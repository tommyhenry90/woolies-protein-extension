// background.js — fallback fetcher
//
// 99% of the time inject.js harvests nutrition from API responses the page is
// already making. For the remaining cases (a tile rendered without a
// corresponding search call), content.js asks us to fetch the product
// directly via /apis/ui/products/{stockcode}, which returns the same
// AdditionalAttributes.nutritionalinformation shape.

const PRODUCT_URL = (stockcode) =>
  `https://www.woolworths.com.au/apis/ui/product/detail/${stockcode}?isMobile=false&useVariant=true`;

// Dedupe concurrent requests for the same stockcode.
const inFlight = new Map();

function extractProtein(addl) {
  if (!addl || typeof addl !== 'object') return null;
  const raw = addl.nutritionalinformation;
  if (!raw || typeof raw !== 'string') return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const attrs = parsed?.Attributes;
  if (!Array.isArray(attrs)) return null;

  let proteinPer100g = null, proteinPerServing = null;
  let energyKjPer100g = null, energyKjPerServing = null;
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
  return { proteinPer100g, proteinPerServing, energyKjPer100g, energyKjPerServing, servingSize };
}

function parseNumber(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const str = String(s).trim().toLowerCase();
  if (!str || str === '—' || str === '-' || str === 'n/a') return null;
  if (str.includes('trace')) return 0;
  const cleaned = str.replace(/^[<~]/, '').replace(',', '.');
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// /product/detail wraps the actual product in `Product`, but be defensive
// in case the shape changes — also accept root-level or one-level-deep
// objects that carry AdditionalAttributes.
function findProductInPayload(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.Product?.AdditionalAttributes) return data.Product;
  if (data.AdditionalAttributes) return data;
  for (const v of Object.values(data)) {
    if (v && typeof v === 'object' && v.AdditionalAttributes) return v;
  }
  return null;
}

async function fetchProductNutrition(stockcode) {
  if (inFlight.has(stockcode)) return inFlight.get(stockcode);
  const p = (async () => {
    try {
      const res = await fetch(PRODUCT_URL(stockcode), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json, text/plain, */*' },
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json();
      const prod = findProductInPayload(data);
      const info = prod ? extractProtein(prod.AdditionalAttributes) : null;
      return {
        ok: true,
        stockcode,
        nutrition: info || { proteinPer100g: null, proteinPerServing: null, energyKjPer100g: null, energyKjPerServing: null, servingSize: null, noData: true },
      };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      inFlight.delete(stockcode);
    }
  })();
  inFlight.set(stockcode, p);
  return p;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'wpt:fetchProduct' && msg.stockcode) {
    fetchProductNutrition(String(msg.stockcode)).then(sendResponse);
    return true; // async
  }
});
