# Marketing Site Documentation

## Overview
The public marketing website for Open Doors Laundromat is fully implemented as part of the existing React + Vite + Express application. It is completely separate from the authenticated POS system and uses the same Neo-Brutalist design system with light/dark mode support.

## Live URL
- **Dev**: http://localhost:5173/
- **Production**: https://open-doors-laundory.vercel.app/

## Pages

### 1. Home Page (`/`)
- **Hero section** with headline, CTA buttons, and trust badges
- **Services overview** with 4 service cards (Wash & Fold, Dry Cleaning, Ironing, Pickup & Delivery)
- **How It Works** section with 5-step process visualization
- **Location section** with address, phone, hours, and WhatsApp link
- **CTA section** encouraging bookings
- **JSON-LD structured data** (LocalBusiness schema)

### 2. Services Page (`/services`)
- Service cards with descriptions and pricing
- Full pricing tables for all three price groups (Full Load, Popular Items, Home Essentials)
- "Why Choose Us" section with key differentiators
- **JSON-LD structured data** (Service schema)

### 3. How It Works Page (`/process`)
- 5-step process: Collect → Sort → Clean → Finish → Deliver
- Visual step cards with connectors

### 4. About Page (`/about`)
- Business story and mission
- Process highlights, service areas, payment methods
- **JSON-LD structured data** (Organization schema)

### 5. Contact Page (`/contact`)
- Phone, email, WhatsApp, location, and business hours
- Interactive map area
- **JSON-LD structured data** (LocalBusiness schema)

### 6. FAQ Page (`/faq`)
- 8 frequently asked questions with accordion UI
- Covers services, hours, payment, tracking, and support

### 7. Booking Page (`/booking`)
- Existing BookingForm component with full pickup request flow
- Service selection, quantity, location, payment method

## Architecture

### Components
- **`src/MarketingLayout.jsx`** — Main layout with header, navigation, footer, theme toggle
- **`src/HomePage.jsx`** — Home page with all marketing sections
- **`src/ServicesPage.jsx`** — Services and pricing page
- **`src/ProcessPage.jsx`** — How-it-works page
- **`src/AboutPage.jsx`** — About page
- **`src/ContactPage.jsx`** — Contact page
- **`src/FAQPage.jsx`** — FAQ page (updated)

### Data Flow
- Business data (`business`, `services`, `processSteps`, `faqs`) is defined in `MarketingLayout.jsx` and exported for use across pages
- Pricing data comes from `/api/site-settings` endpoint (server-side)
- Process steps come from `/api/process` endpoint (server-side)

### SEO Features
- React Helmet async for all page metadata
- Open Graph tags for social sharing
- Twitter Card meta tags
- JSON-LD structured data (LocalBusiness, Service, Organization)
- Canonical URLs
- Robots.txt and sitemap.xml configured

### Design System
- Neo-Brutalist style with CSS custom properties
- Light/dark mode toggle persisted in localStorage
- Responsive design (mobile-first media queries)
- Consistent spacing, typography, and color tokens
- Accessible: skip-link, ARIA attributes, semantic HTML

## Navigation
The marketing site has its own navigation separate from the POS:
- Home, Services, How It Works, About, Contact, FAQ
- Sign in / Get Started links (for POS access)
- Dashboard link (for authenticated users)
- Theme toggle (light/dark)

## Server Integration
- `/api/site-settings` — Returns pricing groups for booking form
- `/api/process` — Returns process steps
- `/api/requests` — Handles booking submissions
- All marketing pages use the same Express backend as the POS

## Deployment
- Vercel: https://open-doors-laundory.vercel.app/
- Build command: `npx vite build`
- Test command: `npx vitest run`
- Lint command: `npx eslint src/`

---

## Addendum 2026-09-26 — Routing fix + content/SEO hardening (Muse Spark)

### Critical bug found: marketing pages never rendered
Routes in `src/App.jsx` used `<MarketingLayout />` as a layout route element, but the layout rendered only `{children}` and never an `<Outlet/>`. Result: every public route (`/`, `/services`, `/process`, `/pricing`, `/about`, `/contact`, `/booking`, `/faq`) displayed header + footer with an EMPTY main — the reported "only navbar and footer" state. Verified by code inspection (no `Outlet` import existed).
- Fix: layout renders `{children ?? <Outlet/>}`; page components no longer wrap themselves in `<MarketingLayout>` (that nesting would have duplicated header/footer).
- Proof: new `src/test/marketing.test.jsx` renders all 8 public routes and asserts page headings + exactly one header/footer + exactly one h1.

### Fabricated content removed
- Fake customer reviews (Jane W., Peter M., Sarah K., David R. + "Trusted by hundreds") deleted from `HomePage.jsx` — replaced with an order-status strip built from the real POS lifecycle (Drop off → Confirmed → Processing → Ready & collected) plus a factual payment/receipt note.
- Unverified claims removed: "Free pickup & delivery" → "Pickup & delivery", "Quality guaranteed" → "Checked with care"/"Checked before packaging", "Trusted in Kitengela" card → "Easy to find" (address), invented founder name in About JSON-LD removed, hardcoded extra prices (wedding gown, leather jacket…) removed from Pricing, unverified "children half price" and "7kg ≈ 25 shirts" notes removed.
- Kept (sourced): express 4-hour wash (business brochure, README), hours, phone/email/WhatsApp, service areas, Cash/M-Pesa, prices from admin-managed `priceGroups`.

### SEO / social hardening
- Centralized `SITE_URL` (`https://open-doors-laundory.vercel.app`, as configured in `sitemap.xml`/vercel): all canonical + `og:url` now absolute (were relative, i.e. invalid).
- `og:image`/`twitter:image` now absolute on every public page (were relative or missing); homepage uses `Laundromat` schema type (was generic `LocalBusiness`); FAQ page gained `FAQPage` JSON-LD; one-h1-per-page enforced; FAQ accordion gained `aria-controls`/`aria-expanded`; nested-`<main>` fixed.
- `index.html`: static absolute canonical + OG/Twitter tags for no-JS crawlers.
- Footer `href="#"` replaced with a real back-to-top button.

### Dead code removed
~290 lines of unused `Header`/`Footer`/`MobileDrawer` + duplicate service data deleted from `src/App.jsx`. `ServicesPage` now fetches live `/api/site-settings` pricing (fallback = admin price list).

### Verification
`npm test` 55/55 (12 new marketing render tests) · `npm run build` ✓ · `npm run lint` 0 errors (118 warnings, down from 146) · dev `:5173` + prod `:3001` shells 200 · sitemap/robots 200 · no-JSX references to removed review blocks · POS routes still behind `ProtectedRoute` (test asserts `/dashboard` redirects to login).
