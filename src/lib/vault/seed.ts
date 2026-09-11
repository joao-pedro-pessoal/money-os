import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/**
 * The twelve words that open a synced vault.
 *
 * A seed rather than a password, because the key it produces has to survive the
 * loss of every device: nothing on the server can recover it, by design (see
 * docs/PLANO_MOBILE.md, "Só os dispositivos decifram"). Twelve words from the
 * BIP39 English list carry 128 bits of entropy and a checksum, so a mistyped word
 * is refused here rather than surfacing later as a wrong key — which someone who
 * wrote their seed down correctly would reasonably read as their data being gone.
 *
 * The list comes from @scure/bip39 and is never written out by hand. A list with
 * one wrong word produces seeds that decode nowhere else and fail nowhere here,
 * which is the one mistake a test built from the same list cannot see.
 */

/** Twelve words: 128 bits of entropy, the only length this app issues or accepts. */
export const SEED_WORDS = 12;
const ENTROPY_BYTES = 16;
const WORDS = new Set(wordlist);

/**
 * A new seed from injected randomness.
 *
 * Injected rather than read from `crypto.getRandomValues` here, for the reason the
 * mobile backup does the same: `src/lib` stays free of platform I/O, and the app
 * and the site each supply their own secure source. The entropy is cleared once
 * the words exist, since the words are now the only copy anyone should hold.
 */
export async function generateSeed(
  random: (length: number) => Uint8Array | Promise<Uint8Array>
): Promise<string> {
  const entropy = await random(ENTROPY_BYTES);
  try {
    return seedFromEntropy(entropy);
  } finally {
    entropy.fill(0);
  }
}

export function seedFromEntropy(entropy: Uint8Array): string {
  if (entropy.length !== ENTROPY_BYTES) {
    throw new Error(
      `A recovery seed needs exactly ${ENTROPY_BYTES} bytes of entropy; got ${entropy.length}.`
    );
  }
  return entropyToMnemonic(entropy, wordlist);
}

/**
 * The words as someone will type them back: any case, any spacing.
 *
 * Written on paper and retyped on a phone, a seed picks up capitals from
 * autocorrect and extra spaces from line breaks. Neither changes which words they
 * are, so neither may be what makes a correct seed fail.
 */
export function normaliseSeed(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

function wordsOf(input: string): string[] {
  const normalised = normaliseSeed(input);
  return normalised === "" ? [] : normalised.split(" ");
}

export function isValidSeed(input: string): boolean {
  const words = wordsOf(input);
  return words.length === SEED_WORDS && validateMnemonic(words.join(" "), wordlist);
}

/**
 * Which rule a typed seed broke, as data a screen can put into its own language.
 *
 * The message stays English like the rest of `src/lib`; the app shows people
 * Portuguese. Translating by matching the English text would be a lookup keyed on
 * prose, which breaks the day a message is reworded.
 */
export class SeedError extends Error {
  constructor(
    readonly problem: "count" | "unknown-word" | "checksum",
    message: string,
    readonly count?: number,
    readonly word?: string
  ) {
    super(message);
    this.name = "SeedError";
  }
}

/**
 * The entropy behind a seed, or a refusal naming the rule it broke.
 *
 * Three different failures, told apart on purpose: a missing word, a word that is
 * not in the list, and valid words that fail the checksum. "Invalid seed" for all
 * three sends someone back to a piece of paper with no idea what to look for.
 *
 * The caller owns the returned bytes and should clear them once a key is derived.
 */
export function seedEntropy(input: string): Uint8Array {
  const words = wordsOf(input);
  if (words.length !== SEED_WORDS) {
    throw new SeedError(
      "count", `A recovery seed has ${SEED_WORDS} words; this has ${words.length}.`, words.length
    );
  }
  const unknown = words.find((w) => !WORDS.has(w));
  if (unknown !== undefined) {
    throw new SeedError(
      "unknown-word", `"${unknown}" is not one of the words a recovery seed is made from.`, undefined, unknown
    );
  }
  const phrase = words.join(" ");
  if (!validateMnemonic(phrase, wordlist)) {
    throw new SeedError(
      "checksum", "Every word is valid but the checksum does not match: one is wrong or in the wrong place."
    );
  }
  return mnemonicToEntropy(phrase, wordlist);
}
