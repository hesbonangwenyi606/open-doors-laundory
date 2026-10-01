/**
 * Offline service catalog.
 *
 * The price list / service list required for POS checkout is synchronized
 * to Dexie while online (`syncCatalogToLocal`) so the cashier can search,
 * select, price and total orders while offline with no API round trip.
 * Service *administration* (create/edit prices) stays online-only; the
 * local copy is a read-only snapshot with a recorded sync time.
 */
import { db, setLocalSetting, getLocalSetting, upsertServerCustomers } from './db.js';

export const CATALOG_SYNC_KEY = 'catalog_synced_at';

/** Flatten server priceGroups into catalog rows and store locally. */
export async function syncCatalogToLocal() {
  const response = await fetch('/api/site-settings');
  if (!response.ok) {
    throw new Error(`Catalog sync failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  const groups = data.priceGroups || [];

  const rows = [];
  for (const group of groups) {
    const category = group.t || group.title || 'Services';
    for (const item of group.items || []) {
      const [serviceName, priceLabel] = Array.isArray(item) ? item : [item.serviceName, item.price];
      const unitPrice = parseInt(String(priceLabel).replace(/[^\d]/g, ''), 10) || 0;
      rows.push({
        serviceName: String(serviceName),
        priceLabel: String(priceLabel),
        unitPrice,
        category,
        updatedAt: new Date().toISOString(),
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
      });
    }
  }

  // Replace snapshot atomically so a half-written catalog is never served.
  await db.transaction('rw', db.products, async () => {
    await db.products.clear();
    if (rows.length > 0) await db.products.bulkAdd(rows);
  });
  await setLocalSetting(CATALOG_SYNC_KEY, new Date().toISOString());

  if (data.businessInfo) {
    await setLocalSetting('business_info', data.businessInfo);
  }
  return { count: rows.length, syncedAt: await getLocalSetting(CATALOG_SYNC_KEY) };
}

export async function getLocalCatalog() {
  // Sorted in JS (not via an index) so no IndexedDB schema migration is
  // needed on devices already running DB v2.
  const rows = await db.products.toArray();
  return rows.sort((a, b) => String(a.serviceName).localeCompare(String(b.serviceName)));
}

export async function searchLocalCatalog(term) {
  const q = String(term || '').toLowerCase();
  const all = await getLocalCatalog();
  if (!q) return all;
  return all.filter(
    (p) =>
      p.serviceName.toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
  );
}

export async function getCatalogSyncedAt() {
  return getLocalSetting(CATALOG_SYNC_KEY);
}

/**
 * Mirror server-known customers (derived from booking requests on the admin
 * dashboard) into Dexie so the cashier can search/select them offline.
 * Keyed by phone; never overwrites locally-created rows with the same phone
 * that are still pending sync.
 */
export async function syncCustomersToLocal() {
  const response = await fetch('/api/admin/dashboard');
  if (!response.ok) {
    throw new Error(`Customer sync failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  return upsertServerCustomers(data.requests);
}

export async function isCatalogAvailable() {
  return (await db.products.count()) > 0;
}

/** Local line total: unit price × integer quantity (KES, no floats). */
export function priceLine(unitPrice, qty) {
  const q = Math.max(1, Math.min(25, Math.floor(Number(qty) || 1)));
  return { qty: q, subtotal: Number(unitPrice) * q };
}
