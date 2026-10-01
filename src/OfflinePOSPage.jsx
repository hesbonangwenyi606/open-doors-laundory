import React, { useState, useEffect, useCallback } from 'react';
import { useOffline, useOfflineOrders, useOfflineCustomers, useOfflinePayments, useOfflineReceipts } from './hooks/useOffline.js';
import { db, getAllOrders, getAllCustomers, getAllPayments, getPendingOutboxItems, getOrderById, getCustomerById, getOrdersByCustomer, getOrdersByStatus, getCustomersCount, getOrdersCount, getPaymentsCount, saveReceiptToLocal, getReceiptByOrderId, getPendingReceipts, markReceiptSynced, addSyncLogEntry } from './lib/db.js';
import { generateReceiptPDF, downloadPDFReceipt, printReceipt } from './lib/receipt.js';
import { priceLine } from './lib/catalog.js';
import {
  Wifi, WifiOff, Database, Plus, FileText, Download, Printer, RefreshCw,
  CheckCircle, AlertCircle, Clock, ShoppingCart, User, CreditCard,
  BarChart3, Search, Trash2,
} from 'lucide-react';

export default function OfflinePOSPage() {
  const { isOnline, backendReachable, backendDown, pendingCount, lastSync, catalog, catalogSyncedAt, createOrderOffline, createCustomerOffline, createPaymentOffline, updateOrderStatusOffline, generateOfflineReceipt, processOutbox } = useOffline();
  const { orders, loading: ordersLoading, refresh: refreshOrders } = useOfflineOrders();
  const { customers, loading: customersLoading, refresh: refreshCustomers } = useOfflineCustomers();
  const { payments, loading: paymentsLoading, refresh: refreshPayments } = useOfflinePayments();
  const { receipts, loading: receiptsLoading } = useOfflineReceipts();

  const [activeTab, setActiveTab] = useState('orders');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newOrder, setNewOrder] = useState({ customerName: '', service: '', totalAmount: '', quantity: 1, notes: '' });
  const selectedCatalogItem = catalog.find((c) => c.serviceName === newOrder.service) || null;
  const computedLine = selectedCatalogItem ? priceLine(selectedCatalogItem.unitPrice, newOrder.quantity) : null;
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const [notifications, setNotifications] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    if (!isOnline && pendingCount > 0) {
      setNotifications(prev => [...prev, {
        type: 'warning',
        message: `${pendingCount} operation(s) pending sync`,
        timestamp: Date.now(),
      }]);
    }
  }, [isOnline, pendingCount]);

  const addNotification = useCallback((type, message) => {
    setNotifications(prev => [...prev, { type, message, timestamp: Date.now() }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.timestamp !== Date.now()));
    }, 5000);
  }, []);

  const handleCreateCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) return;
    const id = await createCustomerOffline(newCustomer);
    setNewCustomer({ name: '', phone: '', email: '', address: '' });
    setShowNewCustomer(false);
    addNotification('success', 'Customer created offline');
    refreshCustomers();
  };

  const handleCreateOrder = async () => {
    if (!newOrder.customerName || !newOrder.service) return;
    // Totals are computed LOCALLY from the synced catalog snapshot —
    // no API round trip, so this works fully offline.
    let totalAmount;
    let items;
    if (selectedCatalogItem) {
      const line = priceLine(selectedCatalogItem.unitPrice, newOrder.quantity);
      totalAmount = line.subtotal;
      items = [{
        name: selectedCatalogItem.serviceName,
        service: selectedCatalogItem.serviceName,
        price: selectedCatalogItem.unitPrice,
        unitPrice: selectedCatalogItem.unitPrice,
        quantity: line.qty,
        kg: line.qty,
        subtotal: line.subtotal,
      }];
    } else {
      // No catalog snapshot (device never synced): cashier-entered amount.
      totalAmount = parseFloat(newOrder.totalAmount) || 0;
      items = [{ name: newOrder.service, service: newOrder.service, price: totalAmount, quantity: parseInt(newOrder.quantity) || 1, kg: parseInt(newOrder.quantity) || 1, subtotal: totalAmount }];
    }
    const order = {
      customerName: newOrder.customerName,
      service: newOrder.service,
      totalAmount,
      quantity: items[0].quantity || items[0].kg || 1,
      status: 'pending',
      paymentStatus: 'pending',
      items,
      notes: newOrder.notes,
      createdAt: new Date().toISOString(),
    };

    const id = await createOrderOffline(order);
    setNewOrder({ customerName: '', service: '', totalAmount: '', quantity: 1, notes: '' });
    setShowNewOrder(false);
    addNotification('success', 'Order created offline');
    refreshOrders();
  };

  const handleCreatePayment = async (orderId, method, amount) => {
    const payment = {
      orderId,
      amount,
      method,
      reference: `OFF-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await createPaymentOffline(payment);
    addNotification('success', 'Payment recorded offline');
    refreshPayments();
  };

  // Next laundry status in the server lifecycle. Works offline: the change
  // applies locally immediately and is queued for the server.
  const NEXT_STATUS = { pending: 'confirmed', new: 'confirmed', confirmed: 'completed' };

  const handleAdvanceStatus = async (order) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      await updateOrderStatusOffline(order.id, next);
      addNotification('success', `Order #${order.id} → ${next} (queued for sync)`);
      refreshOrders();
    } catch {
      addNotification('error', 'Failed to update order status');
    }
  };

  const handleGenerateReceipt = async (order) => {
    const receiptNumber = `OD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(order.id).padStart(3, '0')}`;
    const receiptToken = btoa(JSON.stringify({ orderId: order.id, ts: Date.now() })).slice(0, 24);
    const receiptData = await generateOfflineReceipt(order.id, receiptNumber, receiptToken);

    try {
      await downloadPDFReceipt(receiptData.pdfData || receiptData);
      addNotification('success', `Receipt ${receiptNumber} downloaded`);
    } catch {
      addNotification('error', 'Failed to download receipt');
    }
  };

  const handlePrintReceipt = async (order) => {
    const receiptNumber = `OD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(order.id).padStart(3, '0')}`;
    const receiptToken = btoa(JSON.stringify({ orderId: order.id, ts: Date.now() })).slice(0, 24);
    const receiptData = await generateOfflineReceipt(order.id, receiptNumber, receiptToken);
    const opened = printReceipt(receiptData.pdfData || receiptData);
    if (opened) {
      addNotification('success', `Receipt ${receiptNumber} sent to printer dialog`);
    } else {
      addNotification('error', 'Printer popup blocked — receipt PDF was kept, use Download instead');
    }
  };

  const filteredOrders = orders.filter(o =>
    o.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.service?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCustomers = customers.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  const tabs = [
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'customers', label: 'Customers', icon: User },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'sync', label: 'Sync', icon: RefreshCw },
  ];

  return (
    <div className="offline-pos">
      <div className="offline-pos-header">
        <h1>
          <Database size={24} /> Offline POS
        </h1>
        <div className="offline-status">
          {!isOnline ? (
            <span className="badge badge-offline"><WifiOff size={16} /> Offline</span>
          ) : (
            <span className="badge badge-online"><Wifi size={16} /> Online</span>
          )}
          {pendingCount > 0 && (
            <span className="badge badge-pending">{pendingCount} pending</span>
          )}
          {lastSync && (
            <span className="badge badge-synced">Last sync: {new Date(lastSync).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      <div className="offline-tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`tab ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'orders' && (
        <div className="offline-tab-content">
          <div className="tab-actions">
            <button className="btn-primary" onClick={() => setShowNewOrder(!showNewOrder)}>
              <Plus size={18} /> New Order
            </button>
            <button className="btn-primary" onClick={() => setShowNewCustomer(!showNewCustomer)}>
              <User size={18} /> New Customer
            </button>
            <button className="btn-secondary" onClick={processOutbox} disabled={!isOnline || pendingCount === 0}>
              <RefreshCw size={18} /> Sync Now
            </button>
          </div>

          {showNewOrder && (
            <div className="new-order-form">
              <h3>New Offline Order</h3>
              {catalog.length === 0 && (
                <p className="empty-state" role="note">
                  No price list on this device yet — connect once to download it, or enter the total manually.
                </p>
              )}
              <input
                type="text"
                placeholder="Customer name"
                value={newOrder.customerName}
                onChange={(e) => setNewOrder({ ...newOrder, customerName: e.target.value })}
              />
              {catalog.length > 0 ? (
                <select
                  aria-label="Service"
                  value={newOrder.service}
                  onChange={(e) => setNewOrder({ ...newOrder, service: e.target.value })}
                >
                  <option value="">Select service…</option>
                  {catalog.map((c) => (
                    <option key={`${c.category}-${c.serviceName}`} value={c.serviceName}>
                      {c.serviceName} — KSh {Number(c.unitPrice).toLocaleString()} ({c.category})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Service"
                  value={newOrder.service}
                  onChange={(e) => setNewOrder({ ...newOrder, service: e.target.value })}
                />
              )}
              <div className="form-row">
                <input
                  type="number"
                  placeholder="Quantity"
                  value={newOrder.quantity}
                  onChange={(e) => setNewOrder({ ...newOrder, quantity: e.target.value })}
                  min="1"
                  max="25"
                />
                {computedLine ? (
                  <input
                    type="text"
                    aria-label="Computed total"
                    value={`KSh ${computedLine.subtotal.toLocaleString()} (${computedLine.qty} × KSh ${Number(selectedCatalogItem.unitPrice).toLocaleString()})`}
                    readOnly
                  />
                ) : (
                  <input
                    type="number"
                    placeholder="Total amount"
                    value={newOrder.totalAmount}
                    onChange={(e) => setNewOrder({ ...newOrder, totalAmount: e.target.value })}
                  />
                )}
              </div>
              <textarea
                placeholder="Notes"
                value={newOrder.notes}
                onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })}
              />
              <div className="form-actions">
                <button className="btn-primary" onClick={handleCreateOrder}>Create Order</button>
                <button className="btn-secondary" onClick={() => setShowNewOrder(false)}>Cancel</button>
              </div>
            </div>
          )}

          {showNewCustomer && (
            <div className="new-customer-form">
              <h3>New Customer</h3>
              <input
                type="text"
                placeholder="Full name"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
              />
              <input
                type="tel"
                placeholder="Phone"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              />
              <input
                type="email"
                placeholder="Email"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
              />
              <input
                type="text"
                placeholder="Address"
                value={newCustomer.address}
                onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
              />
              <div className="form-actions">
                <button className="btn-primary" onClick={handleCreateCustomer}>Create Customer</button>
                <button className="btn-secondary" onClick={() => setShowNewCustomer(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="search-bar">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="orders-list">
            {filteredOrders.length === 0 ? (
              <p className="empty-state">No orders yet. Create one offline!</p>
            ) : (
              filteredOrders.map((order) => (
                <div key={order.id} className="order-card">
                  <div className="order-header">
                    <span className="order-id">#{order.id}</span>
                    <span className={`order-status status-${order.status || 'pending'}`}>
                      {order.status || 'pending'}
                    </span>
                    <span className="order-sync-status">
                      {order.syncStatus === 'pending' ? '⏳ Pending sync' : '✅ Synced'}
                    </span>
                  </div>
                  <div className="order-body">
                    <p><strong>Customer:</strong> {order.customerName || 'Walk-in'}</p>
                    <p><strong>Service:</strong> {order.service}</p>
                    <p><strong>Quantity:</strong> {order.quantity || 1}</p>
                    <p><strong>Amount:</strong> KSh {Number(order.totalAmount || 0).toLocaleString()}</p>
                    <p><strong>Date:</strong> {new Date(order.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="order-actions">
                    <button onClick={() => handleGenerateReceipt(order)} title="Download PDF">
                      <Download size={16} /> PDF
                    </button>
                    <button onClick={() => handlePrintReceipt(order)} title="Print">
                      <Printer size={16} /> Print
                    </button>
                    <button onClick={() => handleCreatePayment(order.id, 'Cash', order.totalAmount)} title="Record Cash Payment">
                      <CreditCard size={16} /> Cash
                    </button>
                    {NEXT_STATUS[order.status] && (
                      <button onClick={() => handleAdvanceStatus(order)} title={`Advance status to ${NEXT_STATUS[order.status]} (works offline)`}>
                        <CheckCircle size={16} /> → {NEXT_STATUS[order.status]}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="offline-tab-content">
          <div className="search-bar">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {filteredCustomers.length === 0 ? (
            <p className="empty-state">No customers yet.</p>
          ) : (
            <div className="customers-list">
              {filteredCustomers.map((customer) => (
                <div key={customer.id} className="customer-card">
                  <p><strong>{customer.name}</strong></p>
                  <p>{customer.phone || customer.email || 'No contact'}</p>
                  {customer.address && <p>{customer.address}</p>}
                  <span className={`sync-status ${customer.syncStatus}`}>
                    {customer.syncStatus === 'pending' ? '⏳ Pending sync' : '✅ Synced'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="customer-stats">
            <p>Total customers: {customers.length}</p>
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="offline-tab-content">
          {payments.length === 0 ? (
            <p className="empty-state">No payments recorded yet.</p>
          ) : (
            <div className="payments-list">
              {payments.map((payment) => (
                <div key={payment.id} className="payment-card">
                  <p><strong>Order:</strong> #{payment.orderId}</p>
                  <p><strong>Amount:</strong> KSh {Number(payment.amount || 0).toLocaleString()}</p>
                  <p><strong>Method:</strong> {payment.method}</p>
                  <p><strong>Reference:</strong> {payment.reference}</p>
                  <p><strong>Date:</strong> {new Date(payment.createdAt).toLocaleString()}</p>
                  <span className={`sync-status ${payment.syncStatus}`}>
                    {payment.syncStatus === 'pending' ? '⏳ Pending sync' : '✅ Synced'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="payment-stats">
            <p>Total payments: {payments.length}</p>
            <p>Total amount: KSh {Number(payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)).toLocaleString()}</p>
          </div>
        </div>
      )}

      {activeTab === 'sync' && (
        <div className="offline-tab-content">
          <div className="sync-panel">
            <h3>Synchronization Status</h3>
            <div className="sync-info">
              <p>Connection: {!isOnline ? 'Offline' : backendDown ? 'Online — server unreachable' : 'Online'}</p>
              <p>Pending Items: {pendingCount}</p>
              <p>Last Sync: {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}</p>
              <p>Price list: {catalog.length > 0 ? `${catalog.length} services (synced ${catalogSyncedAt ? new Date(catalogSyncedAt).toLocaleString() : 'unknown'})` : 'not downloaded — connect to sync'}</p>
            </div>
            <button
              className="btn-primary"
              onClick={processOutbox}
              disabled={!isOnline || pendingCount === 0}
            >
              <RefreshCw size={18} /> Force Sync
            </button>
            <div className="sync-queue">
              <h4>Pending Queue</h4>
              {orders.filter(o => o.syncStatus === 'pending').map((order) => (
                <div key={order.id} className="queue-item">
                  <Clock size={16} />
                  <span>Order #{order.id} — {order.customerName}</span>
                  <span className="sync-status pending">pending</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {notifications.length > 0 && (
        <div className="notifications">
          {notifications.map((n, i) => (
            <div key={i} className={`notification notification-${n.type}`}>
              {n.type === 'warning' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
              {n.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
