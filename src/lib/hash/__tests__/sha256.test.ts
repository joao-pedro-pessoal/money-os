import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex, sha256Text } from "../sha256";

const nodeHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("sha256Hex", () => {
  it("matches the published test vectors", () => {
    const text = (s: string) => new TextEncoder().encode(s);
    expect(sha256Hex(text(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(text("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  // Every length around the 55/56/64-byte padding boundaries, where a
  // hand-written SHA-256 is most likely to be wrong.
  it("agrees with Node's implementation at every length up to three blocks", () => {
    for (let length = 0; length <= 200; length++) {
      const bytes = randomBytes(length);
      expect(sha256Hex(bytes)).toBe(nodeHash(bytes));
    }
  });

  it("agrees on a statement-sized file", () => {
    const bytes = randomBytes(256_000);
    expect(sha256Hex(bytes)).toBe(nodeHash(bytes));
  });
});

describe("sha256Text", () => {
  it("gives the same fingerprint as the fallback, accents included", async () => {
    const text = "Data;Descrição;Valor\n2026-09-13;Café;-1,20\n";
    expect(await sha256Text(text)).toBe(sha256Hex(new TextEncoder().encode(text)));
    expect(await sha256Text(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
  });
});
