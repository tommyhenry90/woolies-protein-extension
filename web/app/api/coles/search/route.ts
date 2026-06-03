// POST /api/coles/search  { term, page? }  →  { ok, products, totalCount, page, pageSize, hasMore }
//
// Search response carries no nutrition; the client follows up with
// /api/coles/product/:slug for each product to fill in protein/energy.

import { NextResponse } from "next/server";
import { getColesBuildId, invalidateColesBuildId } from "@/lib/coles-build-id";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

type SearchBody = { term?: string; page?: number };

type ColesImage = { uri?: string };
type ColesPricing = { now?: number; comparable?: string };
type ColesSearchProduct = {
  _type?: string;
  id?: number | string;
  name?: string;
  brand?: string;
  size?: string;
  imageUris?: ColesImage[];
  pricing?: ColesPricing;
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function colesSlug(p: ColesSearchProduct): string {
  // Coles URL pattern: <brand>-<name>-<size>-<id>
  const parts = [p.brand, p.name, p.size].filter(Boolean).map((s) => slugify(String(s)));
  parts.push(String(p.id));
  return parts.filter(Boolean).join("-").replace(/-+/g, "-");
}

function colesProductUrl(p: ColesSearchProduct): string {
  return `https://www.coles.com.au/product/${colesSlug(p)}`;
}

function colesImageUrl(p: ColesSearchProduct): string | null {
  const uri = p.imageUris?.[0]?.uri;
  if (!uri) return null;
  if (uri.startsWith("http")) return uri;
  return `https://productimages.coles.com.au${uri}`;
}

async function fetchSearch(buildId: string, term: string, page: number): Promise<Response> {
  // Coles' Next.js page reads `q` from the query string. We pass `page` too;
  // the server-side handler maps it to `start` internally.
  const url = `https://www.coles.com.au/_next/data/${buildId}/en/search/products.json?q=${encodeURIComponent(term)}&page=${page}`;
  return fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: `https://www.coles.com.au/search/products?q=${encodeURIComponent(term)}`,
    },
  });
}

export async function POST(req: Request) {
  let body: SearchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const term = (body.term || "").trim();
  const page = Math.max(1, Math.floor(body.page ?? 1));
  if (!term) return NextResponse.json({ ok: false, error: "Missing term" }, { status: 400 });

  let buildId = await getColesBuildId();
  if (!buildId) {
    return NextResponse.json({ ok: false, error: "Couldn't fetch Coles build id" }, { status: 502 });
  }

  let res = await fetchSearch(buildId, term, page);
  // Stale build ID? 404 means our path no longer matches.
  if (res.status === 404) {
    invalidateColesBuildId();
    buildId = await getColesBuildId();
    if (buildId) res = await fetchSearch(buildId, term, page);
  }
  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      status: res.status,
      error: `HTTP ${res.status}`,
      products: [],
    }, { status: res.status });
  }

  const data = await res.json() as {
    pageProps?: {
      searchResults?: {
        noOfResults?: number;
        start?: number;
        pageSize?: number;
        results?: ColesSearchProduct[];
      };
    };
  };

  const sr = data.pageProps?.searchResults;
  const rawProducts = sr?.results ?? [];
  const pageSize = sr?.pageSize ?? 48;
  const start = sr?.start ?? 0;
  const totalCount = sr?.noOfResults ?? rawProducts.length;

  const products = rawProducts
    .filter((p) => p._type === "PRODUCT" && p.id != null)
    .map((p) => ({
      stockcode: String(p.id),
      name: p.name ?? "",
      displayName: [p.brand, p.name, p.size].filter(Boolean).join(" "),
      packageSize: p.size ?? null,
      price: p.pricing?.now ?? null,
      cupString: p.pricing?.comparable ?? null,
      imageUrl: colesImageUrl(p),
      productUrl: colesProductUrl(p),
      // Store the slug so /api/coles/product can fetch nutrition without
      // having to guess it from id alone.
      slug: colesSlug(p),
      nutrition: null,
    }));

  return NextResponse.json({
    ok: true,
    products,
    page,
    pageSize,
    totalCount,
    hasMore: start + products.length < totalCount,
  });
}
