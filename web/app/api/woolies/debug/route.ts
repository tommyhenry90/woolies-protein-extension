// Debug endpoint — returns the anonymous cookie string we'd send to Woolies.
import { NextResponse } from "next/server";
import { getAnonymousWooliesCookies, invalidateAnonymousCookies } from "@/lib/anon-cookies";


export async function GET(req: Request) {
  if (new URL(req.url).searchParams.has("refresh")) invalidateAnonymousCookies();
  const cookies = await getAnonymousWooliesCookies();
  return NextResponse.json({
    cookieLength: cookies.length,
    cookieNames: cookies.split(";").map((p) => p.trim().split("=")[0]).filter(Boolean),
    preview: cookies.slice(0, 200),
  });
}
