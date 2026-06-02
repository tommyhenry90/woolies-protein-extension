// GET /api/woolies/suggest?q=chicken  →  { suggestions: string[] }
//
// Thin proxy over Woolies' autocomplete endpoint. Works cookieless, so the
// dropdown shows up the moment the page loads — no session needed.

import { NextResponse } from "next/server";


const SUGGEST_URL = "https://www.woolworths.com.au/apis/ui/search-suggestions/suggestionsb2c";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ suggestions: [] });

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(
      `${SUGGEST_URL}?searchTerm=${encodeURIComponent(q)}`,
      {
        signal: ctrl.signal,
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.woolworths.com.au/shop/search/products",
          "User-Agent": req.headers.get("user-agent")
            || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        },
      },
    );
    clearTimeout(timeoutId);
    if (!res.ok) {
      return NextResponse.json({ suggestions: [], error: `HTTP ${res.status}` }, { status: 502 });
    }
    const data = (await res.json()) as { suggestions?: string[] };
    return NextResponse.json({ suggestions: data.suggestions ?? [] });
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ suggestions: [], error: msg }, { status: 502 });
  }
}
