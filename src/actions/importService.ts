import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { accounts, auditLog, categories, imports, transactions } from "@/db/schema";
import { dedupKey } from "@/lib/csv";
import { centsText, importCents, shortText, validateImportRows, validateIntegrity, validateMapping, type ValidImportRow, type ValidIntegrity } from "@/lib/csv/validation";
import { TransferInputError } from "@/lib/backup/limits";
import { transferLimits } from "./transferConfig";
import { withWork } from "./workGate";

type Result = { importId: string; created: number; net: number; categorised: number; duplicated: number };
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const invalidate = () => { for (const path of ["/transactions", "/savings", "/accounts", "/", "/import"]) revalidatePath(path); };

export async function commitValidatedImport(accountId: string, fileName: string, input: ValidImportRow[], mapping: string, adjustBalance: boolean, supplied?: ValidIntegrity, requestId?: string) {
  const limit = transferLimits();
  shortText(accountId, 200, "account");
  const [owned] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId));
  if (!owned) throw new Error("Account not found");
  shortText(fileName, 255, "file name");
  const rows = validateImportRows(input, limit.csvRows);
  const columnMapping = validateMapping(mapping);
  const integrity = validateIntegrity(supplied, limit.csvRows);
  if (integrity && integrity.rowsInFile < rows.length) throw new TransferInputError("Invalid file integrity details.");
  if (typeof adjustBalance !== "boolean") throw new TransferInputError("Invalid balance option.");
  if (requestId !== undefined && !/^[a-f0-9-]{36}$/i.test(requestId)) throw new TransferInputError("Invalid import request.");
  const fingerprint = digest(JSON.stringify({ accountId, fileName, rows, columnMapping, adjustBalance, integrity }));
  const receiptId = `csv-${digest(`${accountId}|${requestId ?? fingerprint}`)}`;

  const previousResult = async (details: string | null): Promise<Result> => {
    const receipt = JSON.parse(details ?? "{}");
    if (receipt.fingerprint !== fingerprint) throw new TransferInputError("This import request was already used with different details.", 409);
    const [undone] = await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.entityId, receipt.result.importId), eq(auditLog.action, "csv_import_undone")));
    if (undone) throw new TransferInputError("This import was undone. Select the file again to create a new import.", 409);
    return receipt.result;
  };
  // Retried successes do not spend another quota slot or touch the balance.
  const [previous] = await db.select().from(auditLog).where(eq(auditLog.id, receiptId));
  if (previous) return previousResult(previous.details);

  const result = await withWork("csv-import", () => db.transaction(async store => {
    const [account] = await store.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
    if (!account) throw new Error("Account not found");
    const [repeated] = await store.select().from(auditLog).where(eq(auditLog.id, receiptId));
    if (repeated) {
      const receipt = JSON.parse(repeated.details ?? "{}");
      if (receipt.fingerprint !== fingerprint) throw new TransferInputError("This import request was already used with different details.", 409);
      const [undone] = await store.select().from(auditLog).where(and(eq(auditLog.entityId, receipt.result.importId), eq(auditLog.action, "csv_import_undone")));
      if (undone) throw new TransferInputError("This import was undone. Select the file again to create a new import.", 409);
      return receipt.result as Result;
    }
    const existing = await store.select().from(transactions).where(eq(transactions.accountId, accountId));
    const seen = new Set(existing.map(t => dedupKey(new Date(t.date), Number(t.amount), t.description ?? "")));
    const accepted = rows.filter(row => {
      const key = dedupKey(new Date(row.date), row.amount, row.description);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    const existingCategories = await store.select().from(categories);
    const categoryByName = new Map(existingCategories.map(c => [c.name.trim().toLowerCase(), c]));
    let net = BigInt(0), categorised = 0;
    const movements = accepted.map(row => {
      const cents = importCents(row.amount); net += cents;
      const type = cents > BigInt(0) ? "income" : "expense";
      const match = row.category ? categoryByName.get(row.category.trim().toLowerCase()) : undefined;
      const categoryId = match?.kind === type ? match.id : null;
      if (categoryId) categorised++;
      return { accountId, currency: account.currency, type, amount: centsText(cents), date: new Date(row.date), description: row.description, merchant: row.merchant ?? null, categoryId, source: "csv" as const };
    });
    if (net <= -BigInt("100000000000000") || net >= BigInt("100000000000000")) throw new TransferInputError("The import total is too large.");
    const [record] = await store.insert(imports).values({
      accountId, fileName, columnMapping, rowsImported: String(accepted.length), rowsDuplicated: String(rows.length - accepted.length), rowsIgnored: "0",
      fileHash: integrity?.fileHash ?? null, rowsInFile: integrity ? String(integrity.rowsInFile) : null,
      debitTotal: integrity ? String(integrity.debitTotal) : null, creditTotal: integrity ? String(integrity.creditTotal) : null,
    }).returning();
    for (let i = 0; i < movements.length; i += 500) await store.insert(transactions).values(movements.slice(i, i + 500).map(row => ({ ...row, importId: record.id })) as (typeof transactions.$inferInsert)[]);
    if (adjustBalance && net !== BigInt(0)) await store.update(accounts).set({ balance: sql`${accounts.balance} + ${centsText(net)}`, updatedAt: new Date() }).where(eq(accounts.id, accountId));
    const outcome: Result = { importId: record.id, created: accepted.length, net: Number(net) / 100, categorised, duplicated: rows.length - accepted.length };
    await store.insert(auditLog).values({ id: receiptId, entityType: "import", entityId: record.id, action: "csv_imported", details: JSON.stringify({ fileName, ...outcome, adjustBalance, fingerprint, result: outcome }) });
    return outcome;
  }));
  invalidate();
  return result;
}

export async function undoBankImport(importId: string) {
  await db.transaction(async store => {
    // Account first, matching the commit order; re-read the import under lock.
    const [before] = await store.select().from(imports).where(eq(imports.id, importId));
    if (!before) {
      const [undone] = await store.select().from(auditLog).where(and(eq(auditLog.entityId, importId), eq(auditLog.action, "csv_import_undone")));
      if (undone) return;
      throw new Error("Import not found");
    }
    if (before.accountId) await store.select().from(accounts).where(eq(accounts.id, before.accountId)).for("update");
    const [record] = await store.select().from(imports).where(eq(imports.id, importId)).for("update");
    if (!record) return;
    const [total] = await store.select({ net: sql<string>`coalesce(sum(${transactions.amount}), 0)::text`, count: sql<number>`count(*)::int` }).from(transactions).where(eq(transactions.importId, importId));
    const logs = await store.select().from(auditLog).where(and(eq(auditLog.entityId, importId), eq(auditLog.action, "csv_imported")));
    const adjusted = logs.some(log => { try { return JSON.parse(log.details ?? "{}").adjustBalance === true; } catch { return false; } });
    await store.delete(transactions).where(eq(transactions.importId, importId));
    if (adjusted && record.accountId) await store.update(accounts).set({ balance: sql`${accounts.balance} - ${total.net}`, updatedAt: new Date() }).where(eq(accounts.id, record.accountId));
    await store.delete(imports).where(eq(imports.id, importId));
    await store.insert(auditLog).values({ entityType: "import", entityId: importId, action: "csv_import_undone", details: JSON.stringify({ removed: total.count, net: total.net, balanceReverted: adjusted }) });
  });
  invalidate();
}
