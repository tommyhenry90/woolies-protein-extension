// GET /api/coles/product/:slug  →  { ok, nutrition }
//
// Fetches the per-product detail page from Coles' Next data endpoint
// and returns just the parsed nutrition. Used by the client to lazily
// fill in protein/energy badges after the search renders.

import { NextResponse } from "next/server";
import { getColesBuildId, invalidateColesBuildId } from "@/lib/coles-build-id";
import { extractColesNutrition } from "@/lib/coles-nutrition";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

async function fetchProduct(buildId: string, slug: string): Promise<Response> {
  const url = `https://www.coles.com.au/_next/data/${buildId}/en/product/${slug}.json?slug=${encodeURIComponent(slug)}`;
  return fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: `https://www.coles.com.au/product/${slug}`,
    },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slug) return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });

  let buildId = await getColesBuildId();
  if (!buildId) {
    return NextResponse.json({ ok: false, error: "Couldn't fetch Coles build id" }, { status: 502 });
  }

  let res = await fetchProduct(buildId, slug);
  if (res.status === 404) {
    invalidateColesBuildId();
    buildId = await getColesBuildId();
    if (buildId) res = await fetchProduct(buildId, slug);
  }
  if (!res.ok) {
    return NextResponse.json({ ok: false, status: res.status, error: `HTTP ${res.status}` }, { status: res.status });
  }

  const data = await res.json() as {
    pageProps?: { product?: { nutrition?: unknown } };
  };
  const nutrition = extractColesNutrition(data.pageProps?.product?.nutrition as Parameters<typeof extractColesNutrition>[0]);
  return NextResponse.json({ ok: true, nutrition });
}
