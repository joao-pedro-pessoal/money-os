package com.joaonovais.moneyos.shell;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/** Two buttons on the home screen: Despesa and Receita. */
public class QuickEntryWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_entry);
            views.setOnClickPendingIntent(R.id.widget_expense, QuickEntry.open(context, QuickEntry.EXPENSE));
            views.setOnClickPendingIntent(R.id.widget_income, QuickEntry.open(context, QuickEntry.INCOME));
            manager.updateAppWidget(id, views);
        }
    }
}
