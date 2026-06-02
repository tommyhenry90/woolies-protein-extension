// GET /api/woolies/status — reports whether the server can search without
// the visitor connecting their own Woolies session. Always true now that
// the proxy harvests anonymous Akamai cookies from the homepage on demand;
// kept as an endpoint so the UI can react if that path ever breaks.

import { NextResponse } from "next/server";


export async function GET() {
  return NextResponse.json({
    hasSharedSession: true,
    hasEnvCookie: !!(process.env.WOOLIES_COOKIE && process.env.WOOLIES_COOKIE.length > 0),
  });
}
