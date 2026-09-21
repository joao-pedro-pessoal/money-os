import { describe, expect, it } from "vitest";
import { localDay, localMonth } from "../localDay";

describe("today, in local time", () => {
  it("reads the calendar the clock on the wall shows", () => {
    const earlyOnTheFirst = new Date(2026, 9, 1, 0, 30); // 00:30 on 1 October, local
    expect(localDay(earlyOnTheFirst)).toBe("2026-10-01");
    expect(localMonth(earlyOnTheFirst)).toBe("2026-10");
  });

  it("pads the month and day", () => {
    expect(localDay(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });

  /**
   * The bug this replaces, stated where it can be seen: wherever the zone is
   * ahead of UTC, the ISO string of a moment just after midnight is yesterday.
   */
  it("differs from the UTC reading exactly when the zone is ahead of UTC and it is just after midnight", () => {
    const moment = new Date(2026, 9, 1, 0, 30);
    const ahead = moment.getTimezoneOffset() < 0 && moment.getHours() * 60 + moment.getMinutes() < -moment.getTimezoneOffset();
    expect(localDay(moment) !== moment.toISOString().slice(0, 10)).toBe(ahead);
  });
});
