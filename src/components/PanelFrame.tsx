"use client";

import { useText } from "@/components/useText";
import { useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { panelChoice, panelStorageKey, panelStoragePrefix, panelValue, startsCollapsed } from "@/lib/ui/panels";
import { useMobileMode } from "./MobileMode";
import { readPanelChoice, usePanelChoice, usePanelsReady, writePanelChoice } from "./panelChoices";

export default function PanelFrame({ as: Element = "div", persistKey, title, titleTranslate, summary, defaultOpen = true, essential = false, preferenceVersion, children, className, contentClassName, ...props }:
  HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "article"; persistKey: string; title?: string; summary?: ReactNode; defaultOpen?: boolean;
    /** Open on a phone too. Without it, a phone opens this panel only when asked. */
    essential?: boolean;
    /** User-supplied headings, such as playlist names, must not be translated. */
    titleTranslate?: "yes" | "no";
    /** Saving account settings supersedes choices made against an older version. */
    preferenceVersion?: string;
    /** Spacing belongs on the content element, which may use display:contents. */
    contentClassName?: string }) {
  const uiText = useText();
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { simple, phone } = useMobileMode();
  const bodyId = useId();
  const key = panelStorageKey(pathname, persistKey, simple);
  const saved = usePanelChoice(key, { prefix: panelStoragePrefix(pathname, persistKey), simple });
  const collapsed = startsCollapsed({ saved, defaultOpen, phone, essential, preferenceVersion });
  const ready = usePanelsReady();
  const [label, setLabel] = useState(title ?? "Panel");

  useEffect(() => {
    const content = root.current?.querySelector("[data-panel-content]");
    const heading = content?.querySelector("h1,h2,h3,h4,h5,h6,.font-medium,.uppercase");
    setLabel(title ?? (heading?.textContent?.trim().slice(0, 80) || "Panel"));
  }, [pathname, persistKey, title, uiText]);

  useEffect(() => {
    if (saved === null || saved === "") return;
    const choice = panelChoice(saved, defaultOpen, preferenceVersion);
    // Migrate actual old choices only. An outdated tab must never clear a
    // choice made against newer settings in another tab.
    if (choice !== null && (saved !== choice || readPanelChoice(key) === null)) writePanelChoice(key, choice);
  }, [key, saved, defaultOpen, preferenceVersion]);

  useEffect(() => {
    const handle = (event: Event) => {
      const value = (event as CustomEvent<boolean>).detail;
      if (typeof value === "boolean") writePanelChoice(key, panelValue(value, defaultOpen, preferenceVersion));
    };
    window.addEventListener("money-os:panels", handle);
    return () => window.removeEventListener("money-os:panels", handle);
  }, [key, defaultOpen, preferenceVersion]);

  function toggle() {
    writePanelChoice(key, panelValue(!collapsed, defaultOpen, preferenceVersion));
  }

  return <Element {...props} ref={root} className={`${className ?? "card"} panel-frame`} data-panel-collapsed={collapsed}
    data-panel-ready={ready} data-panel-essential={essential || undefined}>
    <button type="button" className="panel-toggle" aria-label={`${collapsed ? uiText("Expand panel") : uiText("Minimize panel")}: ${titleTranslate === "no" ? label : uiText(label)}`}
      aria-expanded={!collapsed} aria-controls={bodyId} title={collapsed ? uiText("Expand panel") : uiText("Minimize panel")} onClick={toggle}>
      <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
    </button>
    {(title || collapsed) && <div className="panel-heading text-sm font-medium pr-8"><button type="button" className="panel-heading-button" onClick={toggle} aria-expanded={!collapsed} aria-controls={bodyId}><span translate={titleTranslate}>{titleTranslate === "no" ? title ?? label : uiText(title ?? label)}</span></button>{summary && <span className="panel-summary ml-3 text-xs text-[var(--muted)]">{typeof summary === "string" ? uiText(summary) : summary}</span>}</div>}
    <div id={bodyId} data-panel-content="" className={contentClassName}
      style={{ display: collapsed ? "none" : contentClassName ? "block" : "contents" }}>
      {children}
    </div>
  </Element>;
}
