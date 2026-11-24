import { authBody } from "@/actions/authHttp";
import { completeGoogle, configuredGoogle } from "@/actions/googleFlow";
import { z } from "zod";
import { GOOGLE_TOKEN } from "@/lib/accounts/google";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const input = z.object({ id: z.string().regex(GOOGLE_TOKEN), verifier: z.string().regex(GOOGLE_TOKEN) }).strict().parse(await authBody(request, configuredGoogle().origin, true, true));
    return new Response(null, { status: 303, headers: { Location: await completeGoogle(input.verifier, input.id), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch { return new Response(null, { status: 303, headers: { Location: "/login?google=failed", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
}
