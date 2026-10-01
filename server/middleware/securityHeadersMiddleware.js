import helmet from 'helmet';

// Security headers configuration
const securityHeaders = helmet({
  // Content Security Policy
  // Allow self, Google Fonts, Google Maps, WhatsApp, data URIs
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://wa.me"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*.google.com", "https://*.googleapis.com"],
      connectSrc: ["'self'", "https://wa.me", "https://www.google.com"],
      frameSrc: ["'self'", "https://www.google.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  
  // HSTS - Only in production with HTTPS
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: false,
  } : false,
  
  // Prevent MIME type sniffing
  noSniff: true,
  
  // X-Frame-Options - Prevent clickjacking
  frameguard: { action: 'sameorigin' },
  
  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  
  // Permissions Policy
  permissionsPolicy: {
    directives: {
      geolocation: [], // Allow geolocation for pickup location
      camera: [],
      microphone: [],
    },
  },
  
  // Hide X-Powered-By header
  hidePoweredBy: true,
});

// Additional headers not covered by helmet
export function applySecurityHeaders(req, res, next) {
  // Apply helmet headers
  securityHeaders(req, res, next);
}

// CORS middleware (simple, non-CORS for same-origin API)
export function corsMiddleware(req, res, next) {
  // For API routes, allow same-origin and specific external domains
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
}

// Cache control middleware for static assets
export function cacheControlMiddleware(req, res, next) {
  // Cache static assets for 1 year
  if (req.path.startsWith('/assets/') || req.path.startsWith('/favicon')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
}

export default securityHeaders;
