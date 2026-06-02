// Client-side helpers for the Woolies session cookie and the search proxy.

import type { Nutrition } from "./rating";

const COOKIE_KEY = "wooliesCookie";

export function getWooliesCookie(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(COOKIE_KEY) || ""; }
  catch { return ""; }
}

export function setWooliesCookie(value: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(COOKIE_KEY, value); } catch { /* private mode */ }
}

export function clearWooliesCookie(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(COOKIE_KEY); } catch { /* */ }
}

export function hasWooliesCookie(): boolean {
  return getWooliesCookie().length > 0;
}

export type WooliesProduct = {
  stockcode: number | string;
  name: string;
  displayName: string;
  packageSize: string | null;
  price: number | null;
  cupString: string | null;
  imageUrl: string | null;
  productUrl: string;
  nutrition: Nutrition | null;
};

export type SearchReply = {
  ok: boolean;
  products: WooliesProduct[];
  needsAuth?: boolean;
  blocked?: boolean;
  error?: string;
};

export async function wooliesSearch(term: string): Promise<SearchReply> {
  if (!term.trim()) return { ok: true, products: [] };
  let res: Response;
  try {
    res = await fetch("/api/woolies/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term, cookie: getWooliesCookie() }),
    });
  } catch (e) {
    return { ok: false, products: [], error: e instanceof Error ? e.message : "network" };
  }
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) return { ok: false, products: [], needsAuth: !!j.needsAuth };
  if (j.ok && Array.isArray(j.products)) return { ok: true, products: j.products };
  return { ok: false, products: [], blocked: !!j.blocked, error: j.error };
}
