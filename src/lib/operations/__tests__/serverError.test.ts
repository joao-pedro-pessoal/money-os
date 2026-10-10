import { describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";

describe("sanitized server error events", () => {
  it("never logs request data, database messages or arbitrary error fields", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const error = Object.assign(new Error("password=secret, balance=12345"), { digest: "private", cause: "postgres://secret" });
      const context = { routeType: "action", routerKind: "App Router", routePath: "/accounts/private-id" } as Parameters<typeof onRequestError>[2];
      await onRequestError(error, { method: "POST", path: "/login?email=private", headers: { cookie: "session-secret" } }, context);
      const event = JSON.parse(log.mock.calls[0][0]);
      expect(event).toEqual({ at: expect.any(String), event: "moneyos.server_error", errorType: "Error", method: "POST", routeType: "action" });
      expect(log.mock.calls[0][0]).not.toMatch(/secret|private|12345|postgres|password|cookie/);
    } finally { log.mockRestore(); }
  });
});
