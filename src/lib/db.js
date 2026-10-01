import Dexie from 'dexie';

export class OpenDoorsDB extends Dexie {
  customers;
  orders;
  payments;
  products;
  outbox;
  syncLog;
  settings;
  receipts;

  constructor() {
    super('OpenDoorsPOS');
    this.version(2).stores({
      customers: '++id, externalId, clientId, name, phone, email, address, notes, createdAt, updatedAt, syncStatus, lastSyncedAt',
      orders: '++id, externalId, clientId, customerId, service, status, totalAmount, paidAmount, createdAt, updatedAt, syncStatus, lastSyncedAt, receiptNumber, receiptToken',
      payments: '++id, externalId, clientId, orderId, amount, method, reference, createdAt, updatedAt, syncStatus, lastSyncedAt',
      products: '++id, externalId, name, price, category, unit, createdAt, updatedAt, syncStatus, lastSyncedAt',
      outbox: '++id, entityType, entityId, clientId, action, payload, idempotencyKey, status, retryCount, createdAt, syncedAt, error',
      syncLog: '++id, entityType, entityId, action, status, timestamp, details',
      settings: 'key, value, updatedAt',
      receipts: '++id, orderId, receiptNumber, receiptToken, pdfData, createdAt, syncedAt',
    });
  }
}

export const db = new OpenDoorsDB();

export async function initDB() {
  await db.open();
}

export async function addToOutbox(entityType, entityId, action, payload, idempotencyKey = null) {
  const id = await db.outbox.add({
    entityType,
    entityId,
    clientId: `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    action,
    payload: JSON.stringify(payload),
    idempotencyKey,
    status: 'pending',
    retryCount: 0,
    createdAt: new Date().toISOString(),
    syncedAt: null,
    error: null,
  });
  return id;
}

export async function markOutboxSynced(outboxId) {
  await db.outbox.update(outboxId, {
    status: 'synced',
    syncedAt: new Date().toISOString(),
    error: null,
  });
}

/**
 * Record a failed sync attempt.
 * Transient failures keep the item `pending` (with an incremented retry
 * count) so automatic retry picks it up again. Only when attempts reach
 * `maxRetries`, or the failure is permanent (e.g. validation 4xx — passed
 * as `permanent: true` by the caller), does the item move to `failed`.
 */
export async function markOutboxFailed(outboxId, error, { maxRetries = 5, permanent = false } = {}) {
  const item = await db.outbox.get(outboxId);
  if (!item) return;
  const retryCount = (item.retryCount || 0) + 1;
  const exhausted = permanent || retryCount >= maxRetries;
  await db.outbox.update(outboxId, {
    status: exhausted ? 'failed' : 'pending',
    error: error.message || String(error),
    retryCount,
  });
}

export async function getPendingOutboxItems() {
  return db.outbox.where('status').equals('pending').sortBy('createdAt');
}

export async function getFailedOutboxItems() {
  return db.outbox.where('status').equals('failed').sortBy('createdAt');
}

export async function getOutboxStats() {
  const pending = await db.outbox.where('status').equals('pending').count();
  const synced = await db.outbox.where('status').equals('synced').count();
  const failed = await db.outbox.where('status').equals('failed').count();
  return { pending, synced, failed };
}

export async function setLocalSetting(key, value) {
  await db.settings.put({ key, value, updatedAt: new Date().toISOString() });
}

export async function getLocalSetting(key) {
  const record = await db.settings.get(key);
  return record ? record.value : null;
}

export async function setCustomerSyncStatus(externalId, syncStatus, lastSyncedAt = new Date().toISOString()) {
  const customer = await db.customers.get({ externalId });
  if (customer) {
    await db.customers.update(customer.id, { syncStatus, lastSyncedAt });
  }
}

export async function setOrderSyncStatus(externalId, syncStatus, lastSyncedAt = new Date().toISOString()) {
  const order = await db.orders.get({ externalId });
  if (order) {
    await db.orders.update(order.id, { syncStatus, lastSyncedAt });
  }
}

export async function getOfflineCustomers() {
  return db.customers.where('syncStatus').equals('pending').toArray();
}

export async function getOfflineOrders() {
  return db.orders.where('syncStatus').equals('pending').toArray();
}

export async function addLocalCustomer(customer) {
  const id = await db.customers.add({
    ...customer,
    clientId: customer.clientId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    syncStatus: 'pending',
    createdAt: customer.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSyncedAt: null,
  });
  return id;
}

export async function addLocalOrder(order) {
  const id = await db.orders.add({
    ...order,
    clientId: order.clientId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    syncStatus: 'pending',
    createdAt: order.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSyncedAt: null,
  });
  return id;
}

export async function addLocalPayment(payment) {
  const id = await db.payments.add({
    ...payment,
    clientId: payment.clientId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    syncStatus: 'pending',
    createdAt: payment.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSyncedAt: null,
  });
  return id;
}

/**
 * Atomically persist a complete POS sale: order + optional payment + their
 * outbox entries, in a single IndexedDB transaction. Either everything is
 * queued or nothing is — no orphan orders, no orphan outbox rows.
 */
export function newClientId(prefix = 'client') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function addOrderTransaction({ order, payment = null }) {
  const orderClientId = order.clientId || newClientId('client');
  const now = new Date().toISOString();
  const paymentClientId = payment ? payment.clientId || newClientId('client') : null;

  const result = await db.transaction('rw', db.orders, db.payments, db.outbox, async () => {
    const orderId = await db.orders.add({
      ...order,
      clientId: orderClientId,
      syncStatus: 'pending',
      createdAt: order.createdAt || now,
      updatedAt: now,
      lastSyncedAt: null,
    });

    const outboxIds = [];
    outboxIds.push(
      await db.outbox.add({
        entityType: 'order',
        entityId: orderClientId,
        clientId: orderClientId,
        action: 'create',
        payload: JSON.stringify(order),
        idempotencyKey: `order_${orderClientId}_create_${Date.now()}`,
        status: 'pending',
        retryCount: 0,
        createdAt: now,
        syncedAt: null,
        error: null,
      })
    );

    let paymentId = null;
    if (payment) {
      paymentId = await db.payments.add({
        ...payment,
        orderId,
        clientId: paymentClientId,
        syncStatus: 'pending',
        createdAt: payment.createdAt || now,
        updatedAt: now,
        lastSyncedAt: null,
      });
      outboxIds.push(
        await db.outbox.add({
          entityType: 'payment',
          entityId: paymentClientId,
          clientId: paymentClientId,
          action: 'create',
          payload: JSON.stringify({ ...payment, orderClientId }),
          idempotencyKey: `payment_${paymentClientId}_create_${Date.now()}`,
          status: 'pending',
          retryCount: 0,
          createdAt: now,
          syncedAt: null,
          error: null,
        })
      );
    }

    return { orderId, paymentId, outboxIds, orderClientId, paymentClientId };
  });

  return result;
}

export async function updateLocalOrder(orderId, updates, { markPending = true } = {}) {
  await db.orders.update(orderId, {
    ...updates,
    updatedAt: new Date().toISOString(),
    ...(markPending ? { syncStatus: 'pending' } : {}),
  });
}

export async function getOrderById(id) {
  return db.orders.get(id);
}

export async function getCustomerById(id) {
  return db.customers.get(id);
}

export async function getAllCustomers() {
  return db.customers.toArray();
}

export async function getAllOrders() {
  return db.orders.toArray();
}

export async function getAllPayments() {
  return db.payments.toArray();
}

export async function getOrdersByCustomer(customerId) {
  return db.orders.where('customerId').equals(customerId).toArray();
}

export async function getOrdersByStatus(status) {
  return db.orders.where('status').equals(status).toArray();
}

export async function getRevenueByDateRange(startDate, endDate) {
  const orders = await db.orders
    .where('createdAt')
    .between(startDate, endDate, true, true)
    .toArray();
  return orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
}

export async function getOrdersCount() {
  return db.orders.count();
}

export async function getCustomersCount() {
  return db.customers.count();
}

export async function getPaymentsCount() {
  return db.payments.count();
}

export async function saveReceiptToLocal(orderId, receiptNumber, receiptToken, pdfData) {
  await db.receipts.add({
    orderId,
    receiptNumber,
    receiptToken,
    pdfData,
    createdAt: new Date().toISOString(),
    syncedAt: null,
  });
}

export async function getReceiptByOrderId(orderId) {
  return db.receipts.where('orderId').equals(orderId).first();
}

export async function getPendingReceipts() {
  return db.receipts.where('syncedAt').equals(null).toArray();
}

export async function markReceiptSynced(receiptId) {
  await db.receipts.update(receiptId, { syncedAt: new Date().toISOString() });
}

export async function addSyncLogEntry(entityType, entityId, action, status, details = '') {
  await db.syncLog.add({
    entityType,
    entityId,
    action,
    status,
    timestamp: new Date().toISOString(),
    details,
  });
}

export async function getSyncLog(limit = 50) {
  return db.syncLog.orderBy('timestamp').reverse().limit(limit).toArray();
}

/**
 * Mirror server booking requests into Dexie so POS lists render instantly
 * and keep working offline. Server rows are keyed `server_<id>` and marked
 * synced; locally-created pending rows are never touched.
 */
export async function upsertServerOrders(serverRequests) {
  const now = new Date().toISOString();
  let mirrored = 0;
  for (const req of serverRequests || []) {
    if (!req || !req.id) continue;
    const clientId = `server_${req.id}`;
    const existing = await db.orders.where('clientId').equals(clientId).first();
    const row = {
      clientId,
      externalId: req.id,
      customerId: null,
      customerName: req.name || 'Walk-in',
      service: req.service || '',
      totalAmount: Number(req.estimatedTotal) || 0,
      paidAmount: null,
      quantity: (req.items || []).reduce((s, i) => s + (Number(i.kg) || 0), 0) || 1,
      status: req.status || 'new',
      paymentStatus: req.paymentStatus || 'pending',
      paymentMethod: req.paymentMethod || null,
      items: (req.items || []).map((i) => ({
        name: i.service,
        service: i.service,
        price: i.unitPrice,
        unitPrice: i.unitPrice,
        quantity: i.kg,
        kg: i.kg,
        subtotal: i.subtotal,
      })),
      notes: req.notes || '',
      receiptNumber: req.receiptNumber || null,
      receiptToken: req.receiptToken || null,
      syncStatus: 'synced',
      createdAt: req.createdAt || now,
      updatedAt: now,
      lastSyncedAt: now,
    };
    if (existing) {
      await db.orders.update(existing.id, row);
    } else {
      await db.orders.add(row);
    }
    mirrored += 1;
  }
  return { mirrored };
}

/** Mirror server-known customers (by phone) without touching pending locals. */
export async function upsertServerCustomers(serverRequests) {
  const now = new Date().toISOString();
  let mirrored = 0;
  for (const req of serverRequests || []) {
    if (!req || !req.phone) continue;
    const existing = await db.customers.where('phone').equals(req.phone).first();
    if (existing) continue;
    await db.customers.add({
      clientId: `server_${req.phone}`,
      externalId: req.id || null,
      name: req.name || 'Walk-in',
      phone: req.phone,
      email: '',
      address: req.location || '',
      syncStatus: 'synced',
      createdAt: req.createdAt || now,
      updatedAt: now,
      lastSyncedAt: now,
    });
    mirrored += 1;
  }
  return { mirrored };
}
