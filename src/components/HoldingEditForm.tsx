"use client";

import { useActionState, useState, type ReactNode } from "react";
import { submitHoldingEdit, type HoldingEditResult } from "@/actions/investments";
import { useText } from "./useText";

/** Preserve all input values on validation or transport errors, including selected options. */
export default function HoldingEditForm({ children }: { children: ReactNode }) {
  const uiText = useText();
  const [dirty, setDirty] = useState(false);
  const [result, action, pending] = useActionState<HoldingEditResult, FormData>(async (previous, form) => {
    let next: HoldingEditResult;
    try { next = await submitHoldingEdit(previous, form); }
    catch { next = { error: "Could not confirm the save. Reload to check the position before retrying." }; }
    setDirty(false);
    return next;
  }, {});
  return <form action={action} onReset={event => event.preventDefault()} onChange={() => setDirty(true)} aria-busy={pending}>
    <fieldset disabled={pending} className="space-y-3">{children}</fieldset>
    {pending && <p role="status" className="text-xs mt-2">{uiText("Saving…")}</p>}
    {!pending && !dirty && result.error && <p role="alert" className="text-xs text-[var(--red)] mt-2">{uiText(result.error)}</p>}
    {!pending && !dirty && result.saved && <p role="status" className="text-xs text-[var(--green)] mt-2">{uiText("Position saved.")}</p>}
  </form>;
}
