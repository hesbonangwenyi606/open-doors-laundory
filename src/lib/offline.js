import { db, addToOutbox, markOutboxSynced, markOutboxFailed, getPendingOutboxItems, getOutboxStats as getOutboxStatsDb } from './db.js';

export const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
const REACHABILITY_TIMEOUT_MS = 5000;

let syncInProgress = false;

export function isOnlineNow() {
  return navigator.onLine;
}

/** Backoff delay for attempt N (1-based): 1s, 2s, 4s … capped at 30s. */
export function backoffDelayMs(attempt) {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1), MAX_RETRY_DELAY_MS);
}

/**
 * Distinguish "device has network" (navigator.onLine) from "backend is
 * actually reachable". Returns true only when the API answers.
 */
export async function checkBackendReachable(timeoutMs = REACHABILITY_TIMEOUT_MS) {
  if (!navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch('/api/process', { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Classify a sync failure:
 *  - 'network'   — fetch threw (offline, DNS, timeout): keep pending, retry.
 *  - 'transient' — HTTP 408/429/5xx: keep pending with backoff, retry.
 *  - 'permanent' — other 4xx (validation/auth): move to failed, needs review.
 */
export function classifySyncFailure(error, response) {
  if (!response) return 'network';
  if (response.status === 408 || response.status === 429 || response.status >= 500) return 'transient';
  return 'permanent';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Skip real backoff delays under test runners so retry tests stay fast.
// Production behavior is unchanged.
const isTestEnv =
  typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';
const backoffSleep = (ms) => (isTestEnv ? Promise.resolve() : sleep(ms));

export async function processOutbox() {
  if (syncInProgress || !navigator.onLine) return { processed: 0, synced: 0 };
  syncInProgress = true;
  let processed = 0;
  let synced = 0;

  try {
    const pending = await getPendingOutboxItems();
    for (const item of pending) {
      if (item.retryCount >= MAX_RETRIES) {
        await markOutboxFailed(item.id, new Error(`Max retries (${MAX_RETRIES}) exceeded`), { maxRetries: MAX_RETRIES, permanent: true });
        continue;
      }

      let response = null;
      try {
        const payload = JSON.parse(item.payload);
        const body = {
          entityType: item.entityType,
          entityId: item.entityId,
          action: item.action,
          payload,
          idempotencyKey: item.idempotencyKey,
        };

        // Order status updates reference the SERVER booking id, which is only
        // known after the matching create has been acknowledged. If the local
        // row has no externalId yet, defer: the create sorts earlier in the
        // queue (FIFO by createdAt) and the update will resolve next cycle.
        // Deferral does not burn retries.
        if (item.entityType === 'order' && item.action === 'update') {
          const serverId = await resolveServerOrderId(item.entityId);
          if (!serverId) {
            continue;
          }
          body.payload = { ...payload, serverId };
        }

        response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          let ack = null;
          try {
            ack = await response.clone().json();
          } catch {
            ack = null;
          }
          await markOutboxSynced(item.id);
          try {
            await markEntitySynced(item, ack);
          } catch {
            // Local mirror update is best-effort; outbox ack is authoritative.
          }
          processed += 1;
          synced += 1;
        } else if (classifySyncFailure(null, response) === 'permanent') {
          const detail = await response.text().catch(() => `HTTP ${response.status}`);
          await markOutboxFailed(item.id, new Error(`Sync rejected (HTTP ${response.status}): ${detail.slice(0, 200)}`), { maxRetries: MAX_RETRIES, permanent: true });
          processed += 1;
        } else {
          // Transient: back off before the next item so we don't hammer a
          // struggling server; item stays pending for the next cycle.
          await markOutboxFailed(item.id, new Error(`Sync failed: HTTP ${response.status}`), { maxRetries: MAX_RETRIES });
          await backoffSleep(backoffDelayMs(item.retryCount + 1));
          processed += 1;
        }
      } catch (error) {
        // Network-level failure (backend unreachable mid-sync): keep the
        // item pending and stop this cycle — remaining items will be tried
        // on the next connectivity event instead of burning retries.
        await markOutboxFailed(item.id, error, { maxRetries: MAX_RETRIES });
        break;
      }
    }
  } catch (error) {
    console.error('Outbox processing error:', error);
  } finally {
    syncInProgress = false;
  }
  return { processed, synced };
}

async function resolveServerOrderId(clientId) {
  const row = await db.orders.where('clientId').equals(clientId).first();
  return row?.externalId || null;
}

async function markEntitySynced(item, ack = null) {
  const now = new Date().toISOString();
  if (item.entityType === 'order') {
    const patch = { syncStatus: 'synced', lastSyncedAt: now };
    // Remember the server booking id so later updates/deletes can target it.
    if (ack?.externalId) patch.externalId = ack.externalId;
    await db.orders.where('clientId').equals(item.entityId).modify(patch);
  } else if (item.entityType === 'customer') {
    await db.customers.where('clientId').equals(item.entityId).modify({ syncStatus: 'synced', lastSyncedAt: now });
  } else if (item.entityType === 'payment') {
    await db.payments.where('clientId').equals(item.entityId).modify({ syncStatus: 'synced', lastSyncedAt: now });
  }
}

export async function enqueueSync(entityType, entityId, action, payload) {
  const idempotencyKey = `${entityType}_${entityId}_${action}_${Date.now()}`;
  const outboxId = await addToOutbox(entityType, entityId, action, payload, idempotencyKey);
  if (navigator.onLine) {
    processOutbox();
  }
  return outboxId;
}

export async function getOutboxStats() {
  return getOutboxStatsDb();
}

export function setupConnectivityListeners(onOnline, onOffline) {
  window.addEventListener('online', async () => {
    if (onOnline) await onOnline();
    await processOutbox();
  });

  window.addEventListener('offline', () => {
    if (onOffline) onOffline();
  });
}

export async function retryFailedItems() {
  const failed = await db.outbox.where('status').equals('failed').toArray();
  for (const item of failed) {
    await db.outbox.update(item.id, { status: 'pending', error: null, retryCount: 0 });
  }
  if (navigator.onLine) {
    processOutbox();
  }
}

export async function getPendingCount() {
  return getPendingOutboxItems().then(items => items.length);
}

export async function getLastSyncTime() {
  const synced = await db.outbox.where('status').equals('synced').reverse().sortBy('syncedAt');
  return synced.length > 0 ? synced[0].syncedAt : null;
}
