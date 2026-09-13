type RandomSource = Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string };

/**
 * A fresh id for a quick entry, in the shape isQuickEntryId accepts.
 *
 * crypto.randomUUID exists only in a secure context. A phone that reaches the
 * site on the computer by its Wi-Fi address — http://192.168.… — is not one,
 * so the quick-entry form threw before it saved anything, and the cashback form
 * with it. getRandomValues has no such restriction, and sixteen random bytes with
 * the version and variant bits set are the same version-4 id.
 */
export function newQuickEntryId(source: RandomSource = globalThis.crypto): string {
  if (typeof source.randomUUID === "function") return `quick-${source.randomUUID()}`;
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `quick-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
