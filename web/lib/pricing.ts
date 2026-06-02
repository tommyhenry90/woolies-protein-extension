// Price normalisation: turn whatever pricing basis Woolies hands us into
// a consistent per-kg + per-100g-protein figure for cross-product comparison.

import type { WooliesProduct } from "./woolies";

// Parse "170g", "1.5kg", "1.3kg - 1.7kg" (returns midpoint), "500g - 1kg",
// "227 g", "1.5 KG" etc. into grams. Returns null for volume-only labels.
export function parsePackageSizeGrams(packageSize: string | null | undefined): number | null {
  if (!packageSize) return null;
  const s = packageSize.toLowerCase();

  const masses: number[] = [];
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g)\b/g)) {
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) continue;
    masses.push(m[2] === "kg" ? n * 1000 : n);
  }
  if (!masses.length) return null;
  // For ranges ("1.3kg - 1.7kg") take the midpoint.
  if (masses.length === 1) return masses[0];
  return (masses[0] + masses[masses.length - 1]) / 2;
}

// Parse Woolies' CupString — e.g. "$1.47 / 100G", "$36.67 / 1KG", "$2.10 / 100ML".
// Returns price-per-kilogram for mass-based units, null otherwise.
export function pricePerKgFromCupString(cup: string | null | undefined): number | null {
  if (!cup) return null;
  const m = cup.match(/\$([\d.]+)\s*\/\s*(\d+(?:\.\d+)?)\s*(g|kg)\b/i);
  if (!m) return null;
  const price = parseFloat(m[1]);
  const qty = parseFloat(m[2]);
  const unit = m[3].toLowerCase();
  if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
  const qtyKg = unit === "kg" ? qty : qty / 1000;
  return price / qtyKg;
}

export function pricePerKg(p: { price: number | null; cupString: string | null; packageSize: string | null }): number | null {
  const fromCup = pricePerKgFromCupString(p.cupString);
  if (fromCup != null) return fromCup;
  if (p.price == null) return null;
  const grams = parsePackageSizeGrams(p.packageSize);
  if (!grams) return null;
  return (p.price / grams) * 1000;
}

// Dollars per 100 g of protein. Only defined when we have both per-kg pricing
// and a protein-per-100g figure > 0.
export function pricePer100gProtein(
  p: { price: number | null; cupString: string | null; packageSize: string | null; nutrition: WooliesProduct["nutrition"] }
): number | null {
  const protein100 = p.nutrition?.proteinPer100g;
  if (protein100 == null || protein100 <= 0) return null;
  const perKg = pricePerKg(p);
  if (perKg == null) return null;
  // Convert per-kg → per 100g of product → per 100g of protein.
  // pricePer100gProduct = perKg / 10.
  // 100g of product contains `protein100` grams of protein, so:
  //   pricePer100gProtein = pricePer100gProduct * (100 / protein100)
  return (perKg / 10) * (100 / protein100);
}

export function formatPrice(n: number | null | undefined, opts: { suffix?: string; max?: number } = {}): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const { suffix = "", max = 999 } = opts;
  if (n > max) return null; // suppress nonsense values
  const cents = n < 10 ? n.toFixed(2) : n.toFixed(0);
  return `$${cents}${suffix}`;
}
