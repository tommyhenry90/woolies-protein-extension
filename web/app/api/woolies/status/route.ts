// GET /api/woolies/status — reports whether the server has a shared Woolies
// cookie configured (WOOLIES_COOKIE env var). The UI uses this to decide
// whether to show the "Connect your Woolies session" prompt.

import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json({
    hasSharedSession: !!(process.env.WOOLIES_COOKIE && process.env.WOOLIES_COOKIE.length > 0),
  });
}
