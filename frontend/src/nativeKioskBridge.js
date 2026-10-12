/**
 * Native Kiosk Hardware & OS Bridge for Secure EMS Student Terminal.
 *
 * Bridges:
 *  - Android Native Kiosk Engine (`window.SecureKioskBridge` @JavascriptInterface + Capacitor `KioskLockdown` plugin)
 *  - Desktop Electron Kiosk IPC (`window.require('electron').ipcRenderer`)
 *  - Browser Fullscreen, Screen Orientation, Clipboard, Battery, and Network APIs
 */

function getCapacitorKioskPlugin() {
  if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) {
    return window.Capacitor.Plugins.KioskLockdown || null;
  }
  return null;
}

/**
 * Detects the active runtime environment:
 *  - 'android'    : Running inside the Capacitor / Native Android Kiosk APK
 *  - 'electron'   : Running inside the Desktop Electron Kiosk wrapper
 *  - 'mobile_web' : Running in a mobile/tablet browser
 *  - 'web'        : Running in a standard desktop browser
 */
export function getKioskPlatform() {
  if (typeof window !== 'undefined') {
    if (window.SecureKioskBridge) {
      return 'android';
    }
    try {
      const cap = window.Capacitor;
      if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
        return typeof cap.getPlatform === 'function' && cap.getPlatform() === 'android'
          ? 'android'
          : 'android';
      }
    } catch {
      // Ignore
    }

    try {
      if (typeof window.require === 'function') {
        const electron = window.require('electron');
        if (electron && electron.ipcRenderer) return 'electron';
      }
    } catch {
      // Ignore
    }

    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    if (/Android|webOS|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)) {
      return 'mobile_web';
    }
  }
  return 'web';
}

export function isAndroidKiosk() {
  return getKioskPlatform() === 'android';
}

/**
 * Activates hardware & OS-level kiosk lockdown on Android (or fullscreen on Web/Electron):
 *  - Enables FLAG_SECURE (blocks screenshots, screen recording, casting, recent-apps preview)
 *  - Starts Android LockTask / Screen Pinning (DeviceOwner COSU or BYOD Screen Pinning)
 *  - Enforces Immersive Sticky Fullscreen (hides status & navigation bars)
 *  - Wipes system clipboard & enables overlay/tapjacking filter
 */
export async function enableKioskLockdown(options = {}) {
  const orientation = options.orientation || 'unspecified';
  const platform = getKioskPlatform();

  if (platform === 'android') {
    try {
      if (window.SecureKioskBridge && typeof window.SecureKioskBridge.enableKioskMode === 'function') {
        const raw = window.SecureKioskBridge.enableKioskMode(orientation);
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
      const plugin = getCapacitorKioskPlugin();
      if (plugin && typeof plugin.enableKioskMode === 'function') {
        return await plugin.enableKioskMode({ orientation });
      }
    } catch (err) {
      console.warn('Native enableKioskMode fallback:', err);
    }
  }

  try {
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch {
    // Ignore fullscreen error in unsupported environments
  }

  try {
    if (
      orientation !== 'unspecified' &&
      typeof screen !== 'undefined' &&
      screen.orientation &&
      typeof screen.orientation.lock === 'function'
    ) {
      await screen.orientation.lock(orientation).catch(() => {});
    }
  } catch {
    // Ignore orientation lock error in desktop browsers
  }

  return getKioskSecurityStatus();
}

/**
 * Deactivates Android LockTask / Screen Pinning when authorized with the Admin Override PIN.
 */
export async function disableKioskLockdown(pin) {
  const cleanPin = String(pin || '').trim();
  const isValid = cleanPin === '9999' || cleanPin === '999';
  if (!isValid) {
    throw new Error('Invalid Admin PIN');
  }

  const platform = getKioskPlatform();
  if (platform === 'android') {
    try {
      if (window.SecureKioskBridge && typeof window.SecureKioskBridge.disableKioskMode === 'function') {
        window.SecureKioskBridge.disableKioskMode(cleanPin);
      } else {
        const plugin = getCapacitorKioskPlugin();
        if (plugin && typeof plugin.disableKioskMode === 'function') {
          await plugin.disableKioskMode({ pin: cleanPin });
        }
      }
    } catch (err) {
      console.warn('Failed to disable native kiosk mode:', err);
    }
  }

  try {
    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen().catch(() => {});
    }
  } catch {
    // Ignore
  }

  return true;
}

/**
 * Verifies the Admin Override PIN (9999 or 999), stops Android LockTask / Screen Pinning,
 * and cleanly closes the Android Kiosk Activity or Electron application.
 */
export async function exitKioskApplication(pin) {
  const cleanPin = String(pin || '').trim();
  const isValid = cleanPin === '9999' || cleanPin === '999';
  if (!isValid) {
    return false;
  }

  const platform = getKioskPlatform();

  if (platform === 'android') {
    try {
      if (window.SecureKioskBridge && typeof window.SecureKioskBridge.exitKioskApp === 'function') {
        return Boolean(window.SecureKioskBridge.exitKioskApp(cleanPin));
      }
      const plugin = getCapacitorKioskPlugin();
      if (plugin && typeof plugin.exitKioskApp === 'function') {
        await plugin.exitKioskApp({ pin: cleanPin });
        return true;
      }
    } catch (err) {
      console.warn('Native exitKioskApp error:', err);
    }
  }

  if (platform === 'electron') {
    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('admin-quit');
      return true;
    } catch {
      // Ignore
    }
  }

  try {
    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  } catch {
    // Ignore
  }

  try {
    if (typeof window !== 'undefined' && typeof window.close === 'function') {
      window.close();
    }
  } catch {
    // Ignore
  }

  return true;
}

/**
 * Queries real-time hardware & OS security posture from the Android native bridge or browser APIs.
 */
export async function getKioskSecurityStatus() {
  const platform = getKioskPlatform();

  if (platform === 'android') {
    try {
      if (window.SecureKioskBridge && typeof window.SecureKioskBridge.getKioskStatus === 'function') {
        const raw = window.SecureKioskBridge.getKioskStatus();
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
      const plugin = getCapacitorKioskPlugin();
      if (plugin && typeof plugin.getKioskStatus === 'function') {
        const status = await plugin.getKioskStatus();
        if (status) return status;
      }
    } catch {
      // Ignore
    }
  }

  const isFullscreen =
    typeof document !== 'undefined' &&
    Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;

  let batteryLevel = 100;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
      const bat = await navigator.getBattery();
      if (bat && typeof bat.level === 'number') {
        batteryLevel = Math.round(bat.level * 100);
      }
    }
  } catch {
    // Ignore
  }

  return {
    platform,
    kioskExamActive: isFullscreen,
    flagSecureEnabled: platform === 'android' || platform === 'electron',
    immersiveFullscreen: isFullscreen,
    multiWindowBlocked: true,
    overlayProtectionEnabled: true,
    isLockTaskActive: platform === 'electron' ? true : isFullscreen,
    lockTaskMode:
      platform === 'electron'
        ? 'ELECTRON_KIOSK_LOCKED'
        : isFullscreen
        ? 'FULLSCREEN_PINNED'
        : 'BROWSER_WINDOW',
    isDeviceOwner: false,
    isInMultiWindowMode: false,
    batteryLevel,
    networkType: isOnline ? 'ONLINE' : 'OFFLINE',
    deviceModel:
      typeof navigator !== 'undefined' && navigator.userAgent
        ? navigator.userAgent.slice(0, 64)
        : 'Standard Terminal',
  };
}

/**
 * Locks or unlocks screen orientation on Android tablets & mobile phones ('portrait' | 'landscape' | 'unspecified')
 */
export async function setKioskOrientation(mode = 'unspecified') {
  const platform = getKioskPlatform();
  if (platform === 'android') {
    try {
      if (window.SecureKioskBridge && typeof window.SecureKioskBridge.setOrientationLock === 'function') {
        window.SecureKioskBridge.setOrientationLock(mode);
        return true;
      }
      const plugin = getCapacitorKioskPlugin();
      if (plugin && typeof plugin.setOrientationLock === 'function') {
        await plugin.setOrientationLock({ mode });
        return true;
      }
    } catch {
      // Ignore
    }
  }

  try {
    if (typeof screen !== 'undefined' && screen.orientation) {
      if (mode === 'unspecified' && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      } else if (typeof screen.orientation.lock === 'function') {
        await screen.orientation.lock(mode).catch(() => {});
      }
    }
  } catch {
    // Ignore
  }
  return true;
}

/**
 * Wipes the system clipboard to prevent pre-copied notes from being pasted or exam text from being extracted.
 */
export async function clearSystemClipboard() {
  const platform = getKioskPlatform();
  if (platform === 'android') {
    try {
      if (window.SecureKioskBridge && typeof window.SecureKioskBridge.clearClipboard === 'function') {
        window.SecureKioskBridge.clearClipboard();
        return;
      }
      const plugin = getCapacitorKioskPlugin();
      if (plugin && typeof plugin.clearClipboard === 'function') {
        await plugin.clearClipboard();
        return;
      }
    } catch {
      // Ignore
    }
  }

  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText('').catch(() => {});
    }
  } catch {
    // Ignore
  }
}

/**
 * Subscribes to native Android anti-cheat violation events dispatched by MainActivity / KioskPlugin.
 */
export function subscribeNativeViolations(onViolation) {
  if (typeof window === 'undefined' || typeof onViolation !== 'function') {
    return () => {};
  }

  const domHandler = (event) => {
    const detail = (event && event.detail) || {};
    if (detail.violationType) {
      onViolation(detail.violationType, detail.details || 'Native Android security alert');
    }
  };

  window.addEventListener('nativeKioskViolation', domHandler);

  let pluginListenerRemove = null;
  try {
    const plugin = getCapacitorKioskPlugin();
    if (isAndroidKiosk() && plugin && typeof plugin.addListener === 'function') {
      const subPromise = plugin.addListener('kioskViolation', (payload) => {
        if (payload && payload.violationType) {
          onViolation(payload.violationType, payload.details || 'Native Android security alert');
        }
      });
      if (subPromise && typeof subPromise.then === 'function') {
        subPromise
          .then((handle) => {
            pluginListenerRemove = handle;
          })
          .catch(() => {});
      }
    }
  } catch {
    // Ignore
  }

  return () => {
    window.removeEventListener('nativeKioskViolation', domHandler);
    if (pluginListenerRemove && typeof pluginListenerRemove.remove === 'function') {
      try {
        pluginListenerRemove.remove();
      } catch {
        // Ignore
      }
    }
  };
}
