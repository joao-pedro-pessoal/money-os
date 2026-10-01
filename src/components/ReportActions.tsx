"use client";

import { useState } from "react";

/**
 * Download the report as CSV or as a PDF the app draws itself.
 *
 * Both go through a blob link like every other export, so the Android app
 * saves them to Downloads: its WebView has no print dialog, which is why the
 * PDF used to be missing there. The PDF is fetched from `/api/report/pdf` with
 * the page's own parameters, so it holds the figures on the screen.
 */
export default function ReportActions({
  csv,
  filename,
  pdfHref,
  pdfFilename,
}: {
  csv: string;
  filename: string;
  pdfHref: string;
  pdfFilename: string;
}) {
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState(false);

  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsv() {
    // A byte-order mark so a spreadsheet opens accented names correctly.
    save(new Blob(["﻿" + csv], { type: "text/csv" }), filename);
  }

  async function downloadPdf() {
    setMaking(true);
    setFailed(false);
    try {
      const response = await fetch(pdfHref, { cache: "no-store" });
      // A session that ended answers with the login page, which is not a PDF.
      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
        throw new Error(`No PDF: ${response.status}`);
      }
      save(await response.blob(), pdfFilename);
    } catch {
      setFailed(true);
    } finally {
      setMaking(false);
    }
  }

  return (
    <div className="report-actions flex gap-2 flex-wrap items-center">
      <button type="button" className="btn" onClick={downloadCsv}>
        Download CSV
      </button>
      <button type="button" className="btn" onClick={downloadPdf} disabled={making} aria-busy={making}>
        {making ? "Making the PDF…" : "Download PDF"}
      </button>
      {failed && (
        <span className="text-xs text-[var(--red)]" role="alert">
          The PDF could not be made. Reload the page and try again.
        </span>
      )}
    </div>
  );
}
