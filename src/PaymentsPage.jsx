import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import {
  ArrowUpRight,
  Check,
  ClipboardList,
  Clock,
  DollarSign,
  Edit3,
  Eye,
  Package,
  Search,
  Trash2,
  X,
  CreditCard,
  Wallet,
} from 'lucide-react';

export default function PaymentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const requests = data.requests || [];
        const paymentData = requests.map((req, i) => ({
          id: req.id,
          customer: req.name,
          phone: req.phone,
          amount: req.estimatedTotal || 0,
          method: req.paymentMethod || 'Cash',
          status: req.paymentStatus || 'pending',
          orderStatus: req.status || 'new',
          date: req.createdAt,
          receiptNumber: req.receiptNumber,
          receiptToken: req.receiptToken,
          mpesaPhone: req.mpesaPhone,
        }));
        setPayments(paymentData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filter === 'all'
    ? payments
    : payments.filter((p) => p.method === filter || p.status === filter);

  const totalCollected = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalPending = payments
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

  if (loading) return <div className="pos-page"><h2>Payments</h2><p>Loading payments…</p></div>;

  return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Payments</p>
          <h2>Payment reconciliation.</h2>
        </div>
        <div className="payment-summary">
          <div className="stat-card">
            <DollarSign size={20} />
            <div>
              <small>Total Collected</small>
              <b>KSh {totalCollected.toLocaleString()}</b>
            </div>
          </div>
          <div className="stat-card">
            <Clock size={20} />
            <div>
              <small>Pending</small>
              <b>KSh {totalPending.toLocaleString()}</b>
            </div>
          </div>
        </div>
      </header>
      <div className="pos-filters">
        {['all', 'M-Pesa', 'Cash'].map((m) => (
          <button
            key={m}
            className={filter === m ? 'active' : ''}
            onClick={() => setFilter(m)}
          >
            {m === 'all' ? 'All' : m}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={28} />
          <h3>No payments found</h3>
          <p>Payment records will appear here.</p>
        </div>
      ) : (
        <div className="payment-list">
          {filtered.map((payment) => (
            <article key={payment.id} className="payment-card">
              <div className="payment-card-header">
                <div>
                  <b>{payment.customer}</b>
                  <span>{payment.phone}</span>
                </div>
                <span className={`badge ${payment.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                  {payment.status}
                </span>
              </div>
              <div className="payment-card-body">
                <span><CreditCard size={14} /> {payment.method}</span>
                <b>KSh {payment.amount.toLocaleString()}</b>
                <small>{payment.receiptNumber}</small>
              </div>
              <div className="payment-card-actions">
                {payment.receiptToken && (
                  <button onClick={() => navigate(`/receipt/${payment.receiptToken}`)}>
                    <Eye size={16} /> Receipt
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
