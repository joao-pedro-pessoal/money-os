"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { newQuickEntryId } from "@/lib/money/quickEntryId";
import { MANUAL_RETRY_MESSAGE, type ManualEntryResult } from "@/lib/money/manualRequest";
import { useText } from "./useText";

type Props = { action: (form: FormData) => Promise<ManualEntryResult>; children: ReactNode; className?: string; fieldsClassName?: string };
export default function RetryableForm(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <EntryAttempt key={attempt} {...props} restart={() => setAttempt(n => n + 1)} />;
}

function EntryAttempt({action: save, children, className, fieldsClassName = "space-y-3", restart}: Props & {restart: () => void}) {
  const uiText = useText();
  const request = useRef("");
  const [dirty, setDirty] = useState(false);
  const [result, action, pending] = useActionState<ManualEntryResult, FormData>(async (_, form) => {
    let next: ManualEntryResult;
    try {
      request.current ||= newQuickEntryId();
      form.set("requestId",request.current);
      next = await save(form);
    } catch { next = {error:MANUAL_RETRY_MESSAGE}; }
    setDirty(false);
    return next;
  },{});
  return <form action={action} className={className} onReset={event => event.preventDefault()} onChange={() => setDirty(true)} aria-busy={pending}>
    <fieldset disabled={pending || result.saved} className={fieldsClassName}>{children}</fieldset>
    {pending && <p role="status" className="text-xs mt-2">{uiText("Saving…")}</p>}
    {!pending && !dirty && result.error && <p role="alert" className="text-xs text-[var(--red)] mt-2">{uiText(result.error)}</p>}
    {result.saved && <>
      <p role="status" className="text-xs text-[var(--green)] mt-2">{uiText("Record saved.")}</p>
      <button type="button" className="btn w-full mt-2" onClick={restart}>{uiText("Start another entry")}</button>
    </>}
  </form>;
}
