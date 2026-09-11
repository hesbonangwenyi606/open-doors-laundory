# Open Doors Laundromat

A responsive, production-ready marketing website for **Open Doors Laundromat**, located at Chuna Mall in Kitengela, Kenya.

The site presents the company’s laundry services, turnaround times, care process, pricing, location, opening hours, and contact channels. Its content and business details were adapted from the supplied Open Doors corporate brochure.

## Features

- Responsive single-page layout for mobile, tablet, and desktop
- Sticky navigation with a mobile menu
- Service overview for washing, folding, dry cleaning, ironing, and delivery
- Step-by-step garment-care process
- Transparent pricing in Kenyan shillings
- Expandable list of additional prices
- Company story and physical location
- Current opening hours
- Direct phone, email, WhatsApp, and Google Maps actions
- Semantic sections and basic search-engine metadata
- Optimized Vite production build

## Technology

- [React](https://react.dev/)
- [Vite](https://vite.dev/)
- [Lucide React](https://lucide.dev/guide/packages/lucide-react) for icons
- Plain CSS with responsive media queries

## Requirements

- Node.js 20 or newer
- npm 10 or newer

The project has been verified with Node.js 24 and npm 11.

## Getting started

Clone or download the project, then run:

```bash
cd open-doors
npm install
npm run dev
```

Vite will print the local address in the terminal. It is normally:

```text
http://localhost:5173
```

## Available commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install project dependencies |
| `npm run dev` | Start the local development server with hot reload |
| `npm run backend` | Start the backend API on port 3001 |
| `npm run dev:all` | Start the frontend and backend together |
| `npm run build` | Create an optimized production build in `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm start` | Serve the API and production website together |

## Admin dashboard

The protected admin dashboard is available at:

```text
http://localhost:5173/admin
```

Copy `.env.example` to `.env` and replace all example secrets before deployment:

```bash
cp .env.example .env
npm run dev:all
```

The admin dashboard includes:

- Today, new, completed, and total request summaries
- A seven-day customer-request graph
- A recent-requests list with status management
- Branded request receipts with unique receipt numbers and print/PDF support
- “Know Before You Load” service and price editing
- Laundry process-step management
- SEO title, description, character counts, and search preview
- A secure sign-in session and logout action

Customer pickup requests are submitted through the public website and stored in `server/data/requests.json`. The form loads its services and unit prices from the admin-managed “Know Before You Load” settings. Customers can add multiple services, select 1–25 kilograms/units for each, and see automatically calculated subtotals and an estimated total. The backend independently validates the current prices before saving the request.

After a successful request, the browser privately remembers the customer’s name, phone number, pickup area, preferred payment method, and M-Pesa number in local storage. Those details are automatically filled on the customer’s next visit from the same browser and device. Notes and service selections are not carried into future requests.

After submission, the customer receives a secure link to a branded receipt containing the logo, request number, service line items, quantities, estimated total, and print/save-PDF action. Admins can reopen the same receipt from the Requests dashboard. Pricing and SEO settings are stored in `server/data/settings.json`, while process changes are stored in `server/data/process.json`.

For a production deployment, always set a strong `ADMIN_PASSWORD` and a long random `SESSION_SECRET`. The server uses a signed, HTTP-only, same-site session cookie. Never commit the `.env` file.

## Production build

Create the deployable site with:

```bash
npm run build
```

Preview that build before deploying:

```bash
npm run preview
```

The generated `dist/` directory can be deployed to any static host, including Netlify, Vercel, Cloudflare Pages, GitHub Pages, or a conventional web server.

| Hosting setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Publish/output directory | `dist` |

## Project structure

```text
open-doors/
├── public/
│   └── assets/              # Logo and brochure-derived business imagery
├── src/
│   ├── main.jsx             # Page content, components, navigation, and interactions
│   └── styles.css           # Global styling and responsive layouts
├── index.html               # HTML shell and metadata
├── package.json             # Dependencies and npm commands
└── README.md
```

## Updating business information

Most editable content is stored in `src/main.jsx`.

### Contact details

Search for the existing phone number, email address, and WhatsApp link in `src/main.jsx` and update every relevant occurrence.

WhatsApp links use the international Kenyan number without spaces or a leading `+`:

```text
https://wa.me/254119444972
```

### Services and prices

- Edit the `services` array to change service cards.
- Edit `priceGroups` to change the main price tables.
- Edit the `more-prices` section to change additional item prices.

Prices displayed on the site are in Kenyan shillings and should be checked whenever the business updates its rates.

### Opening hours and location

Opening hours are in the `hours` block near the bottom of `src/main.jsx`. The address and Google Maps search link are in the contact section.

### Images

Site images live in `public/assets/`. To replace an image without changing the code, preserve its current filename. Alternatively, add a new file and update its `/assets/...` path in `src/main.jsx`.

Recommended image formats are WebP or optimized JPEG. Keep large display images below approximately 500 KB when practical.

## Styling and branding

Global colors are defined as CSS custom properties at the top of `src/styles.css`:

```css
:root {
  --ink: #09243f;
  --blue: #2f79ad;
  --sky: #dff1fa;
  --cream: #f5f1e8;
  --mint: #d6eee6;
  --line: #cbd8df;
}
```

The responsive breakpoints are at `850px` and `520px`. Google Fonts are loaded through the `@import` at the beginning of the stylesheet, so visitors need internet access for those web fonts. The site falls back to a system sans-serif font if they cannot load.

## Contact actions

The website uses direct links rather than a server-side contact form:

- `tel:` opens the visitor’s phone app.
- `mailto:` opens their configured email client.
- `wa.me` opens a WhatsApp conversation.
- The Google Maps link opens a search for Chuna Mall, Kitengela.

No backend, database, API key, or environment variable is required.

## Accessibility notes

- Navigation links target labeled page sections.
- Informational images include alternative text.
- The mobile navigation control has an accessible label.
- Buttons and calls to action use native interactive elements.
- Text and controls use high-contrast brand colors.

When adding content, preserve meaningful heading order, useful image descriptions, and visible keyboard focus behavior.

## Troubleshooting

### `vite: not found`

Install dependencies first:

```bash
npm install
```

### The development port is already in use

Run Vite on another port:

```bash
npm run dev -- --port 5174
```

### Images do not appear after deployment

Keep public image references root-relative:

```jsx
<img src="/assets/logo.jpg" alt="Open Doors Laundromat" />
```

Confirm that the public assets are included in the generated build.

### Production changes are missing

Generate a fresh build and redeploy the new `dist/` directory:

```bash
npm run build
```

## Business details represented on the site

- **Business:** Open Doors Laundromat
- **Location:** Chuna Mall, Ground Floor, Shop 10, Kitengela
- **Service areas:** Kisaju, Kitengela, Isinya, and Athi River
- **Express turnaround:** 4 hours
- **Standard turnaround:** 24 hours
- **Phone and WhatsApp:** 011 944 4972
- **Email:** opendoorslaundromat@gmail.com

Before publishing, the business owner should confirm that prices, hours, service coverage, and contact details remain current.

## License and content
The source code is provided for the Open Doors Laundromat project. The company name, logo, photography, written content, and other brand materials remain the property of their respective owner and should not be reused without permission.
