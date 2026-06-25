# Ajwa Organics — Site

Static, framework-free build (vanilla HTML/CSS/JS) — deploys to Cloudflare
Pages directly from this repo with zero build step.

## Structure

```
ajwa-organics-site/
├── index.html              Homepage. Head + <header>/<footer> are the
│                            shared template for every future page.
│                            Products section shows only items flagged
│                            data-featured="true" (currently honey + 
│                            coconut oil) — full catalog lives on
│                            products.html, linked via "See All Products".
├── products.html           Full product catalog (every product, with
│                            category filter pills). Same design/theme,
│                            same product-card markup as the homepage.
├── checkout.html           Multi-step checkout: cart → delivery map →
│                            review → WhatsApp order handoff.
└── assets/
    ├── css/
    │   ├── style.css       One shared stylesheet, all pages. Design
    │   │                   tokens in :root (section 1). Bilingual/RTL
    │   │                   utilities in section 14.
    │   └── checkout.css    Checkout-only styles (co- prefix). Extends
    │                       style.css, never duplicates a token.
    └── js/
        ├── script.js       Shared site script (header scroll, mobile nav,
        │                   product card size-pill, scroll reveal, footer
        │                   year). Exports SITE_CONFIG + buildWhatsAppLink
        │                   + buildCheckoutLink for checkout.js to import.
        └── checkout.js     Checkout-only logic: cart state, step flow,
                            field validation, Google Maps, GPS, order
                            review, and WhatsApp message builder.
```

## Homepage vs. full catalog (products.html)

- The homepage's `#products` section is a **curated slice only** —
  each card there carries `data-featured="true"`. Everything else
  lives on `products.html`, which lists every product with category
  filter pills (`.catalog-filters`) above the grid.
- **To feature a product on the homepage:** copy its `<article
  class="product-card">` block from `products.html` into `index.html`'s
  `#products` grid and add `data-featured="true"`.
- **To put a product on sale:** add `data-original="<regular price>"`
  to the relevant `<button class="size-pill">`. `script.js` shows the
  regular price struck through next to the active sale price
  automatically — no other markup or CSS changes needed. Leave
  `data-original` off a pill to keep it at regular price.
- **To add a brand-new product:** duplicate a product-card `<article>`
  in `products.html` (see the "ADD NEW PRODUCT CARDS HERE" comment in
  the grid), give it a unique `data-pid` (must match a product id
  checkout.html understands) and a `data-category` (used by the
  filter pills — currently `honey` / `oil`, add more as needed).

## Checkout flow

1. **Cart (sidebar / mobile overlay)** — Customer picks product(s), size,
   and quantity before filling in any personal details. Real-time pricing
   and a free-delivery progress meter update as they go.

2. **Step 1 — Your Details** — Name (required), phone (required, validated
   against Pakistani format), email (optional), delivery notes (optional).

3. **Step 2 — Delivery Location** — Two options:
   - **Use My Location** — browser GPS → coordinates captured instantly.
   - **Pin on Map** — Google Maps JS API, drag-and-drop marker, click
     anywhere, keyboard arrow-key nudge. Centred on Lahore by default.

4. **Step 3 — Review** — Full order summary (products, customer info,
   location with Google Maps link, pricing). Every section has an Edit
   link that jumps back to the right step.

5. **Step 4 — WhatsApp handoff** — Clicking "Confirm Order via WhatsApp"
   opens `wa.me/923093093535` with a pre-filled message containing the
   complete order, delivery notes, Google Maps pin link, pricing, timestamp,
   and a short order reference (e.g. AO-H3K791). A success screen is shown
   in the browser with the same reference.

## Homepage → Checkout linking

- **Buy Now** buttons on product cards link to
  `checkout.html?product=honey&size=250g&qty=1` — the checkout JS reads
  these params and pre-loads that item into the cart automatically.
- The header cart icon (🛒) links to `checkout.html`.
- The "Order on WhatsApp" CTA in the footer band links to `checkout.html`.
- The header's pill button ("Order on WhatsApp") keeps a direct WhatsApp
  link for quick product questions, not full orders.

## Design language

- Exact same design tokens from `style.css :root` — no forked palette.
- All checkout components use the `co-` prefix to avoid class collisions.
- The site header, mobile nav, announcement bar, and footer are 100%
  identical across `index.html` and `checkout.html`.
- The Google Maps marker uses a custom circular icon (set in `checkout.js`)
  to match the brand forest-green palette instead of the default red pin.

## SITE_CONFIG — one place to edit

`assets/js/script.js` exports `SITE_CONFIG`:

```js
const SITE_CONFIG = {
  whatsappNumber: '923093093535',   // ← change the WA number here
  freeDeliveryThreshold: 2000,       // ← Rs. threshold for free delivery
  deliveryFee: 150,                  // ← flat delivery fee
};
```

`checkout.js` imports this object, so any change propagates everywhere
automatically — no need to hunt through two files.

## Adding a new page

1. Duplicate `index.html`, rename it (`our-story.html`, `blog.html`, etc.).
2. Keep the `<head>` `<link>`/`<script>` tags, announcement bar, `<header>`,
   and `<footer>` identical — they're shared site-wide via the two files
   under `assets/`. Don't fork the CSS/JS per page.
3. Replace only the contents of `<main>...</main>`.
4. Link back to the homepage with `index.html#section`, not a bare
   `#section` — anchors only resolve on the page that defines that id.
5. Publishing a page in Urdu? Set `<html lang="ur" dir="rtl">` on that
   page — `style.css` section 14 already mirrors the shared components
   for RTL. For a short Urdu snippet inside an English page, wrap it in
   `class="urdu-content"` instead.

## Deploying (Cloudflare Pages via GitHub)

- Push this folder's contents to the repo root (or set it as the Pages
  "root directory" if it lives in a subfolder).
- Build command: none. Output directory: `/` (or wherever `index.html`
  sits).
- No environment variables or secrets required — WhatsApp links are
  built client-side from the number in `assets/js/script.js`
  (`SITE_CONFIG.whatsappNumber`).

## Planned pages (not yet built)

```
our-story.html
blog.html
blog-how-to-tell-if-honey-is-real.html
blog-cold-pressed-vs-refined-oil.html
privacy-policy.html
terms-conditions.html
shipping-delivery.html
returns-refunds.html
```
