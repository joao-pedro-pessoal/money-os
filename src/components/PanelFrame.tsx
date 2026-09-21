"use client";

import { useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { panelValue, startsCollapsed } from '@/lib/ui/panels';
import { useMobileMode } from './MobileMode';

export default function PanelFrame({ as: Element = 'div', persistKey, title, summary, defaultOpen = true, essential = false, children, className, contentClassName, ...props }:
  HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article'; persistKey: string; title?: string; summary?: ReactNode; defaultOpen?: boolean;
    /** Open on a phone too. Without it, a phone opens this panel only when asked — see startsCollapsed. */
    essential?: boolean;
    /** Spacing between the children goes here, never in `className` — see the content element below. */
    contentClassName?: string }) {
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
    const collapsedNow = startsCollapsed({ saved, defaultOpen, phone, essential });
    setCollapsed(collapsedNow);
    // Written back with what this reading was based on, so the next change of
    // a setting that decides `defaultOpen` is noticed instead of being
    // outvoted by an older answer.
    try { localStorage.setItem(storageKey.current, panelValue(collapsedNow, defaultOpen)); } catch { /* Storage is optional. */ }
    setReady(true);
    const handle = (event: Event) => {
      const value = (event as CustomEvent<boolean>).detail;
      if (typeof value !== 'boolean') return;
      setCollapsed(value);
      try { localStorage.setItem(storageKey.current, panelValue(value, defaultOpen)); } catch { /* Storage is optional. */ }
    };
    window.addEventListener('money-os:panels', handle);
    return () => window.removeEventListener('money-os:panels', handle);
  }, [pathname, persistKey, title, defaultOpen, essential, simple, phone]);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storageKey.current, panelValue(next, defaultOpen)); } catch { /* Still usable without storage. */ }
  }
  return <Element {...props} ref={root} className={`${className ?? 'card'} panel-frame`} data-panel-collapsed={collapsed}
    data-panel-ready={ready} data-panel-essential={essential || undefined}>
    <button type="button" className="panel-toggle" aria-label={`${collapsed ? 'Expand' : 'Minimize'}: ${label}`}
      aria-expanded={!collapsed} aria-controls={bodyId} title={collapsed ? 'Expand panel' : 'Minimize panel'} onClick={toggle}>
      <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
    </button>
    {(title || collapsed) && <div className="panel-heading text-sm font-medium pr-8"><button type="button" className="panel-heading-button" onClick={toggle} aria-expanded={!collapsed} aria-controls={bodyId}>{title ?? label}</button>{summary && <span className="panel-summary ml-3 text-xs text-[var(--muted)]">{summary}</span>}</div>}
    {/* `display: contents` is what lets a panel wrap a grid without becoming a
        box in the middle of it — and it is also why a spacing class on the card
        does nothing: `.space-y-8 > *` matches this wrapper, which has no box to
        put a margin on. Spacing between the children belongs here, on the
        element they are actually the children of. */}
    <div id={bodyId} data-panel-content="" className={contentClassName}
      style={{ display: collapsed ? 'none' : contentClassName ? 'block' : 'contents' }}>
      {children}
    </div>
  </Element>;
}
