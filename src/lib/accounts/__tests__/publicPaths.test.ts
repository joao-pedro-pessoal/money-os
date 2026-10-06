import { describe, expect, it } from "vitest";
import { isPublicPath } from "../publicPaths";
import { LEGAL_PATHS } from "@/lib/legal/paths";

describe("what opens without a session", () => {
  it("lets the privacy notice, the terms and the deletion page through", () => {
    for (const path of Object.values(LEGAL_PATHS)) expect(isPublicPath(path)).toBe(true);
  });

  it("only those exact pages, not anything that starts like them", () => {
    expect(isPublicPath("/privacy-settings")).toBe(false);
    expect(isPublicPath("/terms/anything")).toBe(false);
    expect(isPublicPath("/delete-account/confirm")).toBe(false);
  });

  it("keeps the way in and what an install needs open", () => {
    for (const path of ["/login", "/manifest.webmanifest", "/sw.js", "/offline.html", "/icons/icon-192.png", "/api/sync"]) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it("keeps every page with a figure on it behind the sign-in", () => {
    for (const path of ["/", "/settings", "/transactions", "/api/widget", "/api/alerts", "/api/report/pdf", "/analytics/report"]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });
});
