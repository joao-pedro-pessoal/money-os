package com.joaonovais.moneyos.shell;

import android.app.Activity;
import android.content.MutableContextWrapper;
import android.os.CancellationSignal;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native Google proof. Tokens never enter page JavaScript, URLs or preferences. */
final class GoogleLogin {
    private final Activity activity;
    private final WebView web;
    private final String origin;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final CancellationSignal cancellation = new CancellationSignal();
    private String verifier;
    private boolean busy;
    private boolean closed;

    GoogleLogin(Activity activity, WebView web, String origin) {
        this.activity = activity;
        this.web = web;
        this.origin = origin;
        if (!origin.startsWith("https://") || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(web, "MoneyOSGoogle", Collections.singleton(origin), (view, message, source, mainFrame, reply) -> {
            if (!mainFrame || !origin.equals(source.toString()) || !onSite()) return;
            try {
                String body = message.getData();
                if (body == null || body.length() > 256) throw new IllegalArgumentException();
                JSONObject input = new JSONObject(body);
                String action = input.getString("action");
                if ("prepare".equals(action) && !busy) {
                    byte[] random = new byte[32]; new SecureRandom().nextBytes(random);
                    verifier = hex(random);
                    reply.postMessage(new JSONObject().put("kind", "prepared").put("challenge", hex(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.UTF_8)))).toString());
                } else if ("sign-in".equals(action) && !busy && verifier != null && input.optString("id").matches("[a-f0-9]{64}")) {
                    busy = true;
                    begin(input.getString("id"), verifier, reply);
                } else fail(reply);
            } catch (Exception ignored) { fail(reply); }
        });
    }

    private boolean onSite() {
        return !closed && !activity.isFinishing() && origin.equals(MainActivity.originOf(web.getUrl()));
    }

    private void begin(String id, String proof, JavaScriptReplyProxy reply) {
        worker.execute(() -> {
            try {
                JSONObject challenge = post(new JSONObject().put("id", id).put("verifier", proof));
                String client = challenge.getString("clientId"), nonce = challenge.getString("nonce");
                activity.runOnUiThread(() -> {
                    if (!onSite()) { fail(reply); return; }
                    try {
                        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(client).setNonce(nonce).build();
                        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
                        CredentialManager.create(activity).getCredentialAsync(new MutableContextWrapper(activity), request, cancellation, activity.getMainExecutor(),
                                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                                    @Override public void onError(GetCredentialException error) { fail(reply); }
                                    @Override public void onResult(GetCredentialResponse result) {
                                        if (!onSite()) { fail(reply); return; }
                                        try {
                                            if (!(result.getCredential() instanceof CustomCredential)) throw new IllegalArgumentException();
                                            CustomCredential credential = (CustomCredential) result.getCredential();
                                            if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) throw new IllegalArgumentException();
                                            String token = GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
                                            verify(id, proof, token, reply);
                                        } catch (Exception ignored) { fail(reply); }
                                    }
                                });
                    } catch (Exception ignored) { fail(reply); }
                });
            } catch (Exception ignored) { activity.runOnUiThread(() -> fail(reply)); }
        });
    }

    private void verify(String id, String proof, String token, JavaScriptReplyProxy reply) {
        worker.execute(() -> {
            try {
                JSONObject result = post(new JSONObject().put("id", id).put("verifier", proof).put("token", token));
                if (!result.optBoolean("ready")) throw new IllegalArgumentException();
                activity.runOnUiThread(() -> {
                    if (!onSite()) { fail(reply); return; }
                    try {
                        reply.postMessage("{\"kind\":\"finishing\"}");
                        Site.beginSessionChange(activity);
                        web.postUrl(origin + "/api/auth/google/complete", ("id=" + URLEncoder.encode(id, "UTF-8") + "&verifier=" + URLEncoder.encode(proof, "UTF-8")).getBytes(StandardCharsets.UTF_8));
                    } catch (Exception ignored) { fail(reply); }
                    finally { verifier = null; busy = false; }
                });
            } catch (Exception ignored) { activity.runOnUiThread(() -> fail(reply)); }
        });
    }

    private JSONObject post(JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(origin + "/api/auth/google/native").openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(5000); connection.setReadTimeout(15000);
            connection.setRequestMethod("POST"); connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Origin", origin);
            String cookie = CookieManager.getInstance().getCookie(origin);
            if (cookie == null) throw new IllegalArgumentException();
            connection.setRequestProperty("Cookie", cookie);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (java.io.OutputStream out = connection.getOutputStream()) { out.write(bytes); }
            if (connection.getResponseCode() != 200) throw new IllegalArgumentException();
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[2048]; int n;
                while ((n = in.read(buffer)) != -1) { if (out.size() + n > 16384) throw new IllegalArgumentException(); out.write(buffer, 0, n); }
                return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
            }
        } finally { connection.disconnect(); }
    }

    private void fail(JavaScriptReplyProxy reply) {
        verifier = null; busy = false;
        if (onSite()) reply.postMessage("{\"kind\":\"error\"}");
    }

    void pageFinished() {
        if (!onSite()) return;
        Site.finishSessionChange();
        String cookie = CookieManager.getInstance().getCookie(origin);
        String owner = sessionOwner(cookie);
        String previous = QuickEntry.prefs(activity).getString("session_owner", "");
        if (owner.equals(previous)) return;
        QuickEntry.prefs(activity).edit().putString("session_owner", owner).apply();
        Site.beginSessionChange(activity);
        Site.finishSessionChange();
        if (owner.isEmpty()) {
            CredentialManager.create(activity).clearCredentialStateAsync(new ClearCredentialStateRequest(), null, activity.getMainExecutor(),
                    new CredentialManagerCallback<Void, ClearCredentialException>() {
                        @Override public void onResult(Void result) { }
                        @Override public void onError(ClearCredentialException error) { }
                    });
        }
        MoneyWidgets.refreshAll(activity);
    }

    static String sessionOwner(String cookie) {
        if (cookie == null) return "";
        for (String part : cookie.split(";")) {
            if (!part.trim().startsWith("moneyos_session=")) continue;
            String[] fields = part.trim().substring("moneyos_session=".length()).split("\\.");
            if (fields.length == 5 && (fields[0].equals("v3") || fields[0].equals("v4")) && fields[1].matches("[a-z0-9]{1,40}")) return fields[1];
            if (fields.length == 4 && fields[0].equals("v2")) return "owner";
        }
        return "";
    }

    void close() { closed = true; verifier = null; cancellation.cancel(); worker.shutdownNow(); }
    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return out.toString();
    }
}
