package com.secureems.student.kiosk;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.display.DisplayManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import android.os.Build;
import android.provider.Settings;
import android.view.Display;
import android.webkit.JavascriptInterface;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Native Capacitor Plugin + Direct JavascriptInterface Bridge for Secure EMS Android Kiosk.
 * Provides hardware & OS-level anti-cheating controls on tablets and mobile devices:
 *  - FLAG_SECURE (blocks screenshots, screen recording, casting, recent-apps preview)
 *  - LockTask / Screen Pinning (DeviceOwner COSU LockTask + BYOD Screen Pinning)
 *  - Immersive Sticky Fullscreen (hides status bar, notification drawer, nav buttons)
 *  - Secondary Display / Wireless Cast / HDMI Mirroring detection
 *  - USB Debugging (ADB), Developer Options & Root/Tamper telemetry
 *  - Overlay / Tapjacking defense (filterTouchesWhenObscured)
 *  - System clipboard wiping & monitoring
 *  - Orientation lock & battery/network/lock-state telemetry
 */
@CapacitorPlugin(name = "KioskLockdown")
public class KioskPlugin extends Plugin {

    private static KioskPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void emitViolationEvent(String violationType, String details) {
        if (instance != null) {
            JSObject payload = new JSObject();
            payload.put("violationType", violationType);
            payload.put("details", details);
            payload.put("timestamp", System.currentTimeMillis());
            instance.notifyListeners("kioskViolation", payload);
        }
    }

    @PluginMethod
    public void enableKioskMode(PluginCall call) {
        String orientation = call.getString("orientation", "unspecified");
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            MainActivity mainActivity = (MainActivity) activity;
            mainActivity.runOnUiThread(() -> {
                mainActivity.activateExamKioskLockdown(orientation);
                call.resolve(buildStatusObject(mainActivity));
            });
        } else {
            call.reject("MainActivity unavailable");
        }
    }

    @PluginMethod
    public void disableKioskMode(PluginCall call) {
        String pin = call.getString("pin", "");
        if (!isValidAdminPin(pin)) {
            call.reject("Invalid Administrator Override PIN");
            return;
        }
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            MainActivity mainActivity = (MainActivity) activity;
            mainActivity.runOnUiThread(() -> {
                mainActivity.deactivateExamKioskLockdown();
                call.resolve(buildStatusObject(mainActivity));
            });
        } else {
            call.reject("MainActivity unavailable");
        }
    }

    @PluginMethod
    public void exitKioskApp(PluginCall call) {
        String pin = call.getString("pin", "");
        if (!isValidAdminPin(pin)) {
            call.reject("Invalid Administrator Override PIN");
            return;
        }
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            MainActivity mainActivity = (MainActivity) activity;
            mainActivity.runOnUiThread(() -> {
                mainActivity.deactivateExamKioskLockdown();
                JSObject ret = new JSObject();
                ret.put("exiting", true);
                call.resolve(ret);
                mainActivity.finishAndRemoveTask();
            });
        } else {
            call.reject("MainActivity unavailable");
        }
    }

    @PluginMethod
    public void getKioskStatus(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            call.resolve(buildStatusObject((MainActivity) activity));
        } else {
            call.reject("MainActivity unavailable");
        }
    }

    @PluginMethod
    public void clearClipboard(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            ((MainActivity) activity).runOnUiThread(() -> {
                ((MainActivity) activity).wipeSystemClipboard();
                JSObject ret = new JSObject();
                ret.put("cleared", true);
                call.resolve(ret);
            });
        } else {
            call.reject("MainActivity unavailable");
        }
    }

    @PluginMethod
    public void setOrientationLock(PluginCall call) {
        String mode = call.getString("mode", "unspecified");
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            MainActivity mainActivity = (MainActivity) activity;
            mainActivity.runOnUiThread(() -> {
                mainActivity.applyOrientationLock(mode);
                call.resolve(buildStatusObject(mainActivity));
            });
        } else {
            call.reject("MainActivity unavailable");
        }
    }

    public static boolean isValidAdminPin(String pin) {
        if (pin == null) return false;
        String clean = pin.trim();
        return "9999".equals(clean) || "999".equals(clean);
    }

    public static JSObject buildStatusObject(MainActivity activity) {
        JSObject status = new JSObject();
        status.put("platform", "android");
        status.put("kioskExamActive", activity.isExamKioskActive());
        status.put("flagSecureEnabled", true);
        status.put("immersiveFullscreen", true);
        status.put("multiWindowBlocked", true);
        status.put("overlayProtectionEnabled", true);

        int lockTaskState = getLockTaskState(activity);
        boolean isLocked = lockTaskState != ActivityManager.LOCK_TASK_MODE_NONE;
        String lockModeLabel = "UNPINNED";
        if (lockTaskState == ActivityManager.LOCK_TASK_MODE_LOCKED) {
            lockModeLabel = "DEVICE_OWNER_LOCKED";
        } else if (lockTaskState == ActivityManager.LOCK_TASK_MODE_PINNED) {
            lockModeLabel = "SCREEN_PINNED";
        }

        DevicePolicyManager dpm = (DevicePolicyManager) activity.getSystemService(Context.DEVICE_POLICY_SERVICE);
        boolean isDeviceOwner = dpm != null && dpm.isDeviceOwnerApp(activity.getPackageName());

        boolean inMultiWindow = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            inMultiWindow = activity.isInMultiWindowMode();
        }

        int displayCount = getConnectedDisplayCount(activity);

        status.put("isLockTaskActive", isLocked);
        status.put("lockTaskMode", lockModeLabel);
        status.put("isDeviceOwner", isDeviceOwner);
        status.put("isInMultiWindowMode", inMultiWindow);
        status.put("displayCount", displayCount);
        status.put("secondaryDisplayDetected", displayCount > 1);
        status.put("adbEnabled", isAdbEnabled(activity));
        status.put("devOptionsEnabled", isDevOptionsEnabled(activity));
        status.put("isDeviceRooted", isDeviceRooted());
        status.put("batteryLevel", getBatteryPercentage(activity));
        status.put("networkType", getNetworkType(activity));
        status.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL + " (Android " + Build.VERSION.RELEASE + ")");
        return status;
    }

    public static int getConnectedDisplayCount(Context context) {
        try {
            DisplayManager dm = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
            if (dm == null) return 1;
            Display[] displays = dm.getDisplays();
            return displays != null ? displays.length : 1;
        } catch (Exception e) {
            return 1;
        }
    }

    public static boolean isAdbEnabled(Context context) {
        try {
            return Settings.Global.getInt(context.getContentResolver(), Settings.Global.ADB_ENABLED, 0) == 1;
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean isDevOptionsEnabled(Context context) {
        try {
            return Settings.Global.getInt(context.getContentResolver(), Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1;
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean isDeviceRooted() {
        String buildTags = Build.TAGS;
        if (buildTags != null && buildTags.contains("test-keys")) {
            return true;
        }
        String[] paths = {
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su"
        };
        for (String path : paths) {
            if (new File(path).exists()) return true;
        }
        return false;
    }

    public static int getLockTaskState(Context context) {
        try {
            ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return ActivityManager.LOCK_TASK_MODE_NONE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                return am.getLockTaskModeState();
            } else {
                return am.isInLockTaskMode()
                    ? ActivityManager.LOCK_TASK_MODE_PINNED
                    : ActivityManager.LOCK_TASK_MODE_NONE;
            }
        } catch (Exception e) {
            return ActivityManager.LOCK_TASK_MODE_NONE;
        }
    }

    private static int getBatteryPercentage(Context context) {
        try {
            IntentFilter iFilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            Intent batteryStatus = context.registerReceiver(null, iFilter);
            if (batteryStatus == null) return 100;
            int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (level < 0 || scale <= 0) return 100;
            return Math.round((level / (float) scale) * 100);
        } catch (Exception e) {
            return 100;
        }
    }

    private static String getNetworkType(Context context) {
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return "UNKNOWN";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
                if (caps == null) return "OFFLINE";
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "WIFI";
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "CELLULAR";
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "ETHERNET";
                return "ONLINE";
            }
            return "ONLINE";
        } catch (Exception e) {
            return "ONLINE";
        }
    }

    /**
     * Direct WebView @JavascriptInterface (`window.SecureKioskBridge`) so the React app
     * can also invoke native kiosk controls synchronously or without async bridge latency.
     */
    public static class DirectJsBridge {
        private final MainActivity activity;

        public DirectJsBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public String enableKioskMode(String orientation) {
            activity.runOnUiThread(() -> activity.activateExamKioskLockdown(orientation));
            return buildStatusObject(activity).toString();
        }

        @JavascriptInterface
        public boolean disableKioskMode(String pin) {
            if (!isValidAdminPin(pin)) return false;
            activity.runOnUiThread(activity::deactivateExamKioskLockdown);
            return true;
        }

        @JavascriptInterface
        public boolean exitKioskApp(String pin) {
            if (!isValidAdminPin(pin)) return false;
            activity.runOnUiThread(() -> {
                activity.deactivateExamKioskLockdown();
                activity.finishAndRemoveTask();
            });
            return true;
        }

        @JavascriptInterface
        public String getKioskStatus() {
            return buildStatusObject(activity).toString();
        }

        @JavascriptInterface
        public void clearClipboard() {
            activity.runOnUiThread(activity::wipeSystemClipboard);
        }

        @JavascriptInterface
        public void setOrientationLock(String mode) {
            activity.runOnUiThread(() -> activity.applyOrientationLock(mode));
        }
    }
}
