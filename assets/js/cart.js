/* ================================================================
   AJWA ORGANICS — CART MODULE
   ------------------------------------------------------------
   Single source of truth for "what's actually in the customer's
   cart", shared by every page (index.html, products.html,
   checkout.html) via localStorage. This replaces the old pattern
   where checkout.html always rendered all 3 products with a
   quantity stepper — now an item only appears on checkout if it
   was actually added from a product card.

   Storage shape: an array of line items —
     { id, pid, size, qty, price }
   `id` is `${pid}__${size}` so the same product in two different
   sizes is two separate lines (e.g. Honey 250g + Honey 1kg).

   PRODUCT_CATALOG is the single source of truth for product
   name/badge/icon/sizes so cart lines render correctly on
   checkout.html even though they were added from a different
   page. Keep it in sync with the data-pid/data-size/data-price
   attributes on the product cards in index.html / products.html.
   ================================================================ */

const CART_KEY = 'ajwa_cart_v1';

/** Single source of truth for product display data + pricing. */
export const PRODUCT_CATALOG = {
  honey: {
    name: 'Raw Wildflower Honey',
    badge: 'Best Seller',
    badgeClass: 'honey',
    icon: 'icon-honey-jar',
    sizes: { '250g': 850, '500g': 1600, '1kg': 3000 },
  },
  coconut: {
    name: 'Pure Coconut Oil',
    badge: 'Cold-Pressed',
    badgeClass: 'coconut',
    icon: 'icon-coconut-oil',
    sizes: { '250ml': 650, '500ml': 1200, '1L': 2200 },
  },
  mustard: {
    name: 'Pure Mustard Oil',
    badge: 'Farm Fresh',
    badgeClass: 'mustard',
    icon: 'icon-mustard-oil',
    sizes: { '500ml': 950, '1L': 1800 },
  },
};

/* ============================================================
   READ / WRITE
============================================================ */

function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    /* localStorage unavailable (privacy mode, quota) — cart just
       won't persist across pages, but nothing throws. */
  }
  window.dispatchEvent(new CustomEvent('ajwa:cart-updated', { detail: { items } }));
  return items;
}

/** Returns the current cart as a plain array. */
export function getCart() {
  return readCart();
}

/* ============================================================
   MUTATIONS
============================================================ */

/**
 * Adds a product (by id + size) to the cart, or — if that exact
 * product+size is already in the cart — increases its quantity.
 * @param {string} pid - matches a PRODUCT_CATALOG key
 * @param {string} size - matches a key in that product's `sizes`
 * @param {number} [qty] - how many to add (default 1)
 */
export function addToCart(pid, size, qty = 1) {
  const product = PRODUCT_CATALOG[pid];
  if (!product) return getCart();

  const resolvedSize = Object.prototype.hasOwnProperty.call(product.sizes, size)
    ? size
    : Object.keys(product.sizes)[0];
  const price = product.sizes[resolvedSize];
  const id = `${pid}__${resolvedSize}`;
  const addQty = Math.max(1, Math.min(20, Math.round(qty) || 1));

  const items = readCart();
  const existing = items.find((i) => i.id === id);
  if (existing) {
    existing.qty = Math.max(1, Math.min(20, existing.qty + addQty));
    existing.price = price; // keep price current in case it changed
  } else {
    items.push({ id, pid, size: resolvedSize, qty: addQty, price });
  }
  return writeCart(items);
}

/** Sets an exact quantity for a cart line; removes it if qty <= 0. */
export function setItemQty(id, qty) {
  const items = readCart();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return items;

  if (qty <= 0) {
    items.splice(idx, 1);
  } else {
    items[idx].qty = Math.min(20, Math.round(qty));
  }
  return writeCart(items);
}

/** Removes a cart line entirely, regardless of its quantity. */
export function removeFromCart(id) {
  const items = readCart().filter((i) => i.id !== id);
  return writeCart(items);
}

/** Empties the cart (used after an order is confirmed). */
export function clearCart() {
  return writeCart([]);
}

/* ============================================================
   DERIVED VALUES
============================================================ */

export function cartCount(items = readCart()) {
  return items.reduce((sum, i) => sum + i.qty, 0);
}

export function cartSubtotal(items = readCart()) {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

/** Looks up display data (name/badge/icon) for a cart line's product. */
export function getProductMeta(pid) {
  return PRODUCT_CATALOG[pid] || null;
}

/* ============================================================
   HEADER CART BADGE (shared across all pages)
============================================================ */

/** Refreshes every `.cart-badge` element on the current page. */
export function refreshCartBadges() {
  const count = cartCount();
  document.querySelectorAll('.cart-badge').forEach((badge) => {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
  });
}

/**
 * Keeps the header cart badge in sync: on initial load, whenever
 * this tab changes the cart (ajwa:cart-updated), and when another
 * tab changes it (the native `storage` event).
 */
export function initCartBadge() {
  refreshCartBadges();
  window.addEventListener('ajwa:cart-updated', refreshCartBadges);
  window.addEventListener('storage', (e) => {
    if (e.key === CART_KEY) refreshCartBadges();
  });
}

/* ============================================================
   LIGHTWEIGHT TOAST (for pages without checkout.html's own toast)
============================================================ */

let toastTimer = null;

/** Shows a short-lived toast at the bottom of the screen, creating
 *  the toast element on first use so no markup change is needed
 *  on index.html / products.html. */
export function showCartToast(message) {
  let toast = document.getElementById('site-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'site-toast';
    toast.className = 'site-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2600);
}
