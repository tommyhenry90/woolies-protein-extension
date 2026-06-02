"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { hasWooliesCookie, wooliesSearch, type WooliesProduct } from "@/lib/woolies";
import { ProductCard } from "@/components/ProductCard";
import { SearchBox } from "@/components/SearchBox";
import { computeProteinPer100kcal } from "@/lib/rating";
import { pricePer100gProtein, pricePerKg } from "@/lib/pricing";

type SortKey =
  | "relevance"
  | "protein-density"
  | "cheapest-per-100g-protein"
  | "cheapest-per-kg";

const SORT_LABELS: Record<SortKey, string> = {
  "relevance": "Relevance",
  "protein-density": "Most protein per kcal",
  "cheapest-per-100g-protein": "Cheapest protein",
  "cheapest-per-kg": "Cheapest per kg",
};

function sortProducts(products: WooliesProduct[], key: SortKey): WooliesProduct[] {
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

function scoreFor(p: WooliesProduct, key: SortKey): number | null {
  switch (key) {
    case "protein-density": {
      const d = p.nutrition ? computeProteinPer100kcal(p.nutrition) : null;
      return d && Number.isFinite(d.value) ? d.value : null;
    }
    case "cheapest-per-100g-protein":
      return pricePer100gProtein(p);
    case "cheapest-per-kg":
      return pricePerKg(p);
    default:
      return null;
  }
}

export default function Home() {
  const [submittedTerm, setSubmittedTerm] = useState("");
  const [products, setProducts] = useState<WooliesProduct[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hasSharedSession, setHasSharedSession] = useState<boolean | null>(null);
  const [sort, setSort] = useState<SortKey>("protein-density");

  useEffect(() => {
    setConnected(hasWooliesCookie());
    fetch("/api/woolies/status")
      .then((r) => r.json())
      .then((j) => setHasSharedSession(!!j.hasSharedSession))
      .catch(() => setHasSharedSession(false));
  }, []);

  const sortedProducts = useMemo(
    () => (products ? sortProducts(products, sort) : null),
    [products, sort],
  );

  function search(term: string, pageNumber = 1) {
    startTransition(async () => {
      setError(null);
      setNeedsAuth(false);
      if (pageNumber === 1) {
        setSubmittedTerm(term);
        setProducts(null);
      }
      const reply = await wooliesSearch(term, pageNumber);
      if (reply.ok) {
        setProducts((prev) =>
          pageNumber === 1 ? reply.products : [...(prev || []), ...reply.products],
        );
        setPage(reply.page ?? pageNumber);
        setHasMore(!!reply.hasMore);
        setTotalCount(reply.totalCount ?? reply.products.length);
      } else if (reply.needsAuth) {
        setNeedsAuth(true);
      } else {
        setError(reply.error || (reply.blocked ? "Blocked by Woolworths." : "Search failed."));
        setProducts([]);
      }
    });
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-mark.png"
            alt="Gains Grocer logo"
            width={56}
            height={56}
            priority
            className="flex-shrink-0"
          />
          <div>
            <h1 className="text-3xl font-bold leading-tight flex items-baseline gap-2">
              <span>Gains</span>
              <span className="text-green-700">Grocer</span>
            </h1>
            <p className="text-sm text-gray-500">
              The cheapest protein at Woolworths, ranked by what it costs.
            </p>
          </div>
        </div>
        <Link href="/settings" className="text-sm text-gray-600 hover:text-gray-900 underline">
          Settings
        </Link>
      </header>

      <div className="mb-4">
        <SearchBox pending={pending} onSubmit={(t) => search(t, 1)} />
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
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300 hover:border-gray-400")
              }
            >
              {SORT_LABELS[k]}
            </button>
          ))}
          {totalCount > 0 && (
            <span className="ml-auto text-xs text-gray-500">
              Showing {sortedProducts.length} of {totalCount}
            </span>
          )}
        </div>
      )}

      {!connected && hasSharedSession === false && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          Couldn&apos;t reach Woolworths anonymously — your search may need a
          personal session.{" "}
          <Link href="/settings" className="underline font-medium">Connect one</Link>.
        </div>
      )}

      {needsAuth && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm">
          Your Woolies session expired or is missing.{" "}
          <Link href="/settings" className="underline font-medium">Reconnect</Link>.
        </div>
      )}

      {error && !needsAuth && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-900 text-sm">
          {error}
        </div>
      )}

      {sortedProducts && sortedProducts.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {sortedProducts.map((p) => (
              <ProductCard key={String(p.stockcode)} product={p} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={() => search(submittedTerm, page + 1)}
                disabled={pending}
                className="px-5 py-2.5 rounded-lg bg-white border border-gray-300 text-sm font-medium hover:border-gray-400 disabled:opacity-50"
              >
                {pending ? "Loading…" : `Load more (${Math.max(0, totalCount - sortedProducts.length)} remaining)`}
              </button>
            </div>
          )}
        </>
      )}

      {sortedProducts && sortedProducts.length === 0 && !error && !needsAuth && (
        <div className="text-center text-gray-500 py-12">
          No products found for &ldquo;{submittedTerm}&rdquo;.
        </div>
      )}

      {!sortedProducts && !pending && !needsAuth && !error && (
        <div className="text-center text-gray-400 py-16 text-sm">
          Try <em>chicken breast</em>, <em>greek yoghurt</em>, <em>tuna</em>, <em>protein bar</em>…
        </div>
      )}
    </main>
  );
}
