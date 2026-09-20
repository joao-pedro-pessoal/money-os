/**
 * Whether a panel opens: what the reader chose, against what the page says
 * now.
 *
 * Both are real answers and they disagree. A panel remembers being minimized,
 * which is the point of remembering it — and the analysis page decides what
 * its panels start as from the window preferences in Settings, which is the
 * point of that setting. Holding the choice alone, the setting stopped
 * working: minimize *Investment returns* once, set that window to "visible" in
 * Settings later, and the panel stayed shut with nothing on screen explaining
 * why. "Minimize panels" writes that value for every panel on the page at
 * once, so one click could silence a dozen settings for good.
 *
 * What is stored is the choice **and what the page was saying when it was
 * made**. While the page says the same thing, the choice stands. When the page
 * changes its mind — which only happens because the reader changed a setting —
 * the older answer is dropped. A value saved before this existed carries no
 * such record, so it is honoured and the record is written the first time it
 * is read.
 *
 * Pure. It is in `lib` and not inside the component because deciding which of
 * two answers to throw away is exactly the kind of rule that has to be
 * testable.
 */

export interface PanelChoice {
  collapsed: boolean;
  /** What to write back, so the next read knows what this one was based on. */
  store: string;
}

/** "closed:open" — minimized, chosen while the page wanted it open. */
export function panelValue(collapsed: boolean, defaultOpen: boolean): string {
  return `${collapsed ? "closed" : "open"}:${defaultOpen ? "open" : "closed"}`;
}

export function panelChoice(saved: string | null | undefined, defaultOpen: boolean): PanelChoice {
  const [state, basis] = String(saved ?? "").split(":");
  const chosen = state === "open" || state === "closed";
  // No basis at all is a value from before this rule existed: honoured, and
  // recorded, so the next change of the setting is noticed.
  const stale = chosen && basis !== undefined && basis !== (defaultOpen ? "open" : "closed");
  const collapsed = chosen && !stale ? state === "closed" : !defaultOpen;
  return { collapsed, store: panelValue(collapsed, defaultOpen) };
}
