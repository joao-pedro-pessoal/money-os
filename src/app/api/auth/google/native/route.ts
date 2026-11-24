import { authBody, authJson } from "@/actions/authHttp";
import { configuredGoogle, nativeGoogle } from "@/actions/googleFlow";
import { safeGoogleError } from "@/lib/accounts/google";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { return authJson(await nativeGoogle(await authBody(request, configuredGoogle().origin, false, true))); }
  catch (error) { return authJson({ error: safeGoogleError(error) }, 400); }
}
