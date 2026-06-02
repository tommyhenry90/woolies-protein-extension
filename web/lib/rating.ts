// Protein-density rating used by both the Chrome extension and this web app.
// Headline metric: grams of protein per 100 kcal. Rule of thumb: a food
// is "high protein" if (protein g × 10) > kcal, i.e. ≥ 10 g per 100 kcal.

export const KJ_PER_KCAL = 4.184;

export type Nutrition = {
  proteinPer100g: number | null;
  proteinPerServing: number | null;
  energyKjPer100g: number | null;
  energyKjPerServing: number | null;
  servingSize: string | null;
  noData?: boolean;
};

export type Density = {
  value: number;
  basis: "100g" | "serve";
  kcal: number;
  protein: number;
};

export type Rating = "great" | "good" | "ok" | "poor" | "bad" | "na";

// Compute protein-per-100-kcal. Prefer per-100g; fall back to per-serving.
export function computeProteinPer100kcal(info: Nutrition): Density | null {
  const p100 = info.proteinPer100g;
  const e100 = info.energyKjPer100g;
  if (p100 != null && e100 != null && e100 > 0) {
    const kcal = e100 / KJ_PER_KCAL;
    return { value: (p100 * 100) / kcal, basis: "100g", kcal, protein: p100 };
  }
  const pS = info.proteinPerServing;
  const eS = info.energyKjPerServing;
  if (pS != null && eS != null && eS > 0) {
    const kcal = eS / KJ_PER_KCAL;
    return { value: (pS * 100) / kcal, basis: "serve", kcal, protein: pS };
  }
  return null;
}

export function ratingFor(perHundredKcal: number | null | undefined): Rating {
  if (perHundredKcal == null) return "na";
  if (!Number.isFinite(perHundredKcal) || perHundredKcal >= 20) return "great";
  if (perHundredKcal >= 10) return "good";
  if (perHundredKcal >= 6) return "ok";
  if (perHundredKcal >= 3) return "poor";
  return "bad";
}

export const RATING_COLORS: Record<Rating, { bg: string; fg: string }> = {
  na: { bg: "#9aa0a6", fg: "#ffffff" },
  bad: { bg: "#d93025", fg: "#ffffff" },
  poor: { bg: "#ef6c00", fg: "#ffffff" },
  ok: { bg: "#fbc02d", fg: "#1a1a1a" },
  good: { bg: "#1e8e3e", fg: "#ffffff" },
  great: { bg: "#0d6b2c", fg: "#ffffff" },
};

export const VERDICTS: Record<Rating, string> = {
  great: "Excellent!",
  good: "Good!",
  ok: "OK.",
  poor: "Poor.",
  bad: "Bad.",
  na: "No data.",
};

export function formatGrams(n: number): string {
  if (n >= 10) return Math.round(n).toString();
  return (Math.round(n * 10) / 10).toString();
}

// Parse the nutrition info string out of a Woolies AdditionalAttributes blob.
// Same shape used by the extension's inject.js.
export function extractNutrition(addl: Record<string, unknown> | null | undefined): Nutrition | null {
  if (!addl || typeof addl !== "object") return null;
  const raw = (addl as Record<string, unknown>).nutritionalinformation;
  if (!raw || typeof raw !== "string") return null;
  let parsed: { Attributes?: Array<{ Name?: string; Value?: string }> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const attrs = parsed?.Attributes;
  if (!Array.isArray(attrs)) return null;

  let proteinPer100g: number | null = null;
  let proteinPerServing: number | null = null;
  let energyKjPer100g: number | null = null;
  let energyKjPerServing: number | null = null;
  let servingSize: string | null = null;

  for (const a of attrs) {
    if (!a || typeof a.Name !== "string") continue;
    const name = a.Name.toLowerCase();
    const isTotal = name.includes("- total -") || name.includes("- total ");
    if (!isTotal && !name.startsWith("serving size")) continue;

    if (name.includes("protein quantity per 100g")) {
      const n = parseNumber(a.Value);
      if (n != null) proteinPer100g = n;
    } else if (name.includes("protein quantity per serve")) {
      const n = parseNumber(a.Value);
      if (n != null) proteinPerServing = n;
    } else if (name.includes("energy kj quantity per 100g")) {
      const n = parseNumber(a.Value);
      if (n != null) energyKjPer100g = n;
    } else if (name.includes("energy kj quantity per serve")) {
      const n = parseNumber(a.Value);
      if (n != null) energyKjPerServing = n;
    } else if (name.startsWith("serving size") && servingSize == null) {
      servingSize = String(a.Value).trim();
    }
  }

  const any =
    proteinPer100g != null || proteinPerServing != null ||
    energyKjPer100g != null || energyKjPerServing != null;
  if (!any) return null;
  return { proteinPer100g, proteinPerServing, energyKjPer100g, energyKjPerServing, servingSize };
}

function parseNumber(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const str = String(s).trim().toLowerCase();
  if (!str || str === "—" || str === "-" || str === "n/a") return null;
  if (str.includes("trace")) return 0;
  const cleaned = str.replace(/^[<~]/, "").replace(",", ".");
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}
