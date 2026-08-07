/**
 * Backup format helpers. Pure — no DB, no I/O — so validation is testable.
 *
 * A backup is only worth having if restoring it is safe, so the file carries a
 * version and is validated before anything is deleted.
 */

export const BACKUP_VERSION = 1;

/** Every table that must be in a complete backup, in dependency order. */
export const BACKUP_TABLES = [
  "appSettings",
  "exchangeRates",
  "categories",
  "subcategories",
  "tags",
  "accounts",
  "buckets",
  "bucketAllocations",
  "imports",
  "transactions",
  "transactionTags",
  "transfers",
  "interestPayments",
  "accountSnapshots",
  "playlists",
  "holdings",
  "holdingSnapshots",
  "watchlistItems",
  "accountConnections",
  "positions",
  "positionSnapshots",
  "positionMeta",
  "platformBalances",
  "syncLogs",
  "auditLog",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface Backup {
  version: number;
  exportedAt: string;
  data: Partial<Record<BackupTable, unknown[]>>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Row count per table, for the confirmation screen. */
  counts: Record<string, number>;
}

/**
 * Checks a parsed backup before it is allowed anywhere near the database.
 *
 * Missing tables are a warning rather than an error: a backup taken by an
 * older version simply won't have the newer ones, and refusing it would make
 * old backups worthless.
 */
export function validateBackup(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: Record<string, number> = {};

  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["The file isn't a JSON object."], warnings, counts };
  }

  const backup = raw as Partial<Backup>;

  if (typeof backup.version !== "number") {
    errors.push("No version field — this doesn't look like a Money OS backup.");
  } else if (backup.version > BACKUP_VERSION) {
    errors.push(
      `Backup version ${backup.version} is newer than this app understands (${BACKUP_VERSION}).`
    );
  }

  if (typeof backup.data !== "object" || backup.data === null) {
    errors.push("No data section.");
    return { ok: false, errors, warnings, counts };
  }

  for (const table of BACKUP_TABLES) {
    const rows = (backup.data as Record<string, unknown>)[table];
    if (rows === undefined) {
      warnings.push(`Missing table "${table}" — it will be left empty.`);
      continue;
    }
    if (!Array.isArray(rows)) {
      errors.push(`Table "${table}" is not a list.`);
      continue;
    }
    counts[table] = rows.length;
  }

  const unknownTables = Object.keys(backup.data).filter(
    (k) => !(BACKUP_TABLES as readonly string[]).includes(k)
  );
  for (const t of unknownTables) {
    warnings.push(`Unknown table "${t}" — it will be ignored.`);
  }

  return { ok: errors.length === 0, errors, warnings, counts };
}

/** Escapes a value for CSV: quotes it and doubles any inner quotes. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return columns ? columns.join(",") + "\n" : "";
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
