// Internal bounds before loading the report/font assets, under the caller's RLS.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { currentInvestments } from "./releaseEdition";
import { ReportLimitError, type ReportParams } from "@/lib/reports/request";

function positiveLimit(name: string, fallback: number) {
  const configured = process.env[name];
  if (!configured) return fallback;
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000_000) throw new Error(`Invalid ${name}`);
  return value;
}
export const pdfLimits = () => ({ days: positiveLimit("PDF_MAX_DAYS", 3660), sourceRows: positiveLimit("PDF_MAX_SOURCE_ROWS", 100_000), renderRows: positiveLimit("PDF_MAX_RENDER_ROWS", 10_000), bytes: positiveLimit("PDF_MAX_BYTES", 4 * 1024 * 1024) });

export async function checkReportSource(params: ReportParams, maximum: number) {
  const full = await currentInvestments();
  const scope = full ? (params.scope ?? "both") : "money";
  const tables = [
    // Both scopes read portfolio history: the money report includes the part
    // of old investments that is not already covered by an account balance.
    schema.accounts, schema.holdings, schema.holdingSnapshots, schema.positionSnapshots,
    schema.accountConnections, schema.exchangeRates,
    ...(scope !== "investments" ? [schema.transactions, schema.accountSnapshots, schema.budgets, schema.budgetCategories, schema.categories, schema.subcategories] : []),
    ...(scope !== "money" ? [schema.investmentActivities, schema.positions, schema.positionMeta, schema.platformBalances,
      schema.brokerEvents, schema.dividendPayments, schema.investmentActivityTags, schema.tags, schema.tradeClassifications,
      schema.playlists, schema.symbolNames, schema.benchmarkPrices] : []),
  ];
  // Stop counting each source after the bound; don't pull history into Node.
  const counts = tables.map(table => sql`select count(*)::int as n from (select 1 from ${table} limit ${maximum + 1}) bounded`);
  const result = await db.execute<{ rows: number }>(sql`select coalesce(sum(n), 0)::int as rows from (${sql.join(counts, sql` union all `)}) counts`);
  if (Number(result.rows[0]?.rows) > maximum) throw new ReportLimitError("rows");
}

export function checkReportOutput(report: unknown, maximum: number) {
  let rows = 0, characters = 0;
  const pending: unknown[] = [report];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string") {
      characters += value.length;
      if (value.length > 20_000 || characters > 1_000_000) throw new ReportLimitError("rows");
    }
    if (Array.isArray(value)) {
      rows += value.length;
      if (rows > maximum) throw new ReportLimitError("rows");
      for (const item of value) pending.push(item);
    } else if (value && typeof value === "object") pending.push(...Object.values(value));
    if (rows > maximum) throw new ReportLimitError("rows");
  }
}
