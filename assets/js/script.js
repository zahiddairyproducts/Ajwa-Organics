/* ================================================================
   AJWA ORGANICS — SITE SCRIPT
   ------------------------------------------------------------
   Loaded as a native ES module (see <script type="module"> in
   index.html), so everything here is scoped automatically — no
   IIFE wrapper needed, and this file can `import` from other
   modules once there's a build step or more pages.

   Shape: small, named, single-purpose init functions, each
   wired up once in init() at the bottom. To add a new page
   behaviour, write one more initX() function and add it to the
   list — nothing else in this file has to change.

   Future hooks:
   - SITE_CONFIG is the one place that needs editing per
     deployment (WhatsApp number, free-delivery threshold, etc).
   - initProductCards() reads product/price data straight from
     the DOM (data-* attributes). If products move to a JSON file
     or CMS/API later, swap its data source out for a fetch() —
     the DOM-binding logic below it doesn't need to change.
   - initScrollReveal() and initHeaderScroll() are page-agnostic
     and can be reused as-is on every new page.
   ================================================================ */

import { addToCart, showCartToast, initCartBadge } from './cart.js';

/** Site-wide constants. Edit here, not inline elsewhere. */
const SITE_CONFIG = {
  whatsappNumber: '923093093535',
  freeDeliveryThreshold: 2000,
  deliveryFee: 150,
};

/**
 * Builds a wa.me deep link pre-filled with an order message.
 * @param {string} product - Product name, e.g. "Raw Wildflower Honey".
 * @param {string} [size] - Selected size/variant, e.g. "500g".
 * @returns {string} Full WhatsApp click-to-chat URL.
 */
function buildWhatsAppLink(product, size) {
  const text = `Hi, I'd like to order ${product}${size ? ` (${size})` : ''}.`;
  return `https://wa.me/${SITE_CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

/**
 * Builds a link to checkout.html with a product pre-loaded into the
 * order summary via query params. No longer used by "Buy Now" (which
 * now adds straight to the shared cart — see initProductCards), but
 * kept available/exported in case a future page (e.g. a marketing
 * email or ad landing page) wants to deep-link a single product into
 * checkout without going through the cart first.
 * @param {string} pid - Product id matching a PRODUCT_CATALOG key in cart.js (honey/coconut/mustard).
 * @param {string} size - Selected size/variant, e.g. "500g".
 * @param {number} [qty] - Quantity to pre-fill (default 1).
 * @returns {string} Relative URL to checkout.html with query params.
 */
function buildCheckoutLink(pid, size, qty = 1) {
  const params = new URLSearchParams({ product: pid, size, qty: String(qty) });
  return `checkout.html?${params.toString()}`;
}

/**
 * Adds a shadow/solid background to the sticky header once the
 * page has scrolled past the announcement bar.
 */
function initHeaderScroll() {
  const header = document.getElementById('site-header');
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 12);
  };

  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/**
 * Wires up the mobile hamburger menu: toggle open/close, keep the
 * panel positioned under the (variable-height) header, close on
 * link click, and keep the menu/close icon + aria-expanded in sync.
 */
function initMobileNav() {
  const header = document.getElementById('site-header');
  const navToggle = document.getElementById('nav-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  if (!header || !navToggle || !mobileNav) return;

  const placeMobileNav = () => {
    mobileNav.style.top = `${header.getBoundingClientRect().bottom}px`;
  };

  const closeMobileNav = () => {
    mobileNav.classList.remove('is-open');
    document.body.classList.remove('nav-open');
    navToggle.setAttribute('aria-expanded', 'false');
  };

  navToggle.addEventListener('click', () => {
    placeMobileNav();
    const isOpen = mobileNav.classList.toggle('is-open');
    document.body.classList.toggle('nav-open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  window.addEventListener('resize', () => {
    if (mobileNav.classList.contains('is-open')) placeMobileNav();
  });

  mobileNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMobileNav);
  });
}

/**
 * For each product card: wires the size-pill selector to update the
 * displayed price, wires "Add to Cart" to push the selected size into
 * the shared cart (cart.js) without leaving the page, and wires
 * "Buy Now" to add the same item then jump straight into checkout —
 * so checkout.html only ever shows products the shopper actually
 * chose here, never every product on the site.
 */
function initProductCards() {
  document.querySelectorAll('.product-card').forEach((card) => {
    const pid = card.getAttribute('data-pid');
    const productName = card.getAttribute('data-product') || pid;
    const priceEl = card.querySelector('.price-value');
    const originalEl = card.querySelector('.price-original');
    const buyBtn = card.querySelector('.buy-now-btn');
    const addBtn = card.querySelector('.add-to-cart-btn');
    const pills = card.querySelectorAll('.size-pill');
    if (!priceEl || !pills.length) return;

    let activeSize = null;

    const applySize = (pill) => {
      pills.forEach((p) => p.setAttribute('aria-pressed', 'false'));
      pill.setAttribute('aria-pressed', 'true');

      const size = pill.getAttribute('data-size');
      const price = pill.getAttribute('data-price');
      const original = pill.getAttribute('data-original');
      activeSize = size;

      priceEl.textContent = `Rs. ${price}`;

      // Sale pricing: a pill carrying data-original shows the regular
      // price struck through next to the active sale price. Pills
      // without it (not on sale) hide the original-price element.
      if (originalEl) {
        if (original) {
          originalEl.textContent = `Rs. ${original}`;
          originalEl.hidden = false;
          priceEl.classList.add('is-sale');
        } else {
          originalEl.hidden = true;
          priceEl.classList.remove('is-sale');
        }
      }
    };

    pills.forEach((pill) => {
      pill.addEventListener('click', () => applySize(pill));
    });

    const initialPill = card.querySelector('.size-pill[aria-pressed="true"]') || pills[0];
    applySize(initialPill);

    // "Add to Cart" — adds the currently-selected size to the shared
    // cart and stays on the page (toast confirms + badge updates).
    addBtn?.addEventListener('click', () => {
      if (!pid || !activeSize) return;
      addToCart(pid, activeSize, 1);
      showCartToast(`Added ${productName} (${activeSize}) to your cart`);
      addBtn.classList.add('is-added');
      setTimeout(() => addBtn.classList.remove('is-added'), 900);
    });

    // "Buy Now" — adds the same item, then jumps straight into
    // checkout, which will render only what's actually in the cart.
    buyBtn?.addEventListener('click', (event) => {
      if (!pid || !activeSize) return;
      event.preventDefault();
      addToCart(pid, activeSize, 1);
      window.location.href = 'checkout.html';
    });
  });
}

/**
 * Wires up the category filter pills on the full catalog page
 * (products.html). No-ops on pages without `.catalog-filters`, so
 * it's safe to include in the shared site script. Filtering is a
 * pure show/hide on `.product-card[data-category]` — no reload.
 */
function initCatalogFilters() {
  const filterBar = document.querySelector('.catalog-filters');
  const cards = document.querySelectorAll('.product-grid .product-card');
  if (!filterBar || !cards.length) return;

  const buttons = filterBar.querySelectorAll('.catalog-filter');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter');

      buttons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      cards.forEach((card) => {
        const show = filter === 'all' || card.getAttribute('data-category') === filter;
        card.style.display = show ? '' : 'none';
      });
    });
  });
}

/**
 * Fades + slides any .reveal element into view as it enters the
 * viewport. Falls back to showing everything immediately if
 * IntersectionObserver isn't available.
 */
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;

  if (!('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  reveals.forEach((el) => observer.observe(el));
}

/** Keeps the footer's copyright year correct with zero maintenance. */
function initFooterYear() {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

/** Runs every page behaviour once the DOM is ready. */
function init() {
  initHeaderScroll();
  initMobileNav();
  initProductCards();
  initCatalogFilters();
  initScrollReveal();
  initFooterYear();
  initCartBadge();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Exported in case a future page (or an SSG build script) wants to
// reuse the WhatsApp link builder without re-implementing it.
// checkout.js imports SITE_CONFIG + buildCheckoutLink so the
// WhatsApp number / delivery threshold stay defined in this one
// place site-wide.
export { SITE_CONFIG, buildWhatsAppLink, buildCheckoutLink };
