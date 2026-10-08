package com.joaonovais.moneyos.shell;

import android.content.Context;
import android.webkit.CookieManager;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * A read from the site outside the WebView, as the person logged in there.
 *
 * It sends the session cookie the app's WebView already holds, so it can read
 * nothing the pages could not. A redirect is the login page, never the data.
 */
final class Site {
    static final String PROBLEM_LOGIN = "login";
    static final String PROBLEM_OFFLINE = "offline";
    static final String PROBLEM_NO_ADDRESS = "address";

    /** Why a read gave nothing: one of the PROBLEM_ values. */
    static final class Unavailable extends Exception {
        final String reason;

        Unavailable(String reason) {
            super(reason);
            this.reason = reason;
        }
    }

    private Site() {}

    /**
     * The site's origin, or null when none has been given yet. Fixed in the
     * store build (BuildConfig.SITE_URL, the published site); typed in on the
     * phone in the home build, where the computer's address changes.
     */
    static String address(Context context) {
        if (!BuildConfig.SITE_URL.isEmpty()) return BuildConfig.SITE_URL;
        return QuickEntry.prefs(context).getString("address", null);
    }

    /**
     * Why a read cannot start, from what the WebView's cookie store said; null
     * when there is a session to send.
     *
     * A store that could not be read at all — the WebView being updated by the
     * Play Store, or not loadable in this process — says nothing about the
     * session, so it is offline, never login. A login answer wipes the widgets'
     * copy (WidgetData.recordProblem) and takes the alert notifications down,
     * forgetting which were shown (Alerts), so a passing WebView update used to
     * blank the widgets and bring every alert back as new.
     */
    static String cookieProblem(String cookie, boolean storeReadable) {
        if (!storeReadable) return PROBLEM_OFFLINE;
        return cookie == null || cookie.isEmpty() ? PROBLEM_LOGIN : null;
    }

    /** True when the address is the published site's, built in: nothing to type or change. */
    static boolean fixedAddress() {
        return !BuildConfig.SITE_URL.isEmpty();
    }

    /** The body of a GET to `path` on the site. Blocking: call off the main thread. */
    static String get(Context context, String path) throws Unavailable {
        String address = address(context);
        if (address == null) throw new Unavailable(PROBLEM_NO_ADDRESS);
        String cookie = null;
        boolean readable = true;
        try {
            cookie = CookieManager.getInstance().getCookie(address);
        } catch (RuntimeException e) {
            readable = false;
        }
        String problem = cookieProblem(cookie, readable);
        if (problem != null) throw new Unavailable(problem);

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address + path).openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Cookie", cookie);
            connection.setRequestProperty("Accept", "application/json");
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400 || status == 401 || status == 403) {
                throw new Unavailable(PROBLEM_LOGIN);
            }
            if (status != 200) throw new Unavailable(PROBLEM_OFFLINE);
            keepRenewedSession(address, connection);
            return read(connection.getInputStream());
        } catch (IOException | RuntimeException e) {
            throw new Unavailable(PROBLEM_OFFLINE);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /**
     * The site renews a session once a day by sending a new cookie with an
     * answer. Handed back to the WebView's store, so widgets refreshing on
     * their own keep a session alive the way opening the app does, instead of
     * finding it expired after thirty days away from the app.
     */
    private static void keepRenewedSession(String address, HttpURLConnection connection) {
        try {
            CookieManager cookies = CookieManager.getInstance();
            boolean changed = false;
            for (java.util.Map.Entry<String, java.util.List<String>> header : connection.getHeaderFields().entrySet()) {
                if (header.getKey() == null || !"Set-Cookie".equalsIgnoreCase(header.getKey())) continue;
                for (String value : header.getValue()) {
                    cookies.setCookie(address, value);
                    changed = true;
                }
            }
            if (changed) cookies.flush();
        } catch (RuntimeException ignored) {
            // No WebView store right now: the old session stands until it expires.
        }
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream stream = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = stream.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
}
