"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchAssets } from '@/actions/assetSearch';
import type { AssetSuggestion } from '@/lib/quotes/assetSearch';

export default function AssetSearch({ navigate = false }: { navigate?: boolean }) {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [results, setResults] = useState<AssetSuggestion[]>([]);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<AssetSuggestion | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(-1);
  const sequence = useRef(0);
  const id = useId();
  const router = useRouter();
  useEffect(() => {
    const generation = ++sequence.current;
    if (!expanded || query.trim().length < 2 || selected) return;
    // A flag per run rather than bumping the shared counter in cleanup: the
    // counter still lets choose() invalidate a search in flight, and this covers
    // unmount and a changed query without the cleanup reading a ref that may
    // have moved on by the time it runs.
    let cancelled = false;
    const stale = () => cancelled || generation !== sequence.current;
    const timer = setTimeout(async () => {
      setMessage('Searching…');
      try {
        const response = await searchAssets(query);
        if (stale()) return;
        setResults(response.results); setActive(-1);
        setMessage(response.warning ?? (response.results.length ? '' : 'No matches. You can type the ticker manually.'));
      } catch { if (!stale()) setMessage('Search unavailable. You can type the ticker manually.'); }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, expanded, selected]);
  function choose(asset: AssetSuggestion) {
    sequence.current++; setSelected(asset); setQuery(asset.symbol); setName(asset.name); setExpanded(false); setResults([]); setMessage('');
    if (navigate) router.push(`/investments/asset/${encodeURIComponent(asset.symbol)}?${new URLSearchParams({ name: asset.name, ...(asset.assetType ? { type: asset.assetType } : {}) })}`);
  }
  return <div className="space-y-2 relative" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setExpanded(false); }}>
    <label className="block text-xs">{navigate ? 'Find an asset' : 'Asset name, ticker or ISIN'}
      <input role="combobox" aria-autocomplete="list" aria-expanded={expanded && results.length > 0} aria-controls={`${id}-results`}
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} autoComplete="off" name={navigate ? undefined : 'symbol'}
        className="input w-full mt-1" required={!navigate} value={query} placeholder="e.g. Apple, BTC, S&P 500, IE00B5BMR087"
        onFocus={() => setExpanded(true)} onChange={e => { setQuery(e.target.value); setSelected(null); setResults([]); setMessage(''); setActive(-1); setExpanded(true); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setExpanded(false); setActive(-1); }
          if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
          if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
          if (e.key === 'Enter' && expanded && active >= 0 && results[active]) { e.preventDefault(); choose(results[active]); }
        }} />
    </label>
    {expanded && results.length > 0 && <ul id={`${id}-results`} role="listbox" aria-label="Asset suggestions" className="border rounded max-h-64 overflow-y-auto" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      {results.map((r, i) => <li key={r.symbol} role="option" aria-selected={i === active} id={`${id}-${i}`}>
        <button type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => choose(r)} className="block w-full text-left p-2 text-xs hover:bg-[var(--surface-2)]"
          style={{ background: i === active ? 'var(--surface-2)' : undefined }}>
          <strong>{r.symbol}</strong> · {r.name}<span className="block text-[var(--muted)]">{r.assetType ?? 'Unclassified'} · {r.exchange ?? 'Exchange not reported'} · {r.source}</span>
        </button>
      </li>)}
    </ul>}
    <div role="status" className="text-xs text-[var(--muted)]">{message}</div>
    {selected && !navigate && <p className="text-xs text-[var(--muted)]">Selected: {selected.symbol} · {selected.exchange ?? 'Exchange not reported'}. Check the asset type and currency below.</p>}
    {!navigate && <input name="name" aria-label="Asset name" value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)" className="input w-full" />}
  </div>;
}
