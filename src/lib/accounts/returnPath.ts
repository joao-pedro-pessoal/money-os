/** A login may return only to this site's paths, never to another origin. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  // URL parsers normalize backslashes and remove controls before resolving URLs.
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://moneyos.invalid");
    if (url.origin !== "https://moneyos.invalid" || url.pathname.startsWith("//") || url.pathname.startsWith("/login")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
