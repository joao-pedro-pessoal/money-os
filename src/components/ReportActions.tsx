"use client";

import { useEffect, useState } from "react";

/**
 * Download the report as CSV, or print it — which is also how it becomes a PDF.
 *
 * The CSV goes through a blob link like every other export, so the Android app
 * saves it to Downloads. Printing is hidden inside that app: a WebView has no
 * print dialog, and a button that does nothing is worse than no button.
 */
export default function ReportActions({ csv, filename }: { csv: string; filename: string }) {
  const [canPrint, setCanPrint] = useState(false);

  useEffect(() => {
    // Read once in the browser; the server cannot know where the page runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanPrint(!("MoneyOSAndroid" in window));
  }, []);

  function download() {
    // A byte-order mark so a spreadsheet opens accented names correctly.
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="report-actions flex gap-2 flex-wrap">
      <button type="button" className="btn" onClick={download}>
        Download CSV
      </button>
      {canPrint && (
        <button type="button" className="btn" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      )}
    </div>
  );
}
