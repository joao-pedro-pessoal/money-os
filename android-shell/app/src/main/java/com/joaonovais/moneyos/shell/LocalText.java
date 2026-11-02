package com.joaonovais.moneyos.shell;

import android.content.Context;
import android.webkit.CookieManager;
import org.json.JSONObject;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Static UI dictionaries, selected by the same cookie as the website. */
final class LocalText {
    private static String loadedLanguage = "";
    private static JSONObject catalog = new JSONObject();
    private LocalText() {}

    static String language(Context context) {
        try {
            String address = Site.address(context);
            String cookie = address == null ? null : CookieManager.getInstance().getCookie(address);
            if (cookie != null) for (String part : cookie.split(";")) {
                String value = part.trim();
                if (value.startsWith("moneyos_language=")) return supported(value.substring(17));
            }
        } catch (RuntimeException ignored) { }
        return supported(Locale.getDefault().getLanguage());
    }

    private static String supported(String value) {
        String language = value.startsWith("zh") ? "zh-CN" : value;
        return BuildConfig.LANGUAGES.contains("|" + language + "|") ? language : "en";
    }

    static synchronized String text(Context context, String source) {
        String language = language(context);
        if (!language.equals(loadedLanguage)) {
            try (InputStream stream = context.getAssets().open("i18n/" + language + ".json")) {
                java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[4096]; int count;
                while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
                catalog = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
                loadedLanguage = language;
            } catch (Exception ignored) { return source; }
        }
        return catalog.optString(source, source);
    }
}
