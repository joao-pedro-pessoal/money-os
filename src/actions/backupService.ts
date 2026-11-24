// Internal service. No callable Server Action exports and no database work on inspect.
import { db } from "@/db/client";
import { createHash } from "node:crypto";
import { and, eq, getTableColumns, getTableName, inArray, sql } from "drizzle-orm";
import { auditLog, users } from "@/db/schema";
import { getTableConfig, type AnyPgColumn } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";
import { BACKUP_TABLES, validateBackup, type BackupTable, type ValidationResult } from "@/lib/backup";
import { boundedJson, TransferInputError } from "@/lib/backup/limits";
import { TABLES } from "./backupTables";
import { transferLimits } from "./transferConfig";

type Rows = Partial<Record<BackupTable, Record<string, unknown>[]>>;
const own = (row: object, key: string) => Object.prototype.hasOwnProperty.call(row, key);

function validDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  if (value.length > 10 && (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59)) return null;
  const day = value.slice(0, 10);
  const calendar = new Date(day);
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0, 10) === day ? date : null;
}

function valueFor(column: AnyPgColumn, value: unknown): unknown {
  if (value === null) {
    if (column.notNull) throw new Error("required value");
    return null;
  }
  const type = column.getSQLType();
  if (column.enumValues?.length && !column.enumValues.includes(value as string)) throw new Error("invalid choice");
  if (type === "text[]") {
    if (!Array.isArray(value) || value.length > 1000 || value.some(v => typeof v !== "string" || v.length > 1000 || v.includes("\0"))) throw new Error("invalid text list");
    return value;
  }
  if (column.dataType === "date") {
    const date = validDate(value);
    if (!date) throw new Error("invalid date");
    return date;
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") throw new Error("invalid boolean");
    return value;
  }
  if (type.startsWith("numeric")) {
    if (typeof value !== "string" && typeof value !== "number") throw new Error("invalid decimal");
    const text = String(value);
    if (text.length > 128) throw new Error("invalid decimal");
    const match = /^-?(\d+)(?:\.(\d+))?$/.exec(text);
    const bounds = /numeric\((\d+),\s*(\d+)\)/.exec(type);
    if (!match) throw new Error("invalid decimal");
    if (bounds && (match[1].replace(/^0+/, "").length > Number(bounds[1]) - Number(bounds[2]) || (match[2]?.length ?? 0) > Number(bounds[2]))) throw new Error("decimal exceeds precision");
    return text;
  }
  if (column.dataType === "number") {
    if (!Number.isSafeInteger(value) || Number(value) < -2147483648 || Number(value) > 2147483647) throw new Error("invalid integer");
    return value;
  }
  if (typeof value !== "string" || value.includes("\0")) throw new Error("invalid text");
  return value;
}

/** Validate every cell against the actual database schema, never a parallel list. */
function validatedRows(raw: Record<string, unknown[]>): Rows {
  const result: Rows = {};
  for (const name of BACKUP_TABLES) {
    const columns = getTableColumns(TABLES[name]);
    const config = getTableConfig(TABLES[name]);
    const primary = [...Object.values(columns).filter(c => c.primary), ...config.primaryKeys.flatMap(k => k.columns)]
      .filter(c => c.name !== "user_id").map(c => Object.keys(columns).find(key => columns[key as keyof typeof columns].name === c.name)!);
    const seen = new Set<string>();
    result[name] = (raw[name] ?? []).map((input, index) => {
      const location = `${name}, row ${index + 1}`;
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new TransferInputError(`Backup rejected: ${location} must be an object.`);
      let row = input as Record<string, unknown>;
      if (own(columns, "legacyPlaylistId") && own(columns, "playlistIds") && own(row, "playlistId")) {
        const { playlistId, ...rest } = row;
        row = { ...rest, legacyPlaylistId: row.legacyPlaylistId ?? playlistId, playlistIds: row.playlistIds ?? (playlistId ? [playlistId] : []) };
      }
      const output: Record<string, unknown> = {};
      for (const key of Object.keys(row)) {
        if (key === "userId") continue; // Filled only from the authenticated connection.
        if (!own(columns, key)) throw new TransferInputError(`Backup rejected: unknown field in ${location}.`);
      }
      for (const [key, column] of Object.entries(columns)) {
        if (key === "userId") continue;
        if (!own(row, key)) {
          if (primary.includes(key) || (column.notNull && !column.hasDefault)) throw new TransferInputError(`Backup rejected: missing ${key} in ${location}.`);
          continue;
        }
        try { output[key] = valueFor(column, row[key]); }
        catch { throw new TransferInputError(`Backup rejected: invalid ${key} in ${location}.`); }
      }
      const key = JSON.stringify(primary.map(key => output[key]));
      if (seen.has(key)) throw new TransferInputError(`Backup rejected: duplicate key in ${location}.`);
      seen.add(key);
      return output;
    });
  }
  return result;
}

function referencesInsideBackup(data: Rows) {
  const byTable = new Map<string, BackupTable>(BACKUP_TABLES.map(name => [getTableName(TABLES[name]), name]));
  const keys = new Map(BACKUP_TABLES.map(name => [name, new Map(Object.entries(getTableColumns(TABLES[name])).map(([key, column]) => [column.name, key]))]));
  const indexes = new Map<string, Set<string>>();
  const playlists = new Set((data.playlists ?? []).map(row => row.id));
  for (const name of BACKUP_TABLES) {
    for (const foreignKey of getTableConfig(TABLES[name]).foreignKeys) {
      const reference = foreignKey.reference();
      if (reference.columns.every(c => c.name === "user_id")) continue;
      const target = byTable.get(getTableName(reference.foreignTable));
      if (!target) continue;
      const parentKeys = reference.foreignColumns.map(c => keys.get(target)!.get(c.name)!);
      const localKeys = reference.columns.map(c => keys.get(name)!.get(c.name)!);
      const indexKey = JSON.stringify([target, parentKeys]);
      let parents = indexes.get(indexKey);
      if (!parents) {
        parents = new Set((data[target] ?? []).map(row => JSON.stringify(parentKeys.map(key => row[key]))));
        indexes.set(indexKey, parents);
      }
      for (const row of data[name] ?? []) {
        const values = localKeys.map(key => row[key]);
        if (values.some(value => value === null || value === undefined)) continue;
        if (!parents.has(JSON.stringify(values))) throw new TransferInputError("Backup rejected: References must stay inside the backup.");
      }
    }
    for (const row of data[name] ?? []) {
      if (Array.isArray(row.playlistIds) && row.playlistIds.some(id => !playlists.has(id))) throw new TransferInputError("Backup rejected: Playlist references must stay inside the backup.");
    }
  }
}

export function prepareBackup(json: string): { check: ValidationResult; rows?: Rows; status?: number } {
  const check: ValidationResult = { ok: false, errors: [], warnings: [], counts: {} };
  try {
    const limits = transferLimits();
    const raw = boundedJson(json, limits.backupBytes);
    const candidate = raw && typeof raw === "object" && "data" in raw ? raw.data : undefined;
    if (candidate && typeof candidate === "object") {
      let total = 0;
      for (const value of Object.values(candidate)) if (Array.isArray(value)) total += value.length;
      if (total > limits.backupRows) throw new TransferInputError(`Backup exceeds the ${limits.backupRows} row limit.`, 413);
    }
    Object.assign(check, validateBackup(raw));
    if (!check.ok) return { check, status: 400 };
    const data = (raw as { data: Record<string, unknown[]> }).data;
    const rows = validatedRows(data);
    referencesInsideBackup(rows);
    return { check, rows };
  } catch (error) {
    if (!(error instanceof TransferInputError)) throw error;
    check.ok = false; check.errors = [error.message];
    return { check, status: error.status };
  }
}

async function restoreReceiptId(requestId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw new TransferInputError("Invalid restore request.");
  const identity = await db.execute<{ id: string }>(sql`select current_setting('app.user_id', true) as id`);
  if (!identity.rows[0]?.id) throw new Error("Sign in again.");
  // Account-scoped, but independent of secret rotation: an old retry must stay
  // consumed even after the operator replaces the session-signing secret.
  return `restore-${createHash("sha256").update(`${identity.rows[0].id}|${requestId}`).digest("hex")}`;
}

export async function completedRestore(requestId: string, checksum: string) {
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new TransferInputError("Invalid restore checksum.");
  const id = await restoreReceiptId(requestId);
  const [receipt] = await db.select().from(auditLog).where(and(eq(auditLog.id, id), eq(auditLog.action, "backup_restored")));
  if (!receipt) return undefined;
  const details = JSON.parse(receipt.details ?? "{}");
  if (details.checksum !== checksum) throw new TransferInputError("This restore request was already used with a different file.", 409);
  return { ok: true as const, counts: details.counts as Record<string, number> };
}

export async function replaceBackup(json: string, requestId?: string, checksum?: string) {
  const receiptId = requestId ? await restoreReceiptId(requestId) : undefined;
  const actualChecksum = createHash("sha256").update(json).digest("hex");
  if (requestId && actualChecksum !== checksum) throw new TransferInputError("The uploaded backup checksum does not match.");
  const prepared = prepareBackup(json);
  if (!prepared.rows || !prepared.check.ok) throw new TransferInputError(prepared.check.errors.join(" "), prepared.status);
  await db.transaction(async tx => {
    let retained: (typeof auditLog.$inferSelect)[] = [];
    if (receiptId) {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, sql`current_setting('app.user_id')`)).for("update");
      const [receipt] = await tx.select().from(auditLog).where(eq(auditLog.id, receiptId));
      if (receipt) {
        if (JSON.parse(receipt.details ?? "{}").checksum !== actualChecksum) throw new TransferInputError("This restore request was already used with a different file.", 409);
        return;
      }
      // Keep import/restore receipts across later restores: an old network
      // retry must never reapply money or erase later edits. Owner comes from RLS.
      retained = await tx.select().from(auditLog).where(inArray(auditLog.action, ["backup_restored", "csv_imported", "csv_import_undone"]));
    }
    for (const name of [...BACKUP_TABLES].reverse()) await tx.delete(TABLES[name]);
    for (const name of BACKUP_TABLES) {
      const rows = prepared.rows![name] ?? [];
      // Keep both row count and PostgreSQL's bind-parameter limit bounded.
      const batch = Math.min(500, Math.floor(60_000 / Object.keys(getTableColumns(TABLES[name])).length));
      for (let i = 0; i < rows.length; i += batch) await tx.insert(TABLES[name]).values(rows.slice(i, i + batch) as never);
    }
    for (let i = 0; i < retained.length; i += 500) await tx.insert(auditLog).values(retained.slice(i, i + 500)).onConflictDoNothing();
    if (receiptId) await tx.insert(auditLog).values({ id: receiptId, entityType: "backup", entityId: receiptId, action: "backup_restored", details: JSON.stringify({ checksum: actualChecksum, counts: prepared.check.counts }) }).onConflictDoNothing();
  });
  revalidatePath("/", "layout");
  return { ok: true as const, counts: prepared.check.counts };
}
