/**
 * Copies text to the clipboard, including where navigator.clipboard is missing.
 *
 * The clipboard API exists only in a secure context. On a phone that reaches the
 * site on the computer by its Wi-Fi address it is undefined, and the copy
 * buttons threw instead of copying. A selected, off-screen textarea and
 * execCommand still work there. Returns whether the copy happened, so a button
 * never says "Copied" when it did not.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (no focus, no permission): the fallback below may still work.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
