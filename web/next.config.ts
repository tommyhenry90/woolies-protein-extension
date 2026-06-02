import type { NextConfig } from "next";

// Initialize OpenNext's Cloudflare dev bindings so `next dev` can read
// env vars / secrets / KV bindings the same way the deployed worker does.
// Safe no-op outside dev.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // Required by @opennextjs/cloudflare — it bundles the standalone server
  // output into a single worker entrypoint.
  output: "standalone",
  // Pin the file-tracing root to web/ so Next doesn't try to walk up to the
  // monorepo root (which would nest the standalone output and break OpenNext).
  outputFileTracingRoot: __dirname,
  // Workerd doesn't ship sharp; disable Next's image optimizer (we use
  // <Image unoptimized /> on Woolies CDN URLs anyway).
  images: { unoptimized: true },
};

export default nextConfig;
