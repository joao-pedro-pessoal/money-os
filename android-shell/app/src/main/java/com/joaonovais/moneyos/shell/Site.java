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

    /** The body of a GET to `path` on the site. Blocking: call off the main thread. */
    static String get(Context context, String path) throws Unavailable {
        String address = QuickEntry.prefs(context).getString("address", null);
        if (address == null) throw new Unavailable(PROBLEM_NO_ADDRESS);
        String cookie = null;
        try {
            cookie = CookieManager.getInstance().getCookie(address);
        } catch (RuntimeException ignored) {
            // No WebView on this phone state; treated as not logged in.
        }
        if (cookie == null || cookie.isEmpty()) throw new Unavailable(PROBLEM_LOGIN);

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
