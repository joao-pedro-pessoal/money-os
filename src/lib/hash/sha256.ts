/**
 * SHA-256, for the browser pages that fingerprint an imported file.
 *
 * crypto.subtle exists only in a secure context. A phone that reaches the site
 * on the computer by its Wi-Fi address — http://192.168.… — is not one, so
 * importing a statement there failed before a single row was read. The browser's
 * own digest is still used wherever it exists; this implementation is the
 * fallback, and gives the same fingerprint, so an import made on the phone and
 * one made on the computer are still recognised as the same file.
 */

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The first 32 bits of the fractional part of each root, as FIPS 180-4 defines them. */
function fractionBits(value: number): number {
  return ((value - Math.floor(value)) * 2 ** 32) >>> 0;
}

function firstPrimes(count: number): number[] {
  const primes: number[] = [];
  for (let candidate = 2; primes.length < count; candidate++) {
    if (primes.every((p) => candidate % p !== 0)) primes.push(candidate);
  }
  return primes;
}

const PRIMES = firstPrimes(64);
const INITIAL = PRIMES.slice(0, 8).map((p) => fractionBits(Math.sqrt(p)));
const ROUND = new Uint32Array(PRIMES.map((p) => fractionBits(Math.cbrt(p))));

/** SHA-256 of bytes as lowercase hex, computed here rather than by the browser. */
export function sha256Hex(bytes: Uint8Array): string {
  const blocks = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  blocks.set(bytes);
  blocks[bytes.length] = 0x80;
  const view = new DataView(blocks.buffer);
  const bits = bytes.length * 8;
  view.setUint32(blocks.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(blocks.length - 4, bits >>> 0);

  const hash = new Uint32Array(INITIAL);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < blocks.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      const sigmaE = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + sigmaE + choose + ROUND[i] + w[i]) >>> 0;
      const sigmaA = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (sigmaA + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    hash[0] += a;
    hash[1] += b;
    hash[2] += c;
    hash[3] += d;
    hash[4] += e;
    hash[5] += f;
    hash[6] += g;
    hash[7] += h;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  hash.forEach((word, i) => outView.setUint32(i * 4, word));
  return toHex(out);
}

/** SHA-256 of UTF-8 text as lowercase hex, by the browser where it can, by sha256Hex where it cannot. */
export async function sha256Text(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) return toHex(new Uint8Array(await subtle.digest("SHA-256", bytes)));
  return sha256Hex(bytes);
}
