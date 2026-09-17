package com.joaonovais.moneyos.shell;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * Buttons in the quick settings panel, beside the torch and Wi-Fi.
 *
 * Add them by pulling the panel down, tapping the pencil and dragging them in.
 */
public final class Tiles {
    private Tiles() {}

    /** Opens the quick entry form on an expense. */
    public static class RecordExpense extends TileService {
        @Override
        public void onStartListening() {
            Tile tile = getQsTile();
            if (tile == null) return;
            tile.setLabel("Record expense");
            tile.setIcon(Icon.createWithResource(this, R.drawable.ic_stat_quick_entry));
            tile.setState(Tile.STATE_INACTIVE);
            tile.updateTile();
        }

        @Override
        public void onClick() {
            unlockAndRun(() -> launch(this, QuickEntry.open(this, QuickEntry.EXPENSE),
                    new Intent(this, MainActivity.class)
                            .setAction(QuickEntry.ACTION)
                            .putExtra(QuickEntry.EXTRA_KIND, QuickEntry.EXPENSE)));
        }
    }

    /**
     * Net worth under the tile's name; tapping opens the dashboard.
     *
     * The quick settings panel can be pulled down on a locked phone, so the
     * figure is shown only once the phone is unlocked.
     */
    public static class NetWorth extends TileService {
        @Override
        public void onStartListening() {
            show();
            new Thread(() -> {
                WidgetData.refresh(this);
                show();
                MoneyWidgets.drawAll(this);
            }, "money-os-tile").start();
        }

        private void show() {
            Tile tile = getQsTile();
            if (tile == null) return;
            WidgetData data = WidgetData.cached(this);
            tile.setLabel("Net worth");
            tile.setIcon(Icon.createWithResource(this, R.drawable.ic_stat_quick_entry));
            tile.setState(Tile.STATE_INACTIVE);
            String subtitle;
            if (isLocked()) subtitle = "Unlock to see";
            else if (data == null) subtitle = "Open the app";
            else subtitle = WidgetData.money(data.netWorth, data.currency);
            tile.setSubtitle(subtitle);
            tile.updateTile();
        }

        @Override
        public void onClick() {
            Intent intent = new Intent(this, MainActivity.class)
                    .setAction(MainActivity.ACTION_OPEN_PAGE)
                    .putExtra(MainActivity.EXTRA_PATH, "/")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pending = PendingIntent.getActivity(this, 300, intent,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            unlockAndRun(() -> launch(this, pending, intent));
        }
    }

    /** Android 14 takes a PendingIntent here and refuses a plain Intent. */
    @SuppressLint("StartActivityAndCollapseDeprecated")
    @SuppressWarnings("deprecation")
    private static void launch(TileService service, PendingIntent pending, Intent intent) {
        if (Build.VERSION.SDK_INT >= 34) {
            service.startActivityAndCollapse(pending);
        } else {
            service.startActivityAndCollapse(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
    }
}
