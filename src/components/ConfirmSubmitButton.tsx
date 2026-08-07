"use client";

export default function ConfirmSubmitButton({
  label,
  confirmMessage,
  variant = "danger",
}: {
  label: string;
  confirmMessage: string;
  variant?: "danger" | "default";
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
      className={variant === "danger" ? "text-xs text-[var(--red)] hover:underline" : "text-xs text-[var(--accent)] hover:underline"}
    >
      {label}
    </button>
  );
}
