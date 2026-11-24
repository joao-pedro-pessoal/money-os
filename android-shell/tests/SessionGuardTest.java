package com.joaonovais.moneyos.shell;

public final class SessionGuardTest {
    public static void main(String[] args) {
        SessionGuard guard = new SessionGuard();
        long original = guard.stamp();
        check(guard.accepts(original));
        guard.begin();
        check(!guard.accepts(original));
        long during = guard.stamp();
        check(!guard.accepts(during));
        guard.finish();
        check(!guard.accepts(original) && !guard.accepts(during));
        check(guard.accepts(guard.stamp()));
        check(SessionGuard.sameSession("moneyos_session=a; language=en", "language=pt; moneyos_session=a"));
        check(!SessionGuard.sameSession("moneyos_session=a", "moneyos_session=b"));
        check(!SessionGuard.sameSession("moneyos_session=a", null));
        check(!SessionGuard.sameSession(null, null));
        check(!SessionGuard.sameSession("moneyos_session=a", "moneyos_session=a-renewed"));
        System.out.println("Session guard: 10 stale-response and cookie-binding checks passed");
    }
    private static void check(boolean value) { if (!value) throw new AssertionError("Session guard regression"); }
}
