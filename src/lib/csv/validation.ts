import Papa from "papaparse";
import { buildRows, type ColumnMapping } from ".";
import { looksLikeBrokerStatement } from "./broker";
import { controlSums } from "./integrity";
import { TRANSFER_LIMITS, TransferInputError } from "@/lib/backup/limits";

export interface ValidImportRow { date: string; amount: number; description: string; merchant?: string; category?: string }
export interface ValidIntegrity { fileHash: string; rowsInFile: number; debitTotal: number; creditTotal: number }
const fail = (message: string): never => { throw new TransferInputError(message); };

export function shortText(value: unknown, max: number, name: string): string {
  if (typeof value !== "string" || value.length > max || value.includes("\0")) return fail(`Invalid ${name}.`);
  return value;
}

/** Exact cents for the bank importer, with a range safe for existing numeric UIs. */
export function importCents(value: unknown): bigint {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) >= 1e12) return fail("Invalid import amount.");
  const text = String(value);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return fail("Import amounts need at most two decimal places.");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const cents = BigInt(whole + fraction.padEnd(2, "0"));
  return value < 0 ? -cents : cents;
}
export function centsText(cents: bigint): string {
  const amount = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? "-" : ""}${amount / BigInt(100)}.${String(amount % BigInt(100)).padStart(2, "0")}`;
}

export function validateImportRows(rows: unknown, maximum: number): ValidImportRow[] {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > maximum) return fail(`Import must contain 1 to ${maximum} rows.`);
  return rows.map((input, index) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail(`Invalid import row ${index + 1}.`);
    const row = input as Record<string, unknown>;
    const date = shortText(row.date, 40, "import date");
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date.slice(0, 10)) return fail(`Invalid import date in row ${index + 1}.`);
    const cents = importCents(row.amount);
    if (cents === BigInt(0)) return fail(`Zero import amount in row ${index + 1}.`);
    const result: ValidImportRow = { date: new Date(date).toISOString(), amount: Number(cents) / 100, description: shortText(row.description, TRANSFER_LIMITS.csvFieldChars, "description") };
    if (row.merchant !== undefined) result.merchant = shortText(row.merchant, TRANSFER_LIMITS.csvFieldChars, "merchant");
    if (row.category !== undefined) result.category = shortText(row.category, 1000, "category");
    return result;
  });
}

export function validateMapping(text: unknown): string {
  const input = shortText(text, 16_384, "column mapping");
  let mapping: unknown;
  try { mapping = JSON.parse(input); } catch { return fail("Invalid column mapping."); }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || Object.keys(mapping).length > 7 || Object.entries(mapping).some(([key, value]) => !["date", "amount", "debit", "credit", "description", "merchant"].includes(key) || typeof value !== "string" || value.length > 1000)) return fail("Invalid column mapping.");
  return JSON.stringify(mapping);
}

export function validateIntegrity(input: unknown, maximum: number): ValidIntegrity | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object") return fail("Invalid file integrity details.");
  const data = input as ValidIntegrity;
  if (typeof data.fileHash !== "string" || !/^[a-f0-9]{64}$/.test(data.fileHash) || !Number.isInteger(data.rowsInFile) || data.rowsInFile < 1 || data.rowsInFile > maximum) return fail("Invalid file integrity details.");
  importCents(data.debitTotal); importCents(data.creditTotal);
  if (data.debitTotal < 0 || data.creditTotal < 0) return fail("Invalid file integrity details.");
  return { fileHash: data.fileHash, rowsInFile: data.rowsInFile, debitTotal: data.debitTotal, creditTotal: data.creditTotal };
}

/** Count/field bounds apply before creating parsed objects, including quoted newlines. */
export function boundedCsv(text: string, maxBytes: number, maxRows: number) {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > maxBytes) throw new TransferInputError("CSV exceeds the file size limit.", 413);
  let quoted = false, records = 0, columns = 1, field = 0;
  // Delimiter-independent field length is checked again after parsing.
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { i++; field++; } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === ";" || c === "\t")) {
      columns++; field = 0;
      if (columns > TRANSFER_LIMITS.csvColumns * 3) throw new TransferInputError("CSV has too many columns.", 413);
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      records++; columns = 1; field = 0;
      if (records > maxRows + 1) throw new TransferInputError("CSV has too many rows.", 413);
    } else field++;
    if (field > TRANSFER_LIMITS.csvFieldChars) throw new TransferInputError("CSV field is too long.", 413);
  }
  if (quoted) throw new TransferInputError("CSV has an unfinished quoted field.");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length || !parsed.meta.fields?.length) throw new TransferInputError("The CSV could not be read. Check its columns and quotes.");
  if (parsed.data.length > maxRows || parsed.meta.fields.length > TRANSFER_LIMITS.csvColumns) throw new TransferInputError("CSV has too many rows or columns.", 413);
  if (parsed.meta.fields.some(h => h.length > 1000) || parsed.data.some(row => Object.values(row).some(value => typeof value !== "string" || value.length > TRANSFER_LIMITS.csvFieldChars || value.includes("\0")))) throw new TransferInputError("Invalid CSV field.");
  return parsed;
}

export function bankFileRows(text: string, mappingText: string, maxBytes: number, maxRows: number) {
  const mapping = JSON.parse(validateMapping(mappingText)) as ColumnMapping;
  const parsed = boundedCsv(text, maxBytes, maxRows);
  const fields = parsed.meta.fields!;
  if (looksLikeBrokerStatement(fields)) return fail("Use the broker statement importer for this file.");
  if (!mapping.date || (!mapping.amount && !mapping.debit && !mapping.credit) || Object.values(mapping).some(value => value && !fields.includes(value))) return fail("Choose valid date and amount columns.");
  const category = fields.find(h => h.trim().toLowerCase() === "category");
  const built = buildRows(parsed.data, mapping, new Set());
  // Preserve preview semantics: unreadable/zero rows and in-file duplicates are
  // excluded explicitly; every row that will be written is then validated.
  const selected = built.filter(row => !row.problem && !row.duplicate).map(row => ({ date: row.date!.toISOString(), amount: row.amount!, description: row.description, merchant: row.merchant, category: category ? row.raw[category] : undefined }));
  return { rows: validateImportRows(selected, maxRows), rowsInFile: parsed.data.length, invalid: built.filter(row => row.problem).length, duplicates: built.filter(row => row.duplicate && !row.problem).length, control: controlSums(built.map(row => row.amount ?? NaN)) };
}
