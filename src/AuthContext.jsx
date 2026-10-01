import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { grantOfflineAccess, clearOfflineAuth, resumeOfflineSession } from './lib/offlineAuth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const logoutHandled = useRef(false);

  const clearAuthState = useCallback(() => {
    logoutHandled.current = true;
    setUser(null);
    setSessionExpired(false);
    setError(null);
    setTimeout(() => { logoutHandled.current = false; }, 1000);
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/session');
      if (response.ok) {
        const data = await response.json();
        setUser(data.authenticated ? { email: data.email } : null);
        setSessionExpired(false);
      } else if (response.status === 401) {
        setUser(null);
        setSessionExpired(false);
      } else {
        setUser(null);
      }
    } catch {
      // Network unreachable (offline or backend down): fall back to a
      // previously-granted offline session, if one exists on this device.
      // No grant => user stays null and ProtectedRoute redirects to /login.
      const grant = resumeOfflineSession();
      if (grant) {
        setUser({ email: grant.username, offline: true });
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleUnauthorized = useCallback(() => {
    if (!logoutHandled.current) {
      clearAuthState();
      window.location.href = '/login?session=expired';
    }
  }, [clearAuthState]);

  const login = useCallback(async (email, password) => {
    setError(null);
    setSessionExpired(false);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invalid email or password.');
      }
      const data = await response.json();
      setUser({ email: data.email });
      // Record an offline grant: allows this operator to resume the POS
      // while offline on THIS device for 24h. Stores identity only —
      // never the password. Revoked on logout.
      try {
        grantOfflineAccess({ username: data.email });
      } catch {
        // Non-fatal: online session works; offline resume just won't.
      }
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors
    } finally {
      // Revoke the offline grant so a logged-out device cannot resume.
      try {
        clearOfflineAuth();
      } catch {
        // Ignore storage errors
      }
      clearAuthState();
    }
  }, [clearAuthState]);

  const continueOffline = useCallback(() => {
    // Resume a granted offline session (e.g. from the login page when the
    // network is unreachable). Returns true when a valid grant exists.
    const grant = resumeOfflineSession();
    if (grant) {
      setUser({ email: grant.username, offline: true });
      setError(null);
      return true;
    }
    return false;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider value={{
      user, loading, error, sessionExpired,
      login, logout, clearError, checkSession, handleUnauthorized,
      continueOffline,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export async function fetchWithAuthCheck(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    const event = new CustomEvent('auth:unauthorized');
    window.dispatchEvent(event);
    throw new Error('Session expired. Please sign in again.');
  }

  return response;
}
