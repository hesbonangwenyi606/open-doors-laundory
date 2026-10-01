# UI/UX Audit — Open Doors Laundromat

**Audit date:** 2026-09-26
**Method:** code + stylesheet inspection, component render tests (jsdom), live servers for route shells.
**Not performed (no GUI browser here):** screenshot review at the 11 viewports, visual dark/light inspection,
physical print/paper check, install-banner check. These are marked BLOCKED with the exact manual steps at the end.

## Route inventory (from `src/App.jsx` + servers)

Public marketing: `/ /services /process /pricing /about /contact /booking /faq /receipt/:token /login /404`
Authenticated POS (`POSLayout` shell): `/dashboard /admin /new-order /orders /customers /payments /reports /settings /offline-pos`
Reusable components: **none** — `src/components/` is empty; all UI is page-local (consistent class names, one icon library: lucide-react).

## Findings

Page/Component | Viewport/Theme | Issue | Severity | Expected | Actual
---|---|---|---|---|---
Receipt print (all) | print | Printed receipt loses shop contact block | CRITICAL | Contact footer prints | Global print CSS hides **every** `<footer>`, including the receipt's own | 
AdminDashboard | offline | Network failure bounces an authenticated cashier to `/login` | HIGH | Offline error state + retry | `catch { navigate('/login') }` — indistinguishable from expired session |
AdminDashboard | all | Nested `<main>` landmark | HIGH | One main per page | `<main>` inside `POSLayout`'s `<main>` |
Reports, Settings | API failure | Blank page (`return null`) | HIGH | Error state + retry | Nothing renders |
Request modal | small viewport | Content can overflow viewport (no max-height/scroll) | MEDIUM | Internally scrolling dialog | Fixed height, no overflow rule |
Request modal | all | No Escape-to-close; close button has no accessible name | MEDIUM | Esc + labelled close | Icon-only button, click-away only |
Alerts (`.alert-success/.alert-warning/.alert-info`, `.form-success`) | dark mode | Hardcoded dark text (`#1a6b4a`…) on dark-tinted bg | MEDIUM | Theme-aware text | Light-mode-only colors; badges already have dark overrides, alerts do not |
Receipt status pill | all | `.receipt-status.new/confirmed/…` variants unstyled | MEDIUM | Visible status treatments | Only base selector exists |
Booking service grid | ≤480px | (verify) dense 5-col grid | LOW | Stacked rows | CSS already collapses to 1fr + hides head — OK, verify visually |
POS tables | mobile | No `<table>` elements; card lists used everywhere | LOW | Appropriate strategy | Cards + wrap — OK by construction |
Focus states | all | Global `:focus-visible` + input/button rules present | — | Visible focus | Present; do not remove |
Icons | all | Single library (lucide-react) + one inline SVG (`Mail` in MarketingLayout) | LOW | One style | Consistent enough; inline Mail matches stroke style |
Images | all | `loading="lazy"` except hero (`eager` + `fetchPriority`) | — | No LCP harm | Correct |
Z-index | all | Modal 50, drawer overlay 99/40, sidebar 50, menu toggle 60 | LOW | No clipping | Values sane; verify visually on device |

## Fixes applied (this cycle)

1. Print CSS scoped: marketing footer + `.pos-footer` hidden; `.receipt footer` explicitly kept.
2. AdminDashboard: 401 → login redirect; network failure → offline error panel with Retry (no more false logout).
3. AdminDashboard `<main>` → `<div>` (single landmark; POSLayout owns `<main>`).
4. Reports/Settings: real error states with Retry instead of `return null`.
5. Modal: `max-height: calc(100vh - …)` + internal scroll, Escape handler, `aria-label="Close dialog"`.
6. Dark-mode text overrides for alerts + `.form-success` (mirrors badge pattern).
7. Receipt status pill variants (new/confirmed/completed/cancelled/pending) in both themes.

## Verification

- `src/test/ui-ux.test.jsx` (new, 14/14 PASS): modal Escape/close-label, dashboard offline error (no redirect),
  Reports/Settings error states, single-`<main>` assertion, print-CSS scoping rule presence, receipt status classes,
  PDF-download + print-window behaviors with itemized content, XSS escaping in print HTML.
- Full suite: **91/91 across 9 files** · `npm run build` ✓ · `npm run lint` 0 errors (101 pre-existing warnings).
- Live `:3001`/`:5173` shells re-verified 200 after rebuild + backend restart.
- Viewport/theme screenshot pass: **BLOCKED** — needs a real browser (steps below).

## Manual pass still required (real browser)

1. Print a receipt to paper/PDF from Receipt page → confirm contact footer + totals present.
2. Download PDF from sale completion + Orders "Receipt (PDF)" → open, confirm items.
3. Walk every route at 375px / 768px / 1440px in light + dark; confirm no horizontal scroll, drawer, stacked cart.
4. Keyboard-only run: tab order, focus visibility, modal Esc, FAQ accordion, dashboard tabs.

---

## Addendum — Marketing responsive overhaul, verified with real Chromium (2026-09-26)

Tooling: system Chromium 152 headless + CDP (screenshots at 390/768/1440, scrolled footer/menu states,
forced light theme, computed-style assertions, overflow measurement on `/ /services /booking /contact /faq`).

### Root causes (all measured, not guessed)
1. **Giant footer envelope (240px):** custom inline `Mail` SVG in `MarketingLayout.jsx` ignored the `size`
   prop (raw `<svg>` has no dimension defaults) and ballooned to container width. Replaced with lucide
   `Mail`; added a defensive `.footer-column a svg` 14px guard.
2. **Invisible "Sign in" button:** TWO competing `.nav-cta` rules — `styles.css` (no `!important`,
   light bg) vs `MarketingLayout.css` (`!important`, light text, transparent bg). Mixed winners produced
   light-on-light in dark mode. Resolved into one complete rule (inverse-pair bg/text, readable both themes)
   plus a matching `:hover`.
3. **Footer "unreadable text":** investigated — computed contrast is ~15:1 (fine); the washed look was a
   downscaled-screenshot artifact. No change needed; verified instead.
4. **"Giant void" between CTA and footer:** measurement artifact of a 7000px-tall screenshot viewport
   (`main{min-height:100vh-200px}` sticky-footer pattern working as designed). CDP-measured body height at
   normal viewport: 4032px, no element over 900px. No change needed; verified instead.

### Verified with rendered output (this cycle)
- Footer desktop 1440 (dark + light): 4 columns, readable links, normal icons, working Back-to-top.
- Footer mobile 390: stacked, fits viewport, zero overflow.
- Mobile menu 390: opens/closes via real click, readable links, accessible toggle + CTA.
- Hero/services/process/location/CTA at 390/768/1440, dark + light: stacked correctly, readable type.
- Horizontal overflow: **0px** on all 5 pages × 390/1440 (CDP-measured `scrollWidth - innerWidth`).
- Booking page heading promoted h2 → h1 (one-h1 rule holds everywhere).
- Prior suite untouched: **91/91**, build ✓, lint 0 errors.

### Remaining (needs human eyes once)
- Aesthetic judgment of spacing/rhythm at 768/1024 tablet widths (structure verified, taste not automated).
- Paper print + phone-in-hand check.
