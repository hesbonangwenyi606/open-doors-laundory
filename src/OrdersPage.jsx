import { useEffect, useState } from 'react';
import {
  ClipboardList,
  CreditCard,
  Printer,
  X,
} from 'lucide-react';
import { useOfflineOrders } from './hooks/useOffline.js';
import { upsertServerOrders } from './lib/db.js';
import { generateReceiptPDF, downloadPDFReceipt, printReceipt } from './lib/receipt.js';

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'received', label: 'Received' },
  { value: 'washing', label: 'Washing' },
  { value: 'drying', label: 'Drying' },
  { value: 'ironing', label: 'Ironing' },
  { value: 'ready_for_collection', label: 'Ready for collection' },
  { value: 'cancelled', label: 'Cancelled' },
];

function bookingStatus(status) {
  if (['new', 'pending', 'confirmed'].includes(status)) return 'received';
  if (status === 'completed') return 'ready_for_collection';
  return status || 'received';
}

function whatsappUrl(booking) {
  const digits = String(booking.phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const internationalPhone = digits.startsWith('0') ? `254${digits.slice(1)}` : digits;
  const message = `Hello ${booking.customerName || booking.name || 'there'}, your laundry order ${booking.receiptNumber || ''} is ready for collection at Open Doors Laundromat.`;
  return `https://wa.me/${internationalPhone}?text=${encodeURIComponent(message)}`;
}

export default function OrdersPage() {
  const { orders, loading, refresh } = useOfflineOrders();
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [serverKnown, setServerKnown] = useState(true);
  const [confirmingReady, setConfirmingReady] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [printPromptBooking, setPrintPromptBooking] = useState(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

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
    : orders.filter((o) => bookingStatus(o.status) === filter);

  async function saveStatus(order, status) {
    setNotice('');
    setSavingStatus(true);
    try {
      if (order.externalId) {
        const response = await fetch(`/api/admin/requests/${encodeURIComponent(order.externalId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not update booking status.');
        await upsertServerOrders([result]);
        refresh();
        return { ...order, ...result, status };
      }

      const { updateLocalOrder } = await import('./lib/db.js');
      const { enqueueSync } = await import('./lib/offline.js');
      await updateLocalOrder(order.id, { status });
      if (order.clientId) await enqueueSync('order', order.clientId, 'update', { status });
      refresh();
      if (!navigator.onLine) {
        setNotice('You are offline. The status was saved on this device and will sync automatically.');
      }
      return { ...order, status };
    } catch (error) {
      setNotice(error.message || 'Could not update the status. Please try again.');
      return null;
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleStatusChange(order, status) {
    if (status === 'ready_for_collection') {
      setConfirmingReady(order);
      return;
    }
    await saveStatus(order, status);
  }

  async function confirmReadyForCollection() {
    if (!confirmingReady) return;
    const readyBooking = await saveStatus(confirmingReady, 'ready_for_collection');
    if (readyBooking) {
      setSelectedBooking(readyBooking);
      setPaymentMethod(readyBooking.paymentMethod === 'M-Pesa' ? 'M-Pesa' : 'Cash');
      setPaymentReference(readyBooking.paymentReference || '');
      setConfirmingReady(null);
    }
  }

  async function recordPayment() {
    if (!selectedBooking?.externalId) {
      setPaymentError('This booking must sync with the server before payment can be recorded.');
      return;
    }
    if (paymentMethod === 'M-Pesa' && !paymentReference.trim()) {
      setPaymentError('Enter the M-Pesa transaction code.');
      return;
    }
    setSavingPayment(true);
    setPaymentError('');
    try {
      const response = await fetch(`/api/admin/requests/${encodeURIComponent(selectedBooking.externalId)}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: paymentMethod, reference: paymentReference.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not record payment.');
      await upsertServerOrders([result]);
      refresh();
      setSelectedBooking((current) => ({ ...current, ...result }));
      setPrintPromptBooking({ ...selectedBooking, ...result });
      setNotice('Payment recorded. You can now print the receipt.');
    } catch (error) {
      setPaymentError(error.message || 'Could not record payment.');
    } finally {
      setSavingPayment(false);
    }
  }

  function handlePrintBookingReceipt(booking) {
    const total = Number(booking.totalAmount ?? booking.estimatedTotal) || 0;
    const receiptData = {
      ...booking,
      name: booking.customerName || booking.name,
      servedBy: booking.servedBy || '',
      estimatedTotal: total,
      paidAmount: booking.paymentStatus === 'paid' ? total : 0,
      items: booking.items || [],
    };
    if (!printReceipt(receiptData)) {
      const pdf = generateReceiptPDF(receiptData, booking.receiptNumber, booking.receiptToken);
      downloadPDFReceipt({ ...pdf, receiptNumber: booking.receiptNumber });
    }
  }

  if (loading) return <div className="pos-page"><h2>Orders</h2><p>Loading orders…</p></div>;

  return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Bookings</p>
          <h2>View and manage laundry bookings.</h2>
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
      <div className="bookings-toolbar">
        <h3 id="bookings-table-heading">Bookings</h3>
        <div className="pos-filters" role="group" aria-label="Filter orders by status">
          {STATUSES.map(({ value, label }) => (
            <button
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={28} />
          <h3>No {filter === 'all' ? '' : filter} orders</h3>
          <p>{orders.length === 0 ? 'Create your first sale from New Sale.' : 'No orders match this filter.'}</p>
        </div>
      ) : (
        <section className="bookings-section" aria-labelledby="bookings-table-heading">
          <div className="bookings-table-wrap" role="region" aria-label="Bookings table" tabIndex="0">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th scope="col">Booking</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Service</th>
                  <th scope="col">Items</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Served By</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const items = order.items || [];
                  const status = bookingStatus(order.status);
                  const service = order.service || items.map((item) => item.service || item.name).filter(Boolean).join(', ') || 'Laundry service';

                  return (
                    <tr key={order.id}>
                      <td className="booking-reference">{order.receiptNumber || order.id}</td>
                      <td>{order.customerName || order.name || 'Walk-in'}</td>
                      <td>{service}</td>
                      <td>{items.length}</td>
                      <td className="booking-amount">KSh {(Number(order.totalAmount ?? order.estimatedTotal) || 0).toLocaleString()}</td>
                      <td>{order.servedBy || order.attendant || '—'}</td>
                      <td>
                        <select
                          className={`booking-status-select badge-${status}`}
                          value={status}
                          onChange={(e) => handleStatusChange(order, e.target.value)}
                          aria-label={`Booking status for ${order.receiptNumber || order.id}`}
                          disabled={savingStatus}
                        >
                          <option value="received">Received</option>
                          <option value="washing">Washing</option>
                          <option value="drying">Drying</option>
                          <option value="ironing">Ironing</option>
                          <option value="ready_for_collection">Ready for collection</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {confirmingReady && (
        <div className="booking-dialog-backdrop">
          <section className="booking-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ready-booking-title">
            <h2 id="ready-booking-title">Ready for collection?</h2>
            <p>
              Mark <strong>{confirmingReady.customerName || confirmingReady.name}</strong>’s booking as ready for collection?
              A customer notification can be prepared after confirming.
            </p>
            <div className="booking-dialog-actions">
              <button className="booking-dialog-secondary" type="button" onClick={() => setConfirmingReady(null)} disabled={savingStatus}>Cancel</button>
              <button className="booking-dialog-primary" type="button" onClick={confirmReadyForCollection} disabled={savingStatus}>
                {savingStatus ? 'Saving…' : 'Yes, Ready for Collection'}
              </button>
            </div>
          </section>
        </div>
      )}
      {selectedBooking && (
        <div className="booking-dialog-backdrop">
          <section className="booking-details-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-details-title">
            <header className="booking-details-header">
              <div>
                <p className="eyebrow">{selectedBooking.receiptNumber || 'Booking details'}</p>
                <h2 id="booking-details-title">{selectedBooking.customerName || selectedBooking.name || 'Customer'}</h2>
              </div>
              <button className="booking-dialog-close" type="button" aria-label="Close booking details" onClick={() => setSelectedBooking(null)}><X size={20} /></button>
            </header>
            <dl className="booking-customer-details">
              <div><dt>Contact number</dt><dd>{selectedBooking.phone || selectedBooking.customerPhone || '—'}</dd></div>
              <div><dt>Served By</dt><dd>{selectedBooking.servedBy || selectedBooking.attendant || '—'}</dd></div>
              <div><dt>Pickup area</dt><dd>{selectedBooking.location || '—'}</dd></div>
              <div><dt>Booking status</dt><dd>{STATUSES.find((status) => status.value === bookingStatus(selectedBooking.status))?.label || selectedBooking.status}</dd></div>
              {selectedBooking.notes && <div><dt>Notes</dt><dd>{selectedBooking.notes}</dd></div>}
            </dl>
            <div className="booking-details-items-wrap">
              <table className="booking-details-items">
                <thead><tr><th>Service</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>Subtotal</th></tr></thead>
                <tbody>
                  {(selectedBooking.items || []).map((item, index) => {
                    const original = Number(item.originalSubtotal ?? Number(item.unitPrice ?? item.price ?? 0) * Number(item.kg ?? item.quantity ?? 1));
                    const subtotal = Number(item.subtotal || 0);
                    const discount = Math.max(0, original - subtotal);
                    return (
                      <tr key={item.id || index}>
                        <td>{item.service || item.name}</td>
                        <td>{item.kg ?? item.quantity ?? 1}</td>
                        <td>KSh {Number(item.unitPrice ?? item.price ?? 0).toLocaleString()}</td>
                        <td>{discount ? `-KSh ${discount.toLocaleString()}` : 'None'}</td>
                        <td>KSh {subtotal.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr><th colSpan="4">Total</th><th>KSh {Number(selectedBooking.totalAmount ?? selectedBooking.estimatedTotal ?? 0).toLocaleString()}</th></tr></tfoot>
              </table>
            </div>
            <section className="booking-payment-panel">
              <div>
                <h3>Payment</h3>
                {selectedBooking.paymentStatus === 'paid' ? (
                  <p className="booking-paid-status">Paid earlier · {selectedBooking.paymentMethod || 'Payment recorded'}{selectedBooking.paymentReference ? ` · ${selectedBooking.paymentReference}` : ''}</p>
                ) : (
                  <>
                    <label className="booking-payment-field">
                      Payment method
                      <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                        <option value="Cash">Cash</option>
                        <option value="M-Pesa">M-Pesa</option>
                      </select>
                    </label>
                    {paymentMethod === 'M-Pesa' && (
                      <label className="booking-payment-field">
                        M-Pesa transaction code
                        <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength="64" required />
                      </label>
                    )}
                    {paymentError && <p className="booking-payment-error" role="alert">{paymentError}</p>}
                    <button className="booking-dialog-primary" type="button" onClick={recordPayment} disabled={savingPayment}>
                      <CreditCard size={16} /> {savingPayment ? 'Recording…' : 'Record Payment'}
                    </button>
                  </>
                )}
              </div>
              <div className="booking-detail-actions">
                {whatsappUrl(selectedBooking) && (
                  <a className="booking-dialog-secondary" href={whatsappUrl(selectedBooking)} target="_blank" rel="noreferrer">
                    Notify customer via WhatsApp
                  </a>
                )}
                {selectedBooking.paymentStatus === 'paid' && (
                  <button className="booking-dialog-secondary" type="button" onClick={() => handlePrintBookingReceipt(selectedBooking)}>
                    <Printer size={16} /> Print receipt
                  </button>
                )}
              </div>
            </section>
          </section>
        </div>
      )}
      {printPromptBooking && (
        <div className="booking-dialog-backdrop">
          <section className="booking-dialog" role="alertdialog" aria-modal="true" aria-labelledby="print-receipt-prompt-title">
            <h2 id="print-receipt-prompt-title">Payment recorded</h2>
            <p>Would you like to print the receipt for <strong>{printPromptBooking.customerName || printPromptBooking.name}</strong> now?</p>
            <div className="booking-dialog-actions">
              <button className="booking-dialog-secondary" type="button" onClick={() => setPrintPromptBooking(null)}>Cancel</button>
              <button className="booking-dialog-primary" type="button" onClick={() => {
                handlePrintBookingReceipt(printPromptBooking);
                setPrintPromptBooking(null);
              }}>
                <Printer size={16} /> Print Receipt
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
