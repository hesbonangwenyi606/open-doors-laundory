import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db, addLocalOrder, addLocalCustomer, getPendingOutboxItems } from '../lib/db.js';
import {
  processOutbox,
  enqueueSync,
  retryFailedItems,
  classifySyncFailure,
  backoffDelayMs,
  checkBackendReachable,
  MAX_RETRIES,
} from '../lib/offline.js';
import { syncCatalogToLocal, getLocalCatalog, priceLine } from '../lib/catalog.js';

async function clearAll() {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
}

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { get: () => value, configurable: true });
}

beforeEach(async () => {
  setOnline(true);
  await clearAll();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setOnline(true);
});

describe('offline outbox durability + safe sync', () => {
  it('queues an offline-created order durably with a stable idempotency key', async () => {
    // Simulate fully offline device: fetch unreachable.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    setOnline(false);

    const localId = await addLocalOrder({
      clientId: 'client_test_1',
      customerName: 'Offline QA Customer',
      service: 'Washing',
      totalAmount: 1200,
      quantity: 2,
      status: 'pending',
      items: [{ service: 'Washing', kg: 2, unitPrice: 600, subtotal: 1200 }],
    });
    await enqueueSync('order', 'client_test_1', 'create', {
      name: 'Offline QA Customer',
      phone: '0700000001',
      service: 'Washing',
      items: [{ service: 'Washing', kg: 2 }],
    });

    // Survives "refresh": re-read from IndexedDB.
    expect(await db.orders.get(localId)).toMatchObject({ customerName: 'Offline QA Customer', totalAmount: 1200 });
    const pending = await getPendingOutboxItems();
    expect(pending).toHaveLength(1);
    expect(pending[0].idempotencyKey).toMatch(/^order_client_test_1_create_/);
  });

  it('marks outbox + local entity synced on server acknowledgement', async () => {
    // Queue while "offline" so the fire-and-forget auto-sync in
    // enqueueSync does not race the explicit run below.
    setOnline(false);
    await db.orders.add({ clientId: 'c1', customerName: 'A', service: 'Washing', totalAmount: 600, syncStatus: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSyncedAt: null });
    await enqueueSync('order', 'c1', 'create', { name: 'A', phone: '0700000000', service: 'Washing', items: [{ service: 'Washing', kg: 1 }] });
    setOnline(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    // await explicit run for determinism
    const result = await processOutbox();
    expect(result.synced).toBeGreaterThanOrEqual(1);
    expect(await getPendingOutboxItems()).toHaveLength(0);
    const order = await db.orders.where('clientId').equals('c1').first();
    expect(order.syncStatus).toBe('synced');
  });

  it('keeps items pending (not failed) on transient HTTP 500', async () => {
    setOnline(false);
    await enqueueSync('order', 'c2', 'create', { name: 'A', phone: '0700000000', service: 'Washing', items: [{ service: 'Washing', kg: 1 }] });
    setOnline(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('boom') }));
    await processOutbox();
    const item = (await db.outbox.toArray())[0];
    expect(item.status).toBe('pending');
    expect(item.retryCount).toBeGreaterThanOrEqual(1);
  });

  it('fails fast on permanent HTTP 400 without burning all retries', async () => {
    setOnline(false);
    await enqueueSync('order', 'c3', 'create', { name: 'A', phone: '0700000000', service: 'Washing', items: [{ service: 'Washing', kg: 1 }] });
    setOnline(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve('{"error":"bad"}') }));
    await processOutbox();
    const item = (await db.outbox.toArray())[0];
    expect(item.status).toBe('failed');
    expect(item.error).toContain('400');
  });

  it('keeps items pending when the network drops mid-sync (no retry burn spiral)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    await enqueueSync('order', 'c4', 'create', { name: 'A', phone: '0700000000', service: 'Washing', items: [{ service: 'Washing', kg: 1 }] });
    await processOutbox();
    const item = (await db.outbox.toArray())[0];
    expect(item.status).toBe('pending');
  });

  it('preserves the idempotency key across failed attempts (safe retry)', async () => {
    setOnline(false);
    await enqueueSync('order', 'c5', 'create', { name: 'A', phone: '0700000000', service: 'Washing', items: [{ service: 'Washing', kg: 1 }] });
    setOnline(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve('unavailable') }));
    const before = (await db.outbox.toArray())[0].idempotencyKey;
    await processOutbox();
    const after = (await db.outbox.toArray())[0].idempotencyKey;
    expect(after).toBe(before);
  });

  it('exhausts to failed after MAX_RETRIES and recovers via retryFailedItems', async () => {
    setOnline(false);
    await enqueueSync('order', 'c6', 'create', { name: 'A', phone: '0700000000', service: 'Washing', items: [{ service: 'Washing', kg: 1 }] });
    setOnline(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('x') }));
    for (let i = 0; i < MAX_RETRIES + 1; i++) {
      await processOutbox();
    }
    expect((await db.outbox.toArray())[0].status).toBe('failed');
    await retryFailedItems();
    const item = (await db.outbox.toArray())[0];
    expect(item.status).toBe('pending');
    expect(item.retryCount).toBe(0);
  });

  it('offline-created customers survive alongside orders (no orphans on retry)', async () => {
    setOnline(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await addLocalCustomer({ clientId: 'cust_1', name: 'Offline QA Customer', phone: '0700000001', syncStatus: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSyncedAt: null });
    await enqueueSync('customer', 'cust_1', 'create', { name: 'Offline QA Customer', phone: '0700000001' });
    expect(await db.customers.where('clientId').equals('cust_1').first()).toBeTruthy();
    expect(await getPendingOutboxItems()).toHaveLength(1);
  });
});

describe('sync failure classification + backoff', () => {
  it('classifies network / transient / permanent correctly', () => {
    expect(classifySyncFailure(new TypeError('x'), null)).toBe('network');
    expect(classifySyncFailure(null, { status: 500 })).toBe('transient');
    expect(classifySyncFailure(null, { status: 429 })).toBe('transient');
    expect(classifySyncFailure(null, { status: 408 })).toBe('transient');
    expect(classifySyncFailure(null, { status: 400 })).toBe('permanent');
    expect(classifySyncFailure(null, { status: 401 })).toBe('permanent');
  });

  it('backs off exponentially with a cap', () => {
    expect(backoffDelayMs(1)).toBe(1000);
    expect(backoffDelayMs(2)).toBe(2000);
    expect(backoffDelayMs(3)).toBe(4000);
    expect(backoffDelayMs(99)).toBe(30000);
  });

  it('distinguishes backend reachability from navigator.onLine', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    expect(await checkBackendReachable()).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    expect(await checkBackendReachable(50)).toBe(false);
    setOnline(false);
    expect(await checkBackendReachable()).toBe(false);
  });
});

describe('offline service catalog', () => {
  it('syncs the server price list into Dexie for offline use', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            priceGroups: [
              { t: 'Full load services', items: [['Washing', '600'], ['Wash, dry & fold', '1,200']] },
              { t: 'Popular items', items: [['T-shirt', '200']] },
            ],
            businessInfo: { name: 'Open Doors Laundromat' },
          }),
      })
    );
    const result = await syncCatalogToLocal();
    expect(result.count).toBe(3);
    const catalog = await getLocalCatalog();
    expect(catalog.find((c) => c.serviceName === 'Washing')).toMatchObject({ unitPrice: 600, category: 'Full load services' });
    expect(catalog.find((c) => c.serviceName === 'Wash, dry & fold').unitPrice).toBe(1200);
  });

  it('computes local line totals with integer KES math (600 x 2 = 1200)', () => {
    expect(priceLine(600, 2)).toEqual({ qty: 2, subtotal: 1200 });
    expect(priceLine(600, 0).qty).toBe(1);
    expect(priceLine(600, 99).qty).toBe(25);
  });
});

describe('offline order status updates (queued + server-resolved)', () => {
  function mockServer({ onUpdate = null } = {}) {
    return vi.fn().mockImplementation((url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.action === 'create') {
        const ack = { success: true, externalId: `srv_${body.entityId}`, receiptNumber: 'OD-TEST-001' };
        return Promise.resolve({ ok: true, status: 200, clone: () => ({ json: () => Promise.resolve(ack) }) });
      }
      if (body.action === 'update') {
        if (onUpdate) onUpdate(body);
        const ack = { success: true, updated: { id: body.payload.serverId, status: body.payload.status } };
        return Promise.resolve({ ok: true, status: 200, clone: () => ({ json: () => Promise.resolve(ack) }) });
      }
      return Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve('bad') });
    });
  }

  it('syncs create then resolves the server id for the queued status update', async () => {
    setOnline(false);
    const localId = await addLocalOrder({
      clientId: 'cstat1', customerName: 'Status QA', service: 'Washing',
      totalAmount: 1200, quantity: 2, status: 'pending',
      items: [{ service: 'Washing', kg: 2, unitPrice: 600, subtotal: 1200 }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSyncedAt: null, syncStatus: 'pending',
    });
    await enqueueSync('order', 'cstat1', 'create', { name: 'Status QA', phone: '0700000000', service: 'Washing', items: [{ service: 'Washing', kg: 2 }] });
    // Cashier advances status while still offline.
    const { updateLocalOrder } = await import('../lib/db.js');
    await updateLocalOrder(localId, { status: 'confirmed' });
    await enqueueSync('order', 'cstat1', 'update', { status: 'confirmed' });

    setOnline(true);
    let seenUpdate = null;
    vi.stubGlobal('fetch', mockServer({ onUpdate: (b) => { seenUpdate = b; } }));
    const result = await processOutbox();

    expect(result.synced).toBe(2);
    expect(await getPendingOutboxItems()).toHaveLength(0);
    // The update carried the server booking id resolved from the create ack.
    expect(seenUpdate.payload.serverId).toBe('srv_cstat1');
    expect(seenUpdate.payload.status).toBe('confirmed');
    const row = await db.orders.where('clientId').equals('cstat1').first();
    expect(row.externalId).toBe('srv_cstat1');
    expect(row.status).toBe('confirmed');
    expect(row.syncStatus).toBe('synced');
  });

  it('defers an update whose create has not synced yet (no retry burn, no server call)', async () => {
    setOnline(false);
    await addLocalOrder({
      clientId: 'cstat2', customerName: 'Defer QA', service: 'Drying',
      totalAmount: 600, quantity: 1, status: 'confirmed',
      items: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSyncedAt: null, syncStatus: 'pending',
    });
    await enqueueSync('order', 'cstat2', 'update', { status: 'confirmed' });
    setOnline(true);
    const spy = mockServer();
    vi.stubGlobal('fetch', spy);
    await processOutbox();
    // Update cannot resolve a server id: left pending, server never hit for it.
    expect(spy).not.toHaveBeenCalled();
    const items = await db.outbox.toArray();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('pending');
    expect(items[0].retryCount).toBe(0);
  });

  it('treats HTTP 422 rejections as failed (visible) instead of silently synced', async () => {
    setOnline(false);
    await enqueueSync('order', 'cstat3', 'create', { name: 'X', phone: '0700000000', service: 'Washing', items: [{ service: 'Washing', kg: 1 }] });
    setOnline(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, text: () => Promise.resolve('{"success":false,"error":"Invalid status: bogus"}') }));
    await processOutbox();
    const item = (await db.outbox.toArray())[0];
    expect(item.status).toBe('failed');
    expect(item.error).toContain('422');
  });
});

describe('offline queue performance (10/50/100 transactions)', () => {
  it('keeps local writes + reads responsive at 100 queued transactions', async () => {
    setOnline(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) {
      const clientId = `perf_${i}`;
      await addLocalOrder({
        clientId, customerName: `Perf ${i}`, service: 'Washing', totalAmount: 600,
        quantity: 1, status: 'pending', items: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSyncedAt: null, syncStatus: 'pending',
      });
      await enqueueSync('order', clientId, 'create', { name: `Perf ${i}`, phone: '0700000000', service: 'Washing', items: [{ service: 'Washing', kg: 1 }] });
    }
    const writeMs = Date.now() - t0;
    const r0 = Date.now();
    const orders = await db.orders.toArray();
    const pending = await getPendingOutboxItems();
    const readMs = Date.now() - r0;
    expect(orders).toHaveLength(100);
    expect(pending).toHaveLength(100);
    expect(writeMs).toBeLessThan(15000);
    expect(readMs).toBeLessThan(5000);
  }, 30000);
});
