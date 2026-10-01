import { useState, useEffect, useCallback, useRef } from 'react';
import { enqueueSync, processOutbox, setupConnectivityListeners, checkBackendReachable } from '../lib/offline.js';
import { generateReceiptPDF } from '../lib/receipt.js';
import { syncCatalogToLocal, syncCustomersToLocal, getLocalCatalog, getCatalogSyncedAt } from '../lib/catalog.js';
import { db, getAllOrders, getAllCustomers, getAllPayments, getPendingOutboxItems, addLocalOrder, addLocalCustomer, addLocalPayment, getOrderById, updateLocalOrder, getCustomerById, getOrdersByCustomer, getOrdersByStatus, getCustomersCount, getOrdersCount, getPaymentsCount, saveReceiptToLocal, getReceiptByOrderId, getPendingReceipts, markReceiptSynced, addSyncLogEntry } from '../lib/db.js';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [backendReachable, setBackendReachable] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [catalogSyncedAt, setCatalogSyncedAt] = useState(null);
  const syncInterval = useRef(null);

  const refreshCatalog = useCallback(async () => {
    try {
      setCatalog(await getLocalCatalog());
      setCatalogSyncedAt(await getCatalogSyncedAt());
    } catch {}
  }, []);

  const syncCatalog = useCallback(async () => {
    if (!navigator.onLine) return null;
    try {
      const result = await syncCatalogToLocal();
      // Mirror server-known customers too (best-effort; catalog is critical).
      // Customer lists refresh via useOfflineCustomers polling.
      try {
        await syncCustomersToLocal();
      } catch {
        // Offline console stays usable with the price list alone.
      }
      await refreshCatalog();
      return result;
    } catch {
      return null;
    }
  }, [refreshCatalog]);

  useEffect(() => {
    const loadPendingCount = async () => {
      try {
        const pending = await getPendingOutboxItems();
        setPendingCount(pending.length);
      } catch {}
    };
    loadPendingCount();
    refreshCatalog();
    // Download the price list now so it is available when offline later.
    if (navigator.onLine) {
      syncCatalog();
      checkBackendReachable().then(setBackendReachable).catch(() => setBackendReachable(false));
    } else {
      setBackendReachable(false);
    }

    syncInterval.current = setInterval(async () => {
      if (navigator.onLine) {
        await processOutbox();
        try {
          const pending = await getPendingOutboxItems();
          setPendingCount(pending.length);
          setLastSync(new Date());
        } catch {}
      }
    }, 5000);

    setupConnectivityListeners(
      async () => {
        setIsOnline(true);
        setBackendReachable(await checkBackendReachable());
        await processOutbox();
        await syncCatalog();
        try {
          const pending = await getPendingOutboxItems();
          setPendingCount(pending.length);
          setLastSync(new Date());
        } catch {}
      },
      () => {
        setIsOnline(false);
        setBackendReachable(false);
      }
    );

    return () => {
      if (syncInterval.current) clearInterval(syncInterval.current);
    };
  }, [refreshCatalog, syncCatalog]);

  const createOrderOffline = useCallback(async (order) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const id = await addLocalOrder({ ...order, clientId });
    await enqueueSync('order', clientId, 'create', order);
    return id;
  }, []);

  const createCustomerOffline = useCallback(async (customer) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const id = await addLocalCustomer({ ...customer, clientId });
    await enqueueSync('customer', clientId, 'create', customer);
    return id;
  }, []);

  const createPaymentOffline = useCallback(async (payment) => {
    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const id = await addLocalPayment({ ...payment, clientId });
    await enqueueSync('payment', clientId, 'create', payment);
    return id;
  }, []);

  const generateOfflineReceipt = useCallback(async (orderId, receiptNumber, receiptToken) => {
    const order = await getOrderById(orderId);
    const pdfData = generateReceiptPDF(order, receiptNumber, receiptToken);
    await saveReceiptToLocal(orderId, receiptNumber, receiptToken, pdfData.data);
    return { receiptNumber, receiptToken, pdfData };
  }, []);

  // Server-authoritative laundry statuses. Local-only 'pending' means
  // "created on device, not yet acknowledged" and is never sent upstream.
  const ORDER_STATUSES = ['new', 'confirmed', 'completed', 'cancelled'];

  const updateOrderStatusOffline = useCallback(async (orderId, status) => {
    if (!ORDER_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    const order = await getOrderById(orderId);
    if (!order) throw new Error('Order not found locally.');
    await updateLocalOrder(orderId, { status });
    // Queued for the server; the sync engine resolves the server booking id
    // from the create acknowledgement (defers otherwise, without retry burn).
    await enqueueSync('order', order.clientId, 'update', { status });
    return true;
  }, []);

  return {
    isOnline,
    backendReachable,
    backendDown: isOnline && !backendReachable,
    pendingCount,
    lastSync,
    catalog,
    catalogSyncedAt,
    syncCatalog,
    refreshCatalog,
    createOrderOffline,
    createCustomerOffline,
    createPaymentOffline,
    updateOrderStatusOffline,
    generateOfflineReceipt,
    processOutbox,
  };
}

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function useOfflineOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await getAllOrders();
        if (mounted) { setOrders(data); setLoading(false); }
      } catch { if (mounted) setLoading(false); }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await getAllOrders();
      setOrders(data);
    } catch {}
  }, []);

  return { orders, loading, refresh };
}

export function useOfflineCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await getAllCustomers();
        if (mounted) { setCustomers(data); setLoading(false); }
      } catch { if (mounted) setLoading(false); }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await getAllCustomers();
      setCustomers(data);
    } catch {}
  }, []);

  return { customers, loading, refresh };
}

export function useOfflinePayments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await getAllPayments();
        if (mounted) { setPayments(data); setLoading(false); }
      } catch { if (mounted) setLoading(false); }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await getAllPayments();
      setPayments(data);
    } catch {}
  }, []);

  return { payments, loading, refresh };
}

export function useOfflineReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await getPendingReceipts();
        if (mounted) { setReceipts(data); setLoading(false); }
      } catch { if (mounted) setLoading(false); }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return { receipts, loading };
}
