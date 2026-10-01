import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';

import { prisma } from './db/client.js';
import { adminUserRepository } from './repositories/adminUserRepository.js';
import { siteSettingsRepository } from './repositories/siteSettingsRepository.js';
import { processRepository } from './repositories/processRepository.js';
import { pricingRepository } from './repositories/pricingRepository.js';
import { bookingRepository } from './repositories/bookingRepository.js';
import { requireAdmin, getOptionalSession, createSessionCookie, createLogoutCookie } from './middleware/sessionMiddleware.js';
import { adminLoginLimiter, bookingLimiter } from './middleware/rateLimitMiddleware.js';
import { applySecurityHeaders, corsMiddleware } from './middleware/securityHeadersMiddleware.js';
import { validateBookingRequest, validateAdminLogin, validateProcessSteps, validatePricingUpdate, validateStatusUpdate } from './middleware/validationMiddleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const app = express();
const port = Number(process.env.PORT || 3001);

// Validate required environment variables on startup
function validateEnv() {
  const required = ['DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'SESSION_SECRET'];
  const missing = required.filter(key => !process.env[key] || process.env[key] === 'development-only-change-this-secret');
  
  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    console.error('Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
  
  if (process.env.SESSION_SECRET === 'development-only-change-this-secret') {
    console.warn('WARNING: Using default session secret. Please set a strong SESSION_SECRET in production.');
  }
}

// Validate environment on startup
validateEnv();

// Apply middleware
app.use(express.json({ limit: '50kb' }));
app.use(corsMiddleware);
app.use(applySecurityHeaders);
app.use(helmet());

// ============================================
// PUBLIC API ENDPOINTS
// ============================================

// Get process steps
app.get('/api/process', async (_req, res, next) => {
  try {
    const result = await processRepository.getStepsArray();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get site settings
app.get('/api/site-settings', async (_req, res, next) => {
  try {
    const settings = await siteSettingsRepository.getSettings();
    const pricing = await pricingRepository.getAllPricing();
    
    if (!settings) {
      return res.json({
        seo: { title: 'Open Doors Laundromat', description: 'Premium laundry services' },
        priceGroups: pricing,
      });
    }
    
    res.json({
      seo: {
        title: settings.seoTitle,
        description: settings.seoDescription,
      },
      priceGroups: pricing,
      businessInfo: {
        name: settings.businessName,
        phone: settings.phone,
        email: settings.email,
        address: settings.address,
        hours: settings.businessHours,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create a new booking request
app.post('/api/requests', bookingLimiter, validateBookingRequest, async (req, res, next) => {
  try {
    const { items, ...bookingData } = req.validatedBookingData;
    const result = await bookingRepository.createBooking(bookingData, items);
    
    res.status(201).json({
      id: result.request.id,
      receiptToken: result.receiptToken,
      receiptNumber: result.receiptNumber,
      message: 'Pickup request received.',
    });
  } catch (error) {
    if (error.message.includes('Invalid service')) {
      return res.status(400).json({ error: 'One of the selected services is invalid.' });
    }
    if (error.message.includes('Invalid quantity')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

// Get receipt by token (public receipt page)
app.get('/api/receipts/:token', async (req, res, next) => {
  try {
    const receipt = await bookingRepository.getBookingByToken(req.params.token);
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found.' });
    }
    res.json(receipt);
  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN API ENDPOINTS
// ============================================

// Admin login
app.post('/api/admin/login', adminLoginLimiter, validateAdminLogin, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await adminUserRepository.verifyPassword(email, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    
    const sessionPayload = { email: user.email, userId: user.id };
    res.setHeader('Set-Cookie', createSessionCookie(sessionPayload));
    res.json({ email: user.email });
  } catch (error) {
    next(error);
  }
});

// Check admin session
app.get('/api/admin/session', getOptionalSession, (req, res) => {
  if (!req.adminUser) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, email: req.adminUser.email });
});

// Admin logout
app.post('/api/admin/logout', (_req, res) => {
  res.setHeader('Set-Cookie', createLogoutCookie());
  res.json({ ok: true });
});

// Update process steps
app.put('/api/admin/process', requireAdmin, validateProcessSteps, async (req, res, next) => {
  try {
    const steps = req.validatedSteps;
    const result = await processRepository.updateSteps(steps);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get admin dashboard data
app.get('/api/admin/dashboard', requireAdmin, async (_req, res, next) => {
  try {
    const [requests, settings, process, stats] = await Promise.all([
      bookingRepository.getRecentBookings(20),
      siteSettingsRepository.getSettings(),
      processRepository.getAllSteps(),
      bookingRepository.getBookingStats(),
    ]);
    
    const pricing = await pricingRepository.getPricingStructure();
    
    res.json({
      requests,
      settings: {
        seo: settings ? { title: settings.seoTitle, description: settings.seoDescription } : null,
        priceGroups: pricing.priceGroups,
      },
      process: { steps: process.map(p => p.title), updatedAt: process.length > 0 ? process[0].updatedAt : null },
      stats,
      daily: stats.daily,
    });
  } catch (error) {
    next(error);
  }
});

// Update site settings
app.put('/api/admin/settings', requireAdmin, validatePricingUpdate, async (req, res, next) => {
  try {
    const { seo, priceGroups } = req.body;
    
    if (seo) {
      const settings = await siteSettingsRepository.getSettings();
      if (settings) {
        await siteSettingsRepository.updateSettings({ seo });
      }
    }
    
    if (priceGroups) {
      await pricingRepository.updatePricingGroups(priceGroups);
    }
    
    const [updatedSettings, updatedPricing] = await Promise.all([
      siteSettingsRepository.getSettings(),
      pricingRepository.getPricingStructure(),
    ]);
    
    res.json({
      seo: updatedSettings ? { title: updatedSettings.seoTitle, description: updatedSettings.seoDescription } : null,
      priceGroups: updatedPricing.priceGroups,
    });
  } catch (error) {
    next(error);
  }
});

// Update request status
app.patch('/api/admin/requests/:id', requireAdmin, validateStatusUpdate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const status = req.validatedStatus;
    
    const request = await bookingRepository.getBookingById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    
    const updatedRequest = await bookingRepository.updateBookingStatus(id, status);
    res.json(updatedRequest);
  } catch (error) {
    next(error);
  }
});

// Delete a request (only completed ones)
app.delete('/api/admin/requests/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    await bookingRepository.deleteBooking(id);
    res.json({ ok: true });
  } catch (error) {
    if (error.message === 'Request not found') {
      return res.status(404).json({ error: 'Request not found.' });
    }
    if (error.message === 'Only completed requests can be removed') {
      return res.status(409).json({ error: 'Only completed requests can be removed.' });
    }
    next(error);
  }
});

// ============================================
// SYNC ENDPOINT (for offline-first support)
// ============================================

app.post('/api/sync', requireAdmin, async (req, res, next) => {
  try {
    const { entityType, entityId, action, payload, idempotencyKey } = req.body;

    if (!entityType || !action) {
      return res.status(400).json({ error: 'Missing entityType or action.' });
    }

    if (idempotencyKey) {
      const existing = await bookingRepository.getBookingByToken(idempotencyKey);
      if (existing) {
        return res.json({ success: true, duplicate: true, externalId: existing.id });
      }
    }

    const result = await handleSync(entityType, entityId, action, payload, idempotencyKey);
    if (!result || result.success === false) {
      // Never report success for a rejected operation: the client must keep
      // the item visible (failed) instead of marking it synchronized.
      return res.status(422).json(result);
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

async function handleSync(entityType, entityId, action, payload, idempotencyKey = null) {
  switch (entityType) {
    case 'order':
      return handleOrderSync(entityId, action, payload, idempotencyKey);
    case 'customer':
      return handleCustomerSync(entityId, action, payload, idempotencyKey);
    case 'payment':
      return handlePaymentSync(entityId, action, payload, idempotencyKey);
    default:
      return { success: false, error: `Unknown entity type: ${entityType}` };
  }
}

async function handleOrderSync(entityId, action, payload, idempotencyKey = null) {
  switch (action) {
    case 'create': {
      // Accept both offline-POS shape and booking shape
      const name = payload.name || payload.customerName || 'Walk-in';
      const phone = payload.phone || payload.customerPhone || '0700000000';
      const location = payload.location || payload.pickupArea || '';
      const paymentMethod = payload.paymentMethod || payload.method || 'Cash';
      const mpesaPhone = payload.mpesaPhone || payload.mpesaNumber || null;
      const notes = payload.notes || '';
      const rawItems = payload.items || [];
      const service = payload.service || (rawItems[0]?.service || rawItems[0]?.name) || 'Washing';
      const items = rawItems.length > 0
        ? rawItems.map((it) => ({
            service: it.service || it.name || service,
            kg: Number(it.kg || it.quantity || 1),
          }))
        : [{ service, kg: Number(payload.quantity || 1) }];
      const result = await bookingRepository.createBooking(
        { name, phone, service, location, paymentMethod, mpesaPhone, notes },
        items
      );
      return { success: true, externalId: result.request.id, receiptNumber: result.receiptNumber, idempotencyKey: idempotencyKey || result.receiptToken };
    }
    case 'update': {
      const { status, serverId } = payload;
      const allowedStatuses = ['new', 'confirmed', 'completed', 'cancelled'];
      if (!allowedStatuses.includes(status)) {
        return { success: false, error: `Invalid status: ${status}` };
      }
      // entityId carries the server booking id (resolved client-side from
      // the create acknowledgement); serverId in payload is also accepted.
      const targetId = serverId || entityId;
      const existing = await bookingRepository.getBookingById(targetId);
      if (!existing) {
        return { success: false, error: `Order not found: ${targetId}` };
      }
      const updated = await bookingRepository.updateBookingStatus(targetId, status);
      return { success: true, updated };
    }
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

async function handleCustomerSync(entityId, action, payload, idempotencyKey = null) {
  switch (action) {
    case 'create': {
      const { name, phone, email, address } = payload;
      return { success: true, externalId: entityId, idempotencyKey: idempotencyKey || `cust_${Date.now()}` };
    }
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

async function handlePaymentSync(entityId, action, payload, idempotencyKey = null) {
  switch (action) {
    case 'create': {
      const { orderId, amount, method, reference } = payload;
      return { success: true, externalId: entityId, idempotencyKey: idempotencyKey || `pay_${Date.now()}` };
    }
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

// ============================================
// STATIC FILES & SPA FALLBACK
// ============================================

// Serve static files from dist directory
app.use(express.static(path.join(rootDir, 'dist')));

// SPA fallback for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.sendFile(path.join(rootDir, 'dist', 'index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use((error, _req, res, _next) => {
  console.error('Server error:', error);
  const message = process.env.NODE_ENV === 'production' 
    ? 'Something went wrong. Please try again.'
    : error.message || 'Internal server error.';
  res.status(error.status || 500).json({ error: message });
});

// ============================================
// SERVER STARTUP
// ============================================

export { app, port };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(port, () => {
    console.log(`Open Doors server running at http://localhost:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
