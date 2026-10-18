"use client";
import { useText } from "@/components/useText";

/**
 * Opens the quick entry form on this page, the way a home-screen shortcut opens
 * it on launch — so the phone guide can show what the shortcut does before
 * anyone adds one. Uses the event `QuickEntry` already listens for.
 */
export default function TryQuickEntry({ kind, label }: { kind: "expense" | "income"; label: string }) {
  const uiText = useText();
  return (
    <button
      type="button"
      className="btn"
      onClick={() => window.dispatchEvent(new CustomEvent("money-os:quick-entry", { detail: kind }))}
    >
      {uiText(label ?? "")}
    </button>
  );
}
