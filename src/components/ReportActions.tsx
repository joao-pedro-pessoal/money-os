"use client";

import { useText } from "@/components/useText";
import { useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";
import { readText } from "@/lib/accounts/readText";
import { reportDownload } from "./reportDownload";

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
  const uiText = useText();
  const { language } = useLanguage();
  const text = readText(language);
  const pending = useRef(false);
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState("");

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
    if (pending.current) return;
    pending.current = true;
    setMaking(true);
    setFailed("");
    try {
      save(await reportDownload(pdfHref, language), pdfFilename);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : text.pdfFailed);
    } finally {
      pending.current = false;
      setMaking(false);
    }
  }

  return (
    <div className="report-actions flex gap-2 flex-wrap items-center">
      <button type="button" className="btn" onClick={downloadCsv}>{uiText("Download CSV")}</button>
      <button type="button" className="btn" onClick={downloadPdf} disabled={making} aria-busy={making}>
        {making ? uiText("Making the PDF…") : uiText("Download PDF")}
      </button>
      {failed && (
        <span className="text-xs text-[var(--red)]" role="alert">{failed}</span>
      )}
    </div>
  );
}
