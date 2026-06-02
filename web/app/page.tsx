"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { hasWooliesCookie, wooliesSearch, type WooliesProduct } from "@/lib/woolies";
import { ProductCard } from "@/components/ProductCard";

export default function Home() {
  const [term, setTerm] = useState("");
  const [products, setProducts] = useState<WooliesProduct[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hasSharedSession, setHasSharedSession] = useState<boolean | null>(null);

  useEffect(() => {
    setConnected(hasWooliesCookie());
    fetch("/api/woolies/status")
      .then(r => r.json())
      .then(j => setHasSharedSession(!!j.hasSharedSession))
      .catch(() => setHasSharedSession(false));
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    startTransition(async () => {
      setError(null);
      setNeedsAuth(false);
      const reply = await wooliesSearch(term);
      if (reply.ok) {
        setProducts(reply.products);
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
      <header className="mb-8 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-baseline gap-2">
            <span>Woolies Protein</span>
            <span className="text-green-700">Tags</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Search Woolworths with a protein-density rating on every result.
          </p>
        </div>
        <Link href="/settings" className="text-sm text-gray-600 hover:text-gray-900 underline">
          Settings
        </Link>
      </header>

      <form onSubmit={onSubmit} className="flex gap-2 mb-6">
        <input
          type="search"
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search for chicken breast, greek yoghurt, oats…"
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-green-600"
        />
        <button
          type="submit"
          disabled={pending || !term.trim()}
          className="px-6 py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </form>

      {!connected && hasSharedSession === false && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          You haven&apos;t connected a Woolies session yet. Search needs cookies from your woolworths.com.au login.{" "}
          <Link href="/settings" className="underline font-medium">Connect now</Link>.
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

      {products && products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map((p) => (
            <ProductCard key={String(p.stockcode)} product={p} />
          ))}
        </div>
      )}

      {products && products.length === 0 && !error && !needsAuth && (
        <div className="text-center text-gray-500 py-12">
          No products found for &ldquo;{term}&rdquo;.
        </div>
      )}

      {!products && !pending && !needsAuth && !error && (
        <div className="text-center text-gray-400 py-16 text-sm">
          Type a query above to search Woolworths.
        </div>
      )}
    </main>
  );
}
