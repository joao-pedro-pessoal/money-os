import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isQuickEntryId } from "../manualEntry";
import { newQuickEntryId } from "../quickEntryId";

function bytesSource(fill: (length: number) => Uint8Array) {
  return {
    getRandomValues: ((array: Uint8Array) => {
      array.set(fill(array.length));
      return array;
    }) as Crypto["getRandomValues"],
  };
}

describe("newQuickEntryId", () => {
  it("uses randomUUID where the browser offers it", () => {
    const source = { ...bytesSource((n) => new Uint8Array(n)), randomUUID: () => "8f14e45f-ceea-4d7a-9c2b-1a2b3c4d5e6f" };
    expect(newQuickEntryId(source)).toBe("quick-8f14e45f-ceea-4d7a-9c2b-1a2b3c4d5e6f");
  });

  it("still makes ids the server accepts where randomUUID is missing, as over http on a phone", () => {
    const source = bytesSource((n) => randomBytes(n));
    const ids = Array.from({ length: 500 }, () => newQuickEntryId(source));
    for (const id of ids) expect(isQuickEntryId(id)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("forces the version and variant bits whatever the random bytes are", () => {
    expect(newQuickEntryId(bytesSource((n) => new Uint8Array(n)))).toBe("quick-00000000-0000-4000-8000-000000000000");
    expect(newQuickEntryId(bytesSource((n) => new Uint8Array(n).fill(0xff)))).toBe("quick-ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(isQuickEntryId(newQuickEntryId(bytesSource((n) => new Uint8Array(n).fill(0xff))))).toBe(true);
  });
});
