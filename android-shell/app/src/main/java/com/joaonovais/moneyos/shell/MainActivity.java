package com.joaonovais.moneyos.shell;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.InputType;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The Money OS site, full screen, from the computer that runs it.
 *
 * The pages, the numbers and the login all come from the site, so the phone
 * shows exactly what the computer shows. The one thing kept on the phone is the
 * last set of figures the home-screen widgets read (see WidgetData), so they
 * can still show something, with its time, away from home Wi-Fi. What
 * the app adds is what a browser tab would otherwise supply — choosing a file to
 * import, saving an export, the back gesture — and a screen that says what to
 * check when the computer cannot be reached.
 */
public class MainActivity extends Activity {
    static final String ACTION_OPEN_PAGE = "com.joaonovais.moneyos.site.OPEN_PAGE";
    static final String EXTRA_PATH = "path";
    private static final String PREFS = "money-os-shell";
    private static final String KEY_ADDRESS = "address";
    private static final int CHOOSE_FILE = 1;
    private static final int ASK_NOTIFICATIONS = 2;
    private static final int MAX_SAVED_BYTES = 50 * 1024 * 1024;

    private static final int BACKGROUND = Color.rgb(15, 17, 21);
    private static final int INK = Color.rgb(232, 232, 234);
    private static final int MUTED = Color.rgb(154, 160, 166);
    private static final int ACCENT = Color.rgb(122, 162, 255);
    private static final int WARNING = Color.rgb(242, 139, 130);
    private static final Pattern RGB = Pattern.compile("rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)");

    private FrameLayout root;
    private WebView web;
    private View overlay;
    private ValueCallback<Uri[]> pendingFiles;
    private String shellScript = "";
    private int lastColor = 0;

    /** The origin the app was told to open. */
    private volatile String address = "";
    /** The origin of the page on screen. The bridge answers only when the two agree. */
    private volatile String pageOrigin = "";

    /** A quick entry asked for by the widget, a shortcut or the notification, not yet handed to the page. */
    private String pendingQuick;
    /** A page of the site a widget asked for, such as "/transactions", not yet opened. */
    private String pendingPath;
    /** True between a page finishing and the next one starting. */
    private boolean pageReady;

    private android.window.OnBackInvokedCallback backCallback;
    private boolean backRegistered;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        drawBehindSystemBars();
        root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);
        root.setOnApplyWindowInsetsListener(this::padForSystemBars);
        setContentView(root);
        shellScript = readAsset("shell.js");
        pendingQuick = QuickEntry.kindOf(getIntent());
        pendingPath = pathOf(getIntent());
        // Swiping an ongoing notification away is allowed since Android 14; it
        // comes back the next time the app opens, for as long as it is switched on.
        if (QuickEntry.active(this)) QuickEntry.show(this);

        String saved = prefs().getString(KEY_ADDRESS, null);
        if (saved == null) showAddressForm(null, null);
        else openSite(saved, savedInstanceState);
    }

    // ---------------------------------------------------------------- the site

    private void openSite(String origin, Bundle state) {
        address = origin;
        removeOverlay();
        if (web == null) {
            web = createWebView();
            root.addView(web, 0, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        web.setVisibility(View.VISIBLE);
        if (pendingPath != null) {
            String path = pendingPath;
            pendingPath = null;
            web.loadUrl(origin + path);
            return;
        }
        if (state != null && web.restoreState(state) != null) return;
        web.loadUrl(origin);
    }

    private WebView createWebView() {
        WebView view = new WebView(this);
        view.setBackgroundColor(Color.TRANSPARENT);

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setUserAgentString(settings.getUserAgentString() + " MoneyOSAndroid/0.1");
        CookieManager.getInstance().setAcceptCookie(true);
        view.addJavascriptInterface(new Bridge(), "MoneyOSAndroid");

        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("blob".equals(url.getScheme())) return false;
                if (address.equals(originOf(url.toString()))) return false;
                // Another site — a broker, TradingView — belongs in the browser, and
                // must never see the bridge.
                openElsewhere(url);
                return true;
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap favicon) {
                pageReady = false;
                String origin = originOf(url);
                pageOrigin = origin == null ? "" : origin;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (address.equals(pageOrigin)) {
                    v.evaluateJavascript(shellScript, null);
                    pageReady = true;
                    deliverQuickEntry();
                }
                updateBackHandling();
            }

            @Override
            public void doUpdateVisitedHistory(WebView v, String url, boolean isReload) {
                updateBackHandling();
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showUnreachable(String.valueOf(error.getDescription()));
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                root.removeView(web);
                web.destroy();
                web = null;
                openSite(address, null);
                return true;
            }
        });

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                try {
                    startActivityForResult(params.createIntent(), CHOOSE_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingFiles = null;
                    callback.onReceiveValue(null);
                    toast("Não há nenhuma app para escolher ficheiros.");
                }
                return true;
            }
        });

        view.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            // The site's own exports are blobs, saved through the bridge. A real
            // address is something the browser can download properly.
            if (!url.startsWith("blob:") && !url.startsWith("data:")) openElsewhere(Uri.parse(url));
        });
        return view;
    }

    /** scheme://host[:port] for http and https, or null for anything else. */
    static String originOf(String text) {
        if (text == null) return null;
        String value = text.trim();
        if (value.isEmpty()) return null;
        if (!value.contains("://")) value = "http://" + value;
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || host == null || host.isEmpty()) return null;
        scheme = scheme.toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) return null;
        int port = uri.getPort();
        return scheme + "://" + host.toLowerCase(Locale.ROOT) + (port == -1 ? "" : ":" + port);
    }

    private void openElsewhere(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException e) {
            toast("Não há nenhuma app para abrir esta ligação.");
        }
    }

    // --------------------------------------------------- what the page calls

    private class Bridge {
        @JavascriptInterface
        public boolean quickNotificationEnabled() {
            return address.equals(pageOrigin) && QuickEntry.active(MainActivity.this);
        }

        @JavascriptInterface
        public void setQuickNotification(boolean enabled) {
            if (!address.equals(pageOrigin)) return;
            runOnUiThread(() -> MainActivity.this.setQuickNotification(enabled));
        }

        @JavascriptInterface
        public void themeColor(String value) {
            if (value == null || !address.equals(pageOrigin)) return;
            runOnUiThread(() -> applyColor(value));
        }

        @JavascriptInterface
        public void saveFile(String base64, String name, String mime) {
            if (base64 == null || !address.equals(pageOrigin)) return;
            String fileName = cleanName(name);
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (bytes.length > MAX_SAVED_BYTES) throw new IOException("File too large");
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE,
                        mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri item = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (item == null) throw new IOException("No place to save");
                try (OutputStream out = getContentResolver().openOutputStream(item)) {
                    if (out == null) throw new IOException("No stream");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(item, values, null, null);
                runOnUiThread(() -> toast("Guardado em Transferências: " + fileName));
            } catch (IOException | RuntimeException e) {
                runOnUiThread(() -> toast("Não foi possível guardar " + fileName + "."));
            }
        }
    }

    // ------------------------------------------------------------ quick entry

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String path = pathOf(intent);
        if (path != null) {
            if (web != null && overlay == null && !address.isEmpty()) web.loadUrl(address + path);
            else pendingPath = path;
            return;
        }
        String kind = QuickEntry.kindOf(intent);
        if (kind == null) return;
        pendingQuick = kind;
        deliverQuickEntry();
    }

    /** A path on the site from a widget: starts with one "/", never another origin. */
    static String pathOf(Intent intent) {
        if (intent == null || !ACTION_OPEN_PAGE.equals(intent.getAction())) return null;
        String path = intent.getStringExtra(EXTRA_PATH);
        if (path == null || !path.startsWith("/") || path.startsWith("//") || path.contains("\\")) return null;
        return path;
    }

    /**
     * Opens the site's quick entry form, once the site is on screen.
     *
     * The request is left on `window` as well as sent as an event: after a cold
     * start the page finishes loading before React has attached the listener,
     * and the form picks the request up from there when it mounts.
     */
    private void deliverQuickEntry() {
        if (pendingQuick == null || web == null || !pageReady || !address.equals(pageOrigin)) return;
        String kind = QuickEntry.INCOME.equals(pendingQuick) ? QuickEntry.INCOME : QuickEntry.EXPENSE;
        pendingQuick = null;
        web.evaluateJavascript("window.__moneyOsQuickEntry='" + kind + "';"
                + "window.dispatchEvent(new CustomEvent('money-os:quick-entry',{detail:'" + kind + "'}));", null);
    }

    private void setQuickNotification(boolean enabled) {
        if (!enabled) {
            QuickEntry.prefs(this).edit().putBoolean(QuickEntry.KEY_NOTIFICATION, false).apply();
            QuickEntry.hide(this);
            reportQuickNotification();
            return;
        }
        QuickEntry.prefs(this).edit().putBoolean(QuickEntry.KEY_NOTIFICATION, true).apply();
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, ASK_NOTIFICATIONS);
            return;
        }
        finishEnablingNotification();
    }

    private void finishEnablingNotification() {
        if (QuickEntry.active(this)) {
            QuickEntry.show(this);
        } else {
            // Refused now or earlier: only the system settings can allow it.
            QuickEntry.prefs(this).edit().putBoolean(QuickEntry.KEY_NOTIFICATION, false).apply();
            toast("As notificações da Money OS estão desligadas. Ativa-as nas definições do Android.");
            try {
                startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
            } catch (ActivityNotFoundException ignored) {
                // The toast already said where to go.
            }
        }
        reportQuickNotification();
    }

    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        if (request == ASK_NOTIFICATIONS) {
            finishEnablingNotification();
            return;
        }
        super.onRequestPermissionsResult(request, permissions, results);
    }

    /** Tells the settings page what the switch should now show. */
    private void reportQuickNotification() {
        if (web == null || !address.equals(pageOrigin)) return;
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('money-os:quick-notification',{detail:"
                + QuickEntry.active(this) + "}));", null);
    }

    static String cleanName(String name) {
        String cleaned = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return cleaned.isEmpty() ? "money-os-download" : cleaned;
    }

    @SuppressWarnings("deprecation")
    private void applyColor(String value) {
        int color;
        try {
            Matcher rgb = RGB.matcher(value);
            if (rgb.find()) {
                color = Color.rgb(Integer.parseInt(rgb.group(1)), Integer.parseInt(rgb.group(2)),
                        Integer.parseInt(rgb.group(3)));
            } else {
                color = Color.parseColor(value.trim());
            }
        } catch (RuntimeException e) {
            return;
        }
        if (color == lastColor) return;
        lastColor = color;
        root.setBackgroundColor(color);
        boolean light = Color.luminance(color) > 0.5f;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            int both = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            if (controller != null) controller.setSystemBarsAppearance(light ? both : 0, both);
        } else {
            View decor = getWindow().getDecorView();
            int flags = decor.getSystemUiVisibility();
            decor.setSystemUiVisibility(light
                    ? flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                    : flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    // ------------------------------------------------------- native screens

    private void showAddressForm(String problem, String typed) {
        LinearLayout box = column();
        box.addView(text("Money OS", 28, ACCENT, true));
        box.addView(text("Escreve o endereço do Money OS no teu computador. Aparece na janela "
                + "onde o site está a correr, por exemplo http://192.168.1.20:3000.", 16, INK, false));
        box.addView(text("O telemóvel tem de estar no mesmo Wi-Fi que o computador, e o site tem "
                + "de estar a correr.", 14, MUTED, false));

        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        input.setHint("http://IP-do-computador:3000");
        input.setTextColor(INK);
        input.setHintTextColor(MUTED);
        String current = typed != null ? typed : prefs().getString(KEY_ADDRESS, null);
        if (current != null) input.setText(current);
        box.addView(input);

        if (problem != null) box.addView(text(problem, 14, WARNING, false));

        Button connect = button("Ligar");
        connect.setOnClickListener(v -> {
            String entered = input.getText().toString();
            String origin = originOf(entered);
            if (origin == null) {
                showAddressForm("Esse endereço não é válido. Escreve algo como http://192.168.1.20:3000.", entered);
                return;
            }
            prefs().edit().putString(KEY_ADDRESS, origin).apply();
            openSite(origin, null);
        });
        input.setOnEditorActionListener((v, action, event) -> connect.performClick());
        box.addView(connect);
        show(box);
    }

    private void showUnreachable(String detail) {
        if (web != null) web.setVisibility(View.INVISIBLE);
        LinearLayout box = column();
        box.addView(text("Sem ligação ao Money OS", 24, INK, true));
        box.addView(text("Não consegui abrir " + address + ".", 16, INK, false));
        box.addView(text("Confirma que o computador está ligado, que o site está a correr e que o "
                + "telemóvel está no mesmo Wi-Fi. Se o endereço do computador mudou, escreve o novo.",
                14, MUTED, false));
        box.addView(text(detail, 12, MUTED, false));
        Button retry = button("Tentar outra vez");
        retry.setOnClickListener(v -> openSite(address, null));
        Button change = button("Mudar endereço");
        change.setOnClickListener(v -> showAddressForm(null, address));
        box.addView(retry);
        box.addView(change);
        show(box);
    }

    private LinearLayout column() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_VERTICAL);
        int pad = dp(28);
        box.setPadding(pad, pad, pad, pad);
        return box;
    }

    private TextView text(String value, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setPadding(0, 0, 0, dp(14));
        return view;
    }

    private Button button(String label) {
        Button view = new Button(this);
        view.setText(label);
        view.setAllCaps(false);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(8);
        view.setLayoutParams(params);
        return view;
    }

    private void show(View content) {
        removeOverlay();
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BACKGROUND);
        scroll.addView(content, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        overlay = scroll;
        root.addView(scroll, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        updateBackHandling();
    }

    private void removeOverlay() {
        if (overlay == null) return;
        root.removeView(overlay);
        overlay = null;
        updateBackHandling();
    }

    // ------------------------------------------------------ window and system

    private void drawBehindSystemBars() {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    /**
     * Keeps the page clear of the status bar, the navigation bar, a camera cutout
     * and the keyboard. Android 15 draws every app behind those bars, so the
     * padding is applied on every version rather than on some.
     */
    @SuppressWarnings("deprecation")
    private WindowInsets padForSystemBars(View view, WindowInsets insets) {
        if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsets.CONSUMED;
        }
        view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
        return insets.consumeSystemWindowInsets();
    }

    /**
     * Back goes back a page while there is one. Android 16 no longer calls
     * onBackPressed for apps that target it, so the gesture is claimed through
     * the dispatcher — and released on the first page, where back should leave.
     */
    private void updateBackHandling() {
        if (Build.VERSION.SDK_INT < 33) return;
        boolean wanted = overlay == null && web != null && web.canGoBack();
        if (wanted == backRegistered) return;
        if (backCallback == null) {
            backCallback = () -> {
                if (web != null && web.canGoBack()) web.goBack();
                updateBackHandling();
            };
        }
        if (wanted) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        } else {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        backRegistered = wanted;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (overlay == null && web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == CHOOSE_FILE) {
            if (pendingFiles != null) {
                pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            }
            pendingFiles = null;
            return;
        }
        super.onActivityResult(request, result, data);
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        // Whatever was just recorded or changed should reach the widgets.
        MoneyWidgets.refreshAll(this);
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ----------------------------------------------------------------- small

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            return "";
        }
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
                getResources().getDisplayMetrics()));
    }
}
