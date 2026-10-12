package com.secureems.student.kiosk;

import android.app.ActivityManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.hardware.display.DisplayManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ActionMode;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

/**
 * MainActivity for the Secure EMS Android Student Kiosk Terminal.
 *
 * Enforces multi-layered anti-cheating defenses on Android tablets and phones:
 *  1. FLAG_SECURE: blocks screenshots, screen recording, casting, and recent-apps previews.
 *  2. FLAG_KEEP_SCREEN_ON + High-Perf Wi-Fi Lock: prevents screen or Wi-Fi sleep during examination.
 *  3. LockTask / Screen Pinning: locks the student inside the app (COSU Device Owner or BYOD Screen Pinning).
 *  4. Secondary Display / Cast Guard: detects HDMI / wireless display mirroring via DisplayManager.
 *  5. Immersive Sticky Fullscreen: hides status bar, notification drawer, and navigation bar.
 *  6. Tapjacking / Overlay Defense: sets filterTouchesWhenObscured(true) on root & WebView.
 *  7. WebView Hardening: disables long-press, text selection ActionMode, drag/drop, and debugging.
 *  8. Hardware Key Interception: blocks Back gesture/key, Volume screenshot combos, Menu/Search/AppSwitch.
 *  9. Real-Time Lifecycle & Watchdog Telemetry: detects app switching, window focus loss, split-screen,
 *     PiP, secondary displays, clipboard tampering, and unpinning, dispatching instant events to React.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "SecureEMSKioskActivity";

    private boolean examKioskActive = false;
    private boolean suppressClipboardListener = false;
    private final Handler watchdogHandler = new Handler(Looper.getMainLooper());
    private ClipboardManager clipboardManager;
    private DisplayManager displayManager;
    private WifiManager.WifiLock wifiLock;

    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override
        public void onDisplayAdded(int displayId) {
            if (examKioskActive && KioskPlugin.getConnectedDisplayCount(MainActivity.this) > 1) {
                dispatchNativeViolationToWeb(
                    "SECONDARY_DISPLAY_DETECTED",
                    "External HDMI or Wireless Cast display attached (displayId=" + displayId + ") during examination!"
                );
            }
        }

        @Override
        public void onDisplayRemoved(int displayId) {}

        @Override
        public void onDisplayChanged(int displayId) {
            if (examKioskActive && KioskPlugin.getConnectedDisplayCount(MainActivity.this) > 1) {
                dispatchNativeViolationToWeb(
                    "SECONDARY_DISPLAY_DETECTED",
                    "Secondary screen mirroring or cast display state change detected during examination!"
                );
            }
        }
    };

    private final Runnable lockTaskWatchdog = new Runnable() {
        @Override
        public void run() {
            if (examKioskActive) {
                enforceImmersiveFullscreen();
                int lockState = KioskPlugin.getLockTaskState(MainActivity.this);
                if (lockState == ActivityManager.LOCK_TASK_MODE_NONE) {
                    dispatchNativeViolationToWeb(
                        "SCREEN_PINNING_BREACH",
                        "Android LockTask / Screen Pinning is not active. Student unpinned or bypassed screen lock."
                    );
                }
                if (KioskPlugin.getConnectedDisplayCount(MainActivity.this) > 1) {
                    dispatchNativeViolationToWeb(
                        "SECONDARY_DISPLAY_DETECTED",
                        "Multiple active displays detected on Android device (HDMI/Cast screen mirroring blocked)."
                    );
                }
                watchdogHandler.postDelayed(this, 2500);
            }
        }
    };

    private final ClipboardManager.OnPrimaryClipChangedListener clipListener = () -> {
        if (examKioskActive && !suppressClipboardListener) {
            wipeSystemClipboard();
            dispatchNativeViolationToWeb(
                "CLIPBOARD_TAMPER_ATTEMPT",
                "System clipboard modification detected and automatically wiped by Android Kiosk Engine."
            );
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KioskPlugin.class);
        super.onCreate(savedInstanceState);

        // 1. Always enforce FLAG_SECURE & FLAG_KEEP_SCREEN_ON from app launch
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SECURE |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
        );

        // 2. Apply Device Owner COSU policies if device is provisioned as a dedicated exam tablet
        KioskDeviceAdminReceiver.applyDeviceOwnerPolicies(this);

        // 3. Enforce immersive sticky fullscreen
        enforceImmersiveFullscreen();

        // 4. Configure & harden the Capacitor WebView
        hardenWebView();

        // 5. Set up clipboard monitoring & wipe
        clipboardManager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboardManager != null) {
            clipboardManager.addPrimaryClipChangedListener(clipListener);
        }

        // 6. Monitor connected displays (prevent HDMI / Chromecast / Miracast screen mirroring)
        displayManager = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
        if (displayManager != null) {
            displayManager.registerDisplayListener(displayListener, watchdogHandler);
        }

        // 7. Intercept Android Back button / gesture using OnBackPressedDispatcher
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (examKioskActive) {
                    dispatchNativeViolationToWeb(
                        "HARDWARE_BACK_PRESS",
                        "Hardware Back button or back-swipe gesture blocked in Android Kiosk Mode."
                    );
                }
            }
        });
    }

    private void hardenWebView() {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            WebView webView = getBridge().getWebView();

            // Prevent tapjacking / floating screen overlay attacks
            webView.setFilterTouchesWhenObscured(true);
            View decorView = getWindow().getDecorView();
            if (decorView != null) {
                decorView.setFilterTouchesWhenObscured(true);
            }

            // Disable long-press & drag-and-drop extraction
            webView.setLongClickable(false);
            webView.setHapticFeedbackEnabled(false);
            webView.setOnLongClickListener(v -> {
                if (examKioskActive) {
                    dispatchNativeViolationToWeb(
                        "LONG_PRESS_BLOCKED",
                        "Touch long-press selection / context menu blocked on Android Kiosk."
                    );
                }
                return true;
            });

            // Attach direct JavascriptInterface (`window.SecureKioskBridge`)
            webView.addJavascriptInterface(new KioskPlugin.DirectJsBridge(this), "SecureKioskBridge");

            // Harden WebSettings
            WebSettings settings = webView.getSettings();
            settings.setSaveFormData(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            settings.setGeolocationEnabled(false);
            WebView.setWebContentsDebuggingEnabled(false);
        } catch (Exception e) {
            Log.e(TAG, "Failed to harden WebView: " + e.getMessage());
        }
    }

    /**
     * Suppresses Android's native text-selection ActionMode bar (Copy / Share / Web Search / Translate)
     */
    @Override
    public ActionMode startActionMode(ActionMode.Callback callback) {
        if (examKioskActive) {
            dispatchNativeViolationToWeb(
                "TEXT_SELECTION_BLOCKED",
                "Native Android ActionMode (Copy/Share/WebSearch) intercepted and blocked."
            );
            return null;
        }
        return super.startActionMode(callback);
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        if (examKioskActive) {
            dispatchNativeViolationToWeb(
                "TEXT_SELECTION_BLOCKED",
                "Native Android floating ActionMode (Copy/Share/Translate) intercepted and blocked."
            );
            return null;
        }
        return super.startActionMode(callback, type);
    }

    public boolean isExamKioskActive() {
        return examKioskActive;
    }

    public void activateExamKioskLockdown(String orientation) {
        this.examKioskActive = true;
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SECURE |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );
        enforceImmersiveFullscreen();
        wipeSystemClipboard();
        acquireHighPerfWifiLock();

        if (orientation != null && !orientation.isEmpty()) {
            applyOrientationLock(orientation);
        }

        // Start Android LockTask (Dedicated Device LockTask or Screen Pinning)
        try {
            int lockState = KioskPlugin.getLockTaskState(this);
            if (lockState == ActivityManager.LOCK_TASK_MODE_NONE) {
                startLockTask();
            }
        } catch (Exception e) {
            Log.w(TAG, "startLockTask could not be initiated: " + e.getMessage());
        }

        if (KioskPlugin.getConnectedDisplayCount(this) > 1) {
            dispatchNativeViolationToWeb(
                "SECONDARY_DISPLAY_DETECTED",
                "External HDMI or Wireless Cast display detected during exam activation!"
            );
        }

        watchdogHandler.removeCallbacks(lockTaskWatchdog);
        watchdogHandler.postDelayed(lockTaskWatchdog, 3000);
    }

    public void deactivateExamKioskLockdown() {
        this.examKioskActive = false;
        watchdogHandler.removeCallbacks(lockTaskWatchdog);
        releaseWifiLock();
        try {
            int lockState = KioskPlugin.getLockTaskState(this);
            if (lockState != ActivityManager.LOCK_TASK_MODE_NONE) {
                stopLockTask();
            }
        } catch (Exception e) {
            Log.w(TAG, "stopLockTask error: " + e.getMessage());
        }
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
    }

    private void acquireHighPerfWifiLock() {
        try {
            if (wifiLock == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    int lockType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                        : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                    wifiLock = wm.createWifiLock(lockType, "SecureEMS:KioskHeartbeatWifiLock");
                    wifiLock.setReferenceCounted(false);
                }
            }
            if (wifiLock != null && !wifiLock.isHeld()) {
                wifiLock.acquire();
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not acquire Wi-Fi lock: " + e.getMessage());
        }
    }

    private void releaseWifiLock() {
        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Exception ignored) {}
    }

    public void applyOrientationLock(String mode) {
        if ("landscape".equalsIgnoreCase(mode)) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } else if ("portrait".equalsIgnoreCase(mode)) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    public void wipeSystemClipboard() {
        try {
            if (clipboardManager == null) {
                clipboardManager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            }
            if (clipboardManager != null) {
                suppressClipboardListener = true;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    clipboardManager.clearPrimaryClip();
                } else {
                    clipboardManager.setPrimaryClip(ClipData.newPlainText("", ""));
                }
                suppressClipboardListener = false;
            }
        } catch (Exception e) {
            suppressClipboardListener = false;
        }
    }

    public void enforceImmersiveFullscreen() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    );
                }
            } else {
                View decorView = getWindow().getDecorView();
                decorView.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                );
            }
        } catch (Exception e) {
            Log.w(TAG, "Immersive fullscreen error: " + e.getMessage());
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enforceImmersiveFullscreen();
        } else if (examKioskActive) {
            dispatchNativeViolationToWeb(
                "WINDOW_FOCUS_LOSS",
                "Android window lost focus (notification shade pull-down, system dialog, or overlay attempt detected)."
            );
        }
    }

    @Override
    public void onMultiWindowModeChanged(boolean isInMultiWindowMode, Configuration newConfig) {
        super.onMultiWindowModeChanged(isInMultiWindowMode, newConfig);
        if (examKioskActive && isInMultiWindowMode) {
            dispatchNativeViolationToWeb(
                "MULTI_WINDOW_ATTEMPT",
                "Android split-screen or multi-window mode detected during locked examination!"
            );
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (examKioskActive && isInPictureInPictureMode) {
            dispatchNativeViolationToWeb(
                "PIP_MODE_ATTEMPT",
                "Picture-in-Picture mode attempt detected during locked examination!"
            );
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (examKioskActive) {
            dispatchNativeViolationToWeb(
                "APP_SWITCH_ATTEMPT",
                "Student attempted to leave kiosk application via Home or Recent Apps gesture."
            );
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        if (examKioskActive) {
            dispatchNativeViolationToWeb(
                "BACKGROUND_PAUSE_DETECTED",
                "Android Kiosk Activity entered paused/background state during active examination."
            );
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        enforceImmersiveFullscreen();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (examKioskActive && event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            // Block Hardware Back, AppSwitch, Menu, Search, Voice Assist, SysRq/PrintScreen, Volume Down screenshot combo
            if (
                keyCode == KeyEvent.KEYCODE_BACK ||
                keyCode == KeyEvent.KEYCODE_APP_SWITCH ||
                keyCode == KeyEvent.KEYCODE_MENU ||
                keyCode == KeyEvent.KEYCODE_SEARCH ||
                keyCode == KeyEvent.KEYCODE_ASSIST ||
                keyCode == KeyEvent.KEYCODE_VOICE_ASSIST ||
                keyCode == KeyEvent.KEYCODE_SYSRQ ||
                keyCode == KeyEvent.KEYCODE_VOLUME_DOWN ||
                keyCode == KeyEvent.KEYCODE_VOLUME_UP
            ) {
                dispatchNativeViolationToWeb(
                    "RESTRICTED_HARDWARE_KEY",
                    "Blocked Android hardware key press (keyCode=" + keyCode + ")."
                );
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    public void dispatchNativeViolationToWeb(String violationType, String details) {
        KioskPlugin.emitViolationEvent(violationType, details);
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                JSONObject json = new JSONObject();
                json.put("violationType", violationType);
                json.put("details", details);
                json.put("timestamp", System.currentTimeMillis());
                final String js = "window.dispatchEvent(new CustomEvent('nativeKioskViolation', { detail: " + json.toString() + " }));";
                getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to dispatch violation to WebView: " + e.getMessage());
        }
    }

    @Override
    public void onDestroy() {
        watchdogHandler.removeCallbacks(lockTaskWatchdog);
        releaseWifiLock();
        if (clipboardManager != null) {
            try {
                clipboardManager.removePrimaryClipChangedListener(clipListener);
            } catch (Exception ignored) {}
        }
        if (displayManager != null) {
            try {
                displayManager.unregisterDisplayListener(displayListener);
            } catch (Exception ignored) {}
        }
        super.onDestroy();
    }
}
