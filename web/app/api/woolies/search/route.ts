// POST /api/woolies/search  { term, cookie }  →  { ok, products }
//
// Proxies the search request to woolworths.com.au using a user-supplied
// session cookie. Each returned product includes the parsed nutrition
// info pulled out of AdditionalAttributes.nutritionalinformation.

import { NextResponse } from "next/server";
import { extractNutrition, type Nutrition } from "@/lib/rating";

export const runtime = "edge";
export const preferredRegion = "syd1";

const WOOLIES_SEARCH = "https://www.woolworths.com.au/apis/ui/Search/products";

type SearchBody = { term?: string; cookie?: string };

type WooliesApiProduct = {
  Stockcode?: number | string;
  stockcode?: number | string;
  ProductId?: number | string;
  Name?: string;
  DisplayName?: string;
  UrlFriendlyName?: string;
  PackageSize?: string;
  Price?: number;
  InstorePrice?: number;
  CupString?: string;
  SmallImageFile?: string;
  MediumImageFile?: string;
  LargeImageFile?: string;
  AdditionalAttributes?: Record<string, unknown> | null;
  Products?: WooliesApiProduct[];
};

function productUrl(stockcode: number | string, slug?: string): string {
  const s = slug || "product";
  return `https://www.woolworths.com.au/shop/productdetails/${stockcode}/${s}`;
}

export async function POST(req: Request) {
  let body: SearchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const term = (body.term || "").trim();
  const cookie = body.cookie || "";
  if (!term) return NextResponse.json({ ok: false, error: "Missing term" }, { status: 400 });
  if (!cookie) return NextResponse.json({ ok: false, error: "No Woolies session", needsAuth: true }, { status: 401 });

  const payload = {
    Filters: [],
    IsSpecial: false,
    Location: `/shop/search/products?searchTerm=${encodeURIComponent(term)}`,
    PageNumber: 1,
    PageSize: 24,
    SearchTerm: term,
    SortType: "TraderRelevance",
    IsHideEverydayMarketProducts: false,
    IsRegisteredRewardCardPromotion: null,
    ExcludeSearchTypes: ["UntraceableVendors"],
    GpBoost: 0,
    GroupEdmVariants: false,
    EnableAdReRanking: false,
    flags: { test: true },
  };

  const ua = req.headers.get("user-agent")
    || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 12000);

  try {
    const res = await fetch(WOOLIES_SEARCH, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: "https://www.woolworths.com.au",
        Referer: "https://www.woolworths.com.au/shop/search/products?searchTerm=" + encodeURIComponent(term),
        "User-Agent": ua,
        Cookie: cookie,
      },
      body: JSON.stringify(payload),
    });
    clearTimeout(timeoutId);

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      let snippet = "";
      try { snippet = (await res.text()).slice(0, 200); } catch { /* */ }
      const blocked = /Access Denied|Reference\s*#|edgesuite|akamai/i.test(snippet);
      return NextResponse.json({
        ok: false,
        status: res.status,
        blocked,
        error: blocked ? "Blocked by Woolworths (Akamai)" : `HTTP ${res.status}`,
        products: [],
      }, { status: res.status });
    }
    if (!contentType.includes("application/json")) {
      return NextResponse.json({ ok: false, error: "Non-JSON response", products: [] }, { status: 502 });
    }

    const data = await res.json() as { Products?: WooliesApiProduct[] };
    const groups = data.Products || [];
    const flat: WooliesApiProduct[] = groups.flatMap(g => Array.isArray(g.Products) ? g.Products : [g]);

    const products = flat.map(p => {
      const stockcode = p.Stockcode ?? p.stockcode ?? p.ProductId;
      if (!stockcode) return null;
      const nutrition: Nutrition | null = extractNutrition(p.AdditionalAttributes ?? null);
      return {
        stockcode,
        name: p.Name ?? p.DisplayName ?? "",
        displayName: p.DisplayName ?? p.Name ?? "",
        packageSize: p.PackageSize ?? null,
        price: p.Price ?? p.InstorePrice ?? null,
        cupString: p.CupString ?? null,
        imageUrl: p.MediumImageFile ?? p.LargeImageFile ?? p.SmallImageFile ?? null,
        productUrl: productUrl(stockcode, p.UrlFriendlyName),
        nutrition,
      };
    }).filter(Boolean);

    return NextResponse.json({ ok: true, products });
  } catch (e) {
    clearTimeout(timeoutId);
    const aborted = e instanceof Error && e.name === "AbortError";
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      ok: false,
      error: aborted ? "Timeout (Woolworths took too long)" : msg,
      timeout: aborted,
      products: [],
    }, { status: 502 });
  }
}
