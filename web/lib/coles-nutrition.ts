// Parse a Coles `nutrition` object into our common Nutrition shape.
// Coles structure:
//   nutrition.breakdown[] of { title, nutrients[] }
//   title is "Per Serving" or "Per 100g/ml"
//   nutrients[] of { nutrient: "Protein" | "Energy (kJ)" | …, value: "8.5 g" | "659 kJ" }
//   nutrition.servingSize: "250mL"

import type { Nutrition } from "./rating";

type ColesNutrient = { nutrient?: string; value?: string };
type ColesBreakdown = { title?: string; nutrients?: ColesNutrient[] };
type ColesNutrition = {
  servingSize?: string;
  breakdown?: ColesBreakdown[];
};

function parseValue(s: string | undefined): number | null {
  if (!s) return null;
  const m = String(s).trim().match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function pickBreakdown(n: ColesNutrition, hint: string): ColesBreakdown | null {
  if (!Array.isArray(n.breakdown)) return null;
  const h = hint.toLowerCase();
  return n.breakdown.find((b) => (b.title || "").toLowerCase().includes(h)) || null;
}

function findNutrient(b: ColesBreakdown | null, ...needles: string[]): number | null {
  if (!b || !Array.isArray(b.nutrients)) return null;
  for (const n of b.nutrients) {
    const name = (n.nutrient || "").toLowerCase();
    if (needles.every((needle) => name.includes(needle.toLowerCase()))) {
      return parseValue(n.value);
    }
  }
  return null;
}

export function extractColesNutrition(n: ColesNutrition | null | undefined): Nutrition | null {
  if (!n || typeof n !== "object") return null;

  // Coles' Per 100g block uses the title "Per 100g/ml".
  const per100 = pickBreakdown(n, "100");
  const perServe = pickBreakdown(n, "serv");

  const proteinPer100g = findNutrient(per100, "protein");
  const proteinPerServing = findNutrient(perServe, "protein");
  // "Energy (kJ)" — match on energy + kj to avoid the "Energy (Cal)" sibling.
  const energyKjPer100g = findNutrient(per100, "energy", "kj");
  const energyKjPerServing = findNutrient(perServe, "energy", "kj");

  const any =
    proteinPer100g != null || proteinPerServing != null ||
    energyKjPer100g != null || energyKjPerServing != null;
  if (!any) return null;

  return {
    proteinPer100g,
    proteinPerServing,
    energyKjPer100g,
    energyKjPerServing,
    servingSize: n.servingSize || null,
  };
}
