import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { Check, Edit3, Trash2, X } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

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
            ? 'You are offline. Settings need a server connection — reconnect and retry.'
            : 'Cannot reach the server. Check the connection and retry.'
        );
      });
  }

  useEffect(() => {
    load();
  }, []);

  function saveSettings() {
    fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data.settings),
    })
      .then((r) => r.json())
      .then((result) => {
        setMessage(result.ok ? 'Settings saved.' : result.error);
        if (result.ok) setData(result);
      })
      .catch(() => setMessage('Failed to save settings.'));
  }

  if (loading) return <div className="pos-page"><h2>Settings</h2><p>Loading settings…</p></div>;
  if (!data) return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Business configuration.</h2>
        </div>
      </header>
      <p className="sale-notice error" role="alert">{loadError || 'Settings unavailable.'}</p>
      <button className="btn-primary" onClick={() => { setLoading(true); load(); }}>Retry</button>
    </div>
  );

  return (
    <div className="pos-page">
      <header className="pos-page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Business configuration.</h2>
        </div>
      </header>
      {message && <p className="admin-message">{message}</p>}
      <div className="settings-tabs">
        <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={activeTab === 'business' ? 'active' : ''} onClick={() => setActiveTab('business')}>Business</button>
        <button className={activeTab === 'seo' ? 'active' : ''} onClick={() => setActiveTab('seo')}>SEO</button>
      </div>
      {activeTab === 'overview' && (
        <div className="settings-section">
          <h3>System</h3>
          <div className="setting-row">
            <span>Total Requests</span>
            <b>{data.stats?.total || 0}</b>
          </div>
          <div className="setting-row">
            <span>Today</span>
            <b>{data.stats?.today || 0}</b>
          </div>
          <div className="setting-row">
            <span>Admin</span>
            <span>{user?.email}</span>
          </div>
        </div>
      )}
      {activeTab === 'business' && (
        <div className="settings-section">
          <h3>Business Info</h3>
          {data.settings?.businessInfo && (
            <>
              <div className="setting-row">
                <span>Name</span>
                <b>{data.settings.businessInfo.name}</b>
              </div>
              <div className="setting-row">
                <span>Phone</span>
                <span>{data.settings.businessInfo.phone}</span>
              </div>
              <div className="setting-row">
                <span>Email</span>
                <span>{data.settings.businessInfo.email}</span>
              </div>
              <div className="setting-row">
                <span>Address</span>
                <span>{data.settings.businessInfo.address}</span>
              </div>
            </>
          )}
          <p className="settings-note">Update business details in the Admin Dashboard.</p>
        </div>
      )}
      {activeTab === 'seo' && (
        <div className="settings-section">
          <h3>SEO Settings</h3>
          {data.settings?.seo && (
            <>
              <div className="setting-row">
                <span>Title</span>
                <span>{data.settings.seo.title}</span>
              </div>
              <div className="setting-row">
                <span>Description</span>
                <span>{data.settings.seo.description}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
