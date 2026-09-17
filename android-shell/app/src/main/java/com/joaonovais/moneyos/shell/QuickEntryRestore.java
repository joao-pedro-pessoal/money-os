package com.joaonovais.moneyos.shell;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Puts the notification back after a restart or an update of the app, both of
 * which clear it. Only when it was switched on; this never turns it on.
 */
public class QuickEntryRestore extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        if (QuickEntry.wanted(context)) QuickEntry.show(context);
    }
}
