"use client";

import { useNav } from "./NavContext";

/** How a menu entry looks, current or not — the same on both sides. */
export function navLinkClass(active: boolean): string {
  return `block rounded-lg px-3 py-2 text-sm transition-colors ${
    active ? "bg-[var(--surface-2)] text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
  }`;
}

/**
 * The side menu's frame, shared by the owner's pages and the vault's.
 *
 * A fixed rail on a wide screen, a drawer on a narrow one. It used to be
 * `w-56 shrink-0` at every width, which on a 375px phone left 87px for the
 * content once the page padding was taken off — every table and every card
 * squeezed into a column narrower than the sidebar beside it.
 *
 * What goes inside is each side's own: the owner's pages, search and log out;
 * the vault's pages and its lock. The frame, the drawer and the brand are one
 * thing, so the two sides cannot drift into looking like different apps.
 */
export default function NavFrame({
  onClose,
  label = "Main",
  children,
}: {
  onClose: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  const { open } = useNav();

  return (
    <>
      {/* Covers the page while the drawer is over it, and closes on a tap. */}
      {open && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} aria-hidden="true" />}

      <nav
        id="app-nav"
        className={`
          app-nav border-r border-[var(--border)] p-4 flex flex-col
          bg-[var(--background)]
          fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto
          transition-transform duration-200 ease-out
          motion-reduce:transition-none
          ${open ? "translate-x-0 visible" : "-translate-x-full invisible"}
          md:visible md:static md:translate-x-0 md:w-56 md:shrink-0 md:min-h-screen md:z-auto
        `}
        aria-label={label}
      >
        <div className="flex items-center justify-between mb-6">
          <div style={{ fontFamily: "var(--font-heading)" }} className="text-lg tracking-tight text-[var(--foreground)]">
            Money OS
          </div>
          {/*
            Only reachable when the drawer is showing; the rail has no close.
            The wrapper carries `md:hidden` because `.icon-btn` sets its own
            `display` later in globals.css and would win against the utility.
          */}
          <div className="md:hidden">
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close menu">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {children}
      </nav>
    </>
  );
}
