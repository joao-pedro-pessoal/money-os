import { externalAssetLinks } from "@/lib/portfolio/externalLinks";

export default function ExternalResearchLinks({ assetType, symbol, name, compact = false }: { assetType?: string | null; symbol: string; name?: string | null; compact?: boolean }) {
  const links = externalAssetLinks(assetType, symbol, name);
  return (
    <div className={compact ? "flex flex-wrap gap-1" : "card p-4"}>
      {!compact && <><div className="text-sm font-medium mb-1">External research</div><p className="text-xs text-[var(--muted)] mb-3">Reference sites for rates, prices, yields and fundamentals. These links do not change the app&apos;s calculations.</p></>}
      <div className="flex flex-wrap gap-2">
        {links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="btn text-xs">{link.label} ↗</a>)}
      </div>
    </div>
  );
}
