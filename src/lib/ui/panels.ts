/**
 * Where the site counts as being on a phone: Tailwind's md breakpoint, the same
 * width below which the menu turns into a drawer.
 */
export const PHONE_QUERY = "(max-width: 767px)";

/**
 * Whether a panel starts closed.
 *
 * A choice already made on this device wins, on any screen. Without one, a
 * computer follows the page's own default. A phone opens only the panels the
 * page marks as essential, so its first screen is what the page is for and not
 * the audits, forms and histories around it — every panel is still there, one
 * tap away.
 *
 * Essential never opens what the page keeps closed on a computer: it narrows
 * what a phone shows, it does not add to it.
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
  if (saved === "closed") return true;
  if (saved === "open") return false;
  if (!defaultOpen) return true;
  return phone && !essential;
}
