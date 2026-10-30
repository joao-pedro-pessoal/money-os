// Internal database helper; no "use server" directive, so these are not callable endpoints.
import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isQuickEntryId, ManualEntryError } from "@/lib/money/manualEntry";
import { MANUAL_RETRY_MESSAGE, type ManualEntryResult } from "@/lib/money/manualRequest";
import { hasSession } from "./session";

type Store = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Kind = "bucket:create" | "budget:create" | "subscription:create" | "allocation:add" | "bucket:edit" | "budget:limit" | "allocation:set" | "balance:set";

export async function manualRequestId(form: FormData): Promise<string> {
  if (!(await hasSession())) throw new ManualEntryError("Sign in again.");
  const id = String(form.get("requestId") ?? "").toLowerCase();
  if (!isQuickEntryId(id)) throw new ManualEntryError("Refresh this page before saving this entry.");
  return id;
}

/** The receipt is part of the caller's transaction and must not be pruned as a disposable log. */
export async function claimManualRequest(store: Store, id: string, kind: Kind, recordId: string, details: string): Promise<boolean> {
  const receiptId = `${id}-manual-request`;
  // Compare payloads without retaining another copy of private descriptions or notes.
  const fingerprint = `sha256:${createHash("sha256").update(details).digest("hex")}`;
  const [created] = await store.insert(auditLog).values({id:receiptId,entityType:"manual_request",entityId:recordId,action:kind,details:fingerprint})
    .onConflictDoNothing({target:auditLog.id}).returning({id:auditLog.id});
  if (created) return true;
  const [saved] = await store.select().from(auditLog).where(eq(auditLog.id,receiptId));
  // An invisible receipt from another user is refused without exposing its contents.
  if (saved?.entityType !== "manual_request" || saved.entityId !== recordId || saved.action !== kind || saved.details !== fingerprint) {
    throw new ManualEntryError("This request was already used with different details. Check the record before starting another one.");
  }
  return false;
}

export async function manualEntryResult(work: () => Promise<void>, fallback = MANUAL_RETRY_MESSAGE): Promise<ManualEntryResult> {
  if (!(await hasSession())) return {error:"Sign in again."};
  try { await work(); return {saved:true}; }
  catch(error) { return {error:error instanceof ManualEntryError ? error.message : fallback}; }
}
