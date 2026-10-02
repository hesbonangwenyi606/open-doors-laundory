import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Search,
  UserPlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useOffline, useOfflineCustomers } from './hooks/useOffline.js';
import { upsertServerCustomers } from './lib/db.js';

const EMPTY_CUSTOMER = {
  name: '',
  phone: '',
  email: '',
  servedBy: '',
};

export default function CustomersPage() {
  const navigate = useNavigate();
  const { customers, loading, refresh } = useOfflineCustomers();
  const { createCustomerOffline, deleteCustomerOffline } = useOffline();
  const [search, setSearch] = useState('');
  const [serverKnown, setServerKnown] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER);
  const [formError, setFormError] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [notice, setNotice] = useState('');
  const [deletingCustomerId, setDeletingCustomerId] = useState(null);

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
        const serverCustomers = Array.isArray(data.customers) ? data.customers : data.requests || [];
        await upsertServerCustomers(serverCustomers);
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

  useEffect(() => {
    if (!showCreateForm) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowCreateForm(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateForm]);

  async function handleCreateCustomer(event) {
    event.preventDefault();
    const customer = {
      ...customerForm,
      name: customerForm.name.trim(),
      phone: customerForm.phone.trim(),
      email: customerForm.email.trim(),
    };
    if (!customer.name || !customer.phone) {
      setFormError('Customer name and phone number are required.');
      return;
    }

    setSavingCustomer(true);
    setFormError('');
    try {
      await createCustomerOffline(customer);
      refresh();
      setCustomerForm(EMPTY_CUSTOMER);
      setShowCreateForm(false);
      setNotice(`${customer.name} was added to the customer directory.`);
    } catch {
      setFormError('Could not create the customer. Please try again.');
    } finally {
      setSavingCustomer(false);
    }
  }

  function closeCreateForm() {
    setShowCreateForm(false);
    setFormError('');
  }

  async function handleDeleteCustomer(customer) {
    if (!window.confirm(`Delete ${customer.name} from the customer directory?`)) return;
    setDeletingCustomerId(customer.id);
    try {
      await deleteCustomerOffline(customer);
      refresh();
      setNotice(`${customer.name} was deleted from the customer directory.`);
    } catch {
      setNotice(`Could not delete ${customer.name}. Please try again.`);
    } finally {
      setDeletingCustomerId(null);
    }
  }

  const filtered = customers
    .filter(
        (c) =>
          (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
          (c.phone || '').includes(search) ||
          (c.email || '').toLowerCase().includes(search.toLowerCase())
      )
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  if (loading) return <div className="pos-page"><h2>Customers</h2><p>Loading customers…</p></div>;

  return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Customers</p>
          <h2>Customer directory.</h2>
        </div>
        <div className="customer-directory-actions">
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
          <button className="customer-create-button" onClick={() => setShowCreateForm(true)}>
            <UserPlus size={17} /> Create Customer
          </button>
        </div>
      </header>
      {notice && <p className="sale-notice customer-success-notice" role="status">{notice}</p>}
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
        <div className="customers-table-wrap" role="region" aria-label="Customer directory" tabIndex="0">
          <table className="customers-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Contact Number</th>
                <th scope="col">Email</th>
                <th scope="col">Served By</th>
                <th scope="col">Time</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => {
                const customerTime = customer.createdAt ? new Date(customer.createdAt) : null;
                const formattedTime = customerTime && !Number.isNaN(customerTime.getTime())
                  ? customerTime.toLocaleString()
                  : '—';
                return (
                  <tr key={customer.id}>
                    <td className="customer-table-name">{customer.name || '—'}</td>
                    <td><a href={`tel:${customer.phone}`}>{customer.phone || '—'}</a></td>
                    <td>{customer.email || '—'}</td>
                    <td>{customer.servedBy || '—'}</td>
                    <td><time dateTime={customer.createdAt || undefined}>{formattedTime}</time></td>
                    <td>
                      <div className="customer-table-actions">
                        <button
                          className="customer-booking-button"
                          type="button"
                          onClick={() => navigate('/new-order', {
                            state: {
                              customerName: customer.name,
                              customerPhone: customer.phone,
                              servedBy: customer.servedBy,
                            },
                          })}
                        >
                          <Plus size={15} /> New Booking
                        </button>
                        <button
                          className="customer-delete-button"
                          type="button"
                          aria-label={`Delete ${customer.name}`}
                          title="Delete customer"
                          disabled={deletingCustomerId === customer.id}
                          onClick={() => handleDeleteCustomer(customer)}
                        >
                          <Trash2 size={15} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showCreateForm && (
        <div
          className="customer-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCreateForm();
          }}
        >
          <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="create-customer-title">
            <header className="customer-modal-header">
              <div>
                <p className="eyebrow">Customer directory</p>
                <h3 id="create-customer-title">Create customer</h3>
              </div>
              <button className="customer-modal-close" type="button" onClick={closeCreateForm} aria-label="Close dialog">
                <X size={19} />
              </button>
            </header>
            <form onSubmit={handleCreateCustomer}>
              <div className="customer-form-grid">
                <label className="customer-form-field">
                  Customer Name
                  <input
                    autoFocus
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={customerForm.name}
                    onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}
                    required
                  />
                </label>
                <label className="customer-form-field">
                  Phone number
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={customerForm.phone}
                    onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })}
                    required
                  />
                </label>
                <label className="customer-form-field">
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={customerForm.email}
                    onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })}
                  />
                </label>
                <label className="customer-form-field">
                  Served By
                  <input
                    name="servedBy"
                    type="text"
                    autoComplete="name"
                    value={customerForm.servedBy}
                    onChange={(event) => setCustomerForm({ ...customerForm, servedBy: event.target.value })}
                    required
                  />
                </label>
              </div>
              {formError && <p className="customer-form-error" role="alert">{formError}</p>}
              <div className="customer-modal-actions">
                <button className="customer-cancel-button" type="button" onClick={closeCreateForm}>Cancel</button>
                <button className="customer-submit-button" type="submit" disabled={savingCustomer}>
                  {savingCustomer ? 'Saving…' : 'Save Customer'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
