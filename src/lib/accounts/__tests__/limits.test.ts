import { describe, expect, it } from "vitest";
import {
  afterFailedLogin,
  DEFAULT_MAX_ACCOUNTS,
  lockedUntil,
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
  maxAccounts,
  REGISTRATIONS_PER_DAY,
  REGISTRATIONS_PER_HOUR,
  registrationRefusal,
} from "../limits";

describe("repeated wrong passwords", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");

  it("does not lock before the limit", () => {
    let state = { failedLogins: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) state = afterFailedLogin(state.failedLogins, now);
    expect(state).toEqual({ failedLogins: MAX_FAILED_LOGINS - 1, lockedUntil: null });
  });

  it("locks for a while at the limit and starts counting again", () => {
    const state = afterFailedLogin(MAX_FAILED_LOGINS - 1, now);
    expect(state.failedLogins).toBe(0);
    expect(state.lockedUntil!.getTime() - now.getTime()).toBe(LOCKOUT_MINUTES * 60 * 1000);
    expect(lockedUntil(state, now)).toEqual(state.lockedUntil);
  });

  it("lets the lock expire", () => {
    const state = afterFailedLogin(MAX_FAILED_LOGINS - 1, now);
    const later = new Date(state.lockedUntil!.getTime() + 1);
    expect(lockedUntil(state, later)).toBeNull();
  });
});

describe("new accounts", () => {
  const quiet = { total: 1, lastHour: 0, lastDay: 0 };

  it("are taken while the site is under its limits", () => {
    expect(registrationRefusal(quiet, 10)).toBeNull();
  });

  it("stop at the account limit, which is ten unless the environment says otherwise", () => {
    expect(maxAccounts({})).toBe(DEFAULT_MAX_ACCOUNTS);
    expect(maxAccounts({ MAX_ACCOUNTS: "  " })).toBe(DEFAULT_MAX_ACCOUNTS);
    expect(maxAccounts({ MAX_ACCOUNTS: "300" })).toBe(300);
    expect(registrationRefusal({ ...quiet, total: 3 }, 3)).not.toBeNull();
  });

  it("reads the older name when the new one is not set", () => {
    expect(maxAccounts({ SYNC_MAX_ACCOUNTS: "6" })).toBe(6);
    expect(maxAccounts({ MAX_ACCOUNTS: "50", SYNC_MAX_ACCOUNTS: "6" })).toBe(50);
  });

  /** A limit nobody can read is not permission for no limit. */
  it("are closed when the limit is not a whole number of at least one", () => {
    for (const bad of ["0", "-2", "ten", "2.5", "1e400"]) expect(maxAccounts({ MAX_ACCOUNTS: bad })).toBeNull();
    expect(registrationRefusal(quiet, null)).not.toBeNull();
  });

  it("slow down when too many were made in the last hour or day", () => {
    expect(registrationRefusal({ ...quiet, lastHour: REGISTRATIONS_PER_HOUR }, 100)).not.toBeNull();
    expect(registrationRefusal({ ...quiet, lastDay: REGISTRATIONS_PER_DAY }, 100)).not.toBeNull();
    expect(registrationRefusal({ ...quiet, lastHour: REGISTRATIONS_PER_HOUR - 1 }, 100)).toBeNull();
  });
});
