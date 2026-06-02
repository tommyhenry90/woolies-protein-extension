"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setWooliesCookie } from "@/lib/woolies";

// Receives a Woolies session cookie in the URL hash (#cookie=…), saves it
// to localStorage, and redirects to the home page. Using the hash (not a
// query param) keeps the cookie out of server logs.

export default function ConnectPage() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saved" | "missing">("idle");

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!hash.startsWith("#")) { setState("missing"); return; }
    const params = new URLSearchParams(hash.slice(1));
    const raw = params.get("cookie");
    if (!raw) { setState("missing"); return; }
    setWooliesCookie(decodeURIComponent(raw).trim());
    history.replaceState(null, "", window.location.pathname);
    setState("saved");
    const t = setTimeout(() => router.replace("/?connected=1"), 600);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-6 text-center">
      <div className="space-y-3">
        {state === "idle" && <p className="text-sm text-gray-500">Connecting…</p>}
        {state === "saved" && (
          <>
            <div className="text-3xl font-semibold text-green-700">✓ Connected</div>
            <p className="text-sm text-gray-500">Redirecting…</p>
          </>
        )}
        {state === "missing" && (
          <>
            <div className="text-3xl font-semibold text-red-600">No cookie in URL</div>
            <p className="text-xs text-gray-500 max-w-sm">
              This page expects a <code className="bg-gray-100 px-1 rounded">#cookie=…</code> hash.
              Open it via the bookmarklet on woolworths.com.au or paste your cookie on the
              <a href="/settings" className="underline ml-1">settings page</a>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
