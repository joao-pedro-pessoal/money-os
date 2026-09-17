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
 * the money is, this month's cash flow, and five about investing: the
 * portfolio, allocation by asset type, winners and losers, dividends and open
 * trades.
 *
 * Each draws from the last figures read (see WidgetData) straight away, then
 * asks the site for new ones. Tapping a widget opens the matching page;
 * tapping ↻ refreshes. They refresh on their own about every half hour and
 * whenever the app is left, which is when something may have been recorded.
 */
public final class MoneyWidgets {
    static final String ACTION_REFRESH = "com.joaonovais.moneyos.site.WIDGET_REFRESH";

    private static final Class<?>[] ALL = {
            Dashboard.class, NetWorth.class, WhereMoney.class, CashFlow.class, Investments.class,
            Allocation.class, Movers.class, Dividends.class, OpenTrades.class,
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

    public static class Investments extends Base {
        @Override int kind() { return 4; }
    }

    public static class Allocation extends Base {
        @Override int kind() { return 5; }
    }

    public static class Movers extends Base {
        @Override int kind() { return 6; }
    }

    public static class Dividends extends Base {
        @Override int kind() { return 7; }
    }

    public static class OpenTrades extends Base {
        @Override int kind() { return 8; }
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

    private static final String[] TITLES = {"Money OS", "Net worth", "Where the money is", "Cash flow",
            "Investments", "Allocation", "Winners & losers", "Dividends", "Open trades"};
    private static final String[] PATHS = {"/", "/analytics", "/", "/transactions",
            "/investments", "/investments/analysis", "/investments", "/investments/dividends", "/positions"};

    /** Whether a kind uses the donut layout. */
    private static boolean isDonut(int kind) {
        return kind == 2 || kind == 5;
    }

    /** How many list rows fit under the headline at this height. */
    private static int rows(int heightDp) {
        return Math.max(1, Math.min(10, (heightDp - 96) / 19));
    }

    private static void draw(Context context, AppWidgetManager manager, int id, int kind) {
        float density = context.getResources().getDisplayMetrics().density;
        Bundle options = manager.getAppWidgetOptions(id);
        int widthDp = Math.max(160, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250));
        int heightDp = Math.max(90, options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 140));

        RemoteViews views = new RemoteViews(context.getPackageName(),
                isDonut(kind) ? R.layout.widget_where : R.layout.widget_money);
        views.setTextViewText(R.id.widget_title, TITLES[kind]);
        views.setOnClickPendingIntent(R.id.widget_root, openPage(context, PATHS[kind], kind));
        views.setOnClickPendingIntent(R.id.widget_refresh, refresh(context, ALL[kind], kind));

        WidgetData data = WidgetData.cached(context);
        String problem = WidgetData.problem(context);
        views.setTextViewText(R.id.widget_status, status(context, data, problem));

        if (data == null) {
            views.setTextViewText(R.id.widget_value, "—");
            if (!isDonut(kind)) {
                views.setViewVisibility(R.id.widget_sub, View.GONE);
                views.setViewVisibility(R.id.widget_chart, View.GONE);
                views.setViewVisibility(R.id.widget_legend, View.GONE);
            } else {
                views.setTextViewText(R.id.widget_legend, "");
            }
            manager.updateAppWidget(id, views);
            return;
        }

        int chartWidth = Math.round((widthDp - 28) * density);
        switch (kind) {
            case 0: { // Dashboard: net worth, and how this month is going.
                views.setViewVisibility(R.id.widget_legend, View.GONE);
                views.setTextViewText(R.id.widget_value, WidgetData.money(data.netWorth, data.currency));
                views.setViewVisibility(R.id.widget_sub, View.VISIBLE);
                views.setTextViewText(R.id.widget_sub, signed("This month ", data.net, data.currency));
                int chartHeight = Math.round(Math.max(20, heightDp - 96) * density);
                views.setViewVisibility(R.id.widget_chart, View.VISIBLE);
                views.setImageViewBitmap(R.id.widget_chart, Charts.line(data.series, chartWidth, chartHeight, density));
                break;
            }
            case 1: { // Net worth over time: the line, and how far it moved.
                views.setViewVisibility(R.id.widget_legend, View.GONE);
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
            case 2: // Where the money is: a donut and the biggest places.
                donut(views, data.sliceNames, data.sliceValues, data.currency, "Nothing held yet", widthDp, heightDp, density);
                break;
            case 5: // Allocation: the portfolio by asset type.
                donut(views, data.allocationNames, data.allocationValues, data.currency, "No positions yet", widthDp, heightDp, density);
                break;
            case 4: { // Investments: what is held, how it is doing, the largest positions.
                views.setTextViewText(R.id.widget_value, WidgetData.money(data.investedValue, data.currency));
                views.setViewVisibility(R.id.widget_sub, View.VISIBLE);
                CharSequence pnl = signed("Unrealized ", data.investedPnl, data.currency);
                SpannableStringBuilder sub = new SpannableStringBuilder(pnl);
                if (data.investedPnl != 0) {
                    sub.append(String.format(java.util.Locale.ROOT, "  %+.2f%%", data.investedPnlPercent));
                }
                views.setTextViewText(R.id.widget_sub, sub);
                views.setViewVisibility(R.id.widget_chart, View.GONE);
                SpannableStringBuilder list = new SpannableStringBuilder();
                // A taller widget lists more of them.
                for (int i = 0; i < Math.min(rows(heightDp), data.topNames.size()); i++) {
                    if (i > 0) list.append("\n");
                    list.append(data.topNames.get(i)).append("  ");
                    int valueStart = list.length();
                    list.append(WidgetData.money(data.topValues.get(i), data.currency));
                    list.setSpan(new ForegroundColorSpan(Charts.MUTED), valueStart, list.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    double result = data.topPnl.get(i);
                    if (!Double.isNaN(result)) list.append("  ").append(signed("", result, data.currency));
                }
                if (data.topNames.isEmpty()) list.append(data.positionCount == 0 ? "No positions yet" : "");
                showList(views, list, rows(heightDp));
                break;
            }
            case 6: { // Winners & losers: return on cost, best and worst.
                views.setViewVisibility(R.id.widget_chart, View.GONE);
                int room = rows(heightDp + 19);
                int bestRows = Math.min(data.bestNames.size(), Math.max(1, (room + 1) / 2));
                int worstRows = Math.min(data.worstNames.size(), room - bestRows);
                if (!data.bestNames.isEmpty()) {
                    views.setTextViewText(R.id.widget_value, data.bestNames.get(0) + "  "
                            + String.format(java.util.Locale.ROOT, "%+.1f%%", data.bestPercent.get(0)));
                } else {
                    views.setTextViewText(R.id.widget_value, "—");
                }
                views.setViewVisibility(R.id.widget_sub, View.VISIBLE);
                views.setTextViewText(R.id.widget_sub, "Best and worst on what they cost");
                SpannableStringBuilder list = new SpannableStringBuilder();
                for (int i = 0; i < bestRows; i++) moverRow(list, data.bestNames.get(i), data.bestPercent.get(i), data.bestPnl.get(i), data.currency);
                for (int i = 0; i < worstRows; i++) moverRow(list, data.worstNames.get(i), data.worstPercent.get(i), data.worstPnl.get(i), data.currency);
                if (list.length() == 0) list.append("No measured results yet");
                showList(views, list, room);
                break;
            }
            case 7: { // Dividends: all received, this year, and what should come next.
                views.setViewVisibility(R.id.widget_chart, View.GONE);
                views.setTextViewText(R.id.widget_value, WidgetData.money(data.dividendsTotal, data.currency));
                views.setViewVisibility(R.id.widget_sub, View.VISIBLE);
                views.setTextViewText(R.id.widget_sub, "Received, all time");
                SpannableStringBuilder list = new SpannableStringBuilder();
                if (!data.dividendsAny) {
                    list.append("No distributions on record yet");
                } else {
                    list.append("This year  ");
                    int start = list.length();
                    list.append(WidgetData.money(data.dividendsThisYear, data.currency));
                    list.setSpan(new ForegroundColorSpan(Charts.GREEN), start, list.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    list.append("  ·  ").append(String.valueOf(data.dividendPaymentsThisYear))
                            .append(data.dividendPaymentsThisYear == 1 ? " payment" : " payments");
                    if (data.nextDividendName != null) {
                        list.append("\nNext  ").append(data.nextDividendName);
                        int when = list.length();
                        list.append("  ~ ").append(monthOf(data.nextDividendMonth));
                        list.setSpan(new ForegroundColorSpan(Charts.ACCENT), when, list.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    }
                }
                showList(views, list, 3);
                break;
            }
            case 8: { // Open trades: what the leveraged positions are doing now.
                views.setViewVisibility(R.id.widget_chart, View.GONE);
                views.setTextViewText(R.id.widget_value, signed("", data.tradeUnrealized, data.currency));
                views.setViewVisibility(R.id.widget_sub, View.VISIBLE);
                views.setTextViewText(R.id.widget_sub, data.tradeCount + (data.tradeCount == 1 ? " open · margin " : " open · margin ")
                        + WidgetData.money(data.tradeMargin, data.currency));
                SpannableStringBuilder list = new SpannableStringBuilder();
                for (int i = 0; i < Math.min(rows(heightDp), data.tradeNames.size()); i++) {
                    if (i > 0) list.append("\n");
                    list.append(data.tradeNames.get(i)).append(" ");
                    String side = data.tradeSides.get(i);
                    int sideStart = list.length();
                    list.append(side.toUpperCase(java.util.Locale.ROOT));
                    list.setSpan(new ForegroundColorSpan("long".equals(side) ? Charts.GREEN : Charts.RED),
                            sideStart, list.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    double leverage = data.tradeLeverage.get(i);
                    if (!Double.isNaN(leverage)) {
                        int levStart = list.length();
                        list.append(String.format(java.util.Locale.ROOT, " %.0fx", leverage));
                        list.setSpan(new ForegroundColorSpan(Charts.MUTED), levStart, list.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    }
                    double result = data.tradePnl.get(i);
                    if (!Double.isNaN(result)) list.append("  ").append(signed("", result, data.currency));
                }
                if (data.tradeNames.isEmpty()) list.append("No open trades");
                showList(views, list, rows(heightDp));
                break;
            }
            default: { // Cash flow: this month in, out, and what is left.
                views.setViewVisibility(R.id.widget_legend, View.GONE);
                views.setTextViewText(R.id.widget_value, signed("", data.net, data.currency));
                views.setViewVisibility(R.id.widget_sub, View.VISIBLE);
                views.setTextViewText(R.id.widget_title, TITLES[kind] + " · " + data.monthLabel);
                SpannableStringBuilder sub = new SpannableStringBuilder();
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

    private static void showList(RemoteViews views, CharSequence text, int lines) {
        views.setViewVisibility(R.id.widget_legend, View.VISIBLE);
        views.setInt(R.id.widget_legend, "setMaxLines", Math.max(1, lines));
        views.setTextViewText(R.id.widget_legend, text);
    }

    private static void moverRow(SpannableStringBuilder list, String name, double percent, double pnl, String currency) {
        if (list.length() > 0) list.append("\n");
        list.append(name).append("  ");
        int start = list.length();
        list.append(String.format(java.util.Locale.ROOT, "%+.1f%%", percent));
        list.setSpan(new ForegroundColorSpan(percent >= 0 ? Charts.GREEN : Charts.RED), start, list.length(),
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        int money = list.length();
        list.append("  ").append(WidgetData.money(pnl, currency));
        list.setSpan(new ForegroundColorSpan(Charts.MUTED), money, list.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }

    /** "October 2026" from the site's ISO date, in the phone's time zone. */
    private static String monthOf(String iso) {
        try {
            return java.time.Instant.parse(iso).atZone(java.time.ZoneId.systemDefault())
                    .format(java.time.format.DateTimeFormatter.ofPattern("MMMM yyyy", java.util.Locale.ENGLISH));
        } catch (RuntimeException e) {
            return "";
        }
    }

    /** A donut with the total above it and a legend of names and shares beside it. */
    private static void donut(RemoteViews views, java.util.List<String> names, java.util.List<Double> values,
                              String currency, String empty, int widthDp, int heightDp, float density) {
        double total = 0;
        for (double v : values) total += v;
        views.setTextViewText(R.id.widget_value, WidgetData.money(total, currency));
        int[] colors = new int[values.size()];
        SpannableStringBuilder legend = new SpannableStringBuilder();
        for (int i = 0; i < colors.length; i++) {
            colors[i] = Charts.sliceColor(i, "Other".equals(names.get(i)));
            int start = legend.length();
            legend.append("● ");
            legend.setSpan(new ForegroundColorSpan(colors[i]), start, legend.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            legend.append(names.get(i));
            int pctStart = legend.length();
            legend.append(total > 0 ? String.format(java.util.Locale.ROOT, "  %.0f%%", 100 * values.get(i) / total) : "");
            legend.setSpan(new ForegroundColorSpan(Charts.MUTED), pctStart, legend.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            if (i < colors.length - 1) legend.append("\n");
        }
        if (colors.length == 0) legend.append(empty);
        views.setTextViewText(R.id.widget_legend, legend);
        int size = Math.round(Math.max(48, Math.min(heightDp - 60, widthDp / 2 - 20)) * density);
        views.setImageViewBitmap(R.id.widget_chart, Charts.donut(values, colors, size, density));
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
