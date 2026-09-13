"use client";

import { useEffect, useId, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const listeners = new Set<() => void>();
/** Survives a browser that refuses storage, for as long as the page is open. */
const memory = new Map<string, boolean>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readOpen(key: string): boolean {
  const remembered = memory.get(key);
  if (remembered !== undefined) return remembered;
  try {
    return localStorage.getItem(key) === "open";
  } catch {
    return false;
  }
}

function writeOpen(key: string, open: boolean) {
  memory.set(key, open);
  try {
    localStorage.setItem(key, open ? "open" : "closed");
  } catch {
    // Storage is optional; the choice lasts until the page closes.
  }
  listeners.forEach((listener) => listener());
}

/**
 * A block that is part of the page on a computer and folded away on a phone.
 *
 * For what is not a panel of its own — a chart, an audit, a cross-check, a form
 * the + button already covers — and that a phone should show only when asked.
 * On a wide screen the toggle is hidden and the wrapper is a plain block, so the
 * computer layout is what it was. A fold with nothing inside is not shown at all.
 *
 * Opening one is remembered on this device, and the page's "Minimize panels" and
 * "Expand panels" reach these too.
 */
export default function MobileFold({
  title,
  persistKey,
  className,
  children,
}: {
  title: string;
  persistKey: string;
  /** Classes for the wrapper around the children, e.g. spacing between several. */
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const bodyId = useId();
  const key = `money-os:fold:${pathname}:${persistKey}`;
  const open = useSyncExternalStore(subscribe, () => readOpen(key), () => false);

  useEffect(() => {
    const handle = (event: Event) => {
      const collapsed = (event as CustomEvent<boolean>).detail;
      if (typeof collapsed === "boolean") writeOpen(key, !collapsed);
    };
    window.addEventListener("money-os:panels", handle);
    return () => window.removeEventListener("money-os:panels", handle);
  }, [key]);

  return (
    <div className="mobile-fold" data-open={open}>
      <button
        type="button"
        className="mobile-fold-toggle card"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => writeOpen(key, !open)}
      >
        <span>{title}</span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      <div id={bodyId} className={`mobile-fold-body ${className ?? ""}`}>
        {children}
      </div>
    </div>
  );
}
