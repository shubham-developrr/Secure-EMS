package com.secureems.student.kiosk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * BootReceiver that automatically launches the Secure EMS Student Kiosk Terminal
 * when a dedicated examination tablet powers on or reboots.
 */
public class KioskBootReceiver extends BroadcastReceiver {
    private static final String TAG = "SecureEMSKioskBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        if (
            Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action)
        ) {
            Log.i(TAG, "Device boot detected (" + action + "). Launching Secure EMS Student Kiosk...");
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
            context.startActivity(launchIntent);
        }
    }
}
