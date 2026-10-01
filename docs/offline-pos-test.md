# Offline POS Test Report — Open Doors Laundromat

**Cycle date:** 2026-09-26
**Tester:** senior engineer (automated + live-API execution; no GUI browser in this environment)
**Suite baseline:** 71/71 vitest passing · `npm run build` ✓ · `npm run lint` 0 errors
**Servers:** dev backend `:3001` + Vite `:5173`, both live during testing

> Environment limit (applies to every row marked BROWSER): no graphical browser is
> available here, so physical clicks, DevTools offline toggles, PWA install banners,
> and screenshots were NOT performed. Every such row was instead verified with the
> strongest available proxy: real React components under jsdom + real Dexie
> (fake-indexeddb) + real sync engine + mocked fetch, plus live HTTP checks against
> the real backend/SQLite on `:3001`. Rows are marked accordingly — nothing is
> claimed as browser-tested that was not.

## Initial test (this cycle)

Feature | Test | Expected | Actual | Status
------- | ---- | -------- | ------ | ------
App online load | GET `:5173/` | 200 shell | 200 | PASS
API online | GET `/api/process`, login 200 | 200 | 200 | PASS
Auth login/logout | valid 200 + cookie; invalid 401; dashboard 401 w/o cookie | enforced | enforced | PASS
Offline grant resume | valid grant resumes; fresh device refused; logout revokes | safe | safe (8 tests) | PASS
POS nav separation | POS nav has New Sale → `/new-order`, no link to marketing `/services` | separated | separated (render test) | PASS
Sale screen render | `/new-order` behind auth shows service selection | renders | renders | PASS
Cart offline | add/merge/qty/remove/totals, integer KES | 600×2=1200 etc. | correct (cart unit tests) | PASS
Customer offline | select cached + create new, stable clientId, queued | persisted | persisted (component test) | PASS
Order offline | atomic order+payment+outbox commit | all-or-nothing | verified in Dexie | PASS
Cash payment offline | recorded + queued | recorded | recorded | PASS
M-Pesa offline | queued-pending, never confirmed | honest pending | honest pending | PASS
Receipt data offline | completion shows number/total/status | shown | shown | PASS
Receipt PDF line items | PDF lists the sold services | itemized | **PDF shows NO items (`items: []` passed)** | **FAIL (F1)** |
Receipt re-access (pending orders) | Orders page offers receipt for offline-created orders | available | **no button (no `receiptToken`)** | **FAIL (F2)** |
Receipt persistence | completed sale saved to local receipts table | saved | **not saved (only shown)** | **FAIL (F3)** |
Status update offline | advance + queue + serverId resolve | works | works (17 sync tests) | PASS
Refresh survival | unmount/remount, Dexie re-read | intact | intact (test) | PASS |
Restart survival | close/reopen (new Dexie handle, same DB) | intact | PARTIAL — same-handle tested; new-handle reopen NOT proven | PARTIAL (F4 doc) |
Multi-order offline | 2–3 sales queued | queued | queued (multi-cycle test) | PASS |
Auto-sync on reconnect | outbox drains, rows marked synced | synced | synced (test + live) | PASS |
Exactly-once | interrupt mid-sync → retry → 1 server record | 1 record | 1 record (fake-server + live dedup) | PASS |
Partial failure | 1 poisoned item; rest sync; failed visible | isolated | isolated | PASS |
422 honesty | rejections → failed, never silently synced | failed | failed (test + live) | PASS |
Theme toggle + persist | Sun/Moon flips `data-theme`, survives remount | persists | hook-tested only; shell button NOT exercised | PARTIAL (F5) |
Responsive (all breakpoints) | no overflow, usable cart | static CSS only | NOT browser-measured | BLOCKED (env) |
PWA install/offline launch | install banner, SW offline boot | NOT performed | BLOCKED (env) |
Live DB totals | 1200/600/2100 read back | correct | correct | PASS |

## Failures to fix this cycle

- **F1** — sale-completion PDF/print receipt omits line items (empty `items` passed to generator).
- **F2** — offline-created (pending) orders have no receipt access from Orders page.
- **F3** — completed sales are not saved to the local `receipts` table.
- **F4** — restart proof needs a genuine new-Dexie-handle reopen check (or explicit doc).
- **F5** — POS shell theme button needs a click-level test.

## Fixes applied

- **F1 (itemized receipt PDF)** — `POSSalePage` now generates the PDF from the real cart snapshot at completion time and reuses those bytes for download/print. `src/POSSalePage.jsx`.
- **F2 (receipt re-access)** — completion stamps `receiptNumber`/`receiptToken` onto the local order row (`updateLocalOrder(..., {markPending:false})` so synced sales are never re-pended); `OrdersPage` gained a "Receipt (PDF)" button for pending rows that regenerates the PDF deterministically from the row. `src/OrdersPage.jsx`, `src/lib/db.js`.
- **F3 (receipt persistence)** — every completed sale is saved to the local `receipts` table (verified: 1 row, `data:application/pdf` prefix, survives handle restart).
- **F4 (restart proof)** — new test closes ALL Dexie handles and reopens the same database with a fresh `OpenDoorsDB()` instance: order + items + receipt + outbox all intact.
- **F5 (shell theme click test)** — renders the real `POSLayout` authenticated, clicks the header toggle, asserts `data-theme` + `localStorage`, unmounts/remounts and asserts persistence.

## Final test

- `npm test`: **8 files, 77/77 PASS** (6 new: 4 cashier workflow + 1 restart-durability + 1 shell-theme; all pre-existing intact).
- `npm run build`: **PASS** · `npm run lint`: **0 errors** (100 warnings, all pre-existing).
- Live backend retest: login 200 · multi-item booking 201 with server math 600×2+700=1900 PASS · lifecycle confirmed/completed · cleanup deletes · **zero duplicate receipt numbers/tokens in DB** (group-by query).
- Note on numbering: after deleting a completed order, its `OD-…` number may be reused by a later order — only one live row ever holds a number (unique constraint enforced, verified). Receipt *tokens* never repeat.
- Remaining BLOCKED items are environmental only (no GUI browser/hardware): visual responsive pass, PWA install banner, physical printer/scanner, DevTools-offline click path. All logic beneath them is covered by component + integration tests above.
