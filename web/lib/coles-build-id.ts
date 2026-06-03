// Coles' Next.js data endpoints embed a build ID that rotates on every
// deploy (e.g. "20260522.4-47bcebee9535c37e3618e5372e43e2b1c6a2207a").
// We scrape it from the homepage's __NEXT_DATA__ script tag once per
// edge-instance and cache for an hour; on a 404 from a data endpoint
// we invalidate and re-fetch.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";
const TTL_MS = 60 * 60 * 1000;

let cache: { id: string; expiresAt: number } | null = null;
let inflight: Promise<string | null> | null = null;

export async function getColesBuildId(): Promise<string | null> {
  if (cache && cache.expiresAt > Date.now()) return cache.id;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("https://www.coles.com.au/", {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-AU,en;q=0.9",
        },
      });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/"buildId":"([^"]+)"/);
      if (!m) return null;
      cache = { id: m[1], expiresAt: Date.now() + TTL_MS };
      return m[1];
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateColesBuildId(): void {
  cache = null;
}
