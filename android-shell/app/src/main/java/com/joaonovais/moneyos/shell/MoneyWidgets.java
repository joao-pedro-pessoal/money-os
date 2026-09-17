package com.joaonovais.moneyos.shell;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.format.DateUtils;
import android.text.style.ForegroundColorSpan;
import android.view.View;
import android.widget.RemoteViews;

/**
 * The home-screen widgets with figures: dashboard, net worth over time, where
 * the money is, and this month's cash flow.
 *
 * Each draws from the last figures read (see WidgetData) straight away, then
 * asks the site for new ones. Tapping a widget opens the matching page;
 * tapping ↻ refreshes. They refresh on their own about every half hour and
 * whenever the app is left, which is when something may have been recorded.
 */
public final class MoneyWidgets {
    static final String ACTION_REFRESH = "com.joaonovais.moneyos.site.WIDGET_REFRESH";

    private static final Class<?>[] ALL = {
            Dashboard.class, NetWorth.class, WhereMoney.class, CashFlow.class,
    };

    private MoneyWidgets() {}

    public static class Dashboard extends Base {
        @Override int kind() { return 0; }
    }

    public static class NetWorth extends Base {
        @Override int kind() { return 1; }
    }

    public static class WhereMoney extends Base {
        @Override int kind() { return 2; }
    }

    public static class CashFlow extends Base {
        @Override int kind() { return 3; }
    }

    /** Reads new figures and redraws every widget. Returns at once. */
    static void refreshAll(Context context) {
        Context app = context.getApplicationContext();
        if (!hasAny(app)) return;
        new Thread(() -> {
            WidgetData.refresh(app);
            drawAll(app);
        }, "money-os-widgets").start();
    }

    private static boolean hasAny(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> type : ALL) {
            if (manager.getAppWidgetIds(new ComponentName(context, type)).length > 0) return true;
        }
        return false;
    }

    static void drawAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int kind = 0; kind < ALL.length; kind++) {
            for (int id : manager.getAppWidgetIds(new ComponentName(context, ALL[kind]))) {
                draw(context, manager, id, kind);
            }
        }
    }

    abstract static class Base extends AppWidgetProvider {
        abstract int kind();

        @Override
        public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
            for (int id : ids) draw(context, manager, id, kind());
            PendingResult result = goAsync();
            new Thread(() -> {
                try {
                    WidgetData.refresh(context);
                    drawAll(context);
                } finally {
                    result.finish();
                }
            }, "money-os-widgets").start();
        }

        @Override
        public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
            draw(context, manager, id, kind());
        }

        @Override
        public void onReceive(Context context, Intent intent) {
            if (ACTION_REFRESH.equals(intent.getAction())) {
                PendingResult result = goAsync();
                new Thread(() -> {
                    try {
                        WidgetData.refresh(context);
                        drawAll(context);
                    } finally {
                        result.finish();
                    }
                }, "money-os-widgets").start();
                return;
            }
            super.onReceive(context, intent);
        }
    }

    // ------------------------------------------------------------ drawing

    private static final String[] TITLES = {"Money OS", "Net worth", "Where the money is", "Cash flow"};
    private static final String[] PATHS = {"/", "/analytics", "/", "/transactions"};

    private static void draw(Context context, AppWidgetManager manager, int id, int kind) {
        float density = context.getResources().getDisplayMetrics().density;
        Bundle options = manager.getAppWidgetOptions(id);
        int widthDp = Math.max(160, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250));
        int heightDp = Math.max(90, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 140));

        RemoteViews views = new RemoteViews(context.getPackageName(),
                kind == 2 ? R.layout.widget_where : R.layout.widget_money);
        views.setTextViewText(R.id.widget_title, TITLES[kind]);
        views.setOnClickPendingIntent(R.id.widget_root, openPage(context, PATHS[kind], kind));
        views.setOnClickPendingIntent(R.id.widget_refresh, refresh(context, ALL[kind], kind));

        WidgetData data = WidgetData.cached(context);
        String problem = WidgetData.problem(context);
        views.setTextViewText(R.id.widget_status, status(context, data, problem));

        if (data == null) {
            views.setTextViewText(R.id.widget_value, "—");
            if (kind != 2) {
                views.setViewVisibility(R.id.widget_sub, View.GONE);
                views.setViewVisibility(R.id.widget_chart, View.GONE);
            } else {
                views.setTextViewText(R.id.widget_legend, "");
            }
            manager.updateAppWidget(id, views);
            return;
        }

        int chartWidth = Math.round((widthDp - 28) * density);
        switch (kind) {
            case 0: { // Dashboard: net worth, and how this month is going.
                views.setTextViewText(R.id.widget_value, WidgetData.money(data.netWorth, data.currency));
                views.setViewVisibility(R.id.widget_sub, View.VISIBLE);
                views.setTextViewText(R.id.widget_sub, signed("This month ", data.net, data.currency));
                int chartHeight = Math.round(Math.max(20, heightDp - 96) * density);
                views.setViewVisibility(R.id.widget_chart, View.VISIBLE);
                views.setImageViewBitmap(R.id.widget_chart, Charts.line(data.series, chartWidth, chartHeight, density));
                break;
            }
            case 1: { // Net worth over time: the line, and how far it moved.
                views.setTextViewText(R.id.widget_value, WidgetData.money(data.netWorth, data.currency));
                views.setViewVisibility(R.id.widget_sub, View.VISIBLE);
                double change = data.series.size() < 2 ? 0
                        : data.series.get(data.series.size() - 1)[1] - data.series.get(0)[1];
                views.setTextViewText(R.id.widget_sub, signed("Since tracking began ", change, data.currency));
                int chartHeight = Math.round(Math.max(30, heightDp - 90) * density);
                views.setViewVisibility(R.id.widget_chart, View.VISIBLE);
                views.setImageViewBitmap(R.id.widget_chart, Charts.line(data.series, chartWidth, chartHeight, density));
                break;
            }
            case 2: { // Where the money is: a donut and the biggest places.
                double total = 0;
                for (double v : data.sliceValues) total += v;
                views.setTextViewText(R.id.widget_value, WidgetData.money(total, data.currency));
                int[] colors = new int[data.sliceValues.size()];
                SpannableStringBuilder legend = new SpannableStringBuilder();
                for (int i = 0; i < colors.length; i++) {
                    colors[i] = Charts.sliceColor(i, "Other".equals(data.sliceNames.get(i)));
                    int start = legend.length();
                    legend.append("● ");
                    legend.setSpan(new ForegroundColorSpan(colors[i]), start, legend.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    legend.append(data.sliceNames.get(i));
                    int pctStart = legend.length();
                    legend.append(total > 0 ? String.format(java.util.Locale.ROOT, "  %.0f%%", 100 * data.sliceValues.get(i) / total) : "");
                    legend.setSpan(new ForegroundColorSpan(Charts.MUTED), pctStart, legend.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    if (i < colors.length - 1) legend.append("\n");
                }
                if (colors.length == 0) legend.append("Nothing held yet");
                views.setTextViewText(R.id.widget_legend, legend);
                int size = Math.round(Math.max(48, Math.min(heightDp - 60, widthDp / 2 - 20)) * density);
                views.setImageViewBitmap(R.id.widget_chart, Charts.donut(data.sliceValues, colors, size, density));
                break;
            }
            default: { // Cash flow: this month in, out, and what is left.
                views.setTextViewText(R.id.widget_value, signed("", data.net, data.currency));
                views.setViewVisibility(R.id.widget_sub, View.VISIBLE);
                SpannableStringBuilder sub = new SpannableStringBuilder(data.monthLabel + "  ");
                int in = sub.length();
                sub.append("In ").append(WidgetData.money(data.income, data.currency));
                sub.setSpan(new ForegroundColorSpan(Charts.GREEN), in, sub.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                sub.append("  ");
                int out = sub.length();
                sub.append("Out ").append(WidgetData.money(data.expenses, data.currency));
                sub.setSpan(new ForegroundColorSpan(Charts.RED), out, sub.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                views.setTextViewText(R.id.widget_sub, sub);
                int chartHeight = Math.round(Math.min(28, Math.max(16, heightDp - 96)) * density);
                views.setViewVisibility(R.id.widget_chart, View.VISIBLE);
                views.setImageViewBitmap(R.id.widget_chart, Charts.flows(data.income, data.expenses, chartWidth, chartHeight, density));
                break;
            }
        }
        manager.updateAppWidget(id, views);
    }

    /** "+1 234,00 €" in green or "−56,00 €" in red, after an optional label. */
    private static CharSequence signed(String label, double value, String currency) {
        SpannableStringBuilder text = new SpannableStringBuilder(label);
        int start = text.length();
        String amount = WidgetData.money(Math.abs(value), currency);
        text.append(value > 0 ? "+" + amount : value < 0 ? "−" + amount : amount);
        int color = value > 0 ? Charts.GREEN : value < 0 ? Charts.RED : Charts.MUTED;
        text.setSpan(new ForegroundColorSpan(color), start, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return text;
    }

    private static String status(Context context, WidgetData data, String problem) {
        // The time alone for today's figures; the date too once they are older.
        String when = data == null ? null
                : DateUtils.formatSameDayTime(data.readAt, System.currentTimeMillis(),
                        java.text.DateFormat.SHORT, java.text.DateFormat.SHORT).toString();
        if (WidgetData.PROBLEM_NO_ADDRESS.equals(problem)) return "Open the app to connect";
        if (WidgetData.PROBLEM_LOGIN.equals(problem)) return "Open the app and log in";
        if (WidgetData.PROBLEM_OFFLINE.equals(problem)) {
            return when == null ? "Can't reach the computer" : "Offline · figures from " + when;
        }
        return when == null ? "Loading…" : "Updated " + when;
    }

    private static PendingIntent openPage(Context context, String path, int kind) {
        Intent intent = new Intent(context, MainActivity.class)
                .setAction(MainActivity.ACTION_OPEN_PAGE)
                .putExtra(MainActivity.EXTRA_PATH, path)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, 100 + kind, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent refresh(Context context, Class<?> provider, int kind) {
        Intent intent = new Intent(context, provider).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(context, 200 + kind, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
