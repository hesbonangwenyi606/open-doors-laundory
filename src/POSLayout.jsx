import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Plus,
  ShoppingCart,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  Database,
  LogOut,
  ArrowLeft,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import { useOffline } from './hooks/useOffline.js';
import { useTheme } from './hooks/useTheme.js';
import './POSLayout.css';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/new-order', label: 'New Sale', icon: Plus },
  { to: '/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/offline-pos', label: 'Offline', icon: Database },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const titles = {
  '/dashboard': 'Dashboard',
  '/new-order': 'New Sale',
  '/orders': 'Orders',
  '/customers': 'Customers',
  '/payments': 'Payments',
  '/reports': 'Reports',
  '/offline-pos': 'Offline POS',
  '/settings': 'Settings',
};

function SyncBadge({ isOnline, backendDown, pendingCount }) {
  if (!isOnline) {
    return (
      <span className="pos-sync-status offline" role="status">
        Offline{pendingCount > 0 ? ` · ${pendingCount} pending` : ' · changes saved locally'}
      </span>
    );
  }
  if (backendDown) {
    return (
      <span className="pos-sync-status error" role="status">
        Server unreachable{pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
      </span>
    );
  }
  if (pendingCount > 0) {
    return (
      <span className="pos-sync-status syncing" role="status">
        Syncing · {pendingCount} pending
      </span>
    );
  }
  return (
    <span className="pos-sync-status online" role="status">
      Online · synced
    </span>
  );
}

export default function POSLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { isOnline, backendDown, pendingCount } = useOffline();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="pos-layout">
      <button
        className="pos-menu-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle navigation menu"
        aria-expanded={sidebarOpen}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`pos-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="pos-sidebar-header">
          <span className="pos-brand">OPEN DOORS<small>POS</small></span>
          <button
            className="pos-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="pos-nav" aria-label="POS">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) => `pos-nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="pos-sidebar-footer">
          <div className="pos-user-info">
            <span className="pos-user-email">{user?.email}{user?.offline ? ' (offline)' : ''}</span>
          </div>
          <button className="pos-logout-btn" onClick={handleLogout}>
            <LogOut size={18} /> Log out
          </button>
        </div>
      </aside>

      <div
        className={`pos-sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <main className="pos-main">
        <header className="pos-header">
          <button
            className="pos-back-btn"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="pos-header-title">
            <h1>{titles[location.pathname] || 'Open Doors POS'}</h1>
          </div>
          <div className="pos-header-actions">
            <SyncBadge isOnline={isOnline} backendDown={backendDown} pendingCount={pendingCount} />
            <button
              className="pos-theme-toggle"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        <div className="pos-content">
          {children}
        </div>

        <footer className="pos-footer">
          <span><strong>Open Doors POS</strong> · Chuna Mall, Shop 10, Kitengela</span>
          <SyncBadge isOnline={isOnline} backendDown={backendDown} pendingCount={pendingCount} />
        </footer>
      </main>
    </div>
  );
}
