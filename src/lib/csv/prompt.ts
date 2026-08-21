/**
 * The canonical statement format, and a prompt that gets an AI to produce it.
 *
 * Why this exists: every bank writes a different CSV, Open Banking needs a
 * licence, and the free aggregator tier that hobby projects relied on closed.
 * Rather than chase formats forever, the app states exactly one format it
 * wants and hands you a prompt to convert anything into it. A statement in any
 * shape — CSV, a PDF's text, a copied table — becomes importable.
 *
 * The format is deliberately boring: ISO dates, a dot decimal, a signed amount.
 * Those are the three things that go wrong when a machine writes CSV, and each
 * has a test in ../__tests__/csv.test.ts proving the importer reads them.
 */

export const CANONICAL_COLUMNS = ["date", "amount", "description", "merchant", "category"] as const;

/** Only these are required; merchant and category may be left empty. */
export const REQUIRED_COLUMNS = ["date", "amount", "description"] as const;

export interface PromptOptions {
  /** Category names the app already knows, so the AI reuses them. */
  categories?: string[];
  /** Shown so the AI doesn't invent a currency conversion. */
  currency?: string;
}

/**
 * Builds the instruction to paste into an AI along with a statement.
 *
 * Deliberately strict about the things that quietly corrupt an import:
 * a thousands separator turns 1.234,56 into 1.23; a stray markdown fence makes
 * the first row unparseable; an unsigned amount loses the direction of the
 * money. The prompt forbids all three explicitly rather than hoping.
 *
 * It also forbids inventing rows. An AI asked to "tidy up" a statement will
 * happily fill a gap, and a fabricated transaction in a ledger is worse than
 * a missing one.
 */
export function buildConversionPrompt(options: PromptOptions = {}): string {
  const { categories = [], currency = "EUR" } = options;

  const categoryLine =
    categories.length > 0
      ? `- category: one of exactly these, or empty if none fits. Do not invent new ones.\n  ${categories.join(", ")}`
      : `- category: leave empty.`;

  return `Convert the bank statement below into CSV.

Output rules — follow exactly:
- Output ONLY the CSV. No explanation, no markdown code fences, nothing else.
- First line is exactly this header:
  date,amount,description,merchant,category
- One row per transaction, in the order they appear.
- date: ISO format YYYY-MM-DD.
- amount: a plain number using a DOT as the decimal separator and NO thousands
  separator. Negative for money leaving the account, positive for money coming
  in. Write 1234.56 and -12.50, never 1.234,56 or "1,234.56" or (12.50).
- description: what the statement says, trimmed. If it contains a comma, wrap
  the field in double quotes.
- merchant: the shop or counterparty if it is clear, otherwise empty.
${categoryLine}
- Currency is ${currency}; do not convert any amounts.
- Do NOT add, merge, split, round or "correct" any transaction. If something is
  unreadable, leave the row out entirely rather than guessing a value.
- Ignore balance rows, subtotals and running totals — only actual transactions.

Statement:
`;
}

/** The header the importer expects, for showing next to the prompt. */
export const CANONICAL_HEADER = CANONICAL_COLUMNS.join(",");

/** A short example, so it is obvious what "right" looks like. */
export const CANONICAL_EXAMPLE = [
  CANONICAL_HEADER,
  "2026-01-15,-12.50,Coffee and a newspaper,Padaria Central,Food",
  "2026-01-16,-750.00,Monthly rent,,Housing",
  "2026-01-31,2000.00,Salary,,Salary",
].join("\n");

/**
 * Checks a converted file before the user wastes time on a preview.
 *
 * Catches what an AI actually gets wrong: leaving the markdown fence in,
 * renaming a column, or returning prose instead of CSV.
 */
export function checkCanonicalHeader(firstLine: string): { ok: boolean; problem?: string } {
  const line = firstLine.trim();

  if (line.startsWith("```")) {
    return {
      ok: false,
      problem:
        "The file starts with a markdown code fence (```). Delete that first line — and the one at the end — and try again.",
    };
  }

  const found = line
    .split(",")
    .map((c) => c.trim().toLowerCase().replace(/^["']|["']$/g, ""));

  const missing = REQUIRED_COLUMNS.filter((c) => !found.includes(c));
  if (missing.length > 0) {
    return {
      ok: false,
      problem: `The header is missing: ${missing.join(", ")}. It should read "${CANONICAL_HEADER}".`,
    };
  }

  return { ok: true };
}
