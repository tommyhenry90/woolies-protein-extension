// Harvests an anonymous Woolworths session by GETing the homepage and
// keeping the Akamai bot-detection cookies it sets (bm_sz, _abck, bm_sv).
// That set is enough for the search API to respond — no login required.
//
// Cached in module scope so we only fetch the homepage once every TTL
// per edge instance. Stale-while-revalidate on the cache to keep latency
// low if Woolies rotates a cookie.

const HOMEPAGE = "https://www.woolworths.com.au/";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

let cache: { value: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

function pairsFromHeaders(h: Headers): string[] {
  // Headers.getSetCookie() returns string[] (modern runtimes). Fall back
  // to the singular getter and a naive split in case it isn't available.
  type HeadersWithGet = Headers & { getSetCookie?: () => string[] };
  const headers = h as HeadersWithGet;
  const lines = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : (h.get("set-cookie") || "").split(/,(?=[^;]+?=)/);
  return lines
    .map((s) => s.trim().split(";")[0].trim())
    .filter(Boolean);
}

export async function getAnonymousWooliesCookies(): Promise<string> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      // 1) Homepage — sets bm_sz, AKA_A2, akaalb_*, region cookies.
      const r1 = await fetch(HOMEPAGE, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-AU,en;q=0.9",
        },
        redirect: "follow",
      });
      const jar = new Map<string, string>();
      for (const pair of pairsFromHeaders(r1.headers)) {
        const eq = pair.indexOf("=");
        if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
      }

      // 2) A second hit with those cookies — Akamai usually returns the
      // _abck challenge token here that the API requires. Use the search
      // HTML page since the API itself responds with 403 on the first try.
      const cookieStr1 = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
      const r2 = await fetch("https://www.woolworths.com.au/shop/search/products?searchTerm=fruit", {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-AU,en;q=0.9",
          Referer: HOMEPAGE,
          Cookie: cookieStr1,
        },
        redirect: "follow",
      });
      for (const pair of pairsFromHeaders(r2.headers)) {
        const eq = pair.indexOf("=");
        if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
      }

      const value = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
      if (value) cache = { value, expiresAt: Date.now() + TTL_MS };
      return value;
    } catch {
      return "";
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateAnonymousCookies(): void {
  cache = null;
}
