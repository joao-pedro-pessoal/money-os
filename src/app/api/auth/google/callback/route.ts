import { configuredGoogle, googleCallback } from "@/actions/googleFlow";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return NextResponse.redirect(new URL(await googleCallback(new URL(request.url)), configuredGoogle().origin), { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
  catch { return new Response(null, { status: 303, headers: { Location: "/login?google=failed", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
}
