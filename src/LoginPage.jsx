import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowUpRight,
  LogIn,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  WifiOff,
} from 'lucide-react';
import { useAuth } from './AuthContext.jsx';
import { isOfflineSessionValid, getOfflineUser } from './lib/offlineAuth.js';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, error, clearError, user, continueOffline } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [networkDown, setNetworkDown] = useState(false);
  const offlineGrantUser = !navigator.onLine && isOfflineSessionValid() ? getOfflineUser() : null;

  const from = location.state?.from || '/dashboard';
  const sessionExpired = new URLSearchParams(location.search).get('session') === 'expired';

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  useEffect(() => {
    if (error) {
      setFormError(error);
    }
  }, [error]);

  useEffect(() => {
    if (sessionExpired) {
      setFormError('Your session has expired. Please sign in again.');
    }
  }, [sessionExpired]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setNetworkDown(false);
    setLoading(true);

    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      navigate(from, { replace: true });
    } else if (/failed to fetch|networkerror|load failed/i.test(result.error || '')) {
      // Backend unreachable: offer offline resume only when this device
      // holds a grant from a prior online login. Never bypass auth.
      setNetworkDown(true);
      setFormError('Cannot reach the server. You can continue offline only if this device was signed in online within the last 24 hours.');
    } else {
      setFormError(result.error);
    }
  }

  function handleContinueOffline() {
    if (continueOffline()) {
      navigate(from, { replace: true });
    } else {
      setFormError('No valid offline session on this device. Connect to the internet and sign in first.');
    }
  }

  return (
    <>
      <Helmet>
        <title>Login | Open Doors POS</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="Sign in to Open Doors POS to manage your laundromat." />
      </Helmet>

      <div className="login-page">
        <div className="login-container">
          <div className="login-brand">
            <span className="login-logo">OPEN DOORS</span>
            <small>POINT OF SALE</small>
          </div>

          <div className="login-card">
            <div className="login-header">
              <LogIn size={32} style={{ color: 'var(--primary)', marginBottom: 'var(--space-3)' }} />
              <h1>Welcome back</h1>
              <p>Sign in to manage your laundromat.</p>
            </div>

            {sessionExpired && (
              <div className="login-session-expired" role="alert">
                <AlertTriangle size={18} /> Your session has expired. Please sign in again.
              </div>
            )}

            {(formError || error) && !sessionExpired && (
              <div className="login-error" role="alert">
                {formError || error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="login-email">
                  Email <span className="required">*</span>
                </label>
                <div className="input-wrapper">
                  <Mail size={18} className="input-icon" />
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    aria-required="true"
                    autoComplete="email"
                    placeholder="admin@opendoorslaundromat.co.ke"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="login-password">
                  Password <span className="required">*</span>
                </label>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    aria-required="true"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="login-submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="spin" /> Signing in…
                  </>
                ) : (
                  <>Sign in <ArrowUpRight size={18} /></>
                )}
              </button>

              {(networkDown || offlineGrantUser) && (
                <button
                  type="button"
                  className="login-submit login-offline"
                  onClick={handleContinueOffline}
                  disabled={loading}
                >
                  <WifiOff size={18} /> Continue offline{offlineGrantUser ? ` as ${offlineGrantUser.username}` : ''}
                </button>
              )}
            </form>

            <div className="login-footer">
              <p>
                Default admin credentials are set during setup. Contact the system administrator if needed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
