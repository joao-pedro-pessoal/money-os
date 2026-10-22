/** Tailwind's md breakpoint, also used by the phone navigation. */
export const PHONE_QUERY = "(max-width: 767px)";

/** An explicit local choice, together with the account default it answered. */
export function panelValue(collapsed: boolean, defaultOpen: boolean, preferenceVersion?: string): string {
  return `${collapsed ? "closed" : "open"}:${defaultOpen ? "open" : "closed"}${preferenceVersion ? `:${preferenceVersion}` : ""}`;
}

/** Old choices remain valid until the account's open/minimized default changes. */
export function panelChoice(saved: string | null, defaultOpen: boolean, preferenceVersion?: string): string | null {
  if (saved === null) return null;
  const [state, basis, version, ...extra] = saved.split(":");
  if ((state !== "open" && state !== "closed") || extra.length > 0) return null;
  if (basis !== undefined && basis !== (defaultOpen ? "open" : "closed")) return null;
  if (version !== preferenceVersion) return null;
  return panelValue(state === "closed", defaultOpen, preferenceVersion);
}

/**
 * A local choice wins while its account default is unchanged. With no choice,
 * the computer follows the account/page; a phone further limits initially open
 * panels to essential ones. Evaluating that default never creates a choice.
 * Simple mode has separate local keys; desktop and Complex keep sharing theirs.
 * Hidden account panels are not rendered, so local choices cannot reveal them.
 */
export function startsCollapsed({ saved, defaultOpen, phone, essential, preferenceVersion }: {
  saved: string | null;
  defaultOpen: boolean;
  phone: boolean;
  essential: boolean;
  preferenceVersion?: string;
}): boolean {
  const choice = panelChoice(saved, defaultOpen, preferenceVersion);
  if (choice !== null) return choice.startsWith("closed:");
  return !defaultOpen || (phone && !essential);
}

export function panelStoragePrefix(pathname: string, persistKey: string): string {
  return `money-os:panel:${pathname}:${persistKey}:`;
}

/** Displayed titles can change with language or a playlist rename. */
export function panelStorageKey(pathname: string, persistKey: string, simple: boolean): string {
  return `${panelStoragePrefix(pathname, persistKey)}@panel${simple ? ":simple" : ""}`;
}

/** Preserve the existing fold keys, including the separate Simple choices. */
export function foldStorageKey(pathname: string, persistKey: string, simple: boolean): string {
  return `money-os:fold:${pathname}:${persistKey}${simple ? ":simple" : ""}`;
}
