import { hasSession } from "@/actions/session";
import { completedRestore, prepareBackup, replaceBackup } from "@/actions/backupService";
import { transferLimits } from "@/actions/transferConfig";
import { boundedBody, sameOriginUpload, transferFailure, transferJson } from "@/actions/transferHttp";
import { withWork } from "@/actions/workGate";
import { TransferInputError } from "@/lib/backup/limits";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Raw JSON avoids the 1 MiB Server Action envelope; the general limit stays. */
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  if (!(await hasSession())) return transferJson({ error: "session_required", message: "Sign in again." }, 401);
  try {
    sameOriginUpload(request);
    const { operation } = await context.params;
    if (operation !== "inspect" && operation !== "restore") return transferJson({ error: "not_found" }, 404);
    if (operation === "restore" && request.headers.get("x-money-confirmation") !== "RESTORE") throw new TransferInputError("Type RESTORE to confirm.");
    const requestId = request.headers.get("x-money-request") ?? "";
    const checksum = request.headers.get("x-money-sha256") ?? "";
    if (operation === "restore") {
      const completed = await completedRestore(requestId, checksum);
      if (completed) return transferJson(completed);
    }
    return await withWork(operation === "inspect" ? "backup-inspect" : "backup-restore", async () => {
      const text = await boundedBody(request, transferLimits().backupBytes);
      if (operation === "restore") return transferJson(await replaceBackup(text, requestId, checksum));
      const result = prepareBackup(text);
      return transferJson(result.check, result.check.ok ? 200 : (result.status ?? 400));
    });
  } catch (error) { return transferFailure(error); }
}
