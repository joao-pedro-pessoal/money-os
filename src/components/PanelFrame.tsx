"use client";

import { useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { startsCollapsed } from '@/lib/ui/panels';
import { useMobileMode } from './MobileMode';

export default function PanelFrame({ as: Element = 'div', persistKey, title, summary, defaultOpen = true, essential = false, children, className, ...props }:
  HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article'; persistKey: string; title?: string; summary?: ReactNode; defaultOpen?: boolean;
    /** Open on a phone too. Without it, a phone opens this panel only when asked — see startsCollapsed. */
    essential?: boolean }) {
  // Typed as the div the JSX union resolves to; section and article are both
  // HTMLElement subtypes, and the only use here is querySelector.
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { simple, phone } = useMobileMode();
  const bodyId = useId();
  const [collapsed, setCollapsed] = useState(!defaultOpen);
  // Until the saved choice and the screen width have been read, a phone keeps a
  // non-essential panel's content hidden (see globals.css), so it does not open
  // and then snap shut on every page load.
  const [ready, setReady] = useState(false);
  const [label, setLabel] = useState(title ?? 'Panel');
  const storageKey = useRef('');
  useEffect(() => {
    const content = root.current?.querySelector('[data-panel-content]');
    const heading = content?.querySelector('h1,h2,h3,h4,h5,h6,.font-medium,.uppercase');
    const nextLabel = title ?? heading?.textContent?.trim().slice(0, 80) ?? 'Panel';
    setLabel(nextLabel || 'Panel');
    storageKey.current = `money-os:panel:${pathname}:${persistKey}:${nextLabel}${simple ? ':simple' : ''}`;
    let saved: string | null = null;
    try { saved = localStorage.getItem(storageKey.current); } catch { /* Storage is optional. */ }
    setCollapsed(startsCollapsed({ saved, defaultOpen, phone, essential }));
    setReady(true);
    const handle = (event: Event) => {
      const value = (event as CustomEvent<boolean>).detail;
      if (typeof value !== 'boolean') return;
      setCollapsed(value);
      try { localStorage.setItem(storageKey.current, value ? 'closed' : 'open'); } catch { /* Storage is optional. */ }
    };
    window.addEventListener('money-os:panels', handle);
    return () => window.removeEventListener('money-os:panels', handle);
  }, [pathname, persistKey, title, defaultOpen, essential, simple, phone]);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storageKey.current, next ? 'closed' : 'open'); } catch { /* Still usable without storage. */ }
  }
  return <Element {...props} ref={root} className={`${className ?? 'card'} panel-frame`} data-panel-collapsed={collapsed}
    data-panel-ready={ready} data-panel-essential={essential || undefined}>
    <button type="button" className="panel-toggle" aria-label={`${collapsed ? 'Expand' : 'Minimize'}: ${label}`}
      aria-expanded={!collapsed} aria-controls={bodyId} title={collapsed ? 'Expand panel' : 'Minimize panel'} onClick={toggle}>
      <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
    </button>
    {(title || collapsed) && <div className="panel-heading text-sm font-medium pr-8"><button type="button" className="panel-heading-button" onClick={toggle} aria-expanded={!collapsed} aria-controls={bodyId}>{title ?? label}</button>{summary && <span className="panel-summary ml-3 text-xs text-[var(--muted)]">{summary}</span>}</div>}
    <div id={bodyId} data-panel-content="" style={{ display: collapsed ? 'none' : 'contents' }}>
      {children}
    </div>
  </Element>;
}
