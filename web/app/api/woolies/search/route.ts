// POST /api/woolies/search  { term, cookie }  →  { ok, products }
//
// Proxies the search request to woolworths.com.au using a user-supplied
// session cookie. Each returned product includes the parsed nutrition
// info pulled out of AdditionalAttributes.nutritionalinformation.

import { NextResponse } from "next/server";
import { extractNutrition, type Nutrition } from "@/lib/rating";
import { getAnonymousWooliesCookies, invalidateAnonymousCookies } from "@/lib/anon-cookies";


const WOOLIES_SEARCH = "https://www.woolworths.com.au/apis/ui/Search/products";

type SearchBody = { term?: string; cookie?: string; page?: number; pageSize?: number };

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
  if (!term) return NextResponse.json({ ok: false, error: "Missing term" }, { status: 400 });

  // Cookie sources, tried in order until one isn't blocked:
  //   1. User-supplied (bookmarklet) — their personalised session
  //   2. WOOLIES_COOKIE env var       — preconfigured shared session (optional)
  //   3. Anonymous Akamai cookies harvested from a homepage GET — works for everyone
  // The env cookie goes stale after a few days, so a block on 1 or 2 must
  // fall through to 3 rather than failing every search.
  type CookieSource = "user" | "env" | "anon";
  const sources: CookieSource[] = [];
  if (body.cookie && body.cookie.length > 0) sources.push("user");
  if (process.env.WOOLIES_COOKIE && process.env.WOOLIES_COOKIE.length > 0) sources.push("env");
  sources.push("anon");

  const pageNumber = Math.max(1, Math.floor(body.page ?? 1));
  // Woolies caps PageSize at 36 and returns HTTP 400 otherwise.
  const pageSize = Math.min(36, Math.max(1, Math.floor(body.pageSize ?? 36)));
  const payload = {
    Filters: [],
    IsSpecial: false,
    Location: `/shop/search/products?searchTerm=${encodeURIComponent(term)}`,
    PageNumber: pageNumber,
    PageSize: pageSize,
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

  async function callWoolies(cookieValue: string): Promise<Response> {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 12000);
    try {
      return await fetch(WOOLIES_SEARCH, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          Origin: "https://www.woolworths.com.au",
          Referer: "https://www.woolworths.com.au/shop/search/products?searchTerm=" + encodeURIComponent(term),
          "Accept-Language": "en-AU,en;q=0.9",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "User-Agent": ua,
          Cookie: cookieValue,
        },
        body: JSON.stringify(payload),
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  try {
    let res: Response | null = null;
    let cookieSource: CookieSource = "anon";
    const tried: string[] = [];
    for (const source of sources) {
      const cookie = source === "user" ? body.cookie!
        : source === "env" ? process.env.WOOLIES_COOKIE!
        : await getAnonymousWooliesCookies();
      if (!cookie) { tried.push(`${source}:none`); continue; }
      cookieSource = source;
      res = await callWoolies(cookie);
      tried.push(`${source}:${res.status}`);

      // Stale anon cookies are the most common cause of a 403 — re-harvest
      // the homepage once and retry.
      if (!res.ok && source === "anon" && (res.status === 403 || res.status === 401)) {
        invalidateAnonymousCookies();
        const fresh = await getAnonymousWooliesCookies();
        if (fresh) {
          res = await callWoolies(fresh);
          tried.push(`anon-fresh:${res.status}`);
        }
      }
      if (res.ok || (res.status !== 403 && res.status !== 401)) break;
    }
    if (!res) {
      return NextResponse.json({ ok: false, error: "Couldn't establish a Woolies session", tried, products: [] }, { status: 502 });
    }

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
        tried,
        products: [],
      }, { status: res.status });
    }
    if (!contentType.includes("application/json")) {
      return NextResponse.json({ ok: false, error: "Non-JSON response", products: [] }, { status: 502 });
    }

    const data = await res.json() as { Products?: WooliesApiProduct[]; SearchResultsCount?: number };
    const totalCount = data.SearchResultsCount ?? 0;
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

    return NextResponse.json({
      ok: true,
      products,
      page: pageNumber,
      pageSize,
      totalCount,
      hasMore: pageNumber * pageSize < totalCount,
      cookieSource,
    });
  } catch (e) {
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
