import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, Trash2, Search, Download, Printer, CheckCircle, AlertCircle, Receipt as ReceiptIcon } from 'lucide-react';
import { useOffline, useOfflineCustomers } from './hooks/useOffline.js';
import { addToCart, setLineQty, removeFromCart, cartTotal, cartCount, buildOfflineOrder, clampQty } from './lib/pos.js';
import { addOrderTransaction, updateLocalOrder, saveReceiptToLocal } from './lib/db.js';
import { generateReceiptPDF, downloadPDFReceipt, printReceipt } from './lib/receipt.js';

const KENYAN_PHONE = /^(?:\+?254|0)(?:7|1)\d{8}$/;

function localReceiptNumber(orderId) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `OD-${day}-${String(orderId).padStart(3, '0')}`;
}

function randomToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 24; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export default function POSSalePage() {
  const navigate = useNavigate();
  const {
    isOnline, backendDown, pendingCount, catalog, catalogSyncedAt,
    createCustomerOffline, processOutbox,
  } = useOffline();
  const { customers } = useOfflineCustomers();

  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [qtyByService, setQtyByService] = useState({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(null);
  const [printBlocked, setPrintBlocked] = useState(false);

  const offline = !isOnline || backendDown;

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (c) => c.serviceName.toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q)
    );
  }, [catalog, search]);

  const matchingCustomers = useMemo(() => {
    const q = (customerName.trim() + ' ' + customerPhone.trim()).toLowerCase();
    if (q.trim().length < 2) return [];
    return customers
      .filter((c) => `${c.name || ''} ${c.phone || ''}`.toLowerCase().includes(q.trim()))
      .slice(0, 5);
  }, [customers, customerName, customerPhone]);

  const total = cartTotal(cart);
  const count = cartCount(cart);

  function handleAdd(service) {
    const qty = clampQty(qtyByService[service.serviceName] || 1);
    setCart((prev) => addToCart(prev, service, qty));
    setQtyByService((prev) => ({ ...prev, [service.serviceName]: 1 }));
  }

  async function handleComplete() {
    setError('');
    setPrintBlocked(false);
    if (cart.length === 0) {
      setError('Your cart is empty. Add at least one service first.');
      return;
    }
    const phone = customerPhone.replace(/[\s-]/g, '');
    if (phone && !/^[+\d][\d\s-]{5,29}$/.test(customerPhone)) {
      setError('That phone number does not look valid.');
      return;
    }
    if (paymentMethod === 'M-Pesa' && !KENYAN_PHONE.test(mpesaPhone.replace(/[\s-]/g, ''))) {
      setError('Enter a valid Kenyan M-Pesa number (e.g. 0712 345 678).');
      return;
    }
    setBusy(true);
    try {
      const name = customerName.trim() || 'Walk-in';
      // Grow the local customer cache (separate queued operation).
      if (phone) {
        const known = customers.some((c) => c.phone === phone);
        if (!known) {
          try {
            await createCustomerOffline({ name, phone });
          } catch {
            // Non-fatal: the order itself is what must persist.
          }
        }
      }
      const order = buildOfflineOrder({ cart, customerName: name, paymentMethod, notes: notes.trim() });
      const payment = {
        orderId: null, // linked to the local order row below
        amount: total,
        method: paymentMethod,
        reference: `${paymentMethod.toUpperCase().slice(0, 4)}-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      // Atomic: order + payment + outbox entries commit together.
      const { orderId } = await addOrderTransaction({ order, payment });

      // Sync immediately when possible; otherwise it waits in the outbox.
      if (!offline) {
        try {
          await processOutbox();
        } catch {
          // Outbox retry covers this; the sale is already durable.
        }
      }

      const receiptNumber = localReceiptNumber(orderId);
      const receiptToken = randomToken();
      // Itemized receipt generated from the actual cart snapshot (works
      // offline — jsPDF is bundled), then persisted for later re-access.
      const receiptSource = {
        id: orderId,
        name,
        phone,
        estimatedTotal: total,
        paymentMethod,
        status: order.status,
        items: order.items.map((i) => ({
          service: i.service,
          kg: i.kg,
          unitPrice: i.unitPrice,
          subtotal: i.subtotal,
        })),
        createdAt: order.createdAt,
      };
      const pdf = generateReceiptPDF(receiptSource, receiptNumber, receiptToken);
      try {
        // Receipt metadata only — never re-pends an already-synced sale.
        await updateLocalOrder(orderId, { receiptNumber, receiptToken }, { markPending: false });
      } catch {
        // Non-fatal: order itself is already durable.
      }
      try {
        await saveReceiptToLocal(orderId, receiptNumber, receiptToken, pdf.data);
      } catch {
        // Non-fatal: PDF regenerates deterministically from the order row.
      }
      setCompleted({
        orderId,
        receiptNumber,
        receiptToken,
        total,
        count,
        customer: name,
        paymentMethod,
        status: order.status,
        items: receiptSource.items,
        pdfData: pdf.data,
      });
      setCart([]);
    } catch {
      setError('Could not save this sale on the device. Nothing was lost from your cart — please try again.');
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadPDF() {
    if (!completed) return;
    try {
      downloadPDFReceipt({ data: completed.pdfData, receiptNumber: completed.receiptNumber });
    } catch {
      setError('Could not generate the PDF. Please try printing instead.');
    }
  }

  function handlePrint() {
    if (!completed) return;
    const opened = printReceipt({
      receiptNumber: completed.receiptNumber,
      receiptToken: completed.receiptToken,
      name: completed.customer,
      estimatedTotal: completed.total,
      paymentMethod: completed.paymentMethod,
      status: completed.status,
      items: completed.items || [],
      createdAt: new Date().toISOString(),
    });
    setPrintBlocked(!opened);
  }

  if (completed) {
    return (
      <div className="pos-page">
        <header className="pos-page-header">
          <div>
            <p className="eyebrow">Sale complete</p>
            <h2>Order saved on this device.</h2>
          </div>
        </header>
        <div className="sale-complete">
          <p className="sale-notice">
            <CheckCircle size={16} /> Receipt <b>{completed.receiptNumber}</b> · {completed.count} item(s) ·{' '}
            <b>KSh {completed.total.toLocaleString()}</b> · {completed.paymentMethod}
            {offline || pendingCount > 0
              ? ' · Will sync automatically when back online.'
              : ' · Synced.'}
          </p>
          {printBlocked && (
            <p className="sale-notice error" role="alert">
              <AlertCircle size={16} /> Printer popup was blocked — use Download PDF instead.
            </p>
          )}
          <div className="sale-actions">
            <button className="btn-primary" onClick={handleDownloadPDF}>
              <Download size={18} /> Download PDF receipt
            </button>
            <button className="btn-secondary" onClick={handlePrint}>
              <Printer size={18} /> Print receipt
            </button>
            <button className="btn-secondary" onClick={() => navigate('/orders')}>
              <ReceiptIcon size={18} /> View orders
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setCompleted(null);
                setCustomerName('');
                setCustomerPhone('');
                setMpesaPhone('');
                setNotes('');
              }}
            >
              <Plus size={18} /> Start new sale
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Point of sale</p>
          <h2>New sale.</h2>
        </div>
        {offline && (
          <p className="sale-notice offline" role="status">
            <AlertCircle size={16} /> You are offline. Sales are saved on this device and will sync automatically.
          </p>
        )}
      </header>

      {error && (
        <p className="sale-notice error" role="alert">
          <AlertCircle size={16} /> {error}
        </p>
      )}

      <div className="sale-layout">
        <section className="sale-panel" aria-label="Services">
          <h3>Services</h3>
          <div className="pos-search" style={{ marginBottom: 'var(--space-3)' }}>
            <Search size={18} />
            <input
              type="search"
              placeholder="Search services…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search services"
            />
          </div>
          {catalog.length === 0 ? (
            <p className="cart-empty">
              No price list on this device yet. Connect to the internet once to download it — the sale screen works fully offline after that.
            </p>
          ) : filteredCatalog.length === 0 ? (
            <p className="cart-empty">No services match “{search}”.</p>
          ) : (
            <div className="sale-services">
              {filteredCatalog.map((s) => (
                <article key={`${s.category}-${s.serviceName}`} className="sale-service-card">
                  <b>{s.serviceName}</b>
                  <span>{s.category}</span>
                  <span className="price">KSh {Number(s.unitPrice).toLocaleString()}</span>
                  <div className="qty-controls">
                    <button
                      type="button"
                      aria-label={`Decrease quantity for ${s.serviceName}`}
                      onClick={() =>
                        setQtyByService((p) => ({ ...p, [s.serviceName]: clampQty((p[s.serviceName] || 1) - 1) }))
                      }
                    >
                      −
                    </button>
                    <output aria-label="Quantity">{qtyByService[s.serviceName] || 1}</output>
                    <button
                      type="button"
                      aria-label={`Increase quantity for ${s.serviceName}`}
                      onClick={() =>
                        setQtyByService((p) => ({ ...p, [s.serviceName]: clampQty((p[s.serviceName] || 1) + 1) }))
                      }
                    >
                      +
                    </button>
                  </div>
                  <button type="button" className="btn-primary" onClick={() => handleAdd(s)}>
                    <Plus size={16} /> Add
                  </button>
                </article>
              ))}
            </div>
          )}
          {catalogSyncedAt && (
            <p className="cart-empty" style={{ marginTop: 'var(--space-3)' }}>
              Price list synced {new Date(catalogSyncedAt).toLocaleString()}
            </p>
          )}
        </section>

        <section className="sale-panel cart-panel" aria-label="Cart and checkout">
          <h3>Cart {count > 0 && `(${count})`}</h3>
          {cart.length === 0 ? (
            <p className="cart-empty">Cart is empty. Add services from the list.</p>
          ) : (
            <div className="cart-rows">
              {cart.map((l) => (
                <div key={l.key} className="cart-row">
                  <div>
                    <b>{l.service}</b>
                    <div className="qty-controls" style={{ marginTop: 'var(--space-1)' }}>
                      <button type="button" aria-label={`Decrease ${l.service}`} onClick={() => setCart((p) => setLineQty(p, l.key, l.qty - 1))}>
                        −
                      </button>
                      <output>{l.qty}</output>
                      <button type="button" aria-label={`Increase ${l.service}`} onClick={() => setCart((p) => setLineQty(p, l.key, l.qty + 1))}>
                        +
                      </button>
                    </div>
                  </div>
                  <span className="line-total">KSh {l.subtotal.toLocaleString()}</span>
                  <button type="button" className="remove-btn" onClick={() => setCart((p) => removeFromCart(p, l.key))}>
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="cart-totals">
            <div className="grand-total">
              <span>Total</span>
              <span>KSh {total.toLocaleString()}</span>
            </div>
          </div>

          <div className="sale-field">
            <label htmlFor="sale-customer-name">Customer name</label>
            <input
              id="sale-customer-name"
              type="text"
              placeholder="Walk-in"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="sale-field">
            <label htmlFor="sale-customer-phone">Customer phone</label>
            <input
              id="sale-customer-phone"
              type="tel"
              placeholder="0700 000 000"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              autoComplete="off"
            />
            {matchingCustomers.length > 0 && (
              <div role="listbox" aria-label="Matching customers">
                {matchingCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="btn-secondary"
                    style={{ marginTop: 'var(--space-1)', width: '100%' }}
                    onClick={() => {
                      setCustomerName(c.name || '');
                      setCustomerPhone(c.phone || '');
                    }}
                  >
                    {c.name} · {c.phone}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="sale-field">
            <label htmlFor="sale-payment">Payment method</label>
            <select id="sale-payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="Cash">Cash{offline ? ' (works offline)' : ''}</option>
              <option value="M-Pesa">M-Pesa{offline ? ' (queued, confirmed when online)' : ''}</option>
            </select>
          </div>
          {paymentMethod === 'M-Pesa' && (
            <div className="sale-field">
              <label htmlFor="sale-mpesa">M-Pesa number</label>
              <input
                id="sale-mpesa"
                type="tel"
                placeholder="0712 345 678"
                value={mpesaPhone}
                onChange={(e) => setMpesaPhone(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}
          <div className="sale-field">
            <label htmlFor="sale-notes">Notes (optional)</label>
            <input
              id="sale-notes"
              type="text"
              placeholder="e.g. Handle with care"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="sale-actions">
            <button type="button" className="btn-primary" onClick={handleComplete} disabled={busy || cart.length === 0}>
              {busy ? 'Saving…' : `Complete sale · KSh ${total.toLocaleString()}`}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
