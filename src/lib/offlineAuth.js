/**
 * Offline session model (safe).
 *
 * There is NO offline password check in this file — and there must never be.
 * The browser cannot verify a password without the server (only an argon2
 * hash lives server-side), so any "offline password login" would either
 * require storing a password-equivalent locally or blindly trusting input.
 *
 * Instead this module implements an offline *grant*:
 *  - `grantOfflineAccess()` is called ONLY after a successful ONLINE login
 *    through the real backend. It stores the operator identity + expiry.
 *    No password or password hash is ever stored.
 *  - `resumeOfflineSession()` re-establishes the POS session while offline
 *    if (and only if) a valid, unexpired grant for that username exists on
 *    this device. A fresh device with no prior online login cannot resume.
 *  - Grants expire after 24h and are revoked on logout.
 */

const OFFLINE_KEY = 'od_offline_auth';
const SESSION_KEY = 'od_session';
const GRANT_TTL_MS = 24 * 60 * 60 * 1000;

export function getOfflineAuth() {
  try {
    const data = localStorage.getItem(OFFLINE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Record an offline grant after verified online login.
 * Call ONLY from the online login success path.
 */
export function grantOfflineAccess({ adminId = 'admin', username, token = null }) {
  if (!username) throw new Error('username is required for an offline grant');
  const auth = {
    adminId,
    username: String(username).toLowerCase(),
    // Opaque marker only — proves a prior online login happened on this
    // device. It is NOT a credential and is never sent to the server.
    token: token || `offline-grant-${Date.now().toString(36)}`,
    grantedAt: Date.now(),
    expiresAt: Date.now() + GRANT_TTL_MS,
  };
  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(auth));
  } catch {
    // Storage full/blocked: online login still succeeds, offline resume won't.
  }
  return auth;
}

// Backwards-compatible alias (prefer grantOfflineAccess).
export function setOfflineAuth(authData) {
  return grantOfflineAccess(authData);
}

export function clearOfflineAuth() {
  localStorage.removeItem(OFFLINE_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function isOfflineSessionValid() {
  const auth = getOfflineAuth();
  if (!auth) return false;
  if (Date.now() > auth.expiresAt) {
    clearOfflineAuth();
    return false;
  }
  return true;
}

export function getOfflineSession() {
  const session = localStorage.getItem(SESSION_KEY);
  if (session) return session;
  const auth = getOfflineAuth();
  return auth && Date.now() <= auth.expiresAt ? auth.token : null;
}

export function storeSession(session) {
  localStorage.setItem(SESSION_KEY, session);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  clearOfflineAuth();
}

export function getOfflineUser() {
  const auth = getOfflineAuth();
  if (!auth || Date.now() > auth.expiresAt) return null;
  return { id: auth.adminId, username: auth.username };
}

/**
 * Resume a previously-granted offline session.
 * Succeeds ONLY when a valid, unexpired grant for `username` exists on this
 * device (i.e. the operator logged in online here within the last 24h).
 * Returns the grant, or null when resume is not permitted.
 */
export function resumeOfflineSession(username) {
  const auth = getOfflineAuth();
  if (!auth || Date.now() > auth.expiresAt) return null;
  if (
    username &&
    String(username).toLowerCase() !== String(auth.username).toLowerCase()
  ) {
    return null;
  }
  return auth;
}

/**
 * @deprecated NEVER grant offline access from a raw password.
 * Kept only so old call sites fail loudly instead of bypassing auth.
 */
export async function authenticateOffline() {
  throw new Error(
    'authenticateOffline(username, password) is disabled: offline sessions may only resume a prior online login on this device.'
  );
}

export function getOfflineAuthState() {
  const auth = getOfflineAuth();
  if (!auth) return { authenticated: false };
  if (Date.now() > auth.expiresAt) {
    clearOfflineAuth();
    return { authenticated: false };
  }
  return { authenticated: true, user: getOfflineUser() };
}
