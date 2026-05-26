// content.js — Woolies Protein Tags (isolated world)
//
// Listens for nutrition data harvested by inject.js, caches it in
// chrome.storage, and renders a single pill on each product tile coloured
// by the protein-to-calorie ratio:
//
//   ratio = (proteinPer100g × 10) / kcalPer100g     (kcal = kJ / 4.184)
//
// > 1 means the food passes the "10× protein g exceeds kcal" rule.
// The whole pill goes red → orange → yellow → light green → dark green,
// with grey for "no nutrition info published".

const BADGE_ATTR = 'data-wpt-stockcode';
const TILE_FLAG = 'data-wpt-tile';
const STOCKCODE_RE = /\/productdetails\/(\d+)(?:\/|$)/i;
const STORAGE_PREFIX = 'wpt:';
const KJ_PER_KCAL = 4.184;

const nutritionByStockcode = new Map();

// Stockcodes we've asked the background worker to fetch (so we don't loop).
const fallbackRequested = new Set();
// Stockcodes we've seen on a tile but don't yet have data for; checked
// after a delay so the page's own fetch gets first crack.
const pendingStockcodes = new Map(); // stockcode → first-seen ms

// ─── Cache hydration ─────────────────────────────────────────────────
(async function hydrate() {
  try {
    if (chrome?.storage?.local) {
      const all = await chrome.storage.local.get(null);
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith(STORAGE_PREFIX) && v && typeof v === 'object') {
          nutritionByStockcode.set(k.slice(STORAGE_PREFIX.length), v);
        }
      }
    }
  } catch (_) { /* storage unavailable */ }
  scheduleProcess();
})();

// ─── Listen for nutrition from inject.js ─────────────────────────────
const pendingWrites = {};
let writeTimer = null;

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const msg = e.data;
  if (!msg || msg.source !== 'wpt-inject' || !Array.isArray(msg.payload)) return;

  let changed = 0;
  for (const item of msg.payload) {
    if (!item?.stockcode) continue;
    const incoming = {
      proteinPer100g: item.proteinPer100g ?? null,
      proteinPerServing: item.proteinPerServing ?? null,
      energyKjPer100g: item.energyKjPer100g ?? null,
      energyKjPerServing: item.energyKjPerServing ?? null,
      servingSize: item.servingSize ?? null,
      noData: !!item.noData,
    };
    const existing = nutritionByStockcode.get(item.stockcode);
    if (existing && !existing.noData && incoming.noData) continue;
    nutritionByStockcode.set(item.stockcode, incoming);
    pendingWrites[STORAGE_PREFIX + item.stockcode] = incoming;
    changed++;
  }

  if (changed) {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(flushWrites, 400);
    scheduleProcess();
  }
});

function flushWrites() {
  writeTimer = null;
  const batch = pendingWrites;
  if (!Object.keys(batch).length) return;
  for (const k in batch) delete pendingWrites[k];
  if (!extensionAlive()) return;
  try { chrome.storage.local.set(batch); } catch (_) { /* ignored */ }
}

// ─── Shadow-DOM-aware traversal ──────────────────────────────────────
function* walkAllRoots(root) {
  yield root;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    const tree = node.querySelectorAll ? node.querySelectorAll('*') : [];
    for (const el of tree) {
      if (el.shadowRoot) {
        yield el.shadowRoot;
        stack.push(el.shadowRoot);
      }
    }
  }
}

function queryAllDeep(selector, root = document) {
  const out = [];
  for (const r of walkAllRoots(root)) {
    try { r.querySelectorAll(selector).forEach((el) => out.push(el)); }
    catch (_) { /* ignored */ }
  }
  return out;
}

// ─── Tile detection ──────────────────────────────────────────────────
// Word-boundary classes — don't match substrings like "product-tile-image"
// (an inner element) or "product-tiles-list" (the whole grid).
const TILE_CLASS_RE = /(?:^|\s)(?:product-tile|shelfProductTile|productTile|product-card)(?:$|\s)/i;

function isTileRoot(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'WC-PRODUCT-TILE' || tag === 'WC-SHELF-PRODUCT') return true;
  const cls = (typeof el.className === 'string') ? el.className : '';
  return TILE_CLASS_RE.test(cls);
}

// Walk up to the OUTER-most tile root. Without this, an image-link anchor
// and a title-link anchor inside the same card would resolve to two
// different ancestors (each matching the tile regex at different depths),
// and we'd badge both.
function findTileForLink(a) {
  let el = a;
  let outermost = null;
  for (let i = 0; i < 10 && el; i++) {
    el = el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
    if (!el) break;
    if (isTileRoot(el)) outermost = el;
  }
  return outermost || a.closest('article, li') || a.parentElement;
}

function getStockcodeFromLink(a) {
  const m = (a.getAttribute('href') || '').match(STOCKCODE_RE);
  return m ? m[1] : null;
}

function isHiddenTile(el) {
  let n = el;
  for (let i = 0; i < 4 && n; i++) {
    // Inline style is the cheap, decisive check — Woolies sets display:none !important.
    if (n.style && n.style.display === 'none') return true;
    n = n.parentElement;
  }
  return false;
}

// Carousel libraries (Swiper, Slick, Splide, Glide, plus generic React ones)
// duplicate slide elements for infinite scroll, which means the same product
// appears twice in the DOM. Skip cloned slides so we don't badge them.
const CLONE_CLASS_RE = /\b(?:slick-cloned|swiper-slide-duplicate|splide__slide--clone|glide__slide--clone|cloned|duplicate-slide|carousel-clone)\b/i;
function isCarouselClone(el) {
  let n = el;
  for (let i = 0; i < 8 && n; i++) {
    if (n.getAttribute) {
      const cls = (typeof n.className === 'string') ? n.className : '';
      if (CLONE_CLASS_RE.test(cls)) return true;
      // Swiper and others additionally tag clones with aria-hidden="true";
      // we look for that on slide-like elements so we don't accidentally
      // skip real (visible) tiles that happen to have aria-hidden.
      if (/slide|carousel|swiper/i.test(cls) && n.getAttribute('aria-hidden') === 'true') {
        return true;
      }
    }
    n = n.parentElement;
  }
  return false;
}

// ─── Protein density & rating ────────────────────────────────────────
//
// Headline number is grams of protein per 100 kcal — a basis-independent
// measure of protein density. Computed per-100g preferentially; falls back
// to per-serving if that's all we have.
function computeProteinPer100kcal(info) {
  const p100 = info.proteinPer100g;
  const e100 = info.energyKjPer100g;
  if (p100 != null && e100 != null && e100 > 0) {
    const kcal = e100 / KJ_PER_KCAL;
    return { value: (p100 * 100) / kcal, basis: '100g', kcal, protein: p100 };
  }
  const pS = info.proteinPerServing;
  const eS = info.energyKjPerServing;
  if (pS != null && eS != null && eS > 0) {
    const kcal = eS / KJ_PER_KCAL;
    return { value: (pS * 100) / kcal, basis: 'serve', kcal, protein: pS };
  }
  // Zero-energy edge case (water, sweeteners, etc.) — protein-per-kcal is
  // undefined; we treat it as "no rating" so it lands in the grey bucket.
  return null;
}

// Tiers in grams-protein-per-100-kcal:
//   ≥ 20  great   deep green (extremely protein-dense — egg whites, whey)
//   ≥ 10  good    light green (passes the 10×P > kcal rule)
//   ≥ 6   ok      yellow      (a bit below the rule)
//   ≥ 3   poor    orange
//   < 3   bad     red
function ratingFor(perHundredKcal) {
  if (perHundredKcal == null) return 'na';
  if (!Number.isFinite(perHundredKcal) || perHundredKcal >= 20) return 'great';
  if (perHundredKcal >= 10) return 'good';
  if (perHundredKcal >= 6) return 'ok';
  if (perHundredKcal >= 3) return 'poor';
  return 'bad';
}

// ─── Badge ───────────────────────────────────────────────────────────
// Styles are applied inline so the badge renders correctly even when it's
// inserted inside a Woolworths web-component shadow root (which doesn't
// inherit the manifest-loaded styles.css).
const BADGE_STYLE = [
  'display: inline-flex',
  'align-items: baseline',
  'gap: 4px',
  'margin: 4px 0',
  'padding: 4px 10px',
  'border-radius: 999px',
  'font: 700 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  'letter-spacing: 0.01em',
  'border: none',
  'width: fit-content',
  'max-width: 100%',
  'white-space: nowrap',
  'box-sizing: border-box',
  'cursor: help',
  'z-index: 1',
  'position: relative',
  'visibility: visible',
  'opacity: 1',
  'box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12)',
].join('; ');

const VALUE_STYLE = 'font-weight: 800; font-size: 14px; font-variant-numeric: tabular-nums;';
const UNIT_STYLE = 'font-size: 10px; font-weight: 700; letter-spacing: 0.04em; opacity: 0.85; text-transform: uppercase;';

// Punchier, more saturated colours so the rating reads at a glance.
const RATING_COLORS = {
  na:    { bg: '#9aa0a6', fg: '#ffffff' },  // medium grey
  bad:   { bg: '#d93025', fg: '#ffffff' },  // red
  poor:  { bg: '#ef6c00', fg: '#ffffff' },  // orange
  ok:    { bg: '#fbc02d', fg: '#1a1a1a' },  // yellow (dark text for contrast)
  good:  { bg: '#1e8e3e', fg: '#ffffff' },  // green
  great: { bg: '#0d6b2c', fg: '#ffffff' },  // deep green
};

function applyRating(badge, rating) {
  const c = RATING_COLORS[rating] || RATING_COLORS.na;
  badge.style.background = c.bg;
  badge.style.color = c.fg;
}

// ─── Shared hover tooltip ────────────────────────────────────────────
// One element in document.body, positioned fixed so tile overflow:hidden
// can't clip it. Filled on mouseenter, repositioned for each hover.
let sharedTooltip = null;
function ensureTooltip() {
  if (sharedTooltip) return sharedTooltip;
  sharedTooltip = document.createElement('div');
  sharedTooltip.setAttribute('data-wpt-tooltip', '');
  sharedTooltip.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'visibility: hidden',
    'opacity: 0',
    'pointer-events: none',
    'background: #1f1f1f',
    'color: #ffffff',
    'font: 500 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'padding: 10px 12px',
    'border-radius: 8px',
    'white-space: pre',
    'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28)',
    'z-index: 2147483647',
    'transition: opacity 120ms ease',
    'max-width: 340px',
  ].join('; ');
  const attach = () => document.body && document.body.appendChild(sharedTooltip);
  if (document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach, { once: true });
  window.addEventListener('scroll', hideTooltip, { passive: true, capture: true });
  window.addEventListener('resize', hideTooltip, { passive: true });
  return sharedTooltip;
}

function showTooltipFor(badge) {
  const content = badge.__tooltipContent;
  if (!content) return;
  const tip = ensureTooltip();
  tip.textContent = content;
  tip.style.visibility = 'visible';
  tip.style.opacity = '1';
  // Reflow to get a measured size, then position.
  const rect = badge.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let top = rect.bottom + 6;
  if (top + tipRect.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - tipRect.height - 6);
  }
  let left = rect.left;
  if (left + tipRect.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - tipRect.width - 8);
  }
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
}

function hideTooltip() {
  if (!sharedTooltip) return;
  sharedTooltip.style.visibility = 'hidden';
  sharedTooltip.style.opacity = '0';
}

function attachTooltipHandlers(badge) {
  badge.addEventListener('mouseenter', () => showTooltipFor(badge));
  badge.addEventListener('mouseleave', hideTooltip);
}

function makeBadge(stockcode) {
  const el = document.createElement('div');
  el.className = 'wpt-badge wpt-loading wpt-rating-na';
  el.setAttribute(BADGE_ATTR, stockcode);
  el.style.cssText = BADGE_STYLE;
  applyRating(el, 'na');
  el.innerHTML = `
    <span class="wpt-metric-value" style="${VALUE_STYLE}">…</span><span class="wpt-metric-unit" style="${UNIT_STYLE}">g P / 100 kcal</span>
  `;
  attachTooltipHandlers(el);
  return el;
}

function fillBadge(badge, info) {
  badge.classList.remove('wpt-loading');
  for (const c of [...badge.classList]) {
    if (c.startsWith('wpt-rating-')) badge.classList.remove(c);
  }

  const valueEl = badge.querySelector('.wpt-metric-value');

  if (!info || info.noData) {
    valueEl.textContent = '—';
    badge.classList.add('wpt-rating-na');
    applyRating(badge, 'na');
    badge.__tooltipContent = 'No nutrition info published for this product';
    return;
  }

  const density = computeProteinPer100kcal(info);
  if (density == null) {
    valueEl.textContent = '—';
    badge.classList.add('wpt-rating-na');
    applyRating(badge, 'na');
    badge.__tooltipContent = 'Insufficient nutrition data — no energy value published';
    return;
  }

  valueEl.textContent = Number.isFinite(density.value) ? formatGrams(density.value) : '∞';
  const rating = ratingFor(density.value);
  badge.classList.add('wpt-rating-' + rating);
  applyRating(badge, rating);
  badge.dataset.basis = density.basis;

  badge.__tooltipContent = buildTooltip(info, density);
}

const VERDICTS = {
  great: 'Excellent!',
  good:  'Good!',
  ok:    'OK.',
  poor:  'Poor.',
  bad:   'Bad.',
  na:    'No data.',
};

function buildTooltip(info, density) {
  const lines = [];
  const rating = ratingFor(density?.value ?? null);
  const verdict = VERDICTS[rating];
  if (density && Number.isFinite(density.value)) {
    lines.push(`${verdict} ${formatGrams(density.value)}g of protein per 100 kcal`);
  } else if (density) {
    lines.push(`${verdict} ∞g of protein per 100 kcal (no caloric energy)`);
  }

  if (info.proteinPer100g != null || info.energyKjPer100g != null) {
    const p = info.proteinPer100g != null ? `${info.proteinPer100g}g P` : '—';
    const e = info.energyKjPer100g != null
      ? `${Math.round(info.energyKjPer100g / KJ_PER_KCAL)} kcal`
      : '—';
    lines.push(`Per 100g: ${p} · ${e}`);
  }
  if (info.proteinPerServing != null || info.energyKjPerServing != null) {
    const p = info.proteinPerServing != null ? `${info.proteinPerServing}g P` : '—';
    const e = info.energyKjPerServing != null
      ? `${Math.round(info.energyKjPerServing / KJ_PER_KCAL)} kcal`
      : '—';
    const serve = info.servingSize ? `${info.servingSize} serve` : 'serve';
    lines.push(`Per ${serve}: ${p} · ${e}`);
  }
  return lines.join('\n');
}

function formatGrams(n) {
  if (n >= 10) return Math.round(n).toString();
  return (Math.round(n * 10) / 10).toString();
}
function formatEnergy(kj) {
  return Math.round(kj).toString();
}

// ─── Insertion ───────────────────────────────────────────────────────
// Woolies' <wc-product-tile> shadow DOM exposes named slots — header-slot,
// left-slot, right-slot, cta-slot-1/2/full, footer-slot. Projecting the
// badge into header-slot is the cleanest place: it sits above the tile
// content without disturbing the internal grid layout.
function attachBadge(tile, stockcode) {
  if (tile.getAttribute(TILE_FLAG) === stockcode) {
    return tile.querySelector(`:scope > [${BADGE_ATTR}="${stockcode}"]`)
        || tile.querySelector(`[${BADGE_ATTR}="${stockcode}"]`);
  }
  tile.querySelectorAll(`[${BADGE_ATTR}]`).forEach((b) => b.remove());

  const badge = makeBadge(stockcode);

  const slotName = pickSlot(tile);
  if (slotName) {
    badge.setAttribute('slot', slotName);
    tile.appendChild(badge);
  } else {
    // Fallback for tiles without a shadow root / slot — insert near the name.
    const root = tile.shadowRoot || tile;
    const nameEl =
      root.querySelector?.('[class*="product-tile-product-name"], [class*="productName"], h3, h2') ||
      null;
    if (nameEl && nameEl.parentElement) {
      nameEl.parentElement.insertBefore(badge, nameEl);
    } else {
      root.firstChild ? root.insertBefore(badge, root.firstChild) : root.appendChild(badge);
    }
  }
  tile.setAttribute(TILE_FLAG, stockcode);
  return badge;
}

function pickSlot(tile) {
  const sr = tile.shadowRoot;
  if (!sr) return null;
  if (sr.querySelector('slot[name="header-slot"]')) return 'header-slot';
  return null;
}

// ─── Product detail page (the main item has no /productdetails/ link) ─
const DETAIL_PATH_RE = /^\/shop\/productdetails\/(\d+)(?:\/|$)/i;
const DETAIL_BADGE_ATTR = 'data-wpt-detail-stockcode';

function processDetailPage() {
  const m = location.pathname.match(DETAIL_PATH_RE);
  if (!m) {
    // We may have navigated away from a detail page — clean up stale badges.
    document.querySelectorAll(`[${DETAIL_BADGE_ATTR}]`).forEach((el) => el.remove());
    return;
  }
  const stockcode = m[1];

  // Anchor on the main product H1.
  const h1 = queryAllDeep('h1')[0];
  if (!h1 || !h1.parentElement) return;
  const parent = h1.parentElement;

  // If we already badged this product, just refresh the data if it arrived.
  let badge = parent.querySelector(`[${DETAIL_BADGE_ATTR}="${stockcode}"]`);
  if (badge) {
    const info = nutritionByStockcode.get(stockcode);
    if (info) fillBadge(badge, info);
    else if (!pendingStockcodes.has(stockcode)) pendingStockcodes.set(stockcode, Date.now());
    return;
  }

  // Remove badges for any other (stale) stockcode under this header.
  parent.querySelectorAll(`[${DETAIL_BADGE_ATTR}]`).forEach((el) => el.remove());

  badge = makeBadge(stockcode);
  badge.setAttribute(DETAIL_BADGE_ATTR, stockcode);
  // Larger / more prominent than a tile badge.
  badge.style.fontSize = '14px';
  badge.style.padding = '5px 12px';
  badge.style.marginTop = '10px';
  badge.style.marginBottom = '6px';
  h1.insertAdjacentElement('afterend', badge);

  const info = nutritionByStockcode.get(stockcode);
  if (info) fillBadge(badge, info);
  else if (!pendingStockcodes.has(stockcode)) pendingStockcodes.set(stockcode, Date.now());
}

// ─── Main loop ───────────────────────────────────────────────────────
function processOnce() {
  processDetailPage();

  const links = queryAllDeep('a[href*="/productdetails/"]');
  const seenTiles = new WeakSet();
  const seenStockcodes = new Set();
  for (const a of links) {
    const stockcode = getStockcodeFromLink(a);
    if (!stockcode) continue;
    if (isCarouselClone(a)) continue;
    if (seenStockcodes.has(stockcode)) continue;
    const tile = findTileForLink(a);
    if (!tile || seenTiles.has(tile)) continue;
    // Woolies marks some tiles display:none !important (sponsored placeholders,
    // already-swapped variants). Skip them — they're hidden and badging them
    // would leak our slotted content into the layout if the host ever unhides.
    if (isHiddenTile(tile)) continue;
    seenStockcodes.add(stockcode);
    seenTiles.add(tile);

    const badge = attachBadge(tile, stockcode);
    if (!badge) continue;

    const info = nutritionByStockcode.get(stockcode);
    if (info) {
      fillBadge(badge, info);
    } else {
      if (!pendingStockcodes.has(stockcode)) pendingStockcodes.set(stockcode, Date.now());
    }
  }
  considerFallbackFetch();
  // If anything is still pending, make sure we run again past the fallback
  // delay. Without this, a page that never fetches (SSR/cached) gets stuck
  // in "loading" forever because nothing else triggers a reschedule.
  if (pendingStockcodes.size > 0) {
    setTimeout(scheduleProcess, FALLBACK_DELAY_MS + 50);
  }
}

// If a stockcode has been visible for >500ms with no nutrition data arriving
// from the page's own fetches, ask the background worker to fetch it directly.
// (Lower than before — category pages often render tiles SSR and never fetch
// product data client-side, so we'd otherwise stay grey forever.)
const FALLBACK_DELAY_MS = 500;
function extensionAlive() {
  // chrome.runtime.id is undefined once the extension context is invalidated
  // (e.g. user reloaded the extension while this tab was open).
  try { return !!(chrome?.runtime?.id); } catch (_) { return false; }
}
function considerFallbackFetch() {
  if (!extensionAlive()) return;
  const now = Date.now();
  for (const [sc, since] of pendingStockcodes) {
    if (nutritionByStockcode.has(sc)) {
      pendingStockcodes.delete(sc);
      continue;
    }
    if (fallbackRequested.has(sc)) continue;
    if (now - since < FALLBACK_DELAY_MS) continue;
    fallbackRequested.add(sc);
    try {
      chrome.runtime.sendMessage({ type: 'wpt:fetchProduct', stockcode: sc }, (resp) => {
        if (chrome.runtime?.lastError) return;
        let nutrition;
        if (resp?.ok && resp.nutrition) {
          nutrition = resp.nutrition;
        } else {
          // Couldn't fetch — surface as "no data" so the pill stops loading.
          nutrition = {
            proteinPer100g: null, proteinPerServing: null,
            energyKjPer100g: null, energyKjPerServing: null,
            servingSize: null, noData: true,
          };
        }
        nutritionByStockcode.set(sc, nutrition);
        pendingWrites[STORAGE_PREFIX + sc] = nutrition;
        if (writeTimer) clearTimeout(writeTimer);
        writeTimer = setTimeout(flushWrites, 400);
        scheduleProcess();
      });
    } catch (_) {
      // Context invalidated mid-call — give up silently; the tab needs reload.
    }
  }
}

let scheduled = null;
function scheduleProcess() {
  if (scheduled) return;
  scheduled = setTimeout(() => {
    scheduled = null;
    try { processOnce(); } catch (e) { console.warn('[WPT] process failed', e); }
  }, 150);
}

const observer = new MutationObserver(() => scheduleProcess());
observer.observe(document.documentElement, { childList: true, subtree: true });

// Re-process when the tab becomes visible again — the page often re-fetches
// or re-renders on focus, and we want fresh data to land immediately.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleProcess();
});

// Several follow-up passes catch any tile that renders later than expected.
scheduleProcess();
setTimeout(scheduleProcess, 500);
setTimeout(scheduleProcess, 1500);
setTimeout(scheduleProcess, 4000);
setTimeout(scheduleProcess, 8000);
