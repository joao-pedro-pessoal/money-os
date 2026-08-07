"use client";

import { useState } from "react";
import Papa from "papaparse";
import { importCsvRows } from "@/actions/imports";

export default function CsvImportForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [result, setResult] = useState<{ created: number; duplicated: number; ignored: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !accountId) return;
    setBusy(true);
    setResult(null);
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data.map((r) => ({
      date: r.date ?? r.Date ?? r.Data ?? "",
      amount: r.amount ?? r.Amount ?? r.Montante ?? "0",
      description: r.description ?? r.Description ?? r["Descrição"] ?? "",
    }));
    const res = await importCsvRows(accountId, file.name, rows);
    setResult(res);
    setBusy(false);
    e.target.value = "";
  }

  return (
    <div className="space-y-3">
      <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input type="file" accept=".csv" onChange={handleFile} disabled={busy} className="text-sm" />
      <p className="text-xs text-[var(--muted)]">
        Expects columns date/amount/description (or Data/Montante/Descrição). Duplicates are detected by
        date+amount+description and skipped automatically.
      </p>
      {busy && <p className="text-xs text-[var(--muted)]">Importing…</p>}
      {result && (
        <p className="text-xs text-[var(--green)]">
          Imported {result.created}, skipped {result.duplicated} duplicates, ignored {result.ignored} invalid rows.
        </p>
      )}
    </div>
  );
}
