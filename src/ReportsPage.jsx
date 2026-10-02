import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  CircleDollarSign,
  FileText,
  Printer,
  RotateCcw,
  Users,
} from 'lucide-react';
import './ReportsPage.css';

function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: toLocalISODate(from), to: toLocalISODate(to) };
}

function itemQty(it) {
  return Number(it.kg ?? it.quantity ?? 1) || 1;
}

function normalizeTransactions(requests) {
  return (requests || []).map((req, idx) => {
    const rawItems = Array.isArray(req.items) && req.items.length
      ? req.items
      : [{
          service: req.service || 'Service',
          kg: req.quantity ?? 1,
          unitPrice: req.estimatedTotal ?? req.totalAmount ?? 0,
          subtotal: req.estimatedTotal ?? req.totalAmount ?? 0,
        }];
    const services = rawItems.map((it) => ({
      service: it.service || it.name || 'Service',
      qty: itemQty(it),
    }));
    const itemsSum = rawItems.reduce(
      (s, it) => s + (Number(it.subtotal ?? (Number(it.unitPrice ?? 0) * itemQty(it))) || 0),
      0
    );
    const amount = Number(req.estimatedTotal ?? req.totalAmount ?? itemsSum) || itemsSum;
    const date = req.createdAt || new Date().toISOString();
    return {
      id: req.id ?? req.clientId ?? `row-${idx}`,
      day: String(date).slice(0, 10),
      customer: (req.name || req.customerName || 'Walk-in').trim() || 'Walk-in',
      contact: req.phone || '—',
      servedBy: req.servedBy || '—',
      services,
      status: String(req.paymentStatus || 'pending').toLowerCase() === 'paid' ? 'paid' : 'pending',
      amount,
    };
  }).sort((a, b) => String(b.day).localeCompare(String(a.day)));
}

function StatusPill({ status }) {
  return status === 'paid'
    ? <span className="rpt-pill paid">Paid</span>
    : <span className="rpt-pill pending">Pending</span>;
}

export default function ReportsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const defaults = useMemo(defaultRange, []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [dateWarning, setDateWarning] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadLocalFallback() {
      try {
        const { getAllOrders } = await import('./lib/db.js');
        const local = await getAllOrders();
        if (!cancelled) {
          setTransactions(normalizeTransactions(local.map((o) => ({
            id: o.id, name: o.customerName, phone: o.phone, servedBy: o.servedBy,
            paymentStatus: o.paymentStatus, items: o.items, service: o.service,
            estimatedTotal: o.totalAmount, quantity: o.quantity, createdAt: o.createdAt,
          }))));
        }
        return true;
      } catch {
        return false;
      }
    }
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const res = await fetch('/api/admin/dashboard');
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        if (!cancelled) setTransactions(normalizeTransactions(data.requests || []));
      } catch {
        const ok = await loadLocalFallback();
        if (!cancelled && !ok) {
          setLoadError(
            navigator.onLine === false
              ? 'You are offline. Reports need a server connection — reconnect and retry.'
              : 'Cannot reach the server. Check the connection and retry.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Keep range valid: start after end swaps automatically with a notice.
  function changeFrom(value) {
    setDateWarning('');
    if (value && to && value > to) {
      setFrom(to);
      setTo(value);
      setDateWarning('Start date was after end date — swapped automatically.');
    } else {
      setFrom(value);
    }
  }
  function changeTo(value) {
    setDateWarning('');
    if (from && value && from > value) {
      setFrom(value);
      setTo(from);
      setDateWarning('End date was before start date — swapped automatically.');
    } else {
      setTo(value);
    }
  }
  function setToday() {
    const today = toLocalISODate(new Date());
    setFrom(today);
    setTo(today);
    setDateWarning('');
  }
  function clearRange() {
    setFrom(defaults.from);
    setTo(defaults.to);
    setDateWarning('');
  }

  const filtered = useMemo(() => transactions.filter((t) => {
    if (from && t.day < from) return false;
    if (to && t.day > to) return false;
    return true;
  }), [transactions, from, to]);

  const totalCustomers = useMemo(() => new Set(filtered.map((t) => t.customer)).size, [filtered]);
  const totalServices = useMemo(
    () => filtered.reduce((s, t) => s + t.services.reduce((x, sv) => x + sv.qty, 0), 0),
    [filtered]
  );
  const amountMade = useMemo(
    () => filtered.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amount, 0),
    [filtered]
  );

  const rangeLabel = from && to ? `${from} to ${to}` : 'all dates';

  if (loading) return <div className="rpt"><div className="rpt-loading" role="status">Loading reports…</div></div>;
  if (loadError && transactions.length === 0) {
    return (
      <div className="rpt">
        <div className="rpt-error" role="alert">
          <b>{loadError}</b>
          <button type="button" className="rpt-btn primary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rpt">
      {/* Header */}
      <div className="rpt-head">
        <span className="rpt-head-icon"><BarChart3 size={26} /></span>
        <div>
          <h1>Reports</h1>
          <p>View business analytics and download your statement</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rpt-filters">
        <div className="rpt-field">
          <label htmlFor="rpt-from">From Date</label>
          <input id="rpt-from" type="date" value={from} max={to || undefined} onChange={(e) => changeFrom(e.target.value)} />
        </div>
        <div className="rpt-field">
          <label htmlFor="rpt-to">To Date</label>
          <input id="rpt-to" type="date" value={to} min={from || undefined} onChange={(e) => changeTo(e.target.value)} />
        </div>
        <div className="rpt-quick">
          <button type="button" className="rpt-btn primary" onClick={setToday}><Calendar size={15} /> Today</button>
          <button type="button" className="rpt-btn outline" onClick={clearRange}><RotateCcw size={15} /> Clear</button>
        </div>
        <div className="rpt-print">
          <button type="button" className="rpt-btn print" onClick={() => window.print()}><Printer size={16} /> Print Statement</button>
        </div>
      </div>
      {dateWarning && <p className="rpt-hint" role="status">{dateWarning}</p>}

      {/* KPI cards */}
      <div className="rpt-kpis">
        <div className="rpt-kpi">
          <span className="rpt-kpi-icon blue"><Users size={26} /></span>
          <div><small>Total Customers</small><b>{totalCustomers}</b></div>
        </div>
        <div className="rpt-kpi">
          <span className="rpt-kpi-icon green"><FileText size={26} /></span>
          <div><small>Total Services</small><b>{totalServices}</b></div>
        </div>
        <div className="rpt-kpi">
          <span className="rpt-kpi-icon purple"><CircleDollarSign size={26} /></span>
          <div><small>Amount Made</small><b>KSh {amountMade.toLocaleString()}</b></div>
        </div>
      </div>

      {/* Transactions */}
      <h2 className="rpt-section-title">Transactions</h2>
      <div className="rpt-table-card">
        <div className="rpt-table-wrap">
          <table className="rpt-table">
            <thead>
              <tr>
                <th>Date</th><th>Customer</th><th>Services</th><th>Contact</th>
                <th>Served By</th><th>Payment Status</th><th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="rpt-empty">No transactions in this date range.</td></tr>
              )}
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="rpt-date">{t.day}</td>
                  <td className="rpt-customer">{t.customer}</td>
                  <td>
                    <ul className="rpt-services">
                      {t.services.map((s, i) => (
                        <li key={i}>{s.service} ×{s.qty}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="rpt-contact">{t.contact}</td>
                  <td>{t.servedBy}</td>
                  <td><StatusPill status={t.status} /></td>
                  <td className="num">KSh {t.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="rpt-cards">
          {filtered.length === 0 && <div className="rpt-empty">No transactions in this date range.</div>}
          {filtered.map((t) => (
            <section key={t.id} className="rpt-card">
              <header>
                <div><b>{t.customer}</b><span>{t.day}</span></div>
                <StatusPill status={t.status} />
              </header>
              <ul className="rpt-services">
                {t.services.map((s, i) => (
                  <li key={i}>{s.service} ×{s.qty}</li>
                ))}
              </ul>
              <footer>
                <span>{t.contact} · {t.servedBy}</span>
                <b>KSh {t.amount.toLocaleString()}</b>
              </footer>
            </section>
          ))}
        </div>

        <div className="rpt-foot">
          <span>Showing {filtered.length} record{filtered.length === 1 ? '' : 's'} from {rangeLabel}</span>
          <span className="rpt-total">Total Amount Made: <b>KSh {amountMade.toLocaleString()}</b></span>
        </div>
      </div>
    </div>
  );
}
