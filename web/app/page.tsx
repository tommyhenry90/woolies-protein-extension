"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { wooliesSearch, type Product } from "@/lib/woolies";
import { colesSearch, colesNutrition } from "@/lib/coles";
import { ProductCard } from "@/components/ProductCard";
import { SearchBox } from "@/components/SearchBox";
import { computeProteinPer100kcal, KJ_PER_KCAL } from "@/lib/rating";
import { pricePer100gProtein, pricePerKg } from "@/lib/pricing";

type Store = "woolies" | "coles";

type SortKey =
  | "relevance"
  | "protein-density"
  | "lowest-kcal"
  | "cheapest-per-100g-protein"
  | "cheapest-per-kg";

const SORT_LABELS: Record<SortKey, string> = {
  "relevance": "Relevance",
  "protein-density": "Most protein per kcal",
  "lowest-kcal": "Lowest calories",
  "cheapest-per-100g-protein": "Cheapest protein",
  "cheapest-per-kg": "Cheapest per kg",
};

const MAX_PAGES = 6;
const CONCURRENCY = 3;
const COLES_NUTRITION_CONCURRENCY = 6;

function sortProducts(products: Product[], key: SortKey): Product[] {
  if (key === "relevance") return products;
  const tagged = products.map((p, i) => ({ p, i, v: scoreFor(p, key) }));
  tagged.sort((a, b) => {
    if (a.v == null && b.v == null) return a.i - b.i;
    if (a.v == null) return 1;
    if (b.v == null) return -1;
    return key === "protein-density" ? b.v - a.v : a.v - b.v;
  });
  return tagged.map((t) => t.p);
}

function scoreFor(p: Product, key: SortKey): number | null {
  switch (key) {
    case "protein-density": {
      const d = p.nutrition ? computeProteinPer100kcal(p.nutrition) : null;
      return d && Number.isFinite(d.value) ? d.value : null;
    }
    case "lowest-kcal": {
      const kj = p.nutrition?.energyKjPer100g;
      return kj != null && kj > 0 ? kj / KJ_PER_KCAL : null;
    }
    case "cheapest-per-100g-protein":
      return pricePer100gProtein(p);
    case "cheapest-per-kg":
      return pricePerKg(p);
    default:
      return null;
  }
}

const THEME = {
  woolies: {
    accentText: "text-green-700",
    btnBg: "bg-green-600",
    btnHover: "hover:bg-green-700",
    chipActive: "bg-gray-900 text-white border-gray-900",
    storeLabel: "Woolworths",
  },
  coles: {
    accentText: "text-red-700",
    btnBg: "bg-red-600",
    btnHover: "hover:bg-red-700",
    chipActive: "bg-gray-900 text-white border-gray-900",
    storeLabel: "Coles",
  },
} as const;

export default function Home() {
  const [store, setStore] = useState<Store>("woolies");
  const [submittedTerm, setSubmittedTerm] = useState("");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("protein-density");
  const searchIdRef = useRef(0);

  const theme = THEME[store];
  const sortedProducts = useMemo(
    () => (products ? sortProducts(products, sort) : null),
    [products, sort],
  );

  function switchStore(next: Store) {
    if (next === store) return;
    setStore(next);
    // Clear results when switching stores so the user doesn't see stale items.
    setProducts(null);
    setSubmittedTerm("");
    setError(null);
    setLoadingMore(false);
    searchIdRef.current++;
  }

  async function search(term: string) {
    const myId = ++searchIdRef.current;
    const myStore = store;
    setSubmittedTerm(term);
    setProducts(null);
    setTotalCount(0);
    setError(null);
    setLoadingMore(false);
    setLoading(true);

    const doSearch = myStore === "woolies" ? wooliesSearch : colesSearch;
    const first = await doSearch(term, 1);
    if (searchIdRef.current !== myId) return;

    if (!first.ok) {
      setLoading(false);
      setError(first.error || (first.blocked ? `Blocked by ${theme.storeLabel}.` : "Search failed."));
      setProducts([]);
      return;
    }
    setProducts(first.products);
    setTotalCount(first.totalCount ?? first.products.length);
    setLoading(false);

    // Coles search has no nutrition — kick off lazy per-product detail fetches.
    if (myStore === "coles") {
      hydrateColesNutrition(first.products, myId);
    }

    // Background-load further search pages.
    const pageSize = first.pageSize ?? (myStore === "coles" ? 48 : 36);
    const total = first.totalCount ?? 0;
    const allPages = Math.ceil(total / pageSize);
    const wantedPages = Math.min(allPages, MAX_PAGES);
    if (wantedPages <= 1) return;

    setLoadingMore(true);
    const remaining = Array.from({ length: wantedPages - 1 }, (_, i) => i + 2);
    for (let i = 0; i < remaining.length; i += CONCURRENCY) {
      const batch = remaining.slice(i, i + CONCURRENCY);
      const replies = await Promise.all(batch.map((p) => doSearch(term, p)));
      if (searchIdRef.current !== myId) return;
      const newOnes = replies.flatMap((r) => (r.ok ? r.products : []));
      if (newOnes.length) {
        setProducts((prev) => mergeUnique(prev || [], newOnes));
        if (myStore === "coles") hydrateColesNutrition(newOnes, myId);
      }
    }
    if (searchIdRef.current === myId) setLoadingMore(false);
  }

  async function hydrateColesNutrition(items: Product[], myId: number) {
    // Fetch nutrition for each item, in batches of COLES_NUTRITION_CONCURRENCY.
    const withSlugs = items.filter((p) => p.slug);
    for (let i = 0; i < withSlugs.length; i += COLES_NUTRITION_CONCURRENCY) {
      const batch = withSlugs.slice(i, i + COLES_NUTRITION_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (p) => ({ stockcode: p.stockcode, nutrition: await colesNutrition(p.slug!) })),
      );
      if (searchIdRef.current !== myId) return;
      setProducts((prev) => {
        if (!prev) return prev;
        const map = new Map(results.map((r) => [String(r.stockcode), r.nutrition]));
        return prev.map((p) => (map.has(String(p.stockcode)) ? { ...p, nutrition: map.get(String(p.stockcode)) ?? null } : p));
      });
    }
  }

  const loadedCount = sortedProducts?.length ?? 0;
  const cap = Math.min(totalCount, MAX_PAGES * (store === "coles" ? 48 : 36));
  const remainingToLoad = Math.max(0, cap - loadedCount);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <Image
          src="/logo-mark.png"
          alt="Gains Grocer logo"
          width={48}
          height={48}
          priority
          className="flex-shrink-0"
        />
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight flex items-baseline gap-1.5">
            <span>Gains</span>
            <span className={theme.accentText}>Grocer</span>
          </h1>
          <p className="hidden sm:block text-sm text-gray-500">
            Find the highest-protein groceries at {theme.storeLabel}.
          </p>
        </div>
      </header>

      <div className="mb-3 inline-flex p-1 bg-gray-100 rounded-lg text-sm font-medium">
        {(["woolies", "coles"] as Store[]).map((s) => {
          const t = THEME[s];
          const active = s === store;
          return (
            <button
              key={s}
              onClick={() => switchStore(s)}
              className={
                "px-4 py-1.5 rounded-md transition-colors " +
                (active
                  ? `bg-white shadow-sm ${t.accentText}`
                  : "text-gray-600 hover:text-gray-900")
              }
            >
              {t.storeLabel}
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        <SearchBox
          key={store}
          pending={loading}
          onSubmit={(t) => search(t)}
          accentClass={`${theme.btnBg} ${theme.btnHover}`}
          suggestStore={store}
        />
      </div>

      {sortedProducts && sortedProducts.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Sort</span>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors " +
                (sort === k
                  ? theme.chipActive
                  : "bg-white text-gray-700 border-gray-300 hover:border-gray-400")
              }
            >
              {SORT_LABELS[k]}
            </button>
          ))}
          {totalCount > 0 && (
            <span className="ml-auto text-xs text-gray-500 flex items-center gap-1.5">
              {loadingMore && (
                <span className={`inline-block h-2 w-2 rounded-full animate-pulse ${store === "coles" ? "bg-red-600" : "bg-green-600"}`} />
              )}
              {loadingMore
                ? `Loading ${remainingToLoad} more…`
                : `${loadedCount} of ${totalCount > cap ? `${cap}+` : totalCount}`}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm">
          {error}
        </div>
      )}

      {sortedProducts && sortedProducts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {sortedProducts.map((p) => (
            <ProductCard key={String(p.stockcode)} product={p} accentClass={`${theme.btnBg} ${theme.btnHover}`} viewLabel={`View on ${theme.storeLabel} →`} />
          ))}
        </div>
      )}

      {sortedProducts && sortedProducts.length === 0 && !error && (
        <div className="text-center text-gray-500 py-12">
          No products found for &ldquo;{submittedTerm}&rdquo;.
        </div>
      )}

      {!sortedProducts && !loading && !error && (
        <div className="text-center text-gray-400 py-16 text-sm">
          Try <em>chicken breast</em>, <em>greek yoghurt</em>, <em>tuna</em>, <em>protein bar</em>…
        </div>
      )}
    </main>
  );
}

function mergeUnique(existing: Product[], incoming: Product[]): Product[] {
  const seen = new Set(existing.map((p) => String(p.stockcode)));
  const merged = [...existing];
  for (const p of incoming) {
    const k = String(p.stockcode);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(p);
  }
  return merged;
}
