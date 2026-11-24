import { TRANSFER_LIMITS } from "@/lib/backup/limits";

function configured(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`Invalid ${name}`);
  return number;
}

export function transferLimits() {
  return {
    ...TRANSFER_LIMITS,
    csvBytes: configured("IMPORT_CSV_MAX_BYTES", TRANSFER_LIMITS.csvBytes),
    csvRows: configured("IMPORT_CSV_MAX_ROWS", TRANSFER_LIMITS.csvRows),
    backupBytes: configured("BACKUP_MAX_BYTES", TRANSFER_LIMITS.backupBytes),
    backupRows: configured("BACKUP_MAX_ROWS", TRANSFER_LIMITS.backupRows),
  };
}
