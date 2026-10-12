import { describe, expect, it } from "vitest";
import nextConfig, { SECURITY_HEADERS } from "../../../../next.config";

describe("headers sent with every page", () => {
  it("cover every path", async () => {
    expect(await nextConfig.headers!()).toEqual([{ source: "/:path*", headers: SECURITY_HEADERS }]);
  });

  it("refuse framing by other sites, sniffing and full referrers, and keep scripts unrestricted", () => {
    const sent = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]));
    expect(sent["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    // A script policy would have to allow Next.js's inline scripts; none is safer than a wrong one.
    expect(sent["Content-Security-Policy"]).not.toContain("script-src");
    expect(sent["Content-Security-Policy"]).not.toContain("upgrade-insecure-requests");
    expect(sent["X-Frame-Options"]).toBe("DENY");
    expect(sent["X-Content-Type-Options"]).toBe("nosniff");
    expect(sent["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(sent["Permissions-Policy"]).toContain("camera=()");
  });
});
