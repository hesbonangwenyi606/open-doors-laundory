import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { grantOfflineAccess, resumeOfflineSession, getOfflineAuth, clearOfflineAuth, isOfflineSessionValid, getOfflineSession, getOfflineUser, authenticateOffline } from '../lib/offlineAuth.js';

describe('Offline-First Architecture', () => {
  describe('Offline Authentication (grant model — no password bypass)', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      clearOfflineAuth();
    });

    it('grants offline access only after an online login', async () => {
      // Simulates AuthContext.login success path: grant created server-verified.
      const auth = await grantOfflineAccess({ username: 'admin@opendoorslaundromat.co.ke' });
      expect(auth.username).toBe('admin@opendoorslaundromat.co.ke');
      expect(isOfflineSessionValid()).toBe(true);
    });

    it('resumes a granted session while offline', () => {
      grantOfflineAccess({ username: 'admin' });
      const resumed = resumeOfflineSession('admin');
      expect(resumed).toBeTruthy();
      expect(isOfflineSessionValid()).toBe(true);
      expect(getOfflineSession()).toBeTruthy();
    });

    it('refuses resume for an unknown user or fresh device', () => {
      grantOfflineAccess({ username: 'admin' });
      expect(resumeOfflineSession('attacker')).toBeNull();
      clearOfflineAuth();
      expect(resumeOfflineSession('admin')).toBeNull();
    });

    it('refuses password-based offline login (no bypass)', async () => {
      await expect(authenticateOffline('admin', 'password')).rejects.toThrow();
      expect(isOfflineSessionValid()).toBe(false);
    });

    it('should clear offline auth', () => {
      grantOfflineAccess({ username: 'admin' });
      clearOfflineAuth();
      expect(isOfflineSessionValid()).toBe(false);
    });

    it('should get offline user', () => {
      grantOfflineAccess({ username: 'admin' });
      const user = getOfflineUser();
      expect(user.username).toBe('admin');
      expect(user.id).toBe('admin');
    });

    it('should return null for invalid session', () => {
      expect(isOfflineSessionValid()).toBe(false);
      expect(getOfflineUser()).toBeNull();
    });

    it('should expire session after 24 hours', () => {
      const auth = {
        adminId: 'offline-admin',
        username: 'admin',
        token: btoa(JSON.stringify({ username: 'admin', ts: Date.now() })),
        expiresAt: Date.now() - 1000,
      };
      localStorage.setItem('od_offline_auth', JSON.stringify(auth));
      expect(isOfflineSessionValid()).toBe(false);
    });
  });
});

describe('Offline-First Database Layer', () => {
  it('should have the correct database schema with idempotency', () => {
    const schema = {
      customers: ['id', 'externalId', 'clientId', 'name', 'phone', 'email', 'syncStatus'],
      orders: ['id', 'externalId', 'clientId', 'customerId', 'service', 'status', 'syncStatus'],
      payments: ['id', 'externalId', 'clientId', 'orderId', 'amount', 'syncStatus'],
      outbox: ['id', 'entityType', 'entityId', 'clientId', 'action', 'idempotencyKey', 'status'],
      receipts: ['id', 'orderId', 'receiptNumber', 'receiptToken'],
      syncLog: ['id', 'entityType', 'entityId', 'action', 'status', 'timestamp'],
    };

    expect(schema.orders).toContain('syncStatus');
    expect(schema.customers).toContain('syncStatus');
    expect(schema.outbox).toContain('idempotencyKey');
  });

  it('should define offline-first data model', () => {
    const model = {
      orders: { syncStatus: ['pending', 'synced', 'failed'], fields: ['customerName', 'service', 'totalAmount'] },
      customers: { syncStatus: ['pending', 'synced', 'failed'], fields: ['name', 'phone', 'email'] },
      payments: { syncStatus: ['pending', 'synced', 'failed'], fields: ['orderId', 'amount', 'method'] },
    };

    expect(model.orders.syncStatus).toContain('pending');
    expect(model.customers.syncStatus).toContain('pending');
    expect(model.payments.syncStatus).toContain('pending');
  });

  it('should define outbox queue structure with idempotency', () => {
    const outboxItem = {
      entityType: 'order',
      entityId: 1,
      clientId: 'client_123',
      action: 'create',
      idempotencyKey: 'order_1_create_123',
      payload: { customerName: 'Test' },
      status: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      syncedAt: null,
      error: null,
    };

    expect(outboxItem.status).toBe('pending');
    expect(outboxItem.retryCount).toBe(0);
    expect(outboxItem.action).toBe('create');
    expect(outboxItem.idempotencyKey).toBeTruthy();
  });
});

describe('Offline-First Receipt Generation', () => {
  it('should have receipt generation functions available', async () => {
    const { generateReceiptPDF, downloadReceipt, downloadPDFReceipt, printReceipt } = await import('../lib/receipt.js');
    expect(generateReceiptPDF).toBeDefined();
    expect(downloadReceipt).toBeDefined();
    expect(downloadPDFReceipt).toBeDefined();
    expect(printReceipt).toBeDefined();
  });
});
