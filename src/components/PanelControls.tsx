"use client";

import { useText } from "@/components/useText";
import MobileFold from "./MobileFold";

export default function PanelControls() {
  const uiText = useText();
  const set = (collapsed: boolean) => window.dispatchEvent(new CustomEvent('money-os:panels', { detail: collapsed }));
  return <MobileFold simpleOnly title="Panel settings" persistKey="panel-controls"><div className="panel-controls flex justify-end flex-wrap gap-3 text-xs text-[var(--muted)] mb-3" aria-label={uiText("Page panels")}>
    <button type="button" className="hover:underline" onClick={() => set(true)}>{uiText("Minimize panels")}</button>
    <button type="button" className="hover:underline" onClick={() => set(false)}>{uiText("Expand panels")}</button>
  </div></MobileFold>;
}
