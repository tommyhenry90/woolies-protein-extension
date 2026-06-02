import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// We don't use ISR / on-demand revalidation / route caching, so the defaults
// (in-memory) are fine. Add overrides here later when we wire up KV / D1.
//
// `buildCommand: "true"` makes OpenNext skip running its own Next build —
// pnpm 11's build-gate refuses to run when esbuild/workerd post-install
// scripts are present, so we run `next build` ourselves in our package
// scripts before invoking the OpenNext bundler.
export default defineCloudflareConfig({});
