import type { NextRequest } from "next/server";
import { loadReport } from "@/actions/reports";
import { REPORT_TITLE, reportFileName } from "@/lib/reports/document";
import { renderReportPdf } from "@/lib/reports/pdf";

export const dynamic = "force-dynamic";

/**
 * The report as a PDF, drawn here rather than printed by the browser.
 *
 * Takes the report page's own address parameters and reads them through the
 * same `loadReport`, so the file holds the figures the page shows. Behind the
 * session like every page (src/proxy.ts), and the database only ever answers
 * with the signed-in person's rows, so nobody can download anyone else's.
 */
export async function GET(request: NextRequest) {
  const report = await loadReport(Object.fromEntries(request.nextUrl.searchParams));
  const bytes = await renderReportPdf({
    title: REPORT_TITLE[report.kind],
    label: report.label,
    from: report.from,
    to: report.to,
    currency: report.currency,
    generatedOn: report.today,
    money: report.money,
    investments: report.investments,
    notes: report.notes,
  });

  // A Buffer, which a Response takes as a body in every runtime this is built for.
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${reportFileName(report, "pdf")}"`,
      // Someone's whole financial position: never kept by a cache along the way.
      "cache-control": "private, no-store",
    },
  });
}
