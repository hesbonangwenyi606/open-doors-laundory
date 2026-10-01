# Open Doors Laundromat POS — Offline-First PWA Architecture

**Document Version:** 1.0.0  
**Last Updated:** 2026-09-25  
**Application Version:** 1.0.0  
**Environment:** Development (SQLite) / Production (PostgreSQL recommended)

---

## 1. Overview

This document describes the offline-first PWA architecture of the Open Doors Laundromat POS system. The application is designed to operate fully offline, with all transactions stored locally and synchronized to the backend when connectivity returns.

---

## 2. PWA Architecture

### 2.1 Application Shell

The application shell consists of:
- `index.html` — Main HTML entry point
- `manifest.json` — Web app manifest for PWA installation
- `sw.js` — Service worker for offline caching
- `assets/` — Static assets (logo, images)
- `dist/` — Built production output

### 2.2 Service Worker Strategy

The service worker (`public/sw.js`) implements a multi-strategy caching approach:

| Resource Type | Strategy | Cache Name |
|--------------|----------|------------|
| Static assets (JS, CSS, fonts, images) | Cache-first | `open-doors-v2` |
| API GET requests | Network-first | `open-doors-api-v1` |
| API POST requests | Outbox cache | `open-doors-outbox-v1` |
| PWA manifest | Cache-first | `open-doors-v2` |

**Cache Versioning:**
- `CACHE_NAME = 'open-doors-v2'` — Application shell cache
- `API_CACHE = 'open-doors-api-v1'` — API response cache
- `OUTBOX_CACHE = 'open-doors-outbox-v1'` — Outbox cache for offline POST requests

**Update Mechanism:**
- `skipWaiting()` is called on install to activate the new service worker immediately
- `clients.claim()` is called on activation to take control of all clients
- Old caches are deleted on activation except the current version

### 2.3 Offline Navigation

When offline, the service worker serves the application shell from cache. The SPA handles routing client-side, so all pages are available offline after the first load.

---

## 3. Local Database (IndexedDB/Dexie)

### 3.1 Database Schema

The application uses **Dexie.js** (IndexedDB wrapper) for local persistence. The database is named `OpenDoorsPOS` and version 2.

#### Tables

| Table | Key Fields | Sync Status |
|-------|-----------|-------------|
| `customers` | `++id, externalId, clientId, name, phone, email, syncStatus` | `pending`, `synced`, `failed` |
| `orders` | `++id, externalId, clientId, customerId, service, status, syncStatus` | `pending`, `synced`, `failed` |
| `payments` | `++id, externalId, clientId, orderId, amount, method, syncStatus` | `pending`, `synced`, `failed` |
| `products` | `++id, externalId, name, price, category, syncStatus` | `pending`, `synced`, `failed` |
| `outbox` | `++id, entityType, entityId, clientId, action, idempotencyKey, status` | `pending`, `synced`, `failed` |
| `syncLog` | `++id, entityType, entityId, action, status, timestamp` | N/A |
| `settings` | `key, value, updatedAt` | N/A |
| `receipts` | `++id, orderId, receiptNumber, receiptToken, pdfData, syncedAt` | `syncedAt` null = pending |

### 3.2 Data Durability

IndexedDB data survives:
- ✅ Page refresh
- ✅ Browser restart
- ✅ PWA restart
- ✅ Temporary network loss
- ✅ Service worker updates (data is not cleared)

### 3.3 Database Migration Safety

When upgrading from version 1 to version 2:
- Existing data is preserved
- New fields (`clientId`, `idempotencyKey`) are added to the schema
- Old data is automatically upgraded by Dexie
- No data is cleared during migration

---

## 4. Outbox / Sync Queue

### 4.1 Architecture

Every offline mutation is stored in the `outbox` table before being persisted to the local database. The outbox serves as the synchronization queue.

```text
Offline Mutation
     ↓
Local Database (customers/orders/payments)
     ↓
Outbox Entry (pending)
     ↓
Connectivity Returns
     ↓
Sync Process
     ↓
API POST /api/sync
     ↓
Server Processes
     ↓
Mark Outbox as Synced
```

### 4.2 Outbox Item Structure

```javascript
{
  entityType: 'order' | 'customer' | 'payment',
  entityId: string,        // Client-generated ID
  clientId: string,        // Unique client identifier
  action: 'create' | 'update',
  payload: object,         // The actual data
  idempotencyKey: string,  // For duplicate prevention
  status: 'pending' | 'synced' | 'failed',
  retryCount: number,
  createdAt: ISOString,
  syncedAt: ISOString | null,
  error: string | null,
}
```

### 4.3 Idempotency and Duplicate Prevention

Each outbox item has an `idempotencyKey` that is sent to the server. The server checks for duplicate requests using this key. If a duplicate is detected, the server returns the existing result without creating a new record.

**Idempotency Key Format:** `${entityType}_${entityId}_${action}_${timestamp}`

### 4.4 Retry Strategy

- Maximum retries: 5
- Failed items are marked with `status: 'failed'` and `retryCount` incremented
- Manual retry via "Sync Now" button or `retryFailedItems()` function
- Failed items can be retried after connectivity returns

---

## 5. Offline Authentication

### 5.1 Strategy

Offline authentication uses a locally-stored session based on previously verified online credentials. The approach:

1. User logs in online → Server creates HMAC-signed session cookie
2. Session state is stored locally in `localStorage` under `od_offline_auth`
3. When offline, the application checks the local session validity
4. Session expires after 24 hours

### 5.2 Implementation

```javascript
// Store offline auth
setOfflineAuth({ adminId, username, token, expiresAt });

// Check validity
isOfflineSessionValid();  // Returns true/false

// Get user info
getOfflineUser();  // Returns { id, username } or null
```

### 5.3 Security

- **No raw passwords stored** — Only a derived token
- **Session expiration** — 24-hour timeout
- **No authentication bypass** — Must have been authenticated online first
- **Token is derived** — `btoa(JSON.stringify({ username, ts }))` — not a real JWT

### 5.4 Limitations

- Offline session is a convenience feature, not a security replacement
- Administrative operations require server verification
- The offline session cannot be used to authenticate against the server
- Session must be established online before going offline

---

## 6. Offline POS Workflow

### 6.1 Complete Offline Workflow

```text
1. Open POS (loads from cache)
2. Check offline auth state
3. View customers (from IndexedDB)
4. Create customer (IndexedDB + Outbox)
5. Select service (from local data)
6. Create order (IndexedDB + Outbox)
7. Add service/item (IndexedDB + Outbox)
8. Change quantity (IndexedDB + Outbox)
9. Calculate total (client-side)
10. Record payment (IndexedDB + Outbox)
11. Generate receipt (IndexedDB + jspdf)
12. Download PDF (client-side)
13. Print receipt (browser print)
14. Update status (IndexedDB + Outbox)
15. Create additional transactions
16. Refresh/Restart (data persists)
```

### 6.2 Available Offline

- ✅ View customers
- ✅ Create customer
- ✅ View orders
- ✅ Create order
- ✅ Add service/item
- ✅ Change quantity
- ✅ Calculate totals
- ✅ Record cash payment
- ✅ Generate receipt
- ✅ Download PDF receipt
- ✅ Print receipt (via browser)
- ✅ View sync status
- ✅ Force sync

### 6.3 Not Available Offline

- ❌ M-Pesa payment processing (requires external API)
- ❌ Admin settings changes (requires server)
- ❌ Service/product creation (requires admin)
- ❌ Reports (requires server data)
- ❌ Dashboard analytics (requires server)

---

## 7. Offline PDF Receipts

### 7.1 Implementation

PDF generation uses **jsPDF** library. Receipts are generated entirely client-side from local transaction data.

```javascript
import { jsPDF } from 'jspdf';

const doc = new jsPDF();
doc.text('OPEN DOORS LAUNDROMAT', pageWidth / 2, 20, { align: 'center' });
// ... receipt content
const pdfData = doc.output('datauristring');
```

### 7.2 Receipt Data Flow

```text
Transaction Data (IndexedDB)
     ↓
generateReceiptPDF(order, receiptNumber, receiptToken)
     ↓
jsPDF Document
     ↓
downloadPDFReceipt(receiptData)  →  Download PDF file
printReceipt(receiptData)        →  Browser print dialog
saveReceiptToLocal(orderId, ...) →  Store in IndexedDB
```

### 7.3 Receipt Content

- Business name and logo
- Receipt number (format: `OD-YYYYMMDD-XXX`)
- Token (unique identifier)
- Date/time
- Customer information
- Service items with prices
- Total, paid, change amounts
- Status
- Thank you message

---

## 8. Connectivity Detection

### 8.1 Implementation

The application uses multiple methods to detect connectivity:

```javascript
// Primary: navigator.onLine
const isOnline = navigator.onLine;

// Secondary: Event listeners
window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);

// Tertiary: Backend reachability check
fetch('/api/admin/session').then(...).catch(...);
```

### 8.2 Distinction

The application distinguishes between:
- **Device has network connectivity** (`navigator.onLine`)
- **Backend is actually reachable** (API call succeeds)

The connectivity indicator in the header shows:
- 🟢 Online
- 🔴 Offline
- 🔄 Syncing...
- ⏳ Pending changes: N

---

## 9. PWA Update Strategy

### 9.1 Service Worker Updates

When a new version is deployed:
1. Service worker detects new version
2. New SW installs alongside old SW
3. `skipWaiting()` activates new SW immediately
4. Old SW's caches are preserved
5. IndexedDB data is NOT affected
6. New SW claims all clients

### 9.2 Data Preservation

- **IndexedDB**: Never cleared during updates
- **localStorage**: Preserved
- **Outbox**: Preserved and synced by new SW
- **Receipts**: Preserved in IndexedDB

### 9.3 Migration Safety

Dexie version 2 migration:
- Existing data is preserved
- New indexes are added
- No data loss

---

## 10. Security

### 10.1 Offline Data Security

- **IndexedDB**: Browser-isolated storage, not accessible cross-origin
- **localStorage**: Same-origin policy applies
- **No raw passwords**: Only derived tokens stored
- **Session expiration**: 24-hour timeout for offline auth

### 10.2 API Security

- All sync requests require admin authentication (`requireAdmin` middleware)
- HMAC-signed session cookies
- Rate limiting on login and sync endpoints
- Input validation on all API endpoints

### 10.3 Offline Limitations

- Offline authentication is a convenience feature
- Administrative operations require server verification
- Financial transactions should be verified when online
- The server is the source of truth

---

## 11. Hardware Integration

### 11.1 Thermal Printers

**Status:** Partially Supported

| Type | Status | Method |
|------|--------|--------|
| 58mm USB | ✅ Via system printer | `window.print()` |
| 58mm Network | ✅ Via system printer | `window.print()` |
| 80mm USB | ✅ Via system printer | `window.print()` |
| 80mm Network | ✅ Via system printer | `window.print()` |
| Bluetooth | ⚠️ Requires bridge | Not directly supported |
| ESC/POS | ❌ Not in browser | Requires native bridge |

### 11.2 Barcode Scanners

**Status:** Keyboard-Emulation Supported

| Type | Status | Method |
|------|--------|--------|
| USB Keyboard-Emulation | ✅ Native | Keyboard input |
| Bluetooth Keyboard-Emulation | ✅ Native | Keyboard input |
| WebHID | ⚠️ Needs implementation | `navigator.hid` |
| WebUSB | ⚠️ Needs implementation | `navigator.usb` |
| Web Serial | ⚠️ Needs implementation | `navigator.serial` |

### 11.3 Receipt Workflow

```text
Transaction
     ↓
Receipt Data (IndexedDB)
     ↓
┌───────────────┐
│               │
PDF          Thermal Print
 │               │
Download       Print
│               │
└───────┬───────┘
        ↓
   Fallback if printer unavailable
```

---

## 12. Browser Compatibility

### 12.1 PWA Support

| Browser | PWA Install | Service Worker | IndexedDB | Offline |
|---------|------------|----------------|-----------|---------|
| Chrome 90+ | ✅ | ✅ | ✅ | ✅ |
| Edge 90+ | ✅ | ✅ | ✅ | ✅ |
| Firefox 90+ | ⚠️ Limited | ✅ | ✅ | ✅ |
| Safari 14+ | ⚠️ Limited | ✅ | ✅ | ⚠️ |
| Samsung Internet | ✅ | ✅ | ✅ | ✅ |

### 12.2 Known Limitations

- **Safari**: PWA installation is limited; service worker caching may not persist
- **Firefox**: PWA installation requires manual manifest validation
- **Mobile browsers**: PWA installation depends on browser-specific prompts
- **iOS Safari**: Service worker limitations; IndexedDB may be cleared

---

## 13. First-Time Installation

### 13.1 Online First

First-time installation requires internet:
1. Application shell must be downloaded
2. Service worker must be registered
3. Initial business data must be synchronized
4. PWA manifest must be fetched

### 13.2 After Installation

After initial synchronization:
- Application shell is cached
- Business data is available offline
- All POS operations work offline
- Transactions are stored locally

---

## 14. Testing Checklist

### 14.1 Offline Testing

- [ ] Open POS online
- [ ] Log in
- [ ] Synchronize data
- [ ] Disconnect internet
- [ ] Create customer
- [ ] Create order
- [ ] Add service/item
- [ ] Calculate total
- [ ] Record payment
- [ ] Generate receipt
- [ ] Download PDF
- [ ] Refresh application
- [ ] Verify data persists
- [ ] Close PWA
- [ ] Reopen PWA
- [ ] Verify data persists
- [ ] Reconnect internet
- [ ] Verify automatic sync
- [ ] Verify no duplicates
- [ ] Verify reports update

### 14.2 Sync Testing

- [ ] Create transaction offline
- [ ] Create second transaction offline
- [ ] Create third transaction offline
- [ ] Reconnect internet
- [ ] Verify all transactions sync
- [ ] Verify server acknowledges
- [ ] Verify local records marked synced
- [ ] Verify no duplicates
- [ ] Test offline → online → offline → online
- [ ] Verify no data loss

---

## 15. Production Deployment Requirements

### 15.1 Environment Variables

```env
DATABASE_URL="postgresql://..."
ADMIN_EMAIL="admin@opendoorslaundromat.co.ke"
ADMIN_PASSWORD="your-strong-password"
SESSION_SECRET="your-32-byte-secret"
NODE_ENV="production"
PORT=3001
```

### 15.2 Server Requirements

- Node.js 20+
- PostgreSQL 16+ (recommended for production)
- HTTPS (required for service worker and PWA)
- Proper CORS configuration
- Rate limiting

### 15.3 PWA Requirements

- Valid `manifest.json` with proper icons
- Service worker registered
- HTTPS enabled
- Proper cache headers
- `start_url` and `scope` configured

---

## 16. Architecture Diagram

```text
                    ┌────────────────────┐
                    │     POS UI         │
                    │  (React + Vite)    │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Application Layer  │
                    │  (AuthContext,     │
                    │   OfflinePOSPage)  │
                    └─────────┬──────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │  Local Data  │ │  Outbox/Sync │ │  Auth State  │
     │  Layer       │ │  Queue       │ │  (Offline)   │
     │  (Dexie)     │ │              │ │  (localStorage)│
     └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
            │                │                │
            │    Internet    │                │
            │                │                │
            ▼                ▼                ▼
     ┌─────────────────────────────────────────────┐
     │              Backend API                     │
     │         (Express.js + Prisma)                │
     └─────────────────┬───────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  PostgreSQL    │
              │  (Production)  │
              │  SQLite        │
              │  (Dev)         │
              └────────────────┘
```

---

## 17. Glossary

| Term | Definition |
|------|-----------|
| **Outbox** | Queue of pending synchronization items |
| **Idempotency Key** | Unique identifier to prevent duplicate sync |
| **Dexie** | IndexedDB wrapper library |
| **PWA** | Progressive Web App |
| **Service Worker** | Background script for caching and sync |
| **Offline-First** | Architecture where offline operation is primary |
| **Sync** | Process of uploading local changes to server |
| **Client ID** | Unique identifier generated per offline session |

---

**Document maintained by the Open Doors Laundromat POS team.**

---

## Addendum 2026-09-26 — Offline-first hardening (Muse Spark)

### Bugs found by audit + reproduction (all fixed, all re-tested)
1. **Offline auth bypass (critical).** `authenticateOffline(username, password)` granted an `offline-admin` session to ANY caller without checking the password, and it was dead code (never wired into login). Replaced with a grant model: successful ONLINE login records an identity-only grant (`grantOfflineAccess`, no password stored); `resumeOfflineSession()` only resumes a valid unexpired grant on the same device; the old function now throws. `AuthContext.checkSession` falls back to the grant on network failure; `LoginPage` offers "Continue offline" only when a grant exists; logout revokes the grant. Fresh devices cannot bypass login.
2. **Outbox auto-retry was broken.** `markOutboxFailed` moved items to `failed` on the FIRST transient error, so `getPendingOutboxItems` never picked them up again. Now transient/network failures keep items `pending` with `retryCount++`; `failed` only after 5 attempts or on permanent 4xx. Verified by `offline-sync.test.js` (13 tests, fake-indexeddb).
3. **No backend reachability check.** App relied solely on `navigator.onLine`. Added `checkBackendReachable()` (5s-timeout probe of `/api/process`) driving a new "Online — server unreachable" status; `classifySyncFailure()` splits network/transient/permanent.
4. **No offline price catalog.** Dexie `products` table existed but nothing populated it; the offline order form used free-text service + hand-typed totals. Added `src/lib/catalog.js` (`syncCatalogToLocal` on online load/reconnect) and a catalog service `<select>` with local qty×price math (integer KES). Empty-catalog state is honest ("connect once to download").
5. **SW replayed POSTs + cached admin GETs (auth risk).** Removed POST interception (Dexie outbox with idempotency keys is the single sync path); only public GETs (`/api/process`, `/api/site-settings`, `/api/receipts/*`) are cached; added SPA navigation fallback to cached `/index.html` so `/offline-pos` boots offline; Background Sync now wakes the page instead of replaying requests itself.
6. **PWA not installable.** Manifest icons pointed at a JPEG photo with wrong sizes. Generated real PNG icons (`public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`) + `public/favicon.ico` via ImageMagick, updated manifest (any + maskable purposes), cached icons in APP_SHELL.
7. **Crash found en passant:** `OfflinePOSPage` rendered `<Wifi>` without importing it (ReferenceError whenever online). Fixed import. Also replaced `toFixed(2)` on possibly-undefined totals with `Number(...).toLocaleString()` (3 sites).

### Offline E2E simulation (vitest + fake-indexeddb, actually executed)
Covered in `src/test/offline-sync.test.js`: durable offline order/customer queueing with stable idempotency keys; ack marks outbox+entity synced; 500 keeps pending; 400 fails fast; network drop keeps pending without retry burn; key stability across retries; exhaustion→failed→manual retry recovery; catalog sync + `600×2=1200` math; reachability true/false. Suite: 43/43 passing (was 28/28).

### Conflict-resolution rules (documented, enforced where possible)
- Financial records are append-only: orders/payments are created with client IDs + idempotency keys; sync never updates server financial rows, only creates. Retried POSTs dedupe server-side (`/api/sync` idempotencyKey lookup).
- Status changes are last-writer-wins by `updatedAt`; offline status edits re-enter the outbox as `update` actions.
- Catalog/pricing is server-authoritative: local copy is a read-only snapshot with `catalog_synced_at`; offline orders snapshot the unit price at sale time, so later price changes never rewrite history.
- Customer dedupe is by `clientId`; two devices creating the "same" customer yield two server rows (accepted limitation — reconcile by phone in dashboard).

### Remaining limitations (unchanged / not bugs)
- First install + first login + first catalog sync REQUIRE internet (impossible otherwise).
- No physical hardware tested (printers, scanners); M-Pesa is Cash-or-pending (STK needs connectivity + Daraja credentials).
- No GUI browser in this environment: install prompt, theme, responsive verified statically (manifest valid, icons 192/512 PNG, theme-color, standalone display).

---

## Addendum 2026-09-26 — Offline status sync + sync-failure honesty (Muse Spark)

### Gaps found by audit (reproduced, then fixed)
1. **Offline status changes had no sync path.** The server accepted `order/update` via `/api/sync`, but no UI, hook, or outbox flow ever produced one — cashiers could not advance laundry status offline at all. Implemented end-to-end:
   - `useOffline.updateOrderStatusOffline(orderId, status)` (allowlist-validated client-side) + "→ confirmed/completed" button on each offline order card.
   - Sync engine resolves the server booking id from the stored create acknowledgement (`externalId` now persisted on the local row); updates for not-yet-synced creates **defer without burning retries**.
   - Server `handleOrderSync/update` now validates status (allowlist) and order existence instead of throwing 500s.
2. **Failed syncs were silently marked synchronized.** `/api/sync` returned HTTP 200 even for `{success:false}` (unknown entity/action, invalid status, missing order), so the client acked them as synced — silent data loss. The endpoint now returns **422** for rejected operations; the client records them `failed` (visible, manually retryable), never `synced`.
3. Verified live: valid update 200, invalid status 422, missing order 422, unknown entity 422.

### Architecture map (as implemented)
```text
OfflinePOSPage (React)
  → useOffline (create/update + catalog + reachability + auto-sync on reconnect)
  → Dexie OpenDoorsPOS v2 (customers/orders/payments/products/outbox/syncLog/settings/receipts)
  → outbox rows {entityType, entityId=clientId, action, payload(JSON), idempotencyKey, status, retryCount, error}
  → processOutbox (FIFO, sequential; network/transient→pending+backoff 1s→30s cap/5 tries; permanent 4xx/422→failed; mid-sync network drop→stop cycle, no retry burn)
  → POST /api/sync (admin cookie) → handleSync → bookingRepository → SQLite (dev) / Postgres (prod)
  → ack {externalId} → local row marked synced + externalId stored → later updates target serverId
  → retries keep the SAME idempotencyKey; server dedups replays (duplicate:true)
```
- Receipt strategy: PDF bytes are NOT stored wholesale; receipt data + order row persist locally and the PDF regenerates deterministically (`generateReceiptPDF`), with the generated copy cached in `receipts` for instant re-download.
- Order numbering: local `client_<ts>_<rand>` IDs (collision-safe across devices); server receipt numbers `OD-YYYYMMDD-XXX` with P2002-retry on collision.
- Conflict rules: financial rows append-only; status last-writer-wins by application order (FIFO); catalog snapshot is read-only with `catalog_synced_at`; customer dupes possible across devices (reconcile by phone) — documented limitation.
- PWA update safety: SW caches app shell + public GETs only (never admin/auth), versioned cache names with old-cache purge, IndexedDB untouched by SW updates, Dexie v2 schema unchanged (catalog sorts in JS — no migration needed).

### Test evidence (executed 2026-09-26)
- `npm test`: 6 files, **59/59 pass** (4 new: create→update serverId resolution, update deferral with zero server calls, 422→failed visibility, 100-txn perf <15s writes/<5s reads).
- `npm run build` ✓ · `npm run lint` 0 errors.
- Live backend E2E: 3 mixed transactions created (1200/600/2100 verified from DB), status lifecycle, sync-update valid 200 / invalid 422 / missing 422 / unknown-entity 422, idempotent replay, cleanup deletes, dashboard consistent.
- Browser-dependent items (service-worker install, DevTools offline toggle, PWA close/reopen) cannot run in this headless environment — marked PARTIALLY VERIFIED with exact manual steps in full-system-qa.md; all logic beneath them is unit/integration-tested with fake-indexeddb + mocked fetch.

---

## Addendum 2026-09-26 — POS sale screen + shell repair (Muse Spark)

### Root causes found (all reproduced from code + live routes)
1. **POS Services nav escaped to marketing.** `POSLayout` linked `Services → /services`, a public marketing route rendered OUTSIDE the POS shell. Fixed: new authenticated `/new-order` POS sale screen; POS nav now `Dashboard / New Sale / Orders / Customers / Payments / Reports / Offline / Settings` — no POS link leaves the shell. Public `/services` unchanged.
2. **No cart/order-entry screen existed.** Built `POSSalePage`: catalog search → qty stepper → cart (add/merge/set-qty/remove, integer KES totals) → customer select-or-create (local cache) → Cash / M-Pesa (offline M-Pesa explicitly queued-pending, never confirmed) → atomic persist → receipt + PDF/print + status.
3. **POS shell had no styles.** All `.pos-*` layout CSS lived in `LoginPage.css`, which POS routes never import (`POSLayout` imports only the stub `POSLayout.css`). Shell rendered unstyled/broken. Moved the 262-line block to its proper file.
4. **Fake "Online" badge + no theme toggle.** Header hardcoded `Online` and derived titles from a props hack. Now: live status (Online·synced / Syncing·N / Offline·N pending / Server unreachable) from the sync engine, working Sun/Moon toggle on the single `od-theme` system (new shared `useTheme` hook), route-based titles, corrected overlay class.
5. **Orders/Customers were online-only** (blank "No orders" offline — misleading). Both are local-first now: Dexie renders instantly, server responses upsert a `server_<id>`/`server_<phone>` mirror without touching pending rows; honest offline notices; status changes go through the queued update path.
6. **No atomic sale write.** New `addOrderTransaction` commits order + payment + outbox rows in one Dexie transaction. Server mirrors: `upsertServerOrders` (idempotent re-mirror), `upsertServerCustomers` (shared with catalog sync, by phone).
7. **Footer gap.** Slim POS status footer (business line + live sync badge) instead of a forced marketing footer.

### Verification
`npm test` 71/71 (12 new in `pos-sale.test.jsx`: cart math, atomicity, mirror idempotency, routing separation, theme persistence) · `npm run build` ✓ · `npm run lint` 0 errors (100 warnings, down from 118) · live `:5173/new-order` 200 · catalog API 3 groups/19 items · secondary pages (Payments/Reports/Settings/Admin) verified fail-soft offline via code inspection.
