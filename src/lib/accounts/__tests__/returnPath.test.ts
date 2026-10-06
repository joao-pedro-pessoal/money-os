import { describe, expect, it } from "vitest";
import { safeReturnPath } from "../returnPath";

describe("returning after login", () => {
  it.each(["/?quick=expense", "/?quick=income", "/transactions?from=2026-01-01#recent"])("preserves %s", path => {
    expect(safeReturnPath(path)).toBe(path);
  });
  it.each([undefined, null, ["/accounts"], "", "https://evil.example", "//evil.example", "/\\evil.example", "/\n/evil.example", "/a/..//evil.example", "/%2e//evil.example", "javascript:alert(1)", "/login?next=/login"])("rejects unsafe or looping destinations: %s", path => {
    expect(safeReturnPath(path)).toBe("/");
  });
});
