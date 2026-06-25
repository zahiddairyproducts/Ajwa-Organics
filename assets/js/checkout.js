/* ================================================================
   AJWA ORGANICS — CHECKOUT SCRIPT
   ------------------------------------------------------------
   Loaded as a native ES module, after assets/js/script.js (which
   already wires up the shared header/mobile-nav/footer-year
   behaviour for every page). This file only adds checkout-page
   behaviour: cart state, step navigation, field validation, the
   delivery map, order review, and the final WhatsApp handoff.

   Shape mirrors script.js: small named init*() functions, each
   wired once in init() at the bottom.
   ================================================================ */

import { SITE_CONFIG } from './script.js';
import {
  getCart,
  addToCart,
  setItemQty,
  removeFromCart,
  clearCart,
  cartCount,
  cartSubtotal as getCartSubtotal,
  getProductMeta,
} from './cart.js';

/** Lahore city-centre — sensible default map pin before the
 *  shopper has placed one of their own. */
const LAHORE_CENTER = { lat: 31.567289582366673, lng: 74.40758284702837 }; // Ajwa Organics store address (Canal Bank Road, Muslim Abad, Mughal Pura)

/** Module-level state. Single source of truth for the confirmed
 *  delivery location, read by every render function. The cart itself
 *  lives in localStorage via assets/js/cart.js, not here. */
const state = {
  location: null,  // { lat, lng, source: 'gps' | 'map' }
  step: 1,
};

let map = null;
let marker = null;
let mapInitialized = false;

/* ============================================================
   HELPERS
============================================================ */

/** Formats a number as "Rs. 1,234". */
function formatPKR(amount) {
  return `Rs. ${Math.round(amount).toLocaleString('en-US')}`;
}

/** Escapes user-entered text before it's placed into innerHTML. */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/** Loosely validates a Pakistani mobile number in any common format
 *  (03XXXXXXXXX, +923XXXXXXXXX, 923XXXXXXXXX, 3XXXXXXXXX, with or
 *  without spaces/dashes). */
function isValidPKPhone(raw) {
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(4);
  else if (digits.startsWith('92')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^3\d{9}$/.test(digits);
}

function isValidEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw).trim());
}

/** Builds a Google Maps link from a lat/lng pair. */
function googleMapsLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** A quick, friendly order reference — not a database id, just
 *  something recognisable for the shopper and the team on WhatsApp. */
function generateOrderRef() {
  return `AO-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.floor(10 + Math.random() * 90)}`;
}

let toastTimer = null;
/** Shows a short-lived toast notification at the bottom of the screen. */
function showToast(message) {
  const toast = document.getElementById('co-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => { toast.hidden = true; }, 300);
  }, 3200);
}

/** A small attention-getting shake, used when a step can't advance. */
function shake(el) {
  if (!el || !el.animate) return;
  el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 380, easing: 'ease-in-out' }
  );
}

/* ============================================================
   CART (sidebar product selector)
============================================================ */

/** Builds the HTML for one cart line in the sidebar. Icon/badge/name
 *  come from PRODUCT_CATALOG (cart.js); size/qty/price come from the
 *  cart line itself. */
function renderCartRow(item) {
  const meta = getProductMeta(item.pid) || {};
  const badgeClass = meta.badgeClass || '';
  const total = item.price * item.qty;
  return `
    <div class="co-prod-row" data-id="${escapeHtml(item.id)}">
      <div class="co-prod-icon co-prod-icon--${badgeClass}">
        ${productIconSvg(meta.icon)}
      </div>
      <div class="co-prod-info">
        <div class="co-prod-name-row">
          <span class="co-prod-name">${escapeHtml(meta.name || item.pid)}</span>
          ${meta.badge ? `<span class="co-prod-badge co-prod-badge--${badgeClass}">${escapeHtml(meta.badge)}</span>` : ''}
        </div>
        <div class="co-prod-size">${escapeHtml(item.size)}</div>
      </div>
      <div class="co-prod-ctrl">
        <div class="co-qty" role="group" aria-label="Quantity">
          <button type="button" class="co-qty-btn co-qty-dec" aria-label="Decrease quantity">−</button>
          <span class="co-qty-val" aria-live="polite" aria-atomic="true">${item.qty}</span>
          <button type="button" class="co-qty-btn co-qty-inc" aria-label="Increase quantity">+</button>
        </div>
        <span class="co-prod-total">${formatPKR(total)}</span>
        <button type="button" class="co-prod-remove" aria-label="Remove ${escapeHtml(meta.name || item.pid)} (${escapeHtml(item.size)}) from cart" title="Remove">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/** Re-renders the sidebar's product list straight from the shared
 *  cart (assets/js/cart.js) — so it only ever shows products the
 *  shopper actually added on index.html / products.html, never every
 *  product on the site. Re-runs after every add/remove/qty change. */
function renderCart() {
  const items = getCart();
  const container = document.getElementById('co-products');
  const emptyState = document.getElementById('co-cart-empty');
  const addMoreLink = document.getElementById('co-add-more');
  if (!container) return;

  const isEmpty = items.length === 0;
  container.hidden = isEmpty;
  if (emptyState) emptyState.hidden = !isEmpty;
  if (addMoreLink) addMoreLink.hidden = isEmpty;

  if (isEmpty) {
    container.innerHTML = '';
  } else {
    container.innerHTML = items.map(renderCartRow).join('');

    container.querySelectorAll('.co-prod-row').forEach((row) => {
      const id = row.getAttribute('data-id');
      const item = items.find((i) => i.id === id);
      if (!item) return;

      row.querySelector('.co-qty-dec')?.addEventListener('click', () => setItemQty(id, item.qty - 1));
      row.querySelector('.co-qty-inc')?.addEventListener('click', () => setItemQty(id, item.qty + 1));
      row.querySelector('.co-prod-remove')?.addEventListener('click', () => removeFromCart(id));
    });
  }

  updateSummary();
}

/** Reads ?product=&size=&qty= from the URL — set when a "Buy Now"
 *  button sends the shopper here with an item pre-loaded — adds it
 *  to the shared cart, then strips the query string so refreshing
 *  the page doesn't add it a second time. */
function applyQueryPrefill() {
  const params = new URLSearchParams(window.location.search);
  const pid = params.get('product');
  if (!pid) return;

  const size = params.get('size');
  const qty = Math.max(1, Math.min(20, parseInt(params.get('qty'), 10) || 1));
  addToCart(pid, size, qty);

  const url = new URL(window.location.href);
  url.search = '';
  window.history.replaceState({}, '', url);
}

/** Total number of items (sum of quantities) currently in the cart. */
function cartItemCount() {
  return cartCount();
}

/** Total price of everything currently in the cart. */
function cartSubtotal() {
  return getCartSubtotal();
}

/* ============================================================
   PRICING SUMMARY (sidebar + mobile toggle + free-delivery meter)
============================================================ */

function updateSummary() {
  const itemCount = cartItemCount();
  const subtotal = cartSubtotal();
  const threshold = SITE_CONFIG.freeDeliveryThreshold;
  const delivery = itemCount === 0 ? 0 : (subtotal >= threshold ? 0 : SITE_CONFIG.deliveryFee);
  const total = subtotal + delivery;
  const isFree = itemCount > 0 && delivery === 0;

  const itemCountEl = document.getElementById('co-item-count');
  if (itemCountEl) itemCountEl.textContent = `${itemCount} item${itemCount === 1 ? '' : 's'}`;

  const subtotalEl = document.getElementById('co-subtotal');
  if (subtotalEl) subtotalEl.textContent = formatPKR(subtotal);

  const deliveryRow = document.getElementById('co-delivery-row');
  const deliveryEl = document.getElementById('co-delivery');
  const freeRow = document.getElementById('co-free-row');
  if (deliveryEl) deliveryEl.textContent = formatPKR(SITE_CONFIG.deliveryFee);
  if (deliveryRow) deliveryRow.hidden = isFree;
  if (freeRow) freeRow.classList.toggle('is-shown', isFree);
  if (freeRow) freeRow.hidden = !isFree;

  const totalEl = document.getElementById('co-total');
  if (totalEl) totalEl.textContent = formatPKR(total);

  const toggleTotal = document.getElementById('co-toggle-total');
  if (toggleTotal) toggleTotal.textContent = formatPKR(total);

  const fdm = document.getElementById('co-fdm');
  const fdmFill = document.getElementById('co-fdm-fill');
  const fdmLabel = document.getElementById('co-fdm-label');
  if (fdm && fdmFill && fdmLabel) {
    const pct = Math.min(100, (subtotal / threshold) * 100);
    fdmFill.style.width = `${pct}%`;
    if (subtotal >= threshold) {
      fdm.classList.add('is-unlocked');
      fdmLabel.innerHTML = `<strong>You've unlocked free delivery!</strong>`;
    } else {
      fdm.classList.remove('is-unlocked');
      fdmLabel.innerHTML = `Add <strong>${formatPKR(threshold - subtotal)}</strong> more for free delivery`;
    }
  }

  const emptyBanner = document.getElementById('co-empty-banner');
  if (emptyBanner && itemCount > 0) emptyBanner.hidden = true;
}

/* ============================================================
   MOBILE: collapsible order summary
   ------------------------------------------------------------
   Rather than cloning the sidebar (which would duplicate ids and
   desync interactive controls), the *same* sidebar element is
   relocated into the mobile toggle panel below 1024px and moved
   back into the two-column grid at 1024px+. Its event listeners
   travel with it — nothing is re-bound.
============================================================ */
function initMobileSidebarRelocation() {
  const sidebar = document.getElementById('co-sidebar');
  const mobileSummary = document.getElementById('co-mobile-summary');
  if (!sidebar || !mobileSummary) return;

  const anchor = document.createComment('co-sidebar-anchor');
  sidebar.parentNode.insertBefore(anchor, sidebar);

  const mq = window.matchMedia('(min-width: 1024px)');
  const place = (e) => {
    if (e.matches) {
      anchor.parentNode.insertBefore(sidebar, anchor.nextSibling);
    } else {
      mobileSummary.appendChild(sidebar);
    }
  };
  place(mq);
  mq.addEventListener ? mq.addEventListener('change', place) : mq.addListener(place);
}

function initMobileToggle() {
  const toggle = document.getElementById('co-mobile-toggle');
  const panel = document.getElementById('co-mobile-summary');
  const label = document.getElementById('co-toggle-label');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    const isOpen = panel.hidden;
    panel.hidden = !isOpen;
    toggle.setAttribute('aria-expanded', String(isOpen));
    if (label) label.textContent = isOpen ? 'Hide order summary' : 'Show order summary';
  });
}

function openMobileSummary() {
  const toggle = document.getElementById('co-mobile-toggle');
  const panel = document.getElementById('co-mobile-summary');
  const label = document.getElementById('co-toggle-label');
  if (!toggle || !panel) return;
  if (window.matchMedia('(min-width: 1024px)').matches) {
    document.getElementById('co-sidebar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  panel.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  if (label) label.textContent = 'Hide order summary';
  toggle.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   STEP NAVIGATION + PROGRESS BAR
============================================================ */

function updateProgress(step) {
  for (let i = 1; i <= 3; i += 1) {
    const dot = document.getElementById(`prog-${i}`);
    if (!dot) continue;
    dot.classList.toggle('is-active', i === step);
    dot.classList.toggle('is-complete', i < step);
    if (i === step) dot.setAttribute('aria-current', 'step');
    else dot.removeAttribute('aria-current');
  }
  for (let i = 1; i <= 2; i += 1) {
    const div = document.getElementById(`prog-div-${i}`);
    if (div) div.classList.toggle('is-filled', step > i);
  }
}

function goToStep(step) {
  state.step = step;
  document.querySelectorAll('.co-step-panel').forEach((panel) => panel.classList.remove('is-active'));
  const target = document.getElementById(`step-${step}`);
  if (target) target.classList.add('is-active');
  if (step <= 3) updateProgress(step);

  // Move focus to the step heading for screen-reader / keyboard users.
  const heading = target?.querySelector('h1, h2');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  const topbar = document.querySelector('.co-topbar');
  if (topbar) {
    const y = topbar.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
}

/* ============================================================
   STEP 1 — CUSTOMER DETAILS + VALIDATION
============================================================ */

function fieldEls(name) {
  return {
    wrap: document.getElementById(`field-${name}`),
    input: document.getElementById(`customer-${name}`),
    error: document.getElementById(`err-${name}`),
  };
}

function setFieldError(name, message) {
  const { wrap, error } = fieldEls(name);
  if (!wrap || !error) return false;
  wrap.classList.add('has-error');
  wrap.classList.remove('is-valid');
  error.textContent = message;
  return false;
}

function setFieldValid(name) {
  const { wrap, error } = fieldEls(name);
  if (!wrap || !error) return true;
  wrap.classList.remove('has-error');
  wrap.classList.add('is-valid');
  error.textContent = '';
  return true;
}

function validateName(showErrors = true) {
  const { input } = fieldEls('name');
  const value = input?.value.trim() || '';
  if (value.length < 2) return showErrors ? setFieldError('name', 'Please enter your full name.') : false;
  return showErrors ? setFieldValid('name') : true;
}

function validatePhone(showErrors = true) {
  const { input } = fieldEls('phone');
  const value = input?.value.trim() || '';
  if (!value) return showErrors ? setFieldError('phone', 'Phone number is required.') : false;
  if (!isValidPKPhone(value)) {
    return showErrors ? setFieldError('phone', 'Enter a valid number, e.g. 03XX XXXXXXX.') : false;
  }
  return showErrors ? setFieldValid('phone') : true;
}

function validateEmail(showErrors = true) {
  const { input } = fieldEls('email');
  const value = input?.value.trim() || '';
  if (!value) {
    if (showErrors) setFieldValid('email');
    return true; // optional
  }
  if (!isValidEmail(value)) return showErrors ? setFieldError('email', 'Enter a valid email address.') : false;
  return showErrors ? setFieldValid('email') : true;
}

function initFieldValidation() {
  const name = document.getElementById('customer-name');
  const phone = document.getElementById('customer-phone');
  const email = document.getElementById('customer-email');

  name?.addEventListener('blur', () => validateName());
  phone?.addEventListener('blur', () => validatePhone());
  email?.addEventListener('blur', () => validateEmail());

  // Once a field has been touched, re-validate live as they type
  // so the error clears the moment it's fixed.
  [['name', name, validateName], ['phone', phone, validatePhone], ['email', email, validateEmail]]
    .forEach(([fieldName, el, validator]) => {
      el?.addEventListener('input', () => {
        if (fieldEls(fieldName).wrap?.classList.contains('has-error')) validator();
      });
    });
}

function getCustomerData() {
  return {
    name: document.getElementById('customer-name')?.value.trim() || '',
    phone: document.getElementById('customer-phone')?.value.trim() || '',
    email: document.getElementById('customer-email')?.value.trim() || '',
    notes: document.getElementById('delivery-notes')?.value.trim() || '',
  };
}

/* ============================================================
   STEP 2 — DELIVERY LOCATION (tabs, GPS, map)
============================================================ */

function initLocationTabs() {
  const tabGps = document.getElementById('tab-gps');
  const tabMap = document.getElementById('tab-map');
  const panelGps = document.getElementById('panel-gps');
  const panelMap = document.getElementById('panel-map');
  if (!tabGps || !tabMap || !panelGps || !panelMap) return;

  const activate = (tab) => {
    const showMap = tab === 'map';
    tabGps.classList.toggle('is-active', !showMap);
    tabMap.classList.toggle('is-active', showMap);
    tabGps.setAttribute('aria-selected', String(!showMap));
    tabMap.setAttribute('aria-selected', String(showMap));
    panelGps.classList.toggle('is-active', !showMap);
    panelMap.classList.toggle('is-active', showMap);
    panelGps.hidden = showMap;
    panelMap.hidden = !showMap;

    if (showMap) {
      ensureMap();
      setTimeout(() => {
        if (!map) return;
        google.maps.event.trigger(map, 'resize');
        map.setCenter(marker ? marker.getPosition() : { lat: LAHORE_CENTER.lat, lng: LAHORE_CENTER.lng });
      }, 60);
    }
  };

  tabGps.addEventListener('click', () => activate('gps'));
  tabMap.addEventListener('click', () => activate('map'));
}

function ensureMap() {
  if (mapInitialized || typeof google === 'undefined' || !google.maps) return;
  const mapEl = document.getElementById('delivery-map');
  if (!mapEl) return;

  map = new google.maps.Map(mapEl, {
    center: { lat: LAHORE_CENTER.lat, lng: LAHORE_CENTER.lng },
    zoom: 12,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  });

  const pinIcon = {
    path: google.maps.SymbolPath.CIRCLE,
    scale: 9,
    fillColor: '#54693F',   /* var(--c-forest) */
    fillOpacity: 1,
    strokeColor: '#FFFDF8', /* var(--c-paper) */
    strokeWeight: 3,
  };

  marker = new google.maps.Marker({
    position: { lat: LAHORE_CENTER.lat, lng: LAHORE_CENTER.lng },
    map,
    icon: pinIcon,
    draggable: true,
  });

  marker.addListener('dragend', () => {
    const pos = marker.getPosition();
    handleLocationPicked({ lat: pos.lat(), lng: pos.lng() }, 'map');
  });

  map.addListener('click', (e) => {
    marker.setPosition(e.latLng);
    handleLocationPicked({ lat: e.latLng.lat(), lng: e.latLng.lng() }, 'map');
  });

  // Basic keyboard support: focus the map, nudge the pin with arrow keys.
  mapEl.setAttribute('tabindex', '0');
  mapEl.addEventListener('keydown', (e) => {
    const step = 0.0007;
    const pos = marker.getPosition();
    let lat = pos.lat();
    let lng = pos.lng();
    if (e.key === 'ArrowUp') lat += step;
    else if (e.key === 'ArrowDown') lat -= step;
    else if (e.key === 'ArrowLeft') lng -= step;
    else if (e.key === 'ArrowRight') lng += step;
    else return;
    e.preventDefault();
    const next = new google.maps.LatLng(lat, lng);
    marker.setPosition(next);
    map.panTo(next);
    handleLocationPicked({ lat, lng }, 'map');
  });

  mapInitialized = true;
}

function handleLocationPicked(latlng, source) {
  state.location = { lat: latlng.lat, lng: latlng.lng, source };

  const confirmCard = document.getElementById('co-loc-confirm');
  const latEl = document.getElementById('loc-lat');
  const lngEl = document.getElementById('loc-lng');
  const linkEl = document.getElementById('loc-maps-link');
  if (confirmCard) confirmCard.hidden = false;
  if (latEl) latEl.textContent = latlng.lat.toFixed(5);
  if (lngEl) lngEl.textContent = latlng.lng.toFixed(5);
  if (linkEl) linkEl.setAttribute('href', googleMapsLink(latlng.lat, latlng.lng));

  const gpsError = document.getElementById('co-gps-error');
  if (gpsError) gpsError.hidden = true;
}

function initGPS() {
  const btn = document.getElementById('use-gps-btn');
  const errorBox = document.getElementById('co-gps-error');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.innerHTML = `Location services aren't available in this browser. Please use <button type="button" class="co-maps-link" id="co-gps-fallback-map">Pin on Map</button> instead.`;
        document.getElementById('co-gps-fallback-map')?.addEventListener('click', () => {
          document.getElementById('tab-map')?.click();
        });
      }
      return;
    }

    btn.classList.add('is-loading');
    btn.disabled = true;
    if (errorBox) errorBox.hidden = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.classList.remove('is-loading');
        btn.disabled = false;
        const { latitude, longitude } = pos.coords;
        handleLocationPicked({ lat: latitude, lng: longitude }, 'gps');
        if (mapInitialized && map && marker) {
          const next = new google.maps.LatLng(latitude, longitude);
          marker.setPosition(next);
          map.setCenter(next);
          map.setZoom(15);
        }
        showToast('Location captured.');
      },
      (err) => {
        btn.classList.remove('is-loading');
        btn.disabled = false;
        let msg = 'Could not get your location. Please use Pin on Map instead.';
        if (err.code === err.PERMISSION_DENIED) msg = 'Location access was denied. Please use Pin on Map instead.';
        else if (err.code === err.TIMEOUT) msg = 'Location request timed out. Please try again or use Pin on Map.';
        if (errorBox) {
          errorBox.hidden = false;
          errorBox.innerHTML = `${msg} <button type="button" class="co-maps-link" id="co-gps-fallback-map">Pin on Map</button>`;
          document.getElementById('co-gps-fallback-map')?.addEventListener('click', () => {
            document.getElementById('tab-map')?.click();
          });
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

/* ============================================================
   STEP 3 — REVIEW
============================================================ */

function productIconSvg(iconId) {
  return `<svg class="icon" aria-hidden="true"><use href="#${iconId || 'icon-leaf'}"></use></svg>`;
}

function renderReview() {
  // Products
  const itemsEl = document.getElementById('review-items');
  if (itemsEl) {
    const rows = getCart().map((item) => {
      const meta = getProductMeta(item.pid) || {};
      return `
        <div class="co-review-item">
          <div class="co-review-item-icon ${meta.badgeClass ? `is-${meta.badgeClass}` : ''}">${productIconSvg(meta.icon)}</div>
          <div class="co-review-item-info">
            <div class="co-review-item-name">${escapeHtml(meta.name || item.pid)}</div>
            <div class="co-review-item-meta">${escapeHtml(item.size)} &times; ${item.qty}</div>
          </div>
          <div class="co-review-item-price">${formatPKR(item.price * item.qty)}</div>
        </div>
      `;
    });
    itemsEl.innerHTML = rows.join('') || `<p class="co-review-empty">No products selected.</p>`;
  }

  // Customer
  const customer = getCustomerData();
  const customerEl = document.getElementById('review-customer');
  if (customerEl) {
    customerEl.innerHTML = `
      <div><strong>${escapeHtml(customer.name)}</strong></div>
      <div>${escapeHtml(customer.phone)}</div>
      ${customer.email ? `<div>${escapeHtml(customer.email)}</div>` : ''}
    `;
  }

  // Delivery
  const deliveryEl = document.getElementById('review-delivery');
  if (deliveryEl) {
    const loc = state.location;
    deliveryEl.innerHTML = `
      ${loc
        ? `<div>📍 Pin captured (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}) — <a class="co-maps-link" href="${googleMapsLink(loc.lat, loc.lng)}" target="_blank" rel="noopener">View on Google Maps ↗</a></div>`
        : `<div class="co-review-empty">No delivery location set.</div>`}
      <div>${customer.notes ? escapeHtml(customer.notes) : 'No additional delivery notes.'}</div>
    `;
  }

  // Pricing
  const pricingEl = document.getElementById('review-pricing');
  if (pricingEl) {
    const subtotal = cartSubtotal();
    const threshold = SITE_CONFIG.freeDeliveryThreshold;
    const delivery = subtotal >= threshold ? 0 : SITE_CONFIG.deliveryFee;
    const total = subtotal + delivery;
    pricingEl.innerHTML = `
      <div class="co-price-row"><span>Subtotal</span><span>${formatPKR(subtotal)}</span></div>
      <div class="co-price-row"><span>Delivery</span><span>${delivery === 0 ? 'Free' : formatPKR(delivery)}</span></div>
      <div class="co-price-row co-price-row--total"><span>Total</span><strong>${formatPKR(total)}</strong></div>
    `;
  }
}

function initReviewEditButtons() {
  document.querySelectorAll('.co-review-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const goto = btn.getAttribute('data-goto');
      if (goto === 'sidebar') {
        goToStep(1);
        setTimeout(openMobileSummary, 350);
      } else {
        goToStep(Number(goto));
      }
    });
  });
}

/* ============================================================
   STEP TRANSITIONS (next / back buttons)
============================================================ */

function initStepButtons() {
  document.getElementById('step1-next')?.addEventListener('click', () => {
    const nameOk = validateName();
    const phoneOk = validatePhone();
    const emailOk = validateEmail();

    if (!nameOk || !phoneOk || !emailOk) {
      showToast('Please check the highlighted fields.');
      const firstError = document.querySelector('.co-field.has-error input');
      firstError?.focus();
      return;
    }

    if (cartItemCount() === 0) {
      const banner = document.getElementById('co-empty-banner');
      if (banner) banner.hidden = false;
      showToast('Add at least one product to continue.');
      shake(document.getElementById('co-empty-banner'));
      openMobileSummary();
      return;
    }

    goToStep(2);
  });

  document.getElementById('step2-back')?.addEventListener('click', () => goToStep(1));

  document.getElementById('step2-next')?.addEventListener('click', () => {
    if (!state.location) {
      showToast('Please confirm a delivery location to continue.');
      shake(document.querySelector('.co-loc-tabs'));
      return;
    }
    renderReview();
    goToStep(3);
  });

  document.getElementById('step3-back')?.addEventListener('click', () => goToStep(2));
}

/* ============================================================
   STEP 4 — CONFIRM ORDER VIA WHATSAPP
============================================================ */

function buildOrderMessage(customer, orderRef) {
  const lines = [];
  lines.push('🧾 *New Order — Ajwa Organics*');
  lines.push('');
  lines.push('*Customer Details*');
  lines.push(`Name: ${customer.name}`);
  lines.push(`Phone: ${customer.phone}`);
  if (customer.email) lines.push(`Email: ${customer.email}`);
  lines.push('');
  lines.push('*Order Items*');
  getCart().forEach((item, idx) => {
    const meta = getProductMeta(item.pid) || {};
    lines.push(`${idx + 1}. ${meta.name || item.pid} (${item.size}) x${item.qty} — ${formatPKR(item.price * item.qty)}`);
  });
  lines.push('');
  lines.push('*Delivery*');
  lines.push(`Notes: ${customer.notes || 'None'}`);
  if (state.location) {
    lines.push(`Location: ${googleMapsLink(state.location.lat, state.location.lng)}`);
  }
  lines.push('');
  const subtotal = cartSubtotal();
  const threshold = SITE_CONFIG.freeDeliveryThreshold;
  const delivery = subtotal >= threshold ? 0 : SITE_CONFIG.deliveryFee;
  const total = subtotal + delivery;
  lines.push('*Pricing*');
  lines.push(`Subtotal: ${formatPKR(subtotal)}`);
  lines.push(`Delivery: ${delivery === 0 ? 'Free' : formatPKR(delivery)}`);
  lines.push(`Total: ${formatPKR(total)}`);
  lines.push('');
  const now = new Date();
  lines.push(`🕒 Order Time: ${now.toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}`);
  lines.push(`Ref: ${orderRef}`);
  return lines.join('\n');
}

function initConfirmButton() {
  const btn = document.getElementById('confirm-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (cartItemCount() === 0) {
      showToast('Your cart is empty — add a product before confirming.');
      goToStep(1);
      return;
    }
    if (!state.location) {
      showToast('Please confirm a delivery location to continue.');
      goToStep(2);
      return;
    }

    const customer = getCustomerData();
    const orderRef = generateOrderRef();
    const message = buildOrderMessage(customer, orderRef);
    const waLink = `https://wa.me/${SITE_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;

    // Open WhatsApp synchronously (inside the click handler) so
    // popup blockers don't intercept it.
    window.open(waLink, '_blank', 'noopener');

    btn.classList.add('is-loading');
    setTimeout(() => {
      btn.classList.remove('is-loading');
      const refEl = document.getElementById('success-ref');
      if (refEl) refEl.textContent = orderRef;
      clearCart();
      goToStep(4);
    }, 450);
  });
}

/* ============================================================
   INIT
============================================================ */
function init() {
  applyQueryPrefill();
  renderCart();
  // Any add/remove/qty change anywhere (this page or another tab)
  // re-renders the sidebar + summary from the single source of truth.
  window.addEventListener('ajwa:cart-updated', renderCart);

  initMobileSidebarRelocation();
  initMobileToggle();

  initFieldValidation();
  initLocationTabs();
  initGPS();

  initStepButtons();
  initReviewEditButtons();
  initConfirmButton();

  updateProgress(1);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
