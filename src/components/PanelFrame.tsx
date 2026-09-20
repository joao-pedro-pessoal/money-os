"use client";

import { useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { panelChoice, panelValue } from '@/lib/panels';

export default function PanelFrame({ as: Element = 'div', persistKey, title, summary, defaultOpen = true, children, className, contentClassName, ...props }:
  HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article'; persistKey: string; title?: string; summary?: ReactNode; defaultOpen?: boolean; contentClassName?: string }) {
  // Typed as the div the JSX union resolves to; section and article are both
  // HTMLElement subtypes, and the only use here is querySelector.
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const bodyId = useId();
  const [collapsed, setCollapsed] = useState(!defaultOpen);
  const [label, setLabel] = useState(title ?? 'Panel');
  const storageKey = useRef('');
  useEffect(() => {
    const content = root.current?.querySelector('[data-panel-content]');
    const heading = content?.querySelector('h1,h2,h3,h4,h5,h6,.font-medium,.uppercase');
    const nextLabel = title ?? heading?.textContent?.trim().slice(0, 80) ?? 'Panel';
    setLabel(nextLabel || 'Panel');
    storageKey.current = `money-os:panel:${pathname}:${persistKey}:${nextLabel}`;
    try {
      // The choice is read against what this page is saying now: a panel the
      // reader minimized before changing the setting that opens it is not an
      // answer about the setting they have since changed. See lib/panels.
      const choice = panelChoice(localStorage.getItem(storageKey.current), defaultOpen);
      setCollapsed(choice.collapsed);
      localStorage.setItem(storageKey.current, choice.store);
    } catch { setCollapsed(!defaultOpen); }
    const handle = (event: Event) => {
      const value = (event as CustomEvent<boolean>).detail;
      if (typeof value !== 'boolean') return;
      setCollapsed(value);
      try { localStorage.setItem(storageKey.current, panelValue(value, defaultOpen)); } catch { /* Storage is optional. */ }
    };
    window.addEventListener('money-os:panels', handle);
    return () => window.removeEventListener('money-os:panels', handle);
  }, [pathname, persistKey, title, defaultOpen]);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storageKey.current, panelValue(next, defaultOpen)); } catch { /* Still usable without storage. */ }
  }
  return <Element {...props} ref={root} className={`${className ?? 'card'} panel-frame`} data-panel-collapsed={collapsed}>
    <button type="button" className="panel-toggle" aria-label={`${collapsed ? 'Expand' : 'Minimize'}: ${label}`}
      aria-expanded={!collapsed} aria-controls={bodyId} title={collapsed ? 'Expand panel' : 'Minimize panel'} onClick={toggle}>
      <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
    </button>
    {(title || collapsed) && <div className="panel-heading text-sm font-medium pr-8">{title ?? label}{summary && <span className="ml-3 text-xs text-[var(--muted)]">{summary}</span>}</div>}
    {/* `display: contents` is what lets a panel wrap a grid without becoming a
        box in the middle of it — and it is also why a spacing class on the
        card does nothing: `.space-y-8 > *` matches this wrapper, which has no
        box to put a margin on. Spacing between the children belongs here, on
        the element they are actually the children of. */}
    <div id={bodyId} data-panel-content="" className={contentClassName}
      style={{ display: collapsed ? 'none' : contentClassName ? 'block' : 'contents' }}>
      {children}
    </div>
  </Element>;
}
