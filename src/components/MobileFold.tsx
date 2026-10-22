"use client";

import { useText } from "@/components/useText";
import { useEffect, useId, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { foldStorageKey, PHONE_QUERY } from "@/lib/ui/panels";
import { useMobileMode } from "./MobileMode";
import { usePanelChoice, writePanelChoice } from "./panelChoices";

/** A normal block on a computer, with an explicit local choice on a phone. */
export default function MobileFold({ title, persistKey, className, children, simpleOnly = false }: {
  title: string;
  persistKey: string;
  className?: string;
  children: ReactNode;
  /** Fold only in the simple phone mode; preserve the layout elsewhere. */
  simpleOnly?: boolean;
}) {
  const uiText = useText();
  const pathname = usePathname();
  const { simple, phone } = useMobileMode();
  const bodyId = useId();
  const key = foldStorageKey(pathname, persistKey, simple);
  const open = usePanelChoice(key) === "open";

  useEffect(() => {
    if (!phone || (simpleOnly && !simple)) return;
    const handle = (event: Event) => {
      // CSS changes width before React's media-query subscription commits.
      if (!window.matchMedia(PHONE_QUERY).matches) return;
      const collapsed = (event as CustomEvent<boolean>).detail;
      if (typeof collapsed === "boolean") writePanelChoice(key, collapsed ? "closed" : "open");
    };
    window.addEventListener("money-os:panels", handle);
    return () => window.removeEventListener("money-os:panels", handle);
  }, [key, phone, simple, simpleOnly]);

  return (
    <div className="mobile-fold" data-open={open} data-simple-only={simpleOnly || undefined}>
      <button type="button" className="mobile-fold-toggle card" aria-expanded={open} aria-controls={bodyId}
        onClick={() => writePanelChoice(key, open ? "closed" : "open")}>
        <span>{uiText(title ?? "")}</span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      <div id={bodyId} className={`mobile-fold-body ${className ?? ""}`}>{children}</div>
    </div>
  );
}
