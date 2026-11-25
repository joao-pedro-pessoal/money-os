import type { NextRequest } from "next/server";
import { loadReport } from "@/actions/reports";
import { REPORT_TITLE, reportFileName } from "@/lib/reports/document";
import { renderReportPdf } from "@/lib/reports/pdf";
import { textForRequest } from "@/actions/pageLanguage";
import { currentLanguage } from "@/actions/language";
import { reportFonts } from "@/actions/reportFonts";
import { hasSession } from "@/actions/session";
import { withWork } from "@/actions/workGate";
import { readFailure, readJson } from "@/actions/readHttp";
import { checkReportOutput, checkReportSource, pdfLimits } from "@/actions/reportLimits";
import { pdfRequest, ReportLimitError } from "@/lib/reports/request";
import { localDay } from "@/lib/calendar/localDay";
import { readText } from "@/lib/accounts/readText";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The report as a PDF, drawn here rather than printed by the browser.
 *
 * Takes the report page's own address parameters and reads them through the
 * same `loadReport`, so the file holds the figures the page shows. Behind the
 * session like every page (src/proxy.ts), and the database only ever answers
 * with the signed-in person's rows, so nobody can download anyone else's.
 */
export async function GET(request: NextRequest) {
  if (!(await hasSession())) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const limits = pdfLimits();
    const params = pdfRequest(request.nextUrl.searchParams, localDay(), limits.days);
    return await withWork("pdf", async () => {
      await checkReportSource(params, limits.sourceRows);
      const report = await loadReport(params);
      checkReportOutput(report, limits.renderRows);
      const translate = await textForRequest();
      const language = await currentLanguage();
      const fonts = await reportFonts(language);
      const bytes = await renderReportPdf({
        title: translate(REPORT_TITLE[report.kind]),
        label: translate(report.label),
        translate,
        language,
        fonts,
        from: report.from,
        to: report.to,
        currency: report.currency,
        generatedOn: report.today,
        money: report.money,
        investments: report.investments,
        notes: report.notes,
      });
      if (bytes.byteLength > limits.bytes) throw new ReportLimitError("rows");

      return new Response(Buffer.from(bytes), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${reportFileName(report, "pdf")}"`,
          "cache-control": "private, no-store",
        },
      });
    });
  } catch (error) {
    if (error instanceof ReportLimitError) {
      const text = readText(await currentLanguage());
      return readJson({ error: `pdf_${error.reason}`, message: error.reason === "invalid" ? text.invalid : error.reason === "range" ? text.pdfRange : text.pdfRows }, error.reason === "invalid" ? 400 : 413);
    }
    return readFailure(error, "pdf");
  }
}
