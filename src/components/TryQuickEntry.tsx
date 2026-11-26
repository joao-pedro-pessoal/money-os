"use client";
import { useText } from "@/components/useText";
import PhoneIcon from "./PhoneIcon";
import type { PhoneIconName } from "@/lib/ui/phoneIcons";

/**
 * Opens the quick entry form on this page, the way a home-screen shortcut opens
 * it on launch — so the phone guide can show what the shortcut does before
 * anyone adds one. Uses the event `QuickEntry` already listens for. With an
 * icon it is one of the round buttons on the phone's home screen (F30).
 */
export default function TryQuickEntry({ kind, label, className = "btn", icon }: { kind: "expense" | "income" | "transfer"; label: string; className?: string; icon?: PhoneIconName }) {
  const uiText = useText();
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent("money-os:quick-entry", { detail: kind }))}
    >
      {icon && <span className="ph-action-icon"><PhoneIcon name={icon} size={22} strokeWidth={2} /></span>}
      {uiText(label ?? "")}
    </button>
  );
}
