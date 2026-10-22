import { describe, expect, it } from "vitest";
import { dashboardWindowConfiguration, DEFAULT_DASHBOARD_WINDOW_PREFERENCES } from "../windows";

describe("account panel configuration", () => {
  it("keeps old settings and their local choices until the next explicit save", () => {
    expect(dashboardWindowConfiguration({ "portfolio-returns": "visible" })).toEqual({
      preferences: { ...DEFAULT_DASHBOARD_WINDOW_PREFERENCES, "portfolio-returns": "visible" }, version: undefined,
    });
  });

  it("carries the saved version alongside preferences without turning it into a window", () => {
    const input = { "gain-attribution": "hidden", _panelVersion: "d7fd8f17-c39c-48d7-ab3f-81283a983002" };
    const config = dashboardWindowConfiguration(JSON.parse(JSON.stringify(input)));
    expect(config.version).toBe(input._panelVersion);
    expect(config.preferences["gain-attribution"]).toBe("hidden");
    expect(Object.keys(config.preferences)).toEqual(Object.keys(DEFAULT_DASHBOARD_WINDOW_PREFERENCES));
  });

  it.each([null, [], "bad JSON", { _panelVersion: 123 }, { _panelVersion: "bad:version" }])("normalizes missing or invalid data: %j", input => {
    expect(dashboardWindowConfiguration(input)).toEqual({ preferences: DEFAULT_DASHBOARD_WINDOW_PREFERENCES, version: undefined });
  });
});
