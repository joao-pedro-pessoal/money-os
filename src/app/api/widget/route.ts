import { hasSession } from "@/actions/session";
import { widgetSnapshot } from "@/actions/widgetData";
import { withWork } from "@/actions/workGate";
import { readFailure, readJson } from "@/actions/readHttp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  if (!(await hasSession())) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return await withWork("widget", async () => readJson((await widgetSnapshot()).value, 200));
  } catch (error) { return readFailure(error, "widget"); }
}
