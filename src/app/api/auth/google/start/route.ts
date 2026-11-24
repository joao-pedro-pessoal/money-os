import { authBody, authJson } from "@/actions/authHttp";
import { configuredGoogle, startGoogle } from "@/actions/googleFlow";
import { safeGoogleError } from "@/lib/accounts/google";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { return authJson(await startGoogle(await authBody(request, configuredGoogle().origin))); }
  catch (error) { return authJson({ error: safeGoogleError(error) }, 400); }
}
