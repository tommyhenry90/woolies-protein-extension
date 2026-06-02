"use client";

import { useEffect, useState } from "react";
import { clearWooliesCookie, getWooliesCookie, setWooliesCookie } from "@/lib/woolies";

const BOOKMARKLET = `javascript:(()=>{const c=document.cookie;const o=location.origin.includes('localhost')?'http://localhost:3000':'__WEBAPP_URL__';location.href=o+'/connect#cookie='+encodeURIComponent(c);})();`;

export default function SettingsPage() {
  const [cookie, setCookie] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setCookie(getWooliesCookie());
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  function save() {
    setWooliesCookie(cookie.trim());
  }
  function clear() {
    clearWooliesCookie();
    setCookie("");
  }

  const bookmarklet = BOOKMARKLET.replace("__WEBAPP_URL__", origin);

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Optional — connect your own Woolworths session for personalised
          pricing and stock. Most searches work without it.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-medium">Bookmarklet</h2>
        <p className="text-sm text-gray-600">
          Drag this link to your bookmarks bar. Then visit{" "}
          <a className="underline" href="https://www.woolworths.com.au" target="_blank" rel="noreferrer">woolworths.com.au</a>,
          sign in if needed, and click the bookmarklet — it forwards your cookies to Gains Grocer.
        </p>
        <a
          href={bookmarklet}
          onClick={(e) => e.preventDefault()}
          className="inline-block px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700"
          draggable
        >
          Connect Woolies → Gains Grocer
        </a>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Or paste a cookie string manually</h2>
        <p className="text-sm text-gray-600">
          Open woolworths.com.au → DevTools → Application → Cookies → copy the cookie header value.
        </p>
        <textarea
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
          rows={6}
          className="w-full p-3 border border-gray-300 rounded-md font-mono text-xs"
          placeholder="bff_region=...; w-rctx=...; wow-auth-token=...; …"
        />
        <div className="flex gap-2">
          <button
            onClick={save}
            className="px-4 py-2 rounded-md bg-black text-white text-sm font-medium hover:bg-gray-800"
          >
            Save
          </button>
          <button
            onClick={clear}
            className="px-4 py-2 rounded-md bg-white border border-gray-300 text-sm font-medium hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      </section>
    </main>
  );
}
