import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Eye,
} from 'lucide-react';
import { useOfflineOrders } from './hooks/useOffline.js';
import { upsertServerOrders } from './lib/db.js';
import { generateReceiptPDF, downloadPDFReceipt } from './lib/receipt.js';

const STATUSES = ['all', 'new', 'confirmed', 'completed', 'cancelled'];

export default function OrdersPage() {
  const navigate = useNavigate();
  const { orders, loading, refresh } = useOfflineOrders();
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [serverKnown, setServerKnown] = useState(true);

  function handleLocalReceipt(order) {
    // Regenerate the receipt deterministically from the local row —
    // works fully offline, same data as the original receipt.
    try {
      const pdf = generateReceiptPDF(
        {
          id: order.id,
          name: order.customerName || order.name,
          phone: '',
          estimatedTotal: Number(order.totalAmount ?? order.estimatedTotal) || 0,
          paymentMethod: order.paymentMethod || 'Cash',
          status: order.status,
          items: (order.items || []).map((i) => ({
            service: i.service || i.name,
            kg: i.kg ?? i.quantity ?? 1,
            unitPrice: i.unitPrice ?? i.price ?? 0,
            subtotal: i.subtotal ?? 0,
          })),
          createdAt: order.createdAt,
        },
        order.receiptNumber || `OD-LOCAL-${order.id}`,
        order.receiptToken || ''
      );
      downloadPDFReceipt({ ...pdf, receiptNumber: order.receiptNumber || `OD-LOCAL-${order.id}` });
    } catch {
      setNotice('Could not generate the receipt PDF. Please try again.');
    }
  }

  // Local-first: Dexie renders immediately; server refreshes the mirror
  // when online. Offline shows local rows with an honest notice.
  useEffect(() => {
    let cancelled = false;
    if (!navigator.onLine) {
      setServerKnown(false);
      return;
    }
    fetch('/api/admin/dashboard')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(async (data) => {
        await upsertServerOrders(data.requests || []);
        if (!cancelled) {
          refresh();
          setServerKnown(true);
        }
      })
      .catch(() => {
        if (!cancelled) setServerKnown(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const filtered = filter === 'all'
    ? orders
    : orders.filter((o) => o.status === filter);

  async function handleStatusChange(order, status) {
    setNotice('');
    // Local-first status change: applies instantly, queues for the server
    // when the row originated on this device or is a server mirror.
    try {
      const { updateLocalOrder } = await import('./lib/db.js');
      const { enqueueSync } = await import('./lib/offline.js');
      await updateLocalOrder(order.id, { status });
      if (order.clientId) {
        await enqueueSync('order', order.clientId, 'update', { status });
      }
      refresh();
      if (!navigator.onLine) {
        setNotice('You are offline. The status was saved on this device and will sync automatically.');
      }
    } catch {
      setNotice('Could not update the status. Please try again.');
    }
  }

  if (loading) return <div className="pos-page"><h2>Orders</h2><p>Loading orders…</p></div>;

  return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Orders</p>
          <h2>All customer requests.</h2>
        </div>
        <div className="pos-filters" role="group" aria-label="Filter orders by status">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={filter === s ? 'active' : ''}
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </header>
      {!serverKnown && (
        <p className="sale-notice offline" role="status">
          Showing {orders.length} order(s) saved on this device. Connect to see the latest server orders.
        </p>
      )}
      {notice && (
        <p className="sale-notice" role="status">{notice}</p>
      )}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={28} />
          <h3>No {filter === 'all' ? '' : filter} orders</h3>
          <p>{orders.length === 0 ? 'Create your first sale from New Sale.' : 'No orders match this filter.'}</p>
        </div>
      ) : (
        <div className="order-list">
          {filtered.map((order) => (
            <article key={order.id} className="order-card">
              <div className="order-card-header">
                <div>
                  <b>{order.customerName || order.name}</b>
                  <span>{order.syncStatus === 'pending' ? '⏳ Pending sync' : (order.receiptNumber || '')}</span>
                </div>
                <span className={`badge badge-${order.status}`}>{order.status}</span>
              </div>
              <div className="order-card-body">
                <p>{order.service}</p>
                <small>Items: {(order.items || []).length}</small>
                <b>KSh {(Number(order.totalAmount ?? order.estimatedTotal) || 0).toLocaleString()}</b>
              </div>
              <div className="order-card-actions">
                {order.receiptToken ? (
                  <button onClick={() => navigate(`/receipt/${order.receiptToken}`)}>
                    <Eye size={16} /> View Receipt
                  </button>
                ) : (
                  order.receiptNumber && (
                    <button onClick={() => handleLocalReceipt(order)} title="Receipt saved on this device (pending sync)">
                      <Eye size={16} /> Receipt (PDF)
                    </button>
                  )
                )}
                <select
                  value={order.status}
                  onChange={(e) => handleStatusChange(order, e.target.value)}
                  aria-label={`Change status for order ${order.receiptNumber || order.id}`}
                >
                  <option value="new">New</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
