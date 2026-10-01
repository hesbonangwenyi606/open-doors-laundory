import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Search,
  Phone,
  DollarSign,
  MapPin,
} from 'lucide-react';
import { useOfflineCustomers } from './hooks/useOffline.js';
import { upsertServerCustomers } from './lib/db.js';

export default function CustomersPage() {
  const navigate = useNavigate();
  const { customers, loading, refresh } = useOfflineCustomers();
  const [search, setSearch] = useState('');
  const [serverKnown, setServerKnown] = useState(true);

  // Local-first: Dexie renders immediately; server refreshes the mirror
  // when online (by phone, without touching pending local rows).
  useEffect(() => {
    let cancelled = false;
    if (!navigator.onLine) {
      setServerKnown(false);
      return;
    }
    fetch('/api/admin/dashboard')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(async (data) => {
        await upsertServerCustomers(data.requests || []);
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

  const filtered = search
    ? customers.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
          (c.phone || '').includes(search)
      )
    : customers;

  if (loading) return <div className="pos-page"><h2>Customers</h2><p>Loading customers…</p></div>;

  return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Customers</p>
          <h2>Customer directory.</h2>
        </div>
        <div className="pos-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search customers by name or phone"
          />
        </div>
      </header>
      {!serverKnown && (
        <p className="sale-notice offline" role="status">
          Showing {customers.length} customer(s) saved on this device. Connect to see the latest server directory.
        </p>
      )}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={28} />
          <h3>No customers found</h3>
          <p>{customers.length === 0 ? 'New customers are saved automatically with each sale.' : 'No customers match this search.'}</p>
        </div>
      ) : (
        <div className="customer-list">
          {filtered.map((customer) => (
            <article key={customer.id} className="customer-card">
              <div className="customer-card-header">
                <div>
                  <b>{customer.name}</b>
                  <span>{customer.phone}</span>
                </div>
                {customer.syncStatus === 'pending' && (
                  <span className="sync-status pending">⏳ Pending sync</span>
                )}
              </div>
              <div className="customer-card-body">
                {customer.address && <span><MapPin size={14} /> {customer.address}</span>}
                {customer.phone && <span><Phone size={14} /> {customer.phone}</span>}
                <span><DollarSign size={14} /> {customer.syncStatus === 'pending' ? 'New on this device' : 'Synced'}</span>
              </div>
              <div className="customer-card-actions">
                <button onClick={() => navigate('/new-order')}>New sale</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
