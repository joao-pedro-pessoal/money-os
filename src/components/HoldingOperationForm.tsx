"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { submitHoldingOperation, type HoldingOperation, type HoldingOperationResult } from "@/actions/investments";
import { newQuickEntryId } from "@/lib/money/quickEntryId";
import { useText } from "./useText";

type Props = { kind: HoldingOperation; children: ReactNode; fieldsClassName?: string };

export default function HoldingOperationForm(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <OperationAttempt key={attempt} {...props} restart={() => setAttempt(n => n + 1)} />;
}

function OperationAttempt({ kind, children, fieldsClassName = "space-y-3", restart }: Props & { restart: () => void }) {
  const uiText = useText();
  const request = useRef("");
  const [dirty, setDirty] = useState(false);
  const [result, action, pending] = useActionState<HoldingOperationResult, FormData>(async (_, form) => {
    let next: HoldingOperationResult;
    try {
      request.current ||= newQuickEntryId();
      form.set("requestId", request.current);
      next = await submitHoldingOperation(kind, form);
    } catch {
      next = { error: "Connection interrupted. Retry with the same details; a recorded operation will not be duplicated." };
    }
    setDirty(false);
    return next;
  }, {});

  return <form action={action} onReset={event => event.preventDefault()} onChange={() => setDirty(true)} aria-busy={pending}>
    <fieldset disabled={pending || result.saved} className={fieldsClassName}>{children}</fieldset>
    {pending && <p role="status" className="text-xs mt-2">{uiText("Saving…")}</p>}
    {!pending && !dirty && result.error && <p role="alert" className="text-xs text-[var(--red)] mt-2">{uiText(result.error)}</p>}
    {result.saved && <>
      <p role="status" className="text-xs text-[var(--green)] mt-2">{uiText("Operation recorded.")}</p>
      <button type="button" className="btn w-full mt-2" onClick={restart}>{uiText("Record another operation")}</button>
    </>}
  </form>;
}
