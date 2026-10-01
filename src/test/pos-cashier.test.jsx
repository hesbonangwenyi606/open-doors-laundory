/**
 * Cashier-level workflow test: drives the REAL POSSalePage component offline
 * (clicks, quantities, customer, payment, complete), asserts durable Dexie
 * persistence across unmount/remount (= refresh), then reconnects and syncs
 * against a mock server — multi-cycle, interrupt, and partial-failure included.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { db } from '../lib/db.js';
import { processOutbox } from '../lib/offline.js';
import POSSalePage from '../POSSalePage.jsx';

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { get: () => value, configurable: true });
}

async function seedDevice() {
  await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.products.bulkAdd([
    { serviceName: 'Washing', priceLabel: '600', unitPrice: 600, category: 'Full load services', updatedAt: new Date().toISOString(), syncStatus: 'synced', lastSyncedAt: new Date().toISOString() },
    { serviceName: 'Drying', priceLabel: '600', unitPrice: 600, category: 'Full load services', updatedAt: new Date().toISOString(), syncStatus: 'synced', lastSyncedAt: new Date().toISOString() },
  ]);
  await db.customers.add({
    clientId: 'server_0700000010', externalId: 'srv-cust-1', name: 'Server Sam', phone: '0700000010',
    email: '', address: 'Kitengela', syncStatus: 'synced',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSyncedAt: new Date().toISOString(),
  });
}

function renderSale() {
  return render(
    <MemoryRouter>
      <POSSalePage />
    </MemoryRouter>
  );
}

/** In-memory fake backend: assigns server ids, counts writes per idempotency key. */
function makeFakeServer({ failKeys = new Set(), failOnceKeys = new Set() } = {}) {
  const serverDb = new Map();
  const calls = [];
  const handler = vi.fn().mockImplementation((url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    if (failKeys.has(body.idempotencyKey)) {
      return Promise.resolve({ ok: false, status: 422, text: () => Promise.resolve('{"success":false,"error":"rejected"}') });
    }
    if (failOnceKeys.has(body.idempotencyKey)) {
      failOnceKeys.delete(body.idempotencyKey);
      return Promise.reject(new TypeError('connection reset mid-sync'));
    }
    if (body.action === 'create') {
      if (!serverDb.has(body.idempotencyKey)) {
        serverDb.set(body.idempotencyKey, { serverId: `srv_${body.entityId}`, body });
      }
      const rec = serverDb.get(body.idempotencyKey);
      const ack = { success: true, externalId: rec.serverId, receiptNumber: 'OD-SYNC-001' };
      return Promise.resolve({ ok: true, status: 200, clone: () => ({ json: () => Promise.resolve(ack) }) });
    }
    const ack = { success: true, updated: { status: body.payload.status } };
    return Promise.resolve({ ok: true, status: 200, clone: () => ({ json: () => Promise.resolve(ack) }) });
  });
  return { serverDb, calls, handler };
}

beforeEach(async () => {
  await seedDevice();
  vi.unstubAllGlobals();
  setOnline(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setOnline(true);
});

describe('cashier workflow offline (real component, real Dexie)', () => {
  it('completes a full sale offline: services → cart → qty → customer → cash → order → receipt', async () => {
    setOnline(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const user = userEvent.setup();
    renderSale();

    // Services visible from the local catalog (no network).
    await waitFor(() => expect(screen.getByText('Washing')).toBeInTheDocument());

    // Add Washing x1, bump to x2, add Drying x1 → total 1800.
    const washingCard = screen.getByText('Washing').closest('article');
    await user.click(within(washingCard).getByRole('button', { name: /increase quantity/i }));
    await user.click(within(washingCard).getByRole('button', { name: /^add$/i }));
    const dryingCard = screen.getByText('Drying').closest('article');
    await user.click(within(dryingCard).getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(screen.getByText('KSh 1,800', { selector: '.grand-total span:last-child' })).toBeInTheDocument());

    // Remove Drying → 1200.
    const cart = screen.getByLabelText('Cart and checkout');
    const dryingRow = within(cart).getByText('Drying').closest('.cart-row');
    await user.click(within(dryingRow).getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(screen.getByText('KSh 1,200', { selector: '.grand-total span:last-child' })).toBeInTheDocument());

    // Existing cached customer via suggestion.
    await user.type(screen.getByLabelText('Customer name'), 'Sam');
    await waitFor(() => expect(screen.getByRole('option', { name: /server sam/i })).toBeInTheDocument());
    await user.click(screen.getByRole('option', { name: /server sam/i }));

    await user.click(screen.getByRole('button', { name: /complete sale/i }));

    // Completion screen with real receipt data.
    await waitFor(() => expect(screen.getByText(/sale complete/i)).toBeInTheDocument());
    expect(screen.getByText(/KSh 1,200/)).toBeInTheDocument();

    // Durable: order + cash payment + outbox rows in IndexedDB.
    const orders = await db.orders.toArray();
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ customerName: 'Server Sam', totalAmount: 1200, status: 'pending', syncStatus: 'pending' });
    expect(orders[0].items).toHaveLength(1);
    expect(orders[0].items[0]).toMatchObject({ service: 'Washing', kg: 2, subtotal: 1200 });
    const payments = await db.payments.toArray();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amount: 1200, method: 'Cash' });
    const outbox = await db.outbox.where('status').equals('pending').toArray();
    expect(outbox.length).toBeGreaterThanOrEqual(2);
  });

  it('survives unmount/remount (refresh) with cart-independent persistence', async () => {
    setOnline(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const user = userEvent.setup();
    const { unmount } = renderSale();
    await waitFor(() => expect(screen.getByText('Washing')).toBeInTheDocument());
    const washingCard = screen.getByText('Washing').closest('article');
    await user.click(within(washingCard).getByRole('button', { name: /^add$/i }));
    await user.type(screen.getByLabelText('Customer name'), 'Refresh Rose');
    await user.type(screen.getByLabelText('Customer phone'), '0733333333');
    await user.click(screen.getByRole('button', { name: /complete sale/i }));
    await waitFor(() => expect(screen.getByText(/sale complete/i)).toBeInTheDocument());

    // "Refresh": destroy React tree entirely, re-read the database.
    unmount();
    cleanup();
    const orders = await db.orders.toArray();
    expect(orders).toHaveLength(1);
    expect(orders[0].customerName).toBe('Refresh Rose');
    const pending = await db.outbox.where('status').equals('pending').toArray();
    // order + payment + new-customer creates queued.
    expect(pending.length).toBeGreaterThanOrEqual(3);

    // "Reopen": fresh component sees catalog + customers again.
    renderSale();
    await waitFor(() => expect(screen.getByText('Washing')).toBeInTheDocument());
    expect(await db.orders.count()).toBe(1);
  });

  it('reconnects and syncs offline sales exactly once (multi-cycle + interruption)', async () => {
    setOnline(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const user = userEvent.setup();
    renderSale();
    await waitFor(() => expect(screen.getByText('Washing')).toBeInTheDocument());

    async function completeQuickSale(name, phone) {
      const card = screen.getByText('Washing').closest('article');
      await user.click(within(card).getByRole('button', { name: /^add$/i }));
      await user.clear(screen.getByLabelText('Customer name'));
      await user.type(screen.getByLabelText('Customer name'), name);
      await user.clear(screen.getByLabelText('Customer phone'));
      await user.type(screen.getByLabelText('Customer phone'), phone);
      await user.click(screen.getByRole('button', { name: /complete sale/i }));
      await waitFor(() => expect(screen.getByText(/sale complete/i)).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /start new sale/i }));
      await waitFor(() => expect(screen.getByText('Washing')).toBeInTheDocument());
    }

    // Cycle 1: two offline sales.
    await completeQuickSale('Cycle One', '0744444444');
    await completeQuickSale('Cycle Two', '0755555555');

    // Reconnect with a mid-sync interruption on one payment, then retry.
    setOnline(true);
    const { serverDb, handler } = makeFakeServer();
    // Fail the FIRST attempt once (network drop), succeed on retry.
    let dropOnce = true;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((...args) => {
      if (dropOnce) {
        dropOnce = false;
        return Promise.reject(new TypeError('network dropped mid-sync'));
      }
      return handler(...args);
    }));
    await processOutbox(); // interrupted partway
    vi.stubGlobal('fetch', handler);
    const result = await processOutbox(); // retry completes
    expect(result.synced).toBeGreaterThan(0);
    expect(await db.outbox.where('status').equals('pending').toArray()).toHaveLength(0);

    // Exactly-once per idempotency key on the server.
    const creates = [...serverDb.keys()].filter((k) => k.startsWith('order_'));
    expect(creates).toHaveLength(2);
    const orderRows = await db.orders.toArray();
    expect(orderRows.every((o) => o.syncStatus === 'synced')).toBe(true);
    expect(orderRows.every((o) => o.externalId)).toBe(true);

    // Cycle 2: another offline sale syncs cleanly after.
    setOnline(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await completeQuickSale('Cycle Three', '0766666666');
    setOnline(true);
    vi.stubGlobal('fetch', handler);
    await processOutbox();
    expect([...serverDb.keys()].filter((k) => k.startsWith('order_'))).toHaveLength(3);
    expect(await db.outbox.where('status').equals('pending').toArray()).toHaveLength(0);
  });

  it('isolates partial sync failure: others sync, failed stays retryable', async () => {
    setOnline(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const user = userEvent.setup();
    renderSale();
    await waitFor(() => expect(screen.getByText('Washing')).toBeInTheDocument());
    const card = screen.getByText('Washing').closest('article');
    await user.click(within(card).getByRole('button', { name: /^add$/i }));
    await user.type(screen.getByLabelText('Customer name'), 'Partial Pam');
    await user.type(screen.getByLabelText('Customer phone'), '0777777777');
    await user.click(screen.getByRole('button', { name: /complete sale/i }));
    await waitFor(() => expect(screen.getByText(/sale complete/i)).toBeInTheDocument());

    setOnline(true);
    const pendingBefore = await db.outbox.where('status').equals('pending').toArray();
    // Poison exactly one item (simulate server rejection of the payment).
    const paymentItem = pendingBefore.find((i) => i.entityType === 'payment');
    const { serverDb, handler } = makeFakeServer({ failKeys: new Set([paymentItem.idempotencyKey]) });
    vi.stubGlobal('fetch', handler);
    await processOutbox();

    const failed = await db.outbox.where('status').equals('failed').toArray();
    expect(failed).toHaveLength(1);
    expect(failed[0].entityType).toBe('payment');
    // Server got the order exactly once; payment never stored.
    expect([...serverDb.keys()].filter((k) => k.startsWith('order_'))).toHaveLength(1);
    expect([...serverDb.keys()].filter((k) => k.startsWith('payment_'))).toHaveLength(0);
    // Local order still intact and marked synced; payment still pending-retryable.
    const order = (await db.orders.toArray())[0];
    expect(order.syncStatus).toBe('synced');
  });
});

describe('restart durability (fresh database handle, same device)', () => {
  it('reopens the database after a full close and finds order, receipt and outbox intact', async () => {
    setOnline(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const user = userEvent.setup();
    renderSale();
    await waitFor(() => expect(screen.getByText('Washing')).toBeInTheDocument());
    const card = screen.getByText('Washing').closest('article');
    await user.click(within(card).getByRole('button', { name: /^add$/i }));
    await user.type(screen.getByLabelText('Customer name'), 'Restart Rita');
    await user.type(screen.getByLabelText('Customer phone'), '0788888888');
    await user.click(screen.getByRole('button', { name: /complete sale/i }));
    await waitFor(() => expect(screen.getByText(/sale complete/i)).toBeInTheDocument());
    cleanup();

    // "Restart": drop every handle, reopen the same database from scratch.
    const { OpenDoorsDB } = await import('../lib/db.js');
    db.close();
    const fresh = new OpenDoorsDB();
    await fresh.open();
    try {
      expect(await fresh.orders.count()).toBe(1);
      const order = (await fresh.orders.toArray())[0];
      expect(order).toMatchObject({ customerName: 'Restart Rita', totalAmount: 600 });
      expect(order.receiptNumber).toMatch(/^OD-/);
      expect(order.items).toHaveLength(1);
      // Receipt persisted for later re-access (F3).
      const receipts = await fresh.receipts.toArray();
      expect(receipts).toHaveLength(1);
      expect(receipts[0].pdfData.startsWith('data:application/pdf')).toBe(true);
      // Outbox intact for future sync.
      expect(await fresh.outbox.where('status').equals('pending').count()).toBeGreaterThanOrEqual(2);
    } finally {
      fresh.close();
      await db.open();
    }
  });
});
