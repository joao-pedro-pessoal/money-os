"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Whether the navigation drawer is open, on the screens where it is a drawer.
 *
 * The button that opens it lives in the top bar and the drawer itself lives in
 * the nav, so the state has to sit above both — the same reason PrivacyContext
 * and ThemeContext exist. Above `md` there is no drawer and nothing reads this.
 */
const NavContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => {} });

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);

  /**
   * Close on navigation.
   *
   * Tapping a link with the drawer left open leaves you looking at the menu on
   * top of the page you asked for, which reads as the tap not having worked.
   *
   * Adjusted during render rather than in an effect. An effect would paint the
   * new page with the menu still over it and close it on the pass after, which
   * is both a visible flicker and the cascading render React warns about. This
   * is the documented way to reset state when an input changes, and it also
   * covers the back button — closing it in each link's onClick would not.
   */
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Crossing to the desktop rail must release the mobile modal state.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  /**
   * Stop the page behind from scrolling while the drawer covers it.
   *
   * Without this, a scroll gesture aimed at the menu moves the page underneath
   * and the menu appears frozen.
   */
  useEffect(() => {
    if (!open || window.matchMedia("(min-width: 768px)").matches) return;
    const panel = document.getElementById("app-nav");
    const content = document.getElementById("app-content");
    if (!panel || !content) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousInert = content.inert;
    const previous = document.body.style.overflow;
    const controls = () => Array.from(panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"))
      .filter((element) => element.getClientRects().length > 0);
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    controls()[0]?.focus();
    content.inert = true;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    panel.addEventListener("keydown", onKey);
    return () => {
      panel.removeEventListener("keydown", onKey);
      panel.removeAttribute("role");
      panel.removeAttribute("aria-modal");
      content.inert = previousInert;
      document.body.style.overflow = previous;
      if (opener?.isConnected && opener.getClientRects().length > 0) opener.focus({ preventScroll: true });
    };
  }, [open]);

  return <NavContext.Provider value={{ open, setOpen }}>{children}</NavContext.Provider>;
}

export function useNav() {
  return useContext(NavContext);
}
