"use client";

import { useText } from "@/components/useText";
import { exportAllData } from "@/actions/export";

export default function ExportButton() {
  const uiText = useText();
  async function handleExport() {
    const json = await exportAllData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `money-os-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={handleExport} className="btn">{uiText("Export all data (JSON)")}</button>
  );
}
