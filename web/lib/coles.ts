// Client-side helpers for the Coles proxy.

import type { Nutrition } from "./rating";
import type { Product, SearchReply } from "./woolies";

export async function colesSearch(term: string, page = 1): Promise<SearchReply> {
  if (!term.trim()) return { ok: true, products: [] };
  let res: Response;
  try {
    res = await fetch("/api/coles/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term, page }),
    });
  } catch (e) {
    return { ok: false, products: [], error: e instanceof Error ? e.message : "network" };
  }
  const j = await res.json().catch(() => ({}));
  if (j.ok && Array.isArray(j.products)) {
    return {
      ok: true,
      products: j.products as Product[],
      page: j.page,
      pageSize: j.pageSize,
      totalCount: j.totalCount,
      hasMore: !!j.hasMore,
    };
  }
  return { ok: false, products: [], blocked: !!j.blocked, error: j.error };
}

export async function colesNutrition(slug: string, signal?: AbortSignal): Promise<Nutrition | null> {
  try {
    const res = await fetch(`/api/coles/product/${encodeURIComponent(slug)}`, { signal });
    if (!res.ok) return null;
    const j = await res.json();
    return j.ok ? (j.nutrition ?? null) : null;
  } catch {
    return null;
  }
}
