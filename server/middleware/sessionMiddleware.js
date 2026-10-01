import crypto from 'node:crypto';

const SESSION_COOKIE_NAME = 'od_admin';
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000; // 8 hours

// Get session secret from environment (required)
function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret === 'development-only-change-this-secret') {
    throw new Error('SESSION_SECRET environment variable is required and must be a strong secret');
  }
  return secret;
}

// Parse cookies from request header
function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';')
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf('=');
        return [
          part.slice(0, index).trim(),
          decodeURIComponent(part.slice(index + 1))
        ];
      })
  );
}

// Sign a value with HMAC
function sign(value, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(value)
    .digest('base64url');
}

// Safe timing comparison
function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && 
    crypto.timingSafeEqual(left, right);
}

// Create a new session token
function createSession(payload, secret) {
  const payloadEncoded = Buffer.from(
    JSON.stringify({ ...payload, expires: Date.now() + SESSION_MAX_AGE })
  ).toString('base64url');
  const signature = sign(payloadEncoded, secret);
  return `${payloadEncoded}.${signature}`;
}

// Verify and decode a session token
function getSession(req, secret) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) return null;

    const [payloadEncoded, signature] = token.split('.');
    if (!payloadEncoded || !signature) return null;

    // Verify signature
    if (!safeEqual(signature, sign(payloadEncoded, secret))) return null;

    // Decode and verify expiration
    const payload = JSON.parse(
      Buffer.from(payloadEncoded, 'base64url').toString()
    );
    
    if (payload.expires <= Date.now()) return null;
    
    return payload;
  } catch {
    return null;
  }
}

// Create session cookie header
export function createSessionCookie(payload) {
  const secret = getSessionSecret();
  const token = createSession(payload, secret);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `od_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}${secure}`;
}

// Create logout cookie header (expired)
export function createLogoutCookie() {
  return 'od_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
}

// Middleware to check admin authentication
export function requireAdmin(req, res, next) {
  try {
    const secret = getSessionSecret();
    const session = getSession(req, secret);
    
    if (!session) {
      return res.status(401).json({ error: 'Please sign in.' });
    }
    
    // Attach user to request for convenience
    req.adminUser = session;
    next();
  } catch (error) {
    // If session secret is not configured, fail fast
    if (error.message.includes('SESSION_SECRET')) {
      return res.status(500).json({ 
        error: 'Server configuration error. Please contact support.' 
      });
    }
    return res.status(401).json({ error: 'Please sign in.' });
  }
}

// Middleware to get optional session (for /api/admin/session)
export function getOptionalSession(req, res, next) {
  try {
    const secret = getSessionSecret();
    const session = getSession(req, secret);
    req.adminUser = session || null;
    next();
  } catch {
    req.adminUser = null;
    next();
  }
}

// Helper to get session from request
export function getSessionFromRequest(req) {
  try {
    const secret = getSessionSecret();
    return getSession(req, secret);
  } catch {
    return null;
  }
}
