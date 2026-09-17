package com.joaonovais.moneyos.shell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/**
 * Recording an expense without opening the app first.
 *
 * The widget, the icon shortcuts and the notification all do one thing: open
 * the app straight on the site's quick entry form, as an expense or an income.
 * Nothing is saved from here. The form is the site's own, with its duplicate
 * protection, its currency and its undo, so there is still one way a movement
 * gets recorded — this only removes the taps before it.
 */
final class QuickEntry {
    static final String ACTION = "com.joaonovais.moneyos.site.QUICK_ENTRY";
    static final String EXTRA_KIND = "quick";
    static final String EXPENSE = "expense";
    static final String INCOME = "income";

    static final String PREFS = "money-os-shell";
    static final String KEY_NOTIFICATION = "quick_notification";
    private static final String CHANNEL = "quick_entry";
    private static final int NOTIFICATION_ID = 1;

    private QuickEntry() {}

    /** "expense" or "income", or null for anything else. */
    static String kindOf(Intent intent) {
        if (intent == null) return null;
        String kind = intent.getStringExtra(EXTRA_KIND);
        return EXPENSE.equals(kind) || INCOME.equals(kind) ? kind : null;
    }

    static PendingIntent open(Context context, String kind) {
        Intent intent = new Intent(context, MainActivity.class)
                .setAction(ACTION)
                .putExtra(EXTRA_KIND, kind)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // A distinct request code per kind, or the second PendingIntent would
        // replace the first and both buttons would open the same form.
        int code = EXPENSE.equals(kind) ? 1 : 2;
        return PendingIntent.getActivity(context, code, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean wanted(Context context) {
        return prefs(context).getBoolean(KEY_NOTIFICATION, false);
    }

    /** Whether the notification is both asked for and allowed by the system. */
    static boolean active(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        return wanted(context) && manager != null && manager.areNotificationsEnabled();
    }

    static void show(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || !manager.areNotificationsEnabled()) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL,
                "Registo rápido", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Botões para registar uma despesa ou uma receita.");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);

        Notification notification = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_quick_entry)
                .setContentTitle("Registar um movimento")
                .setContentText("Toca para registar uma despesa")
                .setContentIntent(open(context, EXPENSE))
                .addAction(new Notification.Action.Builder(null, "Despesa", open(context, EXPENSE)).build())
                .addAction(new Notification.Action.Builder(null, "Receita", open(context, INCOME)).build())
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .build();
        manager.notify(NOTIFICATION_ID, notification);
    }

    static void hide(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
    }
}
