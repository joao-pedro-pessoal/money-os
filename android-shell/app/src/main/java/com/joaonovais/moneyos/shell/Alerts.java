package com.joaonovais.moneyos.shell;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * The site's alerts as phone notifications.
 *
 * The site decides what is worth saying (GET /api/alerts, the bell's own list
 * narrowed to what deserves an interruption); the phone only asks now and then
 * and says each alert once. Nothing leaves the computer and the phone: no push
 * service, no email account, no credentials. The price is that the phone hears
 * only while it can reach the computer — on the same Wi-Fi, with the site
 * running — and says nothing, rather than something stale, when it cannot.
 */
final class Alerts {
    static final String KEY_WANTED = "alert_notifications";
    /** The alert ids already notified that the site still reports. */
    private static final String KEY_NOTIFIED = "alert_notified";
    private static final String CHANNEL = "alerts";
    private static final String GROUP = "money-os-alerts";
    /** Every alert notification shares this id and is told apart by its tag. */
    private static final int NOTIFICATION_ID = 1000;
    private static final int JOB_ID = 1000;
    /** Every half hour, whenever Android finds a moment with a network. */
    private static final long EVERY_MS = 30 * 60 * 1000L;

    private Alerts() {}

    static boolean wanted(Context context) {
        return QuickEntry.prefs(context).getBoolean(KEY_WANTED, false);
    }

    /** Asked for, and allowed by the system. */
    static boolean active(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        return wanted(context) && manager != null && manager.areNotificationsEnabled();
    }

    static void setWanted(Context context, boolean wanted) {
        QuickEntry.prefs(context).edit().putBoolean(KEY_WANTED, wanted).apply();
        if (wanted) {
            schedule(context);
            Context app = context.getApplicationContext();
            new Thread(() -> check(app), "money-os-alerts").start();
        } else {
            stop(context);
        }
    }

    /** Starts the periodic check if it is wanted and not already set. */
    static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null || !wanted(context)) return;
        // Rescheduling would restart the half hour every time the app opens.
        if (scheduler.getPendingJob(JOB_ID) != null) return;
        scheduler.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(context, Check.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(EVERY_MS)
                .setPersisted(true)
                .build());
    }

    private static void stop(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler != null) scheduler.cancel(JOB_ID);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) {
            for (StatusBarNotification shown : manager.getActiveNotifications()) {
                if (shown.getId() == NOTIFICATION_ID) manager.cancel(shown.getTag(), NOTIFICATION_ID);
            }
        }
        QuickEntry.prefs(context).edit().remove(KEY_NOTIFIED).apply();
    }

    /**
     * Asks the site and notifies what is new. Blocking: call off the main thread.
     *
     * An alert already notified stays quiet while the site keeps reporting it,
     * even after it is swiped away. One the site no longer reports is taken
     * down, and forgotten, so if it comes back it is news again.
     */
    static void check(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (!wanted(context) || manager == null || !manager.areNotificationsEnabled()) return;

        JSONArray alerts;
        try {
            alerts = new JSONObject(Site.get(context, "/api/alerts")).getJSONArray("alerts");
        } catch (Site.Unavailable | JSONException | RuntimeException e) {
            // Unreachable or logged out: say nothing, and take nothing down on a guess.
            return;
        }

        createChannel(manager);
        SharedPreferences prefs = QuickEntry.prefs(context);
        Set<String> notified = new HashSet<>(prefs.getStringSet(KEY_NOTIFIED, new HashSet<>()));
        Set<String> current = new HashSet<>();
        for (int i = 0; i < alerts.length(); i++) {
            JSONObject alert = alerts.optJSONObject(i);
            String id = alert == null ? "" : alert.optString("id", "");
            if (id.isEmpty()) continue;
            current.add(id);
            if (!notified.contains(id)) manager.notify(id, NOTIFICATION_ID, build(context, alert));
        }
        for (String gone : notified) {
            if (!current.contains(gone)) manager.cancel(gone, NOTIFICATION_ID);
        }
        prefs.edit().putStringSet(KEY_NOTIFIED, current).apply();
    }

    private static void createChannel(NotificationManager manager) {
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Alertas",
                NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Orçamentos, cobranças, contas e ligações que precisam de atenção.");
        manager.createNotificationChannel(channel);
    }

    private static Notification build(Context context, JSONObject alert) {
        String id = alert.optString("id");
        String title = alert.optString("title", "Money OS");
        String detail = alert.isNull("detail") ? null : alert.optString("detail", null);
        String path = alert.optString("href", "/");
        if (!path.startsWith("/") || path.startsWith("//")) path = "/";

        Intent open = new Intent(context, MainActivity.class)
                .setAction(MainActivity.ACTION_OPEN_PAGE)
                .putExtra(MainActivity.EXTRA_PATH, path)
                // Distinct data keeps one alert's tap from replacing another's.
                .setData(Uri.fromParts("moneyos-alert", id, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        // Figures stay off the lock screen: there it only says something is waiting.
        Notification locked = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_quick_entry)
                .setContentTitle("Money OS")
                .setContentText("Something needs your attention")
                .build();

        Notification.Builder builder = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_quick_entry)
                .setContentTitle(title)
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setGroup(GROUP)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setPublicVersion(locked);
        if (detail != null && !detail.isEmpty()) {
            builder.setContentText(detail).setStyle(new Notification.BigTextStyle().bigText(detail));
        }
        return builder.build();
    }

    /** The periodic check, run by Android's job scheduler. */
    public static class Check extends JobService {
        @Override
        public boolean onStartJob(JobParameters params) {
            Context app = getApplicationContext();
            new Thread(() -> {
                try {
                    check(app);
                } finally {
                    jobFinished(params, false);
                }
            }, "money-os-alerts").start();
            return true;
        }

        @Override
        public boolean onStopJob(JobParameters params) {
            return true;
        }
    }
}
