"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { newQuickEntryId } from "@/lib/money/quickEntryId";
import { MANUAL_EDIT_RETRY_MESSAGE, type ManualEntryResult } from "@/lib/money/manualRequest";
import { useText } from "./useText";

type Props = {
  action: (form: FormData) => Promise<ManualEntryResult>;
  children: ReactNode;
  submitLabel?: string;
  fieldsClassName?: string;
  submitClassName?: string;
};

/** Preserve a draft on failure. Only editing after confirmed success starts a new request. */
export default function EditForm({action: save,children,submitLabel="Save",fieldsClassName="space-y-3",submitClassName="btn w-full"}: Props) {
  const uiText = useText();
  const request = useRef("");
  const [dirty,setDirty] = useState(false);
  const [result,action,pending] = useActionState<ManualEntryResult,FormData>(async (_,form) => {
    let next: ManualEntryResult;
    try {
      request.current ||= newQuickEntryId();
      form.set("requestId",request.current);
      next = await save(form);
    } catch { next = {error:MANUAL_EDIT_RETRY_MESSAGE}; }
    setDirty(false);
    return next;
  },{});
  function changed() {
    if (!pending && result.saved && !dirty) request.current = "";
    setDirty(true);
  }
  return <form action={action} onReset={event => event.preventDefault()} onChange={changed} aria-busy={pending}>
    <fieldset disabled={pending} className={fieldsClassName}>
      {children}
      <button type="submit" className={submitClassName} disabled={pending || (!!result.saved && !dirty)}>{uiText(submitLabel)}</button>
    </fieldset>
    {pending && <p role="status" className="text-xs mt-2">{uiText("Saving…")}</p>}
    {!pending && !dirty && result.error && <p role="alert" className="text-xs text-[var(--red)] mt-2">{uiText(result.error)}</p>}
    {!pending && !dirty && result.saved && <p role="status" className="text-xs text-[var(--green)] mt-2">{uiText("Changes saved.")}</p>}
  </form>;
}
