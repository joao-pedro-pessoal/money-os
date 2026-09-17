package com.joaonovais.moneyos.shell;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

/**
 * The rows of the Investments widget: every position, largest first, each
 * with its value and its unrealized P&L in money and in percent.
 *
 * A position with no measured result (cash, an unknown cost) shows "—" in both
 * rather than +0,00 € and 0%, which would claim it had been measured flat.
 */
public class PositionsListService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Rows(getApplicationContext());
    }

    private static final class Rows implements RemoteViewsFactory {
        private final Context context;
        private WidgetData data;

        Rows(Context context) {
            this.context = context;
        }

        @Override public void onCreate() { data = WidgetData.cached(context); }

        @Override public void onDataSetChanged() { data = WidgetData.cached(context); }

        @Override public void onDestroy() {}

        @Override
        public int getCount() {
            return data == null ? 0 : data.topNames.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_position_row);
            if (data == null || position >= data.topNames.size()) return row;
            row.setTextViewText(R.id.row_name, data.topNames.get(position));
            row.setTextViewText(R.id.row_value, WidgetData.money(data.topValues.get(position), data.currency));

            double pnl = data.topPnl.get(position);
            double percent = data.topPercent.get(position);
            if (Double.isNaN(pnl)) {
                row.setTextViewText(R.id.row_pnl, "—");
                row.setTextColor(R.id.row_pnl, Charts.MUTED);
            } else {
                String amount = WidgetData.money(Math.abs(pnl), data.currency);
                row.setTextViewText(R.id.row_pnl, pnl > 0 ? "+" + amount : pnl < 0 ? "−" + amount : amount);
                row.setTextColor(R.id.row_pnl, pnl > 0 ? Charts.GREEN : pnl < 0 ? Charts.RED : Charts.MUTED);
            }
            if (Double.isNaN(percent)) {
                row.setTextViewText(R.id.row_percent, "—");
                row.setTextColor(R.id.row_percent, Charts.MUTED);
            } else {
                row.setTextViewText(R.id.row_percent, String.format(java.util.Locale.ROOT, "%+.2f%%", percent));
                row.setTextColor(R.id.row_percent, percent > 0 ? Charts.GREEN : percent < 0 ? Charts.RED : Charts.MUTED);
            }
            // Filled into the widget's template: a tap on a row opens Investments.
            row.setOnClickFillInIntent(R.id.row_root, new Intent());
            return row;
        }

        @Override public RemoteViews getLoadingView() { return null; }

        @Override public int getViewTypeCount() { return 1; }

        @Override public long getItemId(int position) { return position; }

        @Override public boolean hasStableIds() { return false; }
    }
}
