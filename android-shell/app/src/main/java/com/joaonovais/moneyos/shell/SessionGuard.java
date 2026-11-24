package com.joaonovais.moneyos.shell;

/** Pure generation guard for background responses crossing an account change. */
final class SessionGuard {
    private long generation;
    private boolean changing;
    long stamp() { return generation; }
    boolean accepts(long stamp) { return !changing && stamp == generation; }
    void begin() { generation++; changing = true; }
    void finish() { if (changing) { generation++; changing = false; } }

    static String value(String cookie) {
        if (cookie != null) for (String part : cookie.split(";")) {
            String entry = part.trim();
            if (entry.startsWith("moneyos_session=")) return entry.substring("moneyos_session=".length());
        }
        return "";
    }
    static boolean sameSession(String before, String current) {
        String original = value(before);
        return !original.isEmpty() && original.equals(value(current));
    }
}
