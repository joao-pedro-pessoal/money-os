/**
 * Where the site counts as being on a phone: Tailwind's md breakpoint, the same
 * width below which the menu turns into a drawer.
 */
export const PHONE_QUERY = "(max-width: 767px)";

/**
 * What is written down when a panel is opened or closed: the choice, and what
 * the page was saying when it was made.
 *
 * The second half is the whole point. "closed" on its own is an answer with no
 * question attached, and it outlived the question — see `startsCollapsed`.
 */
export function panelValue(collapsed: boolean, defaultOpen: boolean): string {
  return `${collapsed ? "closed" : "open"}:${defaultOpen ? "open" : "closed"}`;
}

/**
 * Whether a panel starts closed.
 *
 * A choice already made on this device wins, on any screen — **for as long as
 * the page is still asking the same thing**. Without one, a computer follows
 * the page's own default. A phone opens only the panels the page marks as
 * essential, so its first screen is what the page is for and not the audits,
 * forms and histories around it — every panel is still there, one tap away.
 *
 * Essential never opens what the page keeps closed on a computer: it narrows
 * what a phone shows, it does not add to it.
 *
 * That "for as long as" was missing, and the analysis page is where it showed.
 * It takes each panel's `defaultOpen` from the window preferences in Settings,
 * so the page changes its mind when the reader changes a setting — and a saved
 * "closed" beat it every time. Minimize *Investment returns* once, or press
 * "Minimize panels", which writes that for every panel on the page at once;
 * set that window to "visible" in Settings afterwards and nothing happened,
 * with nothing on screen to say why. A choice made against a different
 * question is dropped now. A value saved before any of this carries no record
 * of what it was answering, so it is honoured, and the record is written the
 * first time it is read.
 */
export function startsCollapsed({
  saved,
  defaultOpen,
  phone,
  essential,
}: {
  saved: string | null;
  defaultOpen: boolean;
  phone: boolean;
  essential: boolean;
}): boolean {
  const [state, basis] = String(saved ?? "").split(":");
  const chosen = state === "open" || state === "closed";
  const asked = basis === undefined || basis === (defaultOpen ? "open" : "closed");
  if (chosen && asked) return state === "closed";
  if (!defaultOpen) return true;
  return phone && !essential;
}
