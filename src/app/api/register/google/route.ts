import { authBody, authJson } from "@/actions/authHttp";
import { configuredGoogle, registerGoogle } from "@/actions/googleFlow";
import { safeGoogleError } from "@/lib/accounts/google";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try { return authJson(await registerGoogle(await authBody(request, configuredGoogle().origin))); }
  catch (error) { return authJson({ error: safeGoogleError(error) }, 400); }
}
