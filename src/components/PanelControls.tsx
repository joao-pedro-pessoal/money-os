"use client";

export default function PanelControls() {
  const set = (collapsed: boolean) => window.dispatchEvent(new CustomEvent('money-os:panels', { detail: collapsed }));
  return <div className="flex justify-end flex-wrap gap-3 text-xs text-[var(--muted)] mb-3" aria-label="Page panels">
    <button type="button" className="hover:underline" onClick={() => set(true)}>Minimize panels</button>
    <button type="button" className="hover:underline" onClick={() => set(false)}>Expand panels</button>
  </div>;
}
