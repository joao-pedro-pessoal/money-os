import { createHash } from "node:crypto";
import { z } from "zod";
import { hasSession } from "@/actions/session";
import { withWork } from "@/actions/workGate";
import { commitValidatedImport } from "@/actions/importService";
import { transferLimits } from "@/actions/transferConfig";
import { boundedBody, sameOriginUpload, transferFailure, transferJson } from "@/actions/transferHttp";
import { bankFileRows } from "@/lib/csv/validation";
import { boundedJson, TransferInputError } from "@/lib/backup/limits";

export const runtime = "nodejs";
export const maxDuration = 300;
const Input = z.object({ accountId: z.string().min(1).max(200), fileName: z.string().max(255), text: z.string(), mapping: z.string().max(16384), adjustBalance: z.boolean(), requestId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  if (!(await hasSession())) return transferJson({ error: "session_required", message: "Sign in again." }, 401);
  try {
    sameOriginUpload(request);
    return await withWork("csv-preview", async () => {
      const limit = transferLimits();
      // JSON escaping may expand the raw CSV; raw text is independently bounded.
      const maxRequest = Math.min(4 * 1024 * 1024, limit.csvBytes * 6 + 32768);
      const input = Input.safeParse(boundedJson(await boundedBody(request, maxRequest), maxRequest));
      if (!input.success) throw new TransferInputError("Invalid bank import request.");
      const data = input.data;
      const file = bankFileRows(data.text, data.mapping, limit.csvBytes, limit.csvRows);
      const result = await commitValidatedImport(data.accountId, data.fileName, file.rows, data.mapping, data.adjustBalance, {
        fileHash: createHash("sha256").update(data.text).digest("hex"), rowsInFile: file.rowsInFile,
        debitTotal: file.control.debits, creditTotal: file.control.credits,
      }, data.requestId);
      return transferJson({ ...result, ignored: file.invalid, duplicated: result.duplicated + file.duplicates });
    });
  } catch (error) { return transferFailure(error); }
}
