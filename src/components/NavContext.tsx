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

  /** Escape closes it, because a panel over the whole screen must be dismissible. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /**
   * Stop the page behind from scrolling while the drawer covers it.
   *
   * Without this, a scroll gesture aimed at the menu moves the page underneath
   * and the menu appears frozen.
   */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return <NavContext.Provider value={{ open, setOpen }}>{children}</NavContext.Provider>;
}

export function useNav() {
  return useContext(NavContext);
}
