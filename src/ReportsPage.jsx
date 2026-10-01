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
  TrendingUp,
  BarChart3,
  Users,
  ShoppingCart,
} from 'lucide-react';

export default function ReportsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  function load() {
    setLoadError('');
    fetch('/api/admin/dashboard')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setLoadError(
          navigator.onLine === false
            ? 'You are offline. Reports need a server connection — reconnect and retry.'
            : 'Cannot reach the server. Check the connection and retry.'
        );
      });
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="pos-page"><h2>Reports</h2><p>Loading reports…</p></div>;
  if (!data) return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Business analytics.</h2>
        </div>
      </header>
      <p className="sale-notice error" role="alert">{loadError || 'Reports unavailable.'}</p>
      <button className="btn-primary" onClick={() => { setLoading(true); load(); }}>Retry</button>
    </div>
  );

  const { stats, daily, requests } = data;

  return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Business analytics.</h2>
        </div>
      </header>
      <div className="report-stats">
        <div className="stat-card">
          <ClipboardList size={24} />
          <div>
            <small>Today's Requests</small>
            <b>{stats.today || 0}</b>
          </div>
        </div>
        <div className="stat-card">
          <TrendingUp size={24} />
          <div>
            <small>New Today</small>
            <b>{stats.new || 0}</b>
          </div>
        </div>
        <div className="stat-card">
          <Check size={24} />
          <div>
            <small>Completed</small>
            <b>{stats.completed || 0}</b>
          </div>
        </div>
        <div className="stat-card">
          <DollarSign size={24} />
          <div>
            <small>Total Requests</small>
            <b>{stats.total || 0}</b>
          </div>
        </div>
      </div>
      <div className="report-section">
        <h3>Weekly Trend</h3>
        <div className="bar-chart">
          {daily.map((day) => (
            <div key={day.date} className="bar-item">
              <b>{day.count}</b>
              <span style={{ height: `${Math.max(8, (day.count / Math.max(1, ...daily.map(d => d.count))) * 170)}px` }}></span>
              <small>{day.label}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="report-section">
        <h3>Recent Activity</h3>
        {requests.length === 0 ? (
          <p className="empty-state">No activity yet.</p>
        ) : (
          <div className="activity-list">
            {requests.slice(0, 10).map((req) => (
              <div key={req.id} className="activity-item">
                <div>
                  <b>{req.name}</b>
                  <span>{req.service}</span>
                </div>
                <div>
                  <b>KSh {(req.estimatedTotal || 0).toLocaleString()}</b>
                  <small>{new Date(req.createdAt).toLocaleDateString('en-KE')}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
