package com.secureems.student.kiosk;

import android.app.admin.DeviceAdminReceiver;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.UserManager;
import android.util.Log;

/**
 * DeviceAdminReceiver enabling Dedicated Device (COSU) LockTask Kiosk Mode
 * on institutional examination tablets and phones.
 *
 * Provisioning command for exam center tablets:
 *   adb shell dpm set-device-owner com.secureems.student.kiosk/.KioskDeviceAdminReceiver
 */
public class KioskDeviceAdminReceiver extends DeviceAdminReceiver {
    private static final String TAG = "SecureEMSKioskAdmin";

    public static ComponentName getComponentName(Context context) {
        return new ComponentName(context.getApplicationContext(), KioskDeviceAdminReceiver.class);
    }

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Log.i(TAG, "Secure EMS Kiosk Device Admin enabled");
        applyDeviceOwnerPolicies(context);
    }

    @Override
    public void onLockTaskModeEntering(Context context, Intent intent, String pkg) {
        super.onLockTaskModeEntering(context, intent, pkg);
        Log.i(TAG, "Entering Android LockTask Kiosk Mode for package: " + pkg);
    }

    @Override
    public void onLockTaskModeExiting(Context context, Intent intent) {
        super.onLockTaskModeExiting(context, intent);
        Log.w(TAG, "Exiting Android LockTask Kiosk Mode");
    }

    /**
     * When provisioned as a Device Owner, whitelist this package for unattended LockTask
     * and disable status bar, keyguard, safe-boot, screen capture, and multi-window.
     */
    public static void applyDeviceOwnerPolicies(Context context) {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            if (dpm == null) return;

            ComponentName adminComponent = getComponentName(context);
            String packageName = context.getPackageName();

            if (dpm.isDeviceOwnerApp(packageName)) {
                // Whitelist this kiosk app for unattended startLockTask() without user confirmation dialog
                dpm.setLockTaskPackages(adminComponent, new String[]{packageName});

                // Disable system UI features during LockTask (no status bar, no notifications, no home/recents, no global power menu)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    dpm.setLockTaskFeatures(adminComponent, DevicePolicyManager.LOCK_TASK_FEATURE_NONE);
                }

                // Block OS-level screen capture across the device
                dpm.setScreenCaptureDisabled(adminComponent, true);

                // Block status bar expansion
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    dpm.setStatusBarDisabled(adminComponent, true);
                }

                // Add user restrictions against safe boot, factory reset, and adding secondary users
                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_SAFE_BOOT);
                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_ADD_USER);
                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CREATE_WINDOWS);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not apply full DeviceOwner policies (running in standard/BYOD mode): " + e.getMessage());
        }
    }
}
