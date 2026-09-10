import Link from "next/link";
import ExternalResearchLinks from "@/components/ExternalResearchLinks";
import { tagLabel } from "@/lib/portfolio/tags";
import { getAssetInfo, saveAssetNote } from "@/actions/assetInfo";
import { Bare, Money } from "@/components/PrivacyContext";

export default async function AssetInfoPage({ params, searchParams }: { params: Promise<{ symbol: string }>; searchParams: Promise<{ type?: string; name?: string }> }) {
  const { symbol: raw } = await params;
  const { type, name } = await searchParams;
  const symbol = raw.trim();
  const assetType = type || null;
  const info = await getAssetInfo(symbol);
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs text-[var(--muted)]">Asset information</div>
          <h1 className="text-xl font-semibold">{symbol}</h1>
          <p className="text-xs text-[var(--muted)] mt-1">{tagLabel(assetType, "assetType") ?? "Asset type not set"}</p>
        </div>
        <Link href="/investments" className="btn">Back to holdings</Link>
      </div>
      <ExternalResearchLinks assetType={assetType} symbol={symbol} name={name} />
      <div className="card p-4 space-y-3">
        <div className="text-sm font-medium">Holding information</div>
        {info.entries.length === 0 && <p>No recorded average price for this asset.</p>}
        {info.entries.map(entry => <div key={entry.id} className="text-sm">
          <div>{entry.account}</div>
          <div>Quantity: <Bare value={entry.quantity} /></div>
          <div>Average price: {entry.averagePrice === null ? 'Not reported' : entry.currency === 'broker quote units' ? <><Bare value={entry.averagePrice} /> broker quote units</> : <Money value={entry.averagePrice} currency={entry.currency} />}</div>
        </div>)}
        <form action={saveAssetNote} className="space-y-2">
          <input type="hidden" name="symbol" value={symbol} />
          <textarea name="note" defaultValue={info.note} className="input w-full" rows={4} aria-label="Asset notes" maxLength={20000} placeholder="Write your notes about this asset…" />
          <button type="submit" className="btn">Save notes</button>
        </form>
      </div>
      <div className="card p-4 text-xs text-[var(--muted)]">
        External pages provide market data, yields and research. They are informational only and do not change your stored holdings or portfolio calculations.
      </div>
    </div>
  );
}
