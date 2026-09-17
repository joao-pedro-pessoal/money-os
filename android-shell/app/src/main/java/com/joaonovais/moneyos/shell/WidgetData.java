package com.joaonovais.moneyos.shell;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Currency;
import java.util.List;
import java.util.Locale;

/**
 * The figures behind the widgets and the quick settings tile.
 *
 * Read from the site's /api/widget with the session cookie the app's WebView
 * already holds, so a phone that is not logged in gets nothing. The last answer
 * is kept on the phone so a widget still shows something away from home Wi-Fi,
 * always with the time it was read — a figure without its age would pass for
 * today's.
 */
final class WidgetData {
    private static final String KEY_JSON = "widget_json";
    private static final String KEY_READ_AT = "widget_read_at";
    private static final String KEY_PROBLEM = "widget_problem";
    private static final String KEY_ADDRESS = "address";

    static final String PROBLEM_LOGIN = "login";
    static final String PROBLEM_OFFLINE = "offline";
    static final String PROBLEM_NO_ADDRESS = "address";

    final String currency;
    final double netWorth;
    final List<double[]> series = new ArrayList<>();
    final List<String> sliceNames = new ArrayList<>();
    final List<Double> sliceValues = new ArrayList<>();
    final String monthLabel;
    final double income;
    final double expenses;
    final double net;
    /** When the figures were read, in milliseconds. */
    final long readAt;

    private WidgetData(JSONObject json, long readAt) throws JSONException {
        currency = json.getString("currency");
        netWorth = json.getDouble("netWorth");
        JSONArray points = json.getJSONArray("series");
        for (int i = 0; i < points.length(); i++) {
            series.add(new double[]{i, points.getJSONObject(i).getDouble("value")});
        }
        JSONArray where = json.getJSONArray("where");
        for (int i = 0; i < where.length(); i++) {
            sliceNames.add(where.getJSONObject(i).getString("name"));
            sliceValues.add(where.getJSONObject(i).getDouble("value"));
        }
        JSONObject month = json.getJSONObject("month");
        monthLabel = month.getString("label");
        income = month.getDouble("income");
        expenses = month.getDouble("expenses");
        net = month.getDouble("net");
        this.readAt = readAt;
    }

    private static SharedPreferences prefs(Context context) {
        return QuickEntry.prefs(context);
    }

    /** The last figures read, or null when there are none. */
    static WidgetData cached(Context context) {
        SharedPreferences prefs = prefs(context);
        String json = prefs.getString(KEY_JSON, null);
        if (json == null) return null;
        try {
            return new WidgetData(new JSONObject(json), prefs.getLong(KEY_READ_AT, 0));
        } catch (JSONException e) {
            return null;
        }
    }

    /** Why the last refresh failed, or null when it worked. */
    static String problem(Context context) {
        return prefs(context).getString(KEY_PROBLEM, null);
    }

    /** Asks the site for fresh figures. Blocking: call off the main thread. */
    static void refresh(Context context) {
        SharedPreferences prefs = prefs(context);
        String address = prefs.getString(KEY_ADDRESS, null);
        if (address == null) {
            prefs.edit().putString(KEY_PROBLEM, PROBLEM_NO_ADDRESS).apply();
            return;
        }
        String cookie = null;
        try {
            cookie = CookieManager.getInstance().getCookie(address);
        } catch (RuntimeException ignored) {
            // No WebView on this phone state; treated as not logged in.
        }
        if (cookie == null || cookie.isEmpty()) {
            prefs.edit().putString(KEY_PROBLEM, PROBLEM_LOGIN).apply();
            return;
        }

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address + "/api/widget").openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(15000);
            // A redirect here is the login page, not the data.
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Cookie", cookie);
            connection.setRequestProperty("Accept", "application/json");
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400 || status == 401 || status == 403) {
                prefs.edit().putString(KEY_PROBLEM, PROBLEM_LOGIN).apply();
                return;
            }
            if (status != 200) throw new IOException("HTTP " + status);
            String body = read(connection.getInputStream());
            new WidgetData(new JSONObject(body), System.currentTimeMillis()); // validates
            prefs.edit()
                    .putString(KEY_JSON, body)
                    .putLong(KEY_READ_AT, System.currentTimeMillis())
                    .remove(KEY_PROBLEM)
                    .apply();
        } catch (IOException | JSONException | RuntimeException e) {
            prefs.edit().putString(KEY_PROBLEM, PROBLEM_OFFLINE).apply();
        } finally {
            if (connection != null) connection.disconnect();
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

    /** As the site writes money: pt-PT, and dollars as "$" rather than "US$". */
    static String money(double value, String currency) {
        NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("pt", "PT"));
        try {
            format.setCurrency(Currency.getInstance(currency));
        } catch (IllegalArgumentException ignored) {
            // Unknown code: the number still reads, with the default symbol.
        }
        return format.format(value).replace("US$", "$");
    }
}
