package com.joaonovais.moneyos.shell;

import android.content.SharedPreferences;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;

/** Runs on the JVM against the compiled app and the SDK's android.jar.
 * Only SharedPreferences is replaced: the app's actual failure handler runs.
 */
public final class WidgetCacheTest {
    public static void main(String[] args) {
        check("login", false);
        check("address", false);
        check("offline", true);
        session(null, false, "offline");
        session(null, true, "login");
        session("", true, "login");
        session("money_os_session=x", true, null);
        System.out.println("Widget cache: 3 regression cases passed; session check: 4 cases passed");
    }

    /** An unreadable cookie store must never be read as a refused session. */
    private static void session(String cookie, boolean readable, String expected) {
        String problem = Site.cookieProblem(cookie, readable);
        if (expected == null ? problem != null : !expected.equals(problem))
            throw new AssertionError("cookieProblem(" + cookie + ", " + readable + ") = " + problem);
    }

    private static void check(String reason, boolean retained) {
        Map<String, Object> stored = new HashMap<>();
        stored.put("widget_json", "private financial figures");
        stored.put("widget_read_at", 123L);
        stored.put("alert_notifications", true);
        SharedPreferences.Editor editor = (SharedPreferences.Editor) Proxy.newProxyInstance(
                WidgetCacheTest.class.getClassLoader(), new Class<?>[]{SharedPreferences.Editor.class},
                (proxy, method, values) -> {
                    if (method.getName().equals("putString")) stored.put((String) values[0], values[1]);
                    if (method.getName().equals("remove")) stored.remove((String) values[0]);
                    return method.getName().equals("apply") ? null : proxy;
                });
        SharedPreferences prefs = (SharedPreferences) Proxy.newProxyInstance(
                WidgetCacheTest.class.getClassLoader(), new Class<?>[]{SharedPreferences.class},
                (proxy, method, values) -> editor);

        WidgetData.recordProblem(prefs, reason);
        if (stored.containsKey("widget_json") != retained || stored.containsKey("widget_read_at") != retained)
            throw new AssertionError("Wrong cache retention for " + reason);
        if (!reason.equals(stored.get("widget_problem"))) throw new AssertionError("Missing reason");
        if (!Boolean.TRUE.equals(stored.get("alert_notifications"))) throw new AssertionError("Preference changed");
    }
}
