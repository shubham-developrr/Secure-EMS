# 🛡️ Secure EMS — Android Student Terminal Kiosk Guide

This guide explains how to build, provision, and operate the **Secure EMS Android Student Kiosk** on examination tablets and mobile phones with zero-cheat hardware & OS lockdown.

---

## 🔐 Anti-Cheating Layers Enforced on Android

| Security Layer | Android / Hybrid Implementation | Threat Mitigated |
| :--- | :--- | :--- |
| **1. Screenshot & Recording Block (`FLAG_SECURE`)** | `WindowManager.LayoutParams.FLAG_SECURE` + `DevicePolicyManager.setScreenCaptureDisabled(true)` | Blocks screenshots, screen recording, Google Assistant screen context, Miracast/Chromecast mirroring, and Recent Apps thumbnail previews. |
| **2. Hardware LockTask / Screen Pinning** | `Activity.startLockTask()` + `KioskDeviceAdminReceiver` (`LOCK_TASK_FEATURE_NONE`) | Locks the candidate inside the examination app; disables Home button, Recent Apps overview, notification drawer, and status bar. |
| **3. Split-Screen & PiP Block** | `android:resizeableActivity="false"`, `android:supportsPictureInPicture="false"`, `onMultiWindowModeChanged` + viewport resize detector | Prevents opening a browser, notes app, or AI assistant alongside the exam in split-screen or pop-up window mode. |
| **4. Tapjacking & Floating Overlay Shield** | `View.setFilterTouchesWhenObscured(true)` on root DecorView & WebView | Blocks floating calculator/translator/chat heads or malicious screen-overlay apps from intercepting touches. |
| **5. Immersive Sticky Fullscreen** | `WindowInsetsController.hide(statusBars() \| navigationBars())` + `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` | Hides system status bar, clock, notifications, and navigation bar throughout the exam. |
| **6. Clipboard & Selection Lockdown** | Native `ActionMode` blocker + `ClipboardManager.OnPrimaryClipChangedListener` auto-wipe + CSS `user-select: none` | Disables long-press text selection, Copy/Cut/Paste/Share/Translate bars, and automatically wipes any clipboard data. |
| **7. Multi-Touch & Hardware Key Interception** | `dispatchKeyEvent` (Back, AppSwitch, Menu, Search, Volume screenshot combo) + 3-finger touch gesture blocker (`SUSPICIOUS_TOUCH_GESTURE`) | Blocks hardware key escapes and 3-finger screenshot/split-screen swipe gestures on phones & tablets. |
| **8. In-App Canvas PDF & Image Renderer** | `PdfCanvasViewer.jsx` (`pdf.js` HTML5 `<canvas>`) + `ImagePaperViewer.jsx` + Dynamic Forensic Watermark | Renders decrypted PDFs and page-wise image papers inside the locked WebView with candidate watermark (`ROLL • SEAT • CENTER • SUBJECT`) and zero download/print options. |
| **9. Live 3s Heartbeat & Offline Alert Queue** | `POST /api/student/heartbeat` + `POST /api/student/security-alert` with offline retry queue | Reports `ACTIVE` / `FOCUS_LOSS` / `VIOLATION` status to the Center Supervisor console every 3 seconds; queues alerts if Wi-Fi momentarily drops. |

---

## 🛠️ Building the Android APK

### Prerequisites
- **Node.js 18+**
- **JDK 17 or 21** and **Android SDK** (Android Studio or Android command-line tools)

### 1. Sync Web Assets into the Android Project
```bash
cd student-terminal
npm install
npm run cap:sync
```

### 2. Build Debug APK (for testing on tablets/phones)
```bash
cd student-terminal
npm run build:android
# Output APK:
# student-terminal/android/app/build/outputs/apk/debug/app-debug.apk
```

### 3. Open in Android Studio (optional)
```bash
cd student-terminal
npm run cap:open
```

---

## 📱 Provisioning Modes for Examination Halls

### Mode A: Dedicated Institutional Tablets (Device Owner COSU Mode — Recommended)
On factory-reset or institution-owned Android tablets with no prior Google account signed in, provision the app as **Device Owner** over USB (`adb`):

```bash
adb install app-debug.apk
adb shell dpm set-device-owner com.secureems.student.kiosk/.KioskDeviceAdminReceiver
```

**What this enables:**
- Instant, silent `startLockTask()` with **no confirmation prompt**
- Student **cannot unpin** the app using Back + Overview buttons
- Status bar, notification shade, keyguard, safe-boot, and OS screen capture are disabled at the Android system policy level

### Mode B: Standard / BYOD Tablets & Mobile Phones (Screen Pinning Mode)
If installed on a regular Android phone or tablet without Device Owner provisioning:
1. When the student logs in and clicks **🚀 START SECURE KIOSK READER**, Android triggers **Screen Pinning** (`startLockTask()`).
2. A native 2.5-second watchdog in `MainActivity.java` continuously checks `ActivityManager.getLockTaskModeState()`.
3. If a student unpins the screen, the app **immediately suspends and hides the question paper**, logs `SCREEN_PINNING_BREACH` to the central server audit trail, increments the violation counter, and requires clicking **📌 RE-PIN SCREEN & RESUME SECURE SESSION**.

---

## 🌐 Connecting Tablets/Phones to the Exam Hall Server

On the **Student Terminal Authorization** login card:
1. Tap **⚙️ Configure Server**.
2. Enter the Exam Hall FastAPI Server URL:
   - **Local Exam Hall LAN Server:** `http://192.168.1.100:8000` (replace with your server's LAN IP)
   - **Android Studio Emulator:** `http://10.0.2.2:8000`
   - **Cloud Production Server:** `https://your-secure-ems-server.onrender.com`
3. Tap **Save** and **Test Ping** to verify connectivity before handing the tablet to the candidate.

---

## 🔑 Proctor / Administrator Override & Exit

Because hardware Back, Home, and Overview buttons are locked during an exam:
- **After Submitting Exam (`🔒 SUBMIT & EXIT`):** Enter Administrator PIN **`9999`** and tap **AUTHORIZE UNLOCK & CLOSE APP**.
- **Emergency Proctor Override During Exam:**
  - **On Touch Tablets / Phones:** Rapidly tap the **`● CLIENT ONLINE`** badge in the top-right header **5 times within 3 seconds** to open the **Admin override** modal, then enter PIN **`999`** (or **`9999`**) and tap **EXIT**.
  - **With Physical Keyboard:** Press **`Ctrl + A`**, enter PIN **`999`**, and tap **EXIT**.
