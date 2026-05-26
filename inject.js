// inject.js — Woolies Protein Tags (runs in the page's MAIN world)
//
// Captures product nutrition info from anywhere on the Woolies page:
//   1. Monkey-patches window.fetch    (covers SPA navigation, search, etc.)
//   2. Monkey-patches XMLHttpRequest  (covers HTTP libs that use XHR)
//   3. Scrapes inline <script> JSON   (covers SSR-hydrated initial loads)
//
// Whenever any of those yields products with nutrition data, we post a
// message back to the isolated-world content script via window.postMessage.

(() => {
  if (window.__wptInstalled) return;
  window.__wptInstalled = true;

  const SOURCE = 'wpt-inject';

  // ─── Shared parsing ────────────────────────────────────────────────
  function interceptResponseText(text) {
    if (!text || typeof text !== 'string') return;
    if (text[0] !== '{' && text[0] !== '[') return; // not JSON
    let data;
    try { data = JSON.parse(text); } catch (_) { return; }
    const items = [];
    walk(data, items);
    if (items.length) {
      window.postMessage({ source: SOURCE, payload: items }, '*');
    }
  }

  function urlOf(input) {
    if (!input) return '';
    if (typeof input === 'string') return input;
    if (input instanceof Request) return input.url;
    return input.url || '';
  }

  function shouldIntercept(url) {
    if (!url) return false;
    // Match both absolute and relative URLs. inject.js only runs on
    // woolworths.com.au, so any /apis/ui/ request is on Woolies.
    return /\/apis\/ui\//i.test(url);
  }

  // ─── 1. fetch ──────────────────────────────────────────────────────
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = urlOf(args[0]);
      if (shouldIntercept(url)) {
        res.clone().text().then(interceptResponseText).catch(() => {});
      }
    } catch (_) { /* never break the page */ }
    return res;
  };

  // ─── 2. XMLHttpRequest ─────────────────────────────────────────────
  const XHRP = XMLHttpRequest.prototype;
  const origXhrOpen = XHRP.open;
  const origXhrSend = XHRP.send;

  XHRP.open = function (method, url, ...rest) {
    this.__wptUrl = url;
    return origXhrOpen.call(this, method, url, ...rest);
  };

  XHRP.send = function (...args) {
    if (this.__wptUrl && shouldIntercept(this.__wptUrl)) {
      this.addEventListener('load', function () {
        try {
          if (this.status >= 200 && this.status < 300) {
            const rt = this.responseType;
            let text = null;
            if (rt === '' || rt === 'text') {
              text = this.responseText;
            } else if (rt === 'json' && this.response) {
              text = JSON.stringify(this.response);
            } else if (typeof this.response === 'string') {
              text = this.response;
            }
            interceptResponseText(text);
          }
        } catch (_) { /* swallow */ }
      });
    }
    return origXhrSend.apply(this, args);
  };

  // ─── 3. Inline JSON (SSR hydration) ────────────────────────────────
  // Many SSR setups inline a big JSON blob with product data. Scrape any
  // script tag that looks JSON-ish and feed it through the same walker.
  function scrapeInlineJson() {
    const scripts = document.querySelectorAll(
      'script[type="application/json"], script[type="application/ld+json"], script[id*="data" i], script[id*="state" i]'
    );
    for (const s of scripts) {
      if (s.__wptScraped) continue;
      s.__wptScraped = true;
      const text = s.textContent;
      if (text && (text.includes('Stockcode') || text.includes('stockcode'))) {
        interceptResponseText(text);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scrapeInlineJson, { once: true });
  } else {
    scrapeInlineJson();
  }
  // Late-arriving hydration blobs.
  setTimeout(scrapeInlineJson, 500);
  setTimeout(scrapeInlineJson, 2000);

  // ─── Product walker ────────────────────────────────────────────────
  function walk(obj, out, depth = 0) {
    if (obj == null || depth > 12) return;
    if (Array.isArray(obj)) {
      for (const v of obj) walk(v, out, depth + 1);
      return;
    }
    if (typeof obj !== 'object') return;

    const sc = obj.Stockcode ?? obj.stockcode;
    const addl = obj.AdditionalAttributes;
    if (sc != null && addl && typeof addl === 'object') {
      const info = extractProtein(addl);
      if (info) {
        out.push({ stockcode: String(sc), ...info });
      } else {
        // Still flag the stockcode so we can render an explicit "no data"
        // badge instead of leaving the tile in a loading state forever.
        out.push({ stockcode: String(sc), proteinPer100g: null, proteinPerServing: null, noData: true });
      }
    }

    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === 'object') walk(v, out, depth + 1);
    }
  }

  function extractProtein(addl) {
    const raw = addl.nutritionalinformation;
    if (!raw || typeof raw !== 'string') return null;
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { return null; }
    const attrs = parsed?.Attributes;
    if (!Array.isArray(attrs)) return null;

    let proteinPer100g = null;
    let proteinPerServing = null;
    let energyKjPer100g = null;
    let energyKjPerServing = null;
    let servingSize = null;

    for (const a of attrs) {
      if (!a || typeof a.Name !== 'string') continue;
      const name = a.Name.toLowerCase();
      const isTotal = name.includes('- total -') || name.includes('- total ');
      if (!isTotal && !name.startsWith('serving size')) continue;

      if (name.includes('protein quantity per 100g')) {
        const n = parseNumber(a.Value);
        if (n != null) proteinPer100g = n;
      } else if (name.includes('protein quantity per serve')) {
        const n = parseNumber(a.Value);
        if (n != null) proteinPerServing = n;
      } else if (name.includes('energy kj quantity per 100g')) {
        const n = parseNumber(a.Value);
        if (n != null) energyKjPer100g = n;
      } else if (name.includes('energy kj quantity per serve')) {
        const n = parseNumber(a.Value);
        if (n != null) energyKjPerServing = n;
      } else if (name.startsWith('serving size') && servingSize == null) {
        servingSize = String(a.Value).trim();
      }
    }

    const anyData =
      proteinPer100g != null || proteinPerServing != null ||
      energyKjPer100g != null || energyKjPerServing != null;
    if (!anyData) return null;
    return {
      proteinPer100g,
      proteinPerServing,
      energyKjPer100g,
      energyKjPerServing,
      servingSize,
    };
  }

  function parseNumber(s) {
    if (s == null) return null;
    if (typeof s === 'number') return Number.isFinite(s) ? s : null;
    const str = String(s).trim().toLowerCase();
    if (!str || str === '—' || str === '-' || str === 'n/a') return null;
    if (str.includes('trace')) return 0;
    const cleaned = str.replace(/^[<~]/, '').replace(',', '.');
    const m = cleaned.match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return Number.isFinite(n) ? n : null;
  }
})();
