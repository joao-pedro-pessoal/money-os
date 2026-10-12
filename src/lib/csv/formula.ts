/**
 * A text cell a spreadsheet would run as a formula, made to read as text.
 *
 * Excel, LibreOffice and Google Sheets treat a cell starting with = + - or @
 * (or a tab or carriage return before one) as a formula. A description or
 * merchant name comes from bank files, broker statements and whatever was
 * typed, so `=HYPERLINK("http://…")` in one would run when the exported CSV is
 * opened. A leading apostrophe is the usual cure: shown as text, not run.
 *
 * Numbers are left alone, negative ones included — "-12.5" must stay a number
 * for the sums an accountant does with the file.
 */
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

export function spreadsheetSafe(text: string): string {
  if (!/^[=+\-@\t\r]/.test(text) || NUMBER.test(text)) return text;
  return `'${text}`;
}
