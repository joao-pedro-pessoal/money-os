"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { saveOrder } from "@/actions/order";
import type { OrderList } from "@/lib/ui/userOrder";
import { useText } from "./useText";

type Item = { id: string; label: string };

/**
 * "Arrange": a sheet listing the items by name, where each row is dragged by its
 * handle (or moved with the arrows) and the order is saved to the account. The
 * page itself is sorted on the server, so a table or a chart follows the same
 * order without being draggable itself, and scrolling the page never starts a drag.
 */
export default function ArrangeOrder({ list, items, title }: { list: OrderList; items: Item[]; title?: string }) {
  const uiText = useText();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const scrollBefore = useRef("");
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const drag = useRef<{ from: number; startY: number; mids: number[] } | null>(null);
  const [order, setOrder] = useState<Item[]>(items);
  const [dragging, setDragging] = useState<{ index: number; offset: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (items.length < 2) return null;

  function open() {
    setOrder(items);
    setError("");
    scrollBefore.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
  }
  function close() {
    if (pending) return;
    document.body.style.overflow = scrollBefore.current;
    dialog.current?.close();
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
  }

  function start(event: ReactPointerEvent<HTMLElement>, index: number) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const mids = rows.current.slice(0, order.length).map((row) => {
      const rect = row?.getBoundingClientRect();
      return rect ? rect.top + rect.height / 2 : 0;
    });
    drag.current = { from: index, startY: event.clientY, mids };
    setDragging({ index, offset: 0 });
  }
  function follow(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    setDragging({ index: drag.current.from, offset: event.clientY - drag.current.startY });
  }
  function drop(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    drag.current = null;
    setDragging(null);
    if (!current) return;
    // The dragged row's centre now, against the other rows' centres when it started.
    const centre = current.mids[current.from] + (event.clientY - current.startY);
    const to = current.mids.filter((mid, index) => index !== current.from && mid < centre).length;
    move(current.from, to);
  }

  async function save() {
    setPending(true);
    setError("");
    try {
      const result = await saveOrder(list, order.map((item) => item.id));
      if (result.error) {
        setError(result.error);
        return;
      }
      document.body.style.overflow = scrollBefore.current;
      dialog.current?.close();
      router.refresh();
    } catch {
      setError("Could not save the order. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="text-xs text-[var(--accent)] hover:underline min-h-8" onClick={open}>
        ⠿ {uiText("Arrange")}
      </button>
      <dialog ref={dialog} className="quick-entry" aria-labelledby={`arrange-${list}`}
        onCancel={(event) => { event.preventDefault(); close(); }}
        onClose={() => { document.body.style.overflow = scrollBefore.current; }}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 id={`arrange-${list}`} className="text-lg font-semibold truncate">{title ? uiText(title) : uiText("Change the order")}</h2>
          <button type="button" className="icon-btn" aria-label={uiText("Close")} disabled={pending} onClick={close}>×</button>
        </div>
        <p className="text-xs text-[var(--muted)] mb-4">{uiText("Drag by ⠿ or use the arrows. The order is kept in your account, on every device.")}</p>
        <ol className="space-y-2" aria-busy={pending}>
          {order.map((item, index) => {
            const lifted = dragging?.index === index;
            return (
              <li key={item.id} ref={(row) => { rows.current[index] = row; }}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
                style={lifted ? { transform: `translateY(${dragging.offset}px)`, position: "relative", zIndex: 1, boxShadow: "0 8px 24px rgb(0 0 0 / 40%)" } : undefined}>
                <span role="button" tabIndex={-1} aria-hidden="true"
                  className="flex items-center justify-center w-10 h-10 shrink-0 cursor-grab text-lg text-[var(--muted)] select-none"
                  style={{ touchAction: "none" }}
                  onPointerDown={(event) => start(event, index)} onPointerMove={follow} onPointerUp={drop} onPointerCancel={drop}>⠿</span>
                <span className="flex-1 min-w-0 truncate text-sm" translate="no">{item.label}</span>
                <button type="button" className="icon-btn" aria-label={`${uiText("Move up")}: ${item.label}`} disabled={pending || index === 0} onClick={() => move(index, index - 1)}>↑</button>
                <button type="button" className="icon-btn" aria-label={`${uiText("Move down")}: ${item.label}`} disabled={pending || index === order.length - 1} onClick={() => move(index, index + 1)}>↓</button>
              </li>
            );
          })}
        </ol>
        {error && <p role="alert" className="text-sm text-[var(--red)] mt-3">{uiText(error)}</p>}
        <button type="button" className="btn w-full mt-4" disabled={pending} onClick={save}>{pending ? uiText("Saving…") : uiText("Save order")}</button>
      </dialog>
    </>
  );
}
