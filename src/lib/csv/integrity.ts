/**
 * Proof that what went in is what came out of the file.
 *
 * Handing a statement to an AI to reformat it means something between the bank
 * and the database can drop a row, merge two, or change a digit — and a dropped
 * row is invisible by nature. You can't spot the transaction that isn't there.
 *
 * So the file is measured before anything is parsed, and measured again after.
 * If the counts or the totals disagree, the import says so before writing.
 * Cheap, and it catches exactly the failure that would otherwise be silent.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FileFingerprint {
  /** SHA-256 of the file's bytes. */
  hash: string;
  /** Data rows in the file, excluding the header and blank lines. */
  rowsInFile: number;
}

/** Data lines in a CSV, ignoring the header and trailing blanks. */
export function countDataRows(text: string): number {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  return Math.max(0, lines.length - 1);
}

export interface ControlSums {
  debits: number;
  credits: number;
  net: number;
  count: number;
}

/**
 * Debits and credits kept apart on purpose.
 *
 * A net total alone hides a compensating pair of errors: lose a +100 and a
 * -100 and the net is unchanged while two transactions have vanished. The two
 * sides plus the count make that impossible to miss.
 */
export function controlSums(amounts: number[]): ControlSums {
  let debits = 0;
  let credits = 0;
  for (const a of amounts) {
    if (!Number.isFinite(a)) continue;
    if (a < 0) debits += Math.abs(a);
    else credits += a;
  }
  return {
    debits: round2(debits),
    credits: round2(credits),
    net: round2(credits - debits),
    count: amounts.filter((a) => Number.isFinite(a)).length,
  };
}

export type DiscrepancyLevel = "ok" | "info" | "warn";

export interface Discrepancy {
  level: DiscrepancyLevel;
  message: string;
}

/**
 * Compares the file against what the parser understood.
 *
 * Rows skipped as duplicates or as unreadable are expected and reported as
 * information — the preview already lists them. Rows that simply went missing,
 * with no explanation, are a warning: that's the shape of an AI having dropped
 * something.
 */
export function reconcile(input: {
  rowsInFile: number;
  rowsParsed: number;
  duplicates: number;
  invalid: number;
}): Discrepancy[] {
  const out: Discrepancy[] = [];
  const accounted = input.rowsParsed;

  if (input.rowsInFile > 0 && accounted !== input.rowsInFile) {
    const missing = input.rowsInFile - accounted;
    if (missing > 0) {
      out.push({
        level: "warn",
        message: `The file has ${input.rowsInFile} rows but only ${accounted} were read. ${missing} row${
          missing === 1 ? "" : "s"
        } went missing — if this file came from an AI, check it against the original before importing.`,
      });
    } else {
      out.push({
        level: "warn",
        message: `The file has ${input.rowsInFile} rows but ${accounted} were read. Rows were added somewhere.`,
      });
    }
  }

  if (input.duplicates > 0) {
    out.push({
      level: "info",
      message: `${input.duplicates} row${
        input.duplicates === 1 ? "" : "s"
      } already exist in this account and will be skipped.`,
    });
  }

  if (input.invalid > 0) {
    out.push({
      level: "info",
      message: `${input.invalid} row${
        input.invalid === 1 ? " is" : "s are"
      } unreadable and will be skipped. Check them — a date or amount the parser rejected may be a formatting problem worth fixing.`,
    });
  }

  return out;
}

/** Have we seen this exact file before? */
export function previousImportOf(
  hash: string,
  history: { fileHash: string | null; fileName: string; createdAt: Date | string }[]
): { fileName: string; createdAt: Date | string } | null {
  const match = history.find((h) => h.fileHash === hash);
  return match ? { fileName: match.fileName, createdAt: match.createdAt } : null;
}
