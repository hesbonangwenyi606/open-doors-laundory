import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import {
  ArrowUpRight,
  Check,
  ClipboardList,
  DollarSign,
  Eye,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';

const defaultSteps = ['We collect', 'We sort', 'We clean', 'We finish', 'We deliver'];

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('overview');
  const [loadError, setLoadError] = useState('');

  async function load() {
    setLoadError('');
    try {
      const response = await fetch('/api/admin/dashboard');
      if (response.ok) {
        setData(await response.json());
      } else if (response.status === 401) {
        // Session genuinely expired — re-authenticate.
        navigate('/login');
        return;
      } else {
        setLoadError(`Dashboard unavailable (HTTP ${response.status}). Please try again.`);
      }
    } catch {
      // Network failure (offline/backend down) is NOT an expired session:
      // stay in the POS and offer a retry instead of bouncing to login.
      setLoadError(
        navigator.onLine === false
          ? 'You are offline. Showing the last loaded data when available — reconnect and retry.'
          : 'Cannot reach the server. Check the connection and retry.'
      );
      return;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveProcess(e) {
    e.preventDefault();
    const response = await fetch('/api/admin/process', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: data.process.steps }),
    });
    setMessage(response.ok ? 'Process saved successfully.' : (await response.json()).error);
    if (response.ok) load();
  }

  async function saveSettings(e) {
    e.preventDefault();
    const response = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data.settings),
    });
    setMessage(
      response.ok ? 'Website settings saved successfully.' : (await response.json()).error
    );
    if (response.ok) load();
  }

  async function status(id, status) {
    await fetch(`/api/admin/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function removeRequest(id) {
    if (!window.confirm('Permanently remove this completed request? This cannot be undone.'))
      return;
    const response = await fetch(`/api/admin/requests/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage((await response.json()).error);
      return;
    }
    setMessage('Completed request removed.');
    load();
  }

  const update = (path, value) =>
    setData((current) => {
      const next = structuredClone(current);
      let target = next;
      path.slice(0, -1).forEach((key) => (target = target[key]));
      target[path.at(-1)] = value;
      return next;
    });

  if (loading) return <div className="admin-shell">Loading dashboard…</div>;
  if (loadError && !data) {
    return (
      <div className="pos-page">
        <header className="pos-page-header">
          <div>
            <p className="eyebrow">Business dashboard</p>
            <h2>Dashboard unavailable.</h2>
          </div>
        </header>
        <p className="sale-notice error" role="alert">{loadError}</p>
        <button className="btn-primary" onClick={load}>Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const max = Math.max(1, ...data.daily.map((day) => day.count));
  return (
    <div className="dashboard">
      <div>
        <header className="dash-header">
          <div>
            <p className="eyebrow">Business dashboard</p>
            <h1>{tab[0].toUpperCase() + tab.slice(1)}</h1>
          </div>
        </header>
        {message && <p className="admin-message success">{message}</p>}
        {loadError && (
          <p className="sale-notice error" role="alert">
            {loadError} <button className="btn-secondary" onClick={load}>Retry</button>
          </p>
        )}
        {tab === 'overview' && (
          <>
            <section className="stat-grid">
              <article>
                <ClipboardList size={28} />
                <span>Today's requests</span>
                <b>{data.stats.today}</b>
              </article>
              <article>
                <TrendingUp size={28} />
                <span>New requests</span>
                <b>{data.stats.new}</b>
              </article>
              <article>
                <Check size={18} />
                <span>Completed</span>
                <b>{data.stats.completed}</b>
              </article>
              <article>
                <DollarSign size={28} />
                <span>Total requests</span>
                <b>{data.stats.total}</b>
              </article>
            </section>
            <section className="dash-box">
              <div className="box-title">
                <div>
                  <h2>Requests this week</h2>
                  <p>Daily pickup and service enquiries</p>
                </div>
              </div>
              <div className="bar-chart">
                {data.daily.map((day) => (
                  <div className="bar-item" key={day.date}>
                    <b>{day.count}</b>
                    <span style={{ height: `${Math.max(8, (day.count / max) * 170)}px` }}></span>
                    <small>{day.label}</small>
                  </div>
                ))}
              </div>
            </section>
            <Recent
              requests={data.requests.slice(0, 5)}
              onStatus={status}
              onDelete={removeRequest}
            />
          </>
        )}
        {tab === 'requests' && (
          <Recent requests={data.requests} onStatus={status} onDelete={removeRequest} />
        )}
        {tab === 'process' && (
          <form className="dash-box editor" onSubmit={saveProcess}>
            <div className="box-title">
              <div>
                <h2>Care in every step</h2>
                <p>Edit the process displayed on the website.</p>
              </div>
            </div>
            {data.process.steps.map((step, i) => (
              <div className="step-input" key={i}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <input
                  value={step}
                  onChange={(e) => update(['process', 'steps', i], e.target.value)}
                />
                <button
                  type="button"
                  disabled={data.process.steps.length <= 2}
                  onClick={() =>
                    update(
                      ['process', 'steps'],
                      data.process.steps.filter((_, x) => x !== i)
                    )
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="add-step"
              onClick={() => update(['process', 'steps'], [...data.process.steps, 'New step'])}
            >
              + Add step
            </button>
            <button className="save-button" type="button" onClick={saveProcess}>
              Save process <Check size={18} />
            </button>
          </form>
        )}
        {tab === 'pricing' && (
          <form className="dash-box editor" onSubmit={saveSettings}>
            <div className="box-title">
              <div>
                <h2>Know before you load</h2>
                <p>Add, remove, or update services and prices in Kenyan shillings.</p>
              </div>
            </div>
            {data.settings.priceGroups.map((group, g) => (
              <fieldset className={`price-editor color-${g}`} key={g}>
                <input
                  className="group-name"
                  value={group.t}
                  onChange={(e) => update(['settings', 'priceGroups', g, 't'], e.target.value)}
                />
                {group.items.map((item, i) => (
                  <div key={i}>
                    <input
                      value={item[0]}
                      placeholder="Service or item"
                      onChange={(e) =>
                        update(['settings', 'priceGroups', g, 'items', i, 0], e.target.value)
                      }
                    />
                    <input
                      value={item[1]}
                      placeholder="Price"
                      onChange={(e) =>
                        update(['settings', 'priceGroups', g, 'items', i, 1], e.target.value)
                      }
                    />
                    <button
                      className="remove-price"
                      type="button"
                      disabled={group.items.length <= 1}
                      onClick={() =>
                        update(
                          ['settings', 'priceGroups', g, 'items'],
                          group.items.filter((_, index) => index !== i)
                        )
                      }
                      aria-label={`Remove ${item[0]}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button
                  className="add-price"
                  type="button"
                  onClick={() =>
                    update(
                      ['settings', 'priceGroups', g, 'items'],
                      [...group.items, ['New item', '0']]
                    )
                  }
                >
                  + Add price
                </button>
              </fieldset>
            ))}
            <button className="save-button" type="button" onClick={saveSettings}>
              Save pricing <Check size={18} />
            </button>
          </form>
        )}
        {tab === 'seo' && (
          <form className="dash-box editor seo-editor" onSubmit={saveSettings}>
            <div className="box-title">
              <div>
                <h2>Search engine settings</h2>
                <p>Control how the website appears in search results.</p>
              </div>
              <Search size={20} />
            </div>
            <label>
              Page title
              <input
                maxLength="70"
                value={data.settings.seo.title}
                onChange={(e) => update(['settings', 'seo', 'title'], e.target.value)}
              />
              <small>{data.settings.seo.title.length}/70</small>
            </label>
            <label>
              Meta description
              <textarea
                maxLength="170"
                rows="4"
                value={data.settings.seo.description}
                onChange={(e) => update(['settings', 'seo', 'description'], e.target.value)}
              />
              <small>{data.settings.seo.description.length}/170</small>
            </label>
            <div className="search-preview">
              <small>opendoorslaundromat.co.ke</small>
              <h3>{data.settings.seo.title}</h3>
              <p>{data.settings.seo.description}</p>
            </div>
            <button className="save-button" type="button" onClick={saveSettings}>
              Save SEO <Check size={18} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Recent({ requests, onStatus, onDelete }) {
  const [viewing, setViewing] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!viewing) return;
    function onKeyDown(event) {
      if (event.key === 'Escape') setViewing(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewing]);

  return (
    <section className="dash-box request-list">
      <div className="box-title">
        <div>
          <h2>Customer requests</h2>
          <p>Most recent pickup and service enquiries</p>
        </div>
      </div>
      {requests.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={28} />
          <h3>No requests yet</h3>
          <p>New customer submissions will appear here.</p>
        </div>
      ) : (
        requests.map((item) => (
          <article key={item.id}>
            <div>
              <b>{item.name}</b>
              <span>
                {item.phone} · {item.service}
              </span>
              <small>
                {item.receiptNumber || 'Legacy request'} ·{' '}
                {item.paymentMethod || 'Payment not selected'} ·{' '}
                {new Date(item.createdAt).toLocaleString()}
              </small>
            </div>
            <div className="request-actions">
              <button className="view-request" onClick={() => setViewing(item)}>
                <Eye size={16} /> View
              </button>
              {item.receiptToken && (
                <button
                  onClick={() => navigate(`/receipt/${item.receiptToken}`)}
                  className="receipt-link-button"
                >
                  Receipt
                </button>
              )}
              <select value={item.status} onChange={(e) => onStatus(item.id, e.target.value)}>
                <option value="new">New</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              {item.status === 'completed' && (
                <button
                  className="delete-request"
                  onClick={() => onDelete(item.id)}
                  aria-label={`Remove completed request from ${item.name}`}
                >
                  <Trash2 size={16} /> Remove
                </button>
              )}
            </div>
          </article>
        ))
      )}
      {viewing && (
        <div
          className="request-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Request details"
          onClick={() => setViewing(null)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setViewing(null)} aria-label="Close dialog">
              <X size={16} />
            </button>
            <p className="eyebrow">{viewing.receiptNumber || 'Customer request'}</p>
            <h2>{viewing.name}</h2>
            <div className="request-detail-grid">
              <span>
                <small>Phone</small>
                <b>{viewing.phone}</b>
              </span>
              <span>
                <small>Pickup area</small>
                <b>{viewing.location || 'Not provided'}</b>
              </span>
              <span>
                <small>Payment</small>
                <b>{viewing.paymentMethod || 'Not selected'}</b>
                {viewing.mpesaPhone && <em>{viewing.mpesaPhone}</em>}
              </span>
              <span>
                <small>Status</small>
                <b>{viewing.status}</b>
              </span>
            </div>
            {viewing.items?.length ? (
              <div className="modal-services">
                {viewing.items.map((service, index) => (
                  <div key={index}>
                    <span>
                      {service.service} × {service.kg}
                    </span>
                    <b>KSh {service.subtotal.toLocaleString()}</b>
                  </div>
                ))}
                <div className="modal-total">
                  <span>Estimated total</span>
                  <b>KSh {viewing.estimatedTotal.toLocaleString()}</b>
                </div>
              </div>
            ) : (
              <p>{viewing.service}</p>
            )}
            <div className="modal-notes">
              <small>Additional details</small>
              <p>{viewing.notes || 'No additional details provided.'}</p>
            </div>
            <div className="modal-actions">
              {viewing.receiptToken && (
                <button
                  onClick={() => navigate(`/receipt/${viewing.receiptToken}`)}
                  className="modal-receipt-link"
                >
                  Open receipt <ArrowUpRight size={18} />
                </button>
              )}
              {viewing.status === 'completed' && (
                <button
                  onClick={() => {
                    setViewing(null);
                    onDelete(viewing.id);
                  }}
                >
                  <Trash2 size={16} /> Remove completed request
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
