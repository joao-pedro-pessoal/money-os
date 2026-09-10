"use client";
import { useState, useTransition } from "react";
import { setTradeClassification } from "@/actions/investmentActivity";
import { TRADE_CLASSIFICATION_FIELDS } from "@/lib/trading/classification";
import { annualYieldLabel, tagLabel } from "@/lib/portfolio/tags";
import type { TradeHistoryRow } from "@/lib/trading/filter";

export default function TradeRowTags({ id, classification: c, playlists }: {
  id: string; classification: TradeHistoryRow['classification']; playlists: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [assetType, setAssetType] = useState(c?.assetType ?? "");
  const rateLabel = annualYieldLabel(assetType);
  return <details className="min-w-48 whitespace-normal">
    <summary className="cursor-pointer text-[var(--accent)]">{c ? 'Edit tags' : 'Add tags'}</summary>
    {c && <p className="text-xs">{[tagLabel(c.riskLevel, 'risk'), tagLabel(c.timeHorizon, 'timeHorizon'), c.playlistName].filter(Boolean).join(' / ')}</p>}
    <form action={(data) => startTransition(async () => {
      setMessage("");
      try { await setTradeClassification(data); setMessage("Saved"); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
    })} className="space-y-2 mt-2">
      <input type="hidden" name="activityId" value={id} />
      {TRADE_CLASSIFICATION_FIELDS.map(field => <label key={field.name} className="block text-xs">
        {field.label}
        <select name={field.name} aria-label={field.label} className="input text-xs"
          {...(field.name === 'assetType' ? { value: assetType, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setAssetType(e.target.value) } : { defaultValue: c?.[field.name] ?? '' })}>
          <option value="">Unset</option>
          {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>)}
      {rateLabel && <label className="block text-xs">{rateLabel}<input name="apr" type="number" min="0" max="99999" step="0.001" defaultValue={c?.apr ?? ''} className="input" /></label>}
      <label className="block text-xs">Playlist<select name="playlistId" aria-label="Playlist" defaultValue={c?.playlistId ?? ''} className="input text-xs"><option value="">None</option>{playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="block text-xs">Notes<textarea name="notes" aria-label="Trade notes" maxLength={10000} defaultValue={c?.notes ?? ''} className="input" /></label>
      <button type="submit" disabled={pending} className="btn text-xs">{pending ? 'Saving...' : 'Save'}</button>
      <span role="status" className="block text-xs">{message}</span>
      <p className="text-xs text-[var(--muted)]">Applies only to this trade.</p>
    </form>
  </details>;
}
