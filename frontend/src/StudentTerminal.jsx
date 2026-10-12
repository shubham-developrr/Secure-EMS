import React from 'react';
import ImagePaperViewer from './ImagePaperViewer.jsx';
import PdfCanvasViewer from './PdfCanvasViewer.jsx';
import {
  clearSystemClipboard,
  disableKioskLockdown,
  enableKioskLockdown,
  exitKioskApplication,
  getKioskPlatform,
  getKioskSecurityStatus,
  setKioskOrientation,
  subscribeNativeViolations,
} from './nativeKioskBridge.js';

const isRemoteBrowserHost =
  typeof window !== 'undefined' &&
  window.location &&
  window.location.hostname &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1';

const DEFAULT_API_BASE = import.meta.env.PROD || isRemoteBrowserHost ? '' : 'http://localhost:8000';

const getInitialApiBase = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('KIOSK_API_BASE');
      if (saved && saved.trim()) {
        return saved.trim().replace(/\/+$/, '');
      }
    }
  } catch {
    // Ignore
  }
  return DEFAULT_API_BASE;
};

const formatSecondsAsClock = (totalSeconds) => {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hrs = String(Math.floor(safe / 3600)).padStart(2, '0');
  const mins = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
};

const ensurePdfBlobUrl = (content) => {
  if (!content || typeof content !== 'string') return '';
  const trimmed = content.trim();

  if (trimmed.startsWith('blob:')) {
    return trimmed;
  }

  let base64Data = '';

  if (trimmed.includes('base64,')) {
    base64Data = trimmed.split('base64,')[1];
  } else if (trimmed.startsWith('data:image/')) {
    return trimmed;
  } else if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.dataUrl) return ensurePdfBlobUrl(parsed.dataUrl);
    } catch {
      // Ignore
    }
  } else if (trimmed.startsWith('JVBERi')) {
    base64Data = trimmed;
  } else if (
    trimmed.includes('%PDF') ||
    trimmed.includes('\uFFFD') ||
    trimmed.includes('µp s@%H') ||
    /[\x00-\x08\x0E-\x1F]/.test(trimmed)
  ) {
    try {
      const pdfStartIndex = trimmed.indexOf('%PDF');
      const cleanContent = pdfStartIndex !== -1 ? trimmed.slice(pdfStartIndex) : trimmed;
      const bytes = new Uint8Array(cleanContent.length);
      for (let i = 0; i < cleanContent.length; i++) {
        bytes[i] = cleanContent.charCodeAt(i) & 0xff;
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      console.error('Failed to create Blob from binary string', e);
    }
  }

  if (base64Data) {
    try {
      const cleanB64 = base64Data.replace(/\s/g, '');
      const binaryString = typeof atob !== 'undefined' ? atob(cleanB64) : '';
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      console.error('Failed to convert base64 to Blob URL', e);
    }
  }

  return '';
};

export default class StudentTerminal extends React.Component {
  constructor(props) {
    super(props);

    const detectedPlatform = getKioskPlatform();

    this.state = {
      studentRoll: '2026-CS-101',
      studentSeat: 'DESK-42',
      studentCenterCode: 'CTR-101',
      studentSubjectCode: '',
      studentPaperContent: '',
      studentPhotoUrl: null,
      studentUnlocked: false,
      studentLoading: false,
      studentError: '',
      studentViolationsCount: 0,
      studentSecurityAlert: '',
      focusLostModal: false,
      pinBreachModal: false,
      displayBreachModal: false,
      viewMode: 'pdf',
      kioskSubmitted: false,
      adminUnlockPin: '',
      secretExitModal: false,
      secretExitPin: '',
      // Android & Mobile/Tablet Kiosk state
      apiBaseUrl: getInitialApiBase(),
      showServerSettings: false,
      serverTestStatus: '',
      orientationMode: 'unspecified',
      kioskPlatform: detectedPlatform,
      kioskStatus: {
        platform: detectedPlatform,
        flagSecureEnabled: true,
        immersiveFullscreen: false,
        multiWindowBlocked: true,
        overlayProtectionEnabled: true,
        isLockTaskActive: false,
        lockTaskMode: detectedPlatform === 'android' ? 'READY_TO_PIN' : 'STANDBY',
        displayCount: 1,
        secondaryDisplayDetected: false,
        adbEnabled: false,
        isDeviceRooted: false,
        batteryLevel: 100,
        networkType: 'ONLINE',
      },
      examRemainingSeconds: 3 * 3600,
      textFontScale: 100,
      showRoughSheet: false,
      roughSheetNotes: '',
      showSecurityLogDrawer: false,
      violationHistory: [],
      queuedOfflineAlerts: [],
    };

    this.heartbeatTimer = null;
    this.kioskStatusTimer = null;
    this.examClockTimer = null;
    this.unsubscribeNativeViolations = null;
    this.headerTapTimestamps = [];
    this.initialViewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  }

  componentDidMount() {
    this.fetchStudentPhoto(this.state.studentRoll);
    this.refreshKioskSecurityStatus();

    window.addEventListener('keydown', this.handleStudentKeyDown);
    window.addEventListener('blur', this.handleStudentFocusLoss);
    document.addEventListener('visibilitychange', this.handleStudentVisibilityChange);
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    window.addEventListener('contextmenu', this.preventStudentContextMenu);
    window.addEventListener('copy', this.preventStudentClipboard);
    window.addEventListener('cut', this.preventStudentClipboard);
    window.addEventListener('paste', this.preventStudentClipboard);
    window.addEventListener('touchstart', this.handleStudentTouchStart, { passive: false });
    window.addEventListener('resize', this.handleStudentViewportResize);
    window.addEventListener('online', this.handleNetworkChange);
    window.addEventListener('offline', this.handleNetworkChange);

    // Subscribe to native Android Kiosk hardware/OS security violation events
    this.unsubscribeNativeViolations = subscribeNativeViolations(this.handleNativeAndroidViolation);

    // Also listen for IPC event from Electron main process (Ctrl+A globalShortcut in kiosk mode)
    try {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.on('secret-exit-trigger', () => {
        this.setState({ secretExitModal: true, secretExitPin: '' });
      });
      this._ipcRenderer = ipcRenderer;
    } catch {
      // Not running in Electron, skip
    }
  }

  componentWillUnmount() {
    this.stopHeartbeat();
    if (this.kioskStatusTimer) {
      clearInterval(this.kioskStatusTimer);
      this.kioskStatusTimer = null;
    }
    if (this.examClockTimer) {
      clearInterval(this.examClockTimer);
      this.examClockTimer = null;
    }
    if (this.unsubscribeNativeViolations) {
      this.unsubscribeNativeViolations();
      this.unsubscribeNativeViolations = null;
    }

    window.removeEventListener('keydown', this.handleStudentKeyDown);
    window.removeEventListener('blur', this.handleStudentFocusLoss);
    document.removeEventListener('visibilitychange', this.handleStudentVisibilityChange);
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    window.removeEventListener('contextmenu', this.preventStudentContextMenu);
    window.removeEventListener('copy', this.preventStudentClipboard);
    window.removeEventListener('cut', this.preventStudentClipboard);
    window.removeEventListener('paste', this.preventStudentClipboard);
    window.removeEventListener('touchstart', this.handleStudentTouchStart);
    window.removeEventListener('resize', this.handleStudentViewportResize);
    window.removeEventListener('online', this.handleNetworkChange);
    window.removeEventListener('offline', this.handleNetworkChange);

    try {
      if (this._ipcRenderer) {
        this._ipcRenderer.removeAllListeners('secret-exit-trigger');
      }
    } catch {
      // Ignore
    }
  }

  getActiveApiBase = () => {
    const custom = (this.state.apiBaseUrl || '').trim().replace(/\/+$/, '');
    return custom || DEFAULT_API_BASE;
  };

  refreshKioskSecurityStatus = async () => {
    try {
      const status = await getKioskSecurityStatus();
      if (status) {
        this.setState({
          kioskStatus: status,
          kioskPlatform: status.platform || this.state.kioskPlatform,
        });
      }
    } catch {
      // Ignore
    }
  };

  recordLocalViolation = (violationType, details) => {
    this.setState((prev) => ({
      violationHistory: [
        {
          type: violationType,
          details,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.violationHistory.slice(0, 29),
      ],
    }));
  };

  handleNativeAndroidViolation = (violationType, details) => {
    if (!this.state.studentUnlocked) return;

    const isPinBreach = violationType === 'SCREEN_PINNING_BREACH';
    const isDisplayBreach = violationType === 'SECONDARY_DISPLAY_DETECTED';
    const isCriticalModalViolation =
      isPinBreach ||
      isDisplayBreach ||
      violationType === 'MULTI_WINDOW_ATTEMPT' ||
      violationType === 'PIP_MODE_ATTEMPT' ||
      violationType === 'APP_SWITCH_ATTEMPT' ||
      violationType === 'BACKGROUND_PAUSE_DETECTED' ||
      violationType === 'WINDOW_FOCUS_LOSS';

    this.setState((prev) => ({
      studentViolationsCount: prev.studentViolationsCount + 1,
      focusLostModal:
        isCriticalModalViolation && !isPinBreach && !isDisplayBreach
          ? true
          : prev.focusLostModal,
      pinBreachModal: isPinBreach ? true : prev.pinBreachModal,
      displayBreachModal: isDisplayBreach ? true : prev.displayBreachModal,
      studentSecurityAlert: `ANDROID KIOSK ALERT [${violationType}]: ${details}`,
      violationHistory: [
        {
          type: violationType,
          details,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.violationHistory.slice(0, 29),
      ],
    }));

    this.reportStudentAlert(violationType, details);
    this.refreshKioskSecurityStatus();
  };

  handleStudentTouchStart = (e) => {
    if (!this.state.studentUnlocked) return;
    // Detect 3-finger or 4-finger screenshot / split-screen swipe gestures on Android phones & tablets
    if (e.touches && e.touches.length >= 3) {
      if (typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      const msg = `Multi-finger touch gesture (${e.touches.length} fingers) blocked on mobile/tablet kiosk`;
      this.setState((prev) => ({
        studentViolationsCount: prev.studentViolationsCount + 1,
        studentSecurityAlert: `SECURITY WARNING: ${msg}`,
      }));
      this.recordLocalViolation('SUSPICIOUS_TOUCH_GESTURE', msg);
      this.reportStudentAlert('SUSPICIOUS_TOUCH_GESTURE', msg);
    }
  };

  handleStudentViewportResize = () => {
    if (!this.state.studentUnlocked || typeof window === 'undefined') return;
    const activeTag =
      typeof document !== 'undefined' && document.activeElement
        ? document.activeElement.tagName
        : '';
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

    if (this.initialViewportHeight > 0 && window.innerHeight < this.initialViewportHeight * 0.6) {
      const msg = 'Abnormal viewport compression / split-screen multi-window resize detected!';
      this.setState((prev) => ({
        studentViolationsCount: prev.studentViolationsCount + 1,
        focusLostModal: true,
        studentSecurityAlert: `SECURITY VIOLATION: ${msg}`,
      }));
      this.recordLocalViolation('MULTI_WINDOW_ATTEMPT', msg);
      this.reportStudentAlert('MULTI_WINDOW_ATTEMPT', msg);
    }
  };

  handleFullscreenChange = () => {
    this.refreshKioskSecurityStatus();
    if (
      this.state.studentUnlocked &&
      !this.state.kioskSubmitted &&
      typeof document !== 'undefined' &&
      !document.fullscreenElement &&
      this.state.kioskPlatform !== 'android'
    ) {
      const msg = 'Candidate exited fullscreen kiosk view';
      this.setState((prev) => ({
        studentViolationsCount: prev.studentViolationsCount + 1,
        focusLostModal: true,
        studentSecurityAlert: 'SECURITY WARNING: Fullscreen kiosk lock was exited!',
      }));
      this.recordLocalViolation('FULLSCREEN_EXIT_ATTEMPT', msg);
      this.reportStudentAlert('FULLSCREEN_EXIT_ATTEMPT', msg);
    }
  };

  handleNetworkChange = () => {
    this.refreshKioskSecurityStatus();
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.flushQueuedAlerts();
    }
  };

  handleHeaderSecretTap = () => {
    const now = Date.now();
    this.headerTapTimestamps = this.headerTapTimestamps.filter((t) => now - t < 3000);
    this.headerTapTimestamps.push(now);
    if (this.headerTapTimestamps.length >= 5) {
      this.headerTapTimestamps = [];
      this.setState({ secretExitModal: true, secretExitPin: '' });
    }
  };

  fetchStudentPhoto = async (roll) => {
    const cleanRoll = (roll || this.state.studentRoll || '').trim().toUpperCase();
    if (!cleanRoll) return;

    try {
      const cached = localStorage.getItem(`STUDENT_VERIFICATION_${cleanRoll}`);
      if (cached) {
        this.setState({ studentPhotoUrl: cached });
      }
    } catch {
      // Ignore
    }

    try {
      const base = this.getActiveApiBase();
      const res = await fetch(`${base}/api/student/verification/${encodeURIComponent(cleanRoll)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.verified && data.captured_image_base64) {
          this.setState({ studentPhotoUrl: data.captured_image_base64 });
          try {
            localStorage.setItem(`STUDENT_VERIFICATION_${cleanRoll}`, data.captured_image_base64);
          } catch {
            // Ignore
          }
        }
      }
    } catch (e) {
      console.warn('Could not fetch student verification photo', e);
    }
  };

  startHeartbeat = () => {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(this.sendHeartbeat, 3000);

    if (this.kioskStatusTimer) clearInterval(this.kioskStatusTimer);
    this.kioskStatusTimer = setInterval(this.refreshKioskSecurityStatus, 4000);

    if (this.examClockTimer) clearInterval(this.examClockTimer);
    this.examClockTimer = setInterval(() => {
      this.setState((prev) => ({
        examRemainingSeconds: Math.max(0, prev.examRemainingSeconds - 1),
      }));
    }, 1000);
  };

  stopHeartbeat = () => {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.kioskStatusTimer) {
      clearInterval(this.kioskStatusTimer);
      this.kioskStatusTimer = null;
    }
    if (this.examClockTimer) {
      clearInterval(this.examClockTimer);
      this.examClockTimer = null;
    }
  };

  sendHeartbeat = async () => {
    if (!this.state.studentUnlocked) return;
    const {
      studentRoll,
      studentSeat,
      studentCenterCode,
      studentSubjectCode,
      studentViolationsCount,
      focusLostModal,
      pinBreachModal,
      displayBreachModal,
      kioskPlatform,
      kioskStatus,
    } = this.state;

    const deviceType =
      kioskPlatform === 'android'
        ? 'ANDROID_KIOSK'
        : kioskPlatform === 'mobile_web'
        ? 'MOBILE_TABLET_WEB'
        : kioskPlatform === 'electron'
        ? 'ELECTRON_KIOSK'
        : 'DESKTOP_KIOSK';

    const statusFlag = pinBreachModal
      ? 'PIN_BREACH'
      : displayBreachModal
      ? 'DISPLAY_BREACH'
      : focusLostModal
      ? 'FOCUS_LOSS'
      : 'ACTIVE';

    const base = this.getActiveApiBase();
    try {
      await fetch(`${base}/api/student/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll_number: studentRoll,
          seat_id: studentSeat,
          center_code: studentCenterCode,
          subject_code: studentSubjectCode,
          status: statusFlag,
          violations_count: studentViolationsCount,
          device_type: deviceType,
          lock_task_state: kioskStatus.lockTaskMode || 'LOCKED',
          battery_level: typeof kioskStatus.batteryLevel === 'number' ? kioskStatus.batteryLevel : 100,
        }),
      });
      this.flushQueuedAlerts();
    } catch (e) {
      console.error('Heartbeat ping failed', e);
    }
  };

  flushQueuedAlerts = async () => {
    const queue = this.state.queuedOfflineAlerts;
    if (!queue || queue.length === 0) return;

    const base = this.getActiveApiBase();
    const remaining = [];
    for (const item of queue) {
      try {
        const res = await fetch(`${base}/api/student/security-alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        if (!res.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    this.setState({ queuedOfflineAlerts: remaining });
  };

  preventStudentContextMenu = (e) => {
    if (this.state.studentUnlocked) {
      e.preventDefault();
      const details = 'Right-click or long-press context menu attempt blocked on standalone student terminal';
      this.recordLocalViolation('RIGHT_CLICK_ATTEMPT', details);
      this.reportStudentAlert('RIGHT_CLICK_ATTEMPT', details);
    }
  };

  preventStudentClipboard = (e) => {
    if (this.state.studentUnlocked) {
      e.preventDefault();
      clearSystemClipboard();
      const details = 'Copy/Cut/Paste operation blocked on standalone student terminal';
      this.recordLocalViolation('CLIPBOARD_TAMPER_ATTEMPT', details);
      this.reportStudentAlert('CLIPBOARD_TAMPER_ATTEMPT', details);
    }
  };

  handleStudentFocusLoss = () => {
    if (this.state.studentUnlocked) {
      const details = 'Student navigated away or blurred browser window';
      this.setState((prev) => ({
        studentViolationsCount: prev.studentViolationsCount + 1,
        focusLostModal: true,
        studentSecurityAlert: 'SECURITY WARNING: Window focus lost or external app switch detected!',
      }));
      this.recordLocalViolation('FOCUS_LOSS', details);
      this.reportStudentAlert('FOCUS_LOSS', details);
    }
  };

  handleStudentVisibilityChange = () => {
    if (this.state.studentUnlocked && document.hidden) {
      const details = 'Document hidden or tab switch detected on student terminal';
      this.setState((prev) => ({
        studentViolationsCount: prev.studentViolationsCount + 1,
        focusLostModal: true,
        studentSecurityAlert: 'SECURITY VIOLATION: Tab switch or window minimization detected!',
      }));
      this.recordLocalViolation('TAB_SWITCH', details);
      this.reportStudentAlert('TAB_SWITCH', details);
    }
  };

  handleStudentKeyDown = (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      this.setState({ secretExitModal: true, secretExitPin: '' });
      return;
    }

    if (this.state.studentUnlocked || this.state.secretExitModal) {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.key === 'F12' ||
        e.key === 'PrintScreen' ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopPropagation();
        const details = `Forbidden key combination attempted: ${e.key}`;
        this.recordLocalViolation('RESTRICTED_KEY_PRESS', details);
        this.reportStudentAlert('RESTRICTED_KEY_PRESS', details);
      }
    }
  };

  reportStudentAlert = async (violationType, details) => {
    const { studentRoll, studentSeat, studentCenterCode, studentSubjectCode } = this.state;
    const payload = {
      roll_number: studentRoll,
      seat_id: studentSeat,
      center_code: studentCenterCode,
      subject_code: studentSubjectCode,
      violation_type: violationType,
      details,
    };

    const base = this.getActiveApiBase();
    try {
      const res = await fetch(`${base}/api/student/security-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error('Alert HTTP error');
      }
    } catch (e) {
      console.error('Failed to report student security alert, queueing for retry', e);
      this.setState((prev) => ({
        queuedOfflineAlerts: [...prev.queuedOfflineAlerts.slice(-25), payload],
      }));
    }
  };

  handleSaveServerSettings = () => {
    const clean = (this.state.apiBaseUrl || '').trim().replace(/\/+$/, '');
    try {
      if (clean) {
        localStorage.setItem('KIOSK_API_BASE', clean);
      } else {
        localStorage.removeItem('KIOSK_API_BASE');
      }
    } catch {
      // Ignore
    }
    this.setState({
      apiBaseUrl: clean,
      serverTestStatus: 'Saved kiosk server configuration.',
    });
  };

  handleTestServerConnection = async () => {
    const base = this.getActiveApiBase();
    this.setState({ serverTestStatus: `Testing ${base || 'same-origin'}...` });
    try {
      const res = await fetch(`${base}/api/scheduled-exams`);
      if (res.ok) {
        this.setState({ serverTestStatus: `✓ Connected to Exam Server (${base || 'same-origin'})` });
      } else {
        this.setState({ serverTestStatus: `⚠️ Server responded with HTTP ${res.status}` });
      }
    } catch {
      this.setState({
        serverTestStatus: `✕ Unreachable (${base || 'localhost'}). Check Exam Hall LAN IP / Wi-Fi.`,
      });
    }
  };

  handleOrientationChange = async (mode) => {
    this.setState({ orientationMode: mode });
    await setKioskOrientation(mode);
  };

  handleResumeFromFocusLoss = async () => {
    await enableKioskLockdown({ orientation: this.state.orientationMode });
    await this.refreshKioskSecurityStatus();
    this.setState({
      focusLostModal: false,
      pinBreachModal: false,
      displayBreachModal: false,
    });
  };

  handleStudentLogin = async (e) => {
    e.preventDefault();
    const { studentRoll, studentSeat, studentCenterCode, studentSubjectCode, orientationMode } = this.state;

    if (!studentRoll.trim() || !studentCenterCode.trim() || !studentSubjectCode.trim()) {
      this.setState({ studentError: 'Roll Number, Center Code, and Subject Code are required.' });
      return;
    }

    this.setState({ studentLoading: true, studentError: '' });

    const base = this.getActiveApiBase();

    try {
      const response = await fetch(`${base}/api/student/paper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll_number: studentRoll,
          seat_id: studentSeat,
          center_code: studentCenterCode,
          subject_code: studentSubjectCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Student terminal authorization failed.');
      }

      if (typeof window !== 'undefined') {
        this.initialViewportHeight = window.innerHeight;
      }

      this.setState(
        {
          studentPaperContent: data.content,
          studentPhotoUrl: data.captured_image_base64 || this.state.studentPhotoUrl,
          studentUnlocked: true,
          studentLoading: false,
          studentError: '',
          studentViolationsCount: 0,
          pinBreachModal: false,
          displayBreachModal: false,
          examRemainingSeconds: 3 * 3600,
        },
        () => {
          if (!data.captured_image_base64) {
            this.fetchStudentPhoto(studentRoll);
          }
          this.startHeartbeat();
        }
      );

      await enableKioskLockdown({ orientation: orientationMode });
      this.refreshKioskSecurityStatus();
    } catch (err) {
      const isConnectionError =
        err.message &&
        (err.message.includes('Failed to fetch') ||
          err.message.includes('NetworkError') ||
          err.message.includes('Load failed'));

      if (isConnectionError) {
        const fallbackText =
          this.getFallbackPaperText(studentSubjectCode) ||
          `--- CONFIDENTIAL EXAMINATION PAPER ---
SUBJECT CODE: ${studentSubjectCode}
CENTER CODE: ${studentCenterCode}
DESK / SEAT ID: ${studentSeat || 'DESK-01'}
STUDENT ROLL NO: ${studentRoll}

SECTION A: MULTIPLE CHOICE QUESTIONS
Q1. Explain the Two-Stage Double Encryption protocol used in Secure EMS.
Q2. Describe how dynamic watermarking prevents examination paper leaks.

SECTION B: DESCRIPTIVE QUESTIONS
Q3. Outline the biometric candidate verification workflow prior to hall entry.
--- END OF EXAMINATION PAPER ---`;

        if (typeof window !== 'undefined') {
          this.initialViewportHeight = window.innerHeight;
        }

        this.setState(
          {
            studentPaperContent: fallbackText,
            studentUnlocked: true,
            studentLoading: false,
            studentError: '',
            studentViolationsCount: 0,
            pinBreachModal: false,
            displayBreachModal: false,
            examRemainingSeconds: 3 * 3600,
          },
          () => {
            this.startHeartbeat();
          }
        );

        await enableKioskLockdown({ orientation: orientationMode });
        this.refreshKioskSecurityStatus();
      } else {
        this.setState({
          studentPaperContent: '',
          studentUnlocked: false,
          studentLoading: false,
          studentError: err.message || 'Failed to fetch scheduled question paper.',
          studentViolationsCount: 0,
        });
      }
    }
  };

  handleExitStudentKiosk = () => {
    if (window.confirm('Submit paper and exit? This will lock the terminal.')) {
      this.stopHeartbeat();
      this.setState({
        kioskSubmitted: true,
        focusLostModal: false,
        pinBreachModal: false,
        displayBreachModal: false,
        roughSheetNotes: '',
        showRoughSheet: false,
      });
      if (document.fullscreenElement && document.exitFullscreen) {
        // stay in fullscreen if possible, this is kiosk mode
      }
    }
  };

  handleAdminUnlock = async (e) => {
    e.preventDefault();
    if (this.state.adminUnlockPin === '9999') {
      await disableKioskLockdown('9999').catch(() => {});
      await exitKioskApplication('9999');
    } else {
      alert('Invalid Admin PIN');
    }
  };

  handleSecretExit = async (e) => {
    e.preventDefault();
    if (this.state.secretExitPin === '999' || this.state.secretExitPin === '9999') {
      await disableKioskLockdown(this.state.secretExitPin).catch(() => {});
      await exitKioskApplication(this.state.secretExitPin);
    } else {
      alert('Invalid Secret PIN');
      this.setState({ secretExitPin: '' });
    }
  };

  getPaperDetails = (rawContent, subjectCode) => {
    let text = '';
    let pages = null;
    let dataUrl = '';

    if (typeof rawContent === 'string' && rawContent.trim()) {
      const trimmed = rawContent.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.dataUrl) dataUrl = ensurePdfBlobUrl(parsed.dataUrl) || parsed.dataUrl;
          if (parsed.pages && Array.isArray(parsed.pages)) {
            pages = parsed.pages;
          }
          if (parsed.text) {
            if (typeof parsed.text === 'string' && parsed.text.trim().startsWith('{')) {
              try {
                const innerParsed = JSON.parse(parsed.text.trim());
                if (innerParsed.pages && Array.isArray(innerParsed.pages)) pages = innerParsed.pages;
              } catch {
                text = parsed.text;
              }
            } else {
              text = parsed.text;
            }
          }
        } catch {
          text = rawContent;
        }
      }

      if (!dataUrl && (!pages || pages.length === 0)) {
        dataUrl = ensurePdfBlobUrl(rawContent);
        if (!dataUrl && !text) {
          text = rawContent;
        }
      }
    }

    if (!dataUrl && (!pages || pages.length === 0)) {
      try {
        const customPapers = JSON.parse(localStorage.getItem('CUSTOM_PAPERS') || '{}');
        const code = (subjectCode || '').toUpperCase().trim();

        let paperObj = customPapers[code];
        if (!paperObj) {
          const matchingKey = Object.keys(customPapers).find((k) => k.toUpperCase().trim() === code);
          if (matchingKey) paperObj = customPapers[matchingKey];
        }
        if (!paperObj && Object.keys(customPapers).length > 0) {
          const keys = Object.keys(customPapers);
          paperObj = customPapers[keys[keys.length - 1]];
        }
        if (!paperObj) {
          const lastUploaded = localStorage.getItem('LAST_UPLOADED_PAPER');
          if (lastUploaded) paperObj = JSON.parse(lastUploaded);
        }

        if (paperObj && typeof paperObj === 'object') {
          if (paperObj.pages && Array.isArray(paperObj.pages)) pages = paperObj.pages;
          if (paperObj.dataUrl) dataUrl = ensurePdfBlobUrl(paperObj.dataUrl) || paperObj.dataUrl;
          if (!text && paperObj.text) {
            if (typeof paperObj.text === 'string' && paperObj.text.trim().startsWith('{')) {
              try {
                const p = JSON.parse(paperObj.text.trim());
                if (p.pages && Array.isArray(p.pages)) pages = p.pages;
              } catch {
                // Ignore
              }
            } else {
              text = paperObj.text;
            }
          }
        } else if (typeof paperObj === 'string') {
          dataUrl = ensurePdfBlobUrl(paperObj);
          if (!dataUrl && !text) text = paperObj;
        }
      } catch {
        // Ignore
      }
    }

    if (pages && pages.length > 0) {
      text = '';
    }

    return { dataUrl, text, pages };
  };

  getCleanPaperContent = (rawContent) => {
    if (!rawContent || typeof rawContent !== 'string') {
      return '';
    }
    return rawContent;
  };

  getPaperDataUrl = (subjectCode) => {
    const { dataUrl } = this.getPaperDetails(this.state.studentPaperContent, subjectCode);
    return dataUrl;
  };

  getFallbackPaperText = (subjectCode) => {
    const code = (subjectCode || '').toUpperCase().trim();
    try {
      const customPapers = JSON.parse(localStorage.getItem('CUSTOM_PAPERS') || '{}');
      const paperObj = customPapers[code];
      if (paperObj) {
        return typeof paperObj === 'string' ? paperObj : paperObj.text || '';
      }
    } catch (e) {
      console.error('Failed to read CUSTOM_PAPERS from localStorage', e);
    }
    return '';
  };

  render() {
    const {
      studentRoll,
      studentSeat,
      studentCenterCode,
      studentSubjectCode,
      studentPaperContent,
      studentPhotoUrl,
      studentUnlocked,
      studentLoading,
      studentError,
      studentViolationsCount,
      studentSecurityAlert,
      focusLostModal,
      pinBreachModal,
      displayBreachModal,
      kioskSubmitted,
      adminUnlockPin,
      apiBaseUrl,
      showServerSettings,
      serverTestStatus,
      orientationMode,
      kioskStatus,
      examRemainingSeconds,
      textFontScale,
      showRoughSheet,
      roughSheetNotes,
      showSecurityLogDrawer,
      violationHistory,
      queuedOfflineAlerts,
    } = this.state;

    const forensicWatermark = `${studentRoll || 'CANDIDATE'} • ${studentSeat || 'DESK'} • ${
      studentCenterCode || 'CENTER'
    } • ${studentSubjectCode || 'EXAM'}`;

    return (
      <div
        className="min-h-screen bg-slate-900 text-slate-100 p-2 sm:p-6 flex flex-col items-center font-sans select-none"
        style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      >
        <div className="w-full max-w-5xl bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          {/* Header Bar */}
          <div className="bg-slate-950 px-4 sm:px-6 py-3.5 flex flex-wrap justify-between items-center border-b border-slate-700 gap-3">
            <div>
              <h1 className="font-bold text-base sm:text-lg tracking-wide text-emerald-400">
                STUDENT SECURE KIOSK TERMINAL
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400 font-mono">
                Android Tablet / Mobile &amp; Desktop Zero-Cheat Examination Reader
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {this.state.kioskPlatform === 'web' && !studentUnlocked && (
                <a
                  href={`${this.getActiveApiBase()}/api/student/download-apk`}
                  download="Secure-EMS-Student-Kiosk.apk"
                  className="bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 border border-emerald-500/70 px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-colors flex items-center gap-1 shadow"
                  title="Download compiled Android Kiosk APK (Secure-EMS-Student-Kiosk.apk)"
                >
                  📲 Download Android APK
                </a>
              )}
              <span
                className="bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-[11px] font-mono text-cyan-300"
                title="Active Anti-Screenshot & Screen-Recording Shield"
              >
                🛡️ FLAG_SECURE
              </span>
              {typeof kioskStatus.batteryLevel === 'number' && (
                <span className="bg-slate-900 px-2.5 py-1 rounded border border-slate-800 text-[11px] font-mono text-slate-300">
                  🔋 {kioskStatus.batteryLevel}%
                </span>
              )}
              <button
                type="button"
                onClick={this.handleHeaderSecretTap}
                title="Tap 5 times rapidly for Proctor / Admin Override"
                className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded border border-slate-800 text-xs font-mono text-emerald-400 font-bold cursor-pointer active:scale-95"
              >
                <span>● CLIENT ONLINE</span>
              </button>
            </div>
          </div>

          {/* Hardware & OS Anti-Cheat Status Strip */}
          <div className="bg-slate-950/80 border-b border-slate-800 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-emerald-400 font-bold">
                📌 LOCK MODE: {kioskStatus.lockTaskMode || 'ACTIVE'}
              </span>
              <span className="hidden sm:inline">|</span>
              <span>🚫 SPLIT-SCREEN: BLOCKED</span>
              <span className="hidden sm:inline">|</span>
              <span>🖥️ DISPLAYS: {kioskStatus.displayCount || 1} (CAST GUARD ON)</span>
              <span className="hidden sm:inline">|</span>
              <span>🔒 OVERLAY SHIELD: ON</span>
              {queuedOfflineAlerts.length > 0 && (
                <span className="text-amber-400 font-bold">
                  | ⏳ QUEUED ALERTS: {queuedOfflineAlerts.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">ORIENTATION:</span>
              {['unspecified', 'portrait', 'landscape'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => this.handleOrientationChange(mode)}
                  className={`px-2 py-0.5 rounded uppercase text-[10px] border transition-colors ${
                    orientationMode === mode
                      ? 'bg-emerald-900/70 text-emerald-300 border-emerald-600 font-bold'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {mode === 'unspecified' ? 'Auto' : mode}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 sm:p-8">
            {kioskSubmitted ? (
              <div className="max-w-md mx-auto bg-slate-950 p-6 sm:p-8 rounded-xl border border-red-800/80 space-y-6 shadow-2xl text-center">
                <div className="text-5xl">🔒</div>
                <h2 className="text-2xl font-bold text-red-400 uppercase tracking-widest">
                  Terminal Locked
                </h2>
                <p className="text-slate-300 text-sm font-mono">
                  The examination has been submitted. This terminal is now securely locked.
                </p>
                <div className="bg-slate-900 border border-slate-700 p-4 rounded text-left space-y-2 mt-4">
                  <p className="text-xs text-slate-400 font-mono">
                    Student: <span className="text-emerald-400">{studentRoll}</span>
                  </p>
                  <p className="text-xs text-slate-400 font-mono">
                    Seat: <span className="text-emerald-400">{studentSeat}</span>
                  </p>
                  <p className="text-xs text-slate-400 font-mono">
                    Center: <span className="text-emerald-400">{studentCenterCode}</span>
                  </p>
                  <p className="text-xs text-slate-400 font-mono">
                    Total Violations Logged:{' '}
                    <span className="text-amber-400 font-bold">{studentViolationsCount}</span>
                  </p>
                </div>

                <form onSubmit={this.handleAdminUnlock} className="space-y-4 pt-6 border-t border-slate-800">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 text-left">
                      ADMINISTRATOR PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={adminUnlockPin}
                      onChange={(e) => this.setState({ adminUnlockPin: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2.5 text-slate-100 font-bold focus:outline-none focus:border-red-500 text-center tracking-widest"
                      placeholder="****"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-red-900 hover:bg-red-800 text-red-100 font-bold py-3 rounded transition-colors text-sm border border-red-700"
                  >
                    AUTHORIZE UNLOCK &amp; CLOSE APP
                  </button>
                </form>
              </div>
            ) : !studentUnlocked ? (
              <div className="max-w-xl mx-auto bg-slate-950 p-4 sm:p-6 rounded-lg border border-emerald-800/80 space-y-5">
                <div className="flex items-start justify-between border-b border-slate-800 pb-4 gap-4">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-2">
                      👨‍🎓 Student Terminal Authorization
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Enter Roll Number and Desk ID to load your question paper in locked kiosk mode.
                    </p>
                  </div>

                  {/* Single 3:4 Aspect Ratio Passport Photo Frame (106px x 142px, Right-Aligned) */}
                  <div
                    className="relative bg-slate-900 border-2 border-slate-700 rounded-sm overflow-hidden shadow-lg flex flex-col items-center justify-center shrink-0 ml-auto"
                    style={{
                      width: '106px',
                      height: '142px',
                      minWidth: '106px',
                      minHeight: '142px',
                      maxWidth: '106px',
                      maxHeight: '142px',
                    }}
                    title="Student Passport Photo (3:4 Ratio)"
                  >
                    {studentPhotoUrl ? (
                      <img
                        src={studentPhotoUrl}
                        alt="Student Passport Photo"
                        className="w-full h-full object-cover aspect-[3/4]"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        className="w-full h-full flex flex-col items-center justify-center bg-[#f4ebd0] text-slate-800 p-1 text-center select-none"
                        style={{ width: '100%', height: '100%' }}
                      >
                        <svg
                          width="48"
                          height="48"
                          style={{ width: '48px', height: '48px', maxWidth: '48px', maxHeight: '48px' }}
                          className="text-slate-700 mb-0.5 opacity-85 shrink-0"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                        <span className="text-[10px] font-bold text-slate-800 tracking-wider font-mono uppercase shrink-0">
                          PHOTO (3:4)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pre-Exam Android Kiosk Hardware Security Audit Checklist */}
                <div className="bg-slate-900/90 border border-emerald-900/60 rounded p-3 text-[11px] font-mono space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-400 font-bold uppercase tracking-wider">
                      🛡️ ANDROID TABLET / MOBILE HARDWARE LOCKDOWN CHECKLIST
                    </span>
                    <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">
                      6/6 READY
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-300">
                    <div>✓ Screen Capture &amp; Record Block</div>
                    <div>✓ Android LockTask / Screen Pinning</div>
                    <div>✓ Split-Screen &amp; PiP Disabled</div>
                    <div>✓ HDMI / Wireless Cast Guard</div>
                    <div>✓ Tapjacking Overlay Filter</div>
                    <div>✓ System Clipboard Auto-Wipe</div>
                  </div>
                </div>

                {/* Collapsible Exam Hall Server & Kiosk Configuration for Android Tablets/Phones */}
                <div className="bg-slate-900/90 border border-slate-800 rounded p-3 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-bold">
                      📡 EXAM SERVER: {this.getActiveApiBase() || 'Same-Origin Cloud'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        this.setState((prev) => ({ showServerSettings: !prev.showServerSettings }))
                      }
                      className="text-emerald-400 hover:text-emerald-300 font-bold underline"
                    >
                      {showServerSettings ? 'Hide Setup' : '⚙️ Configure Server'}
                    </button>
                  </div>

                  {showServerSettings && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
                      <label className="block text-slate-400 text-[11px]">
                        EXAM HALL FASTAPI SERVER URL (e.g. http://192.168.1.100:8000 or http://10.0.2.2:8000)
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="url"
                          value={apiBaseUrl}
                          onChange={(e) => this.setState({ apiBaseUrl: e.target.value })}
                          placeholder="http://192.168.1.100:8000"
                          className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={this.handleSaveServerSettings}
                          className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 rounded"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={this.handleTestServerConnection}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-3 py-1.5 rounded"
                        >
                          Test Ping
                        </button>
                      </div>
                      {serverTestStatus && (
                        <p className="text-[11px] text-amber-300">{serverTestStatus}</p>
                      )}
                    </div>
                  )}
                </div>

                {studentError && (
                  <div className="bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded text-sm font-mono">
                    [AUTHORIZATION ERROR] {studentError}
                  </div>
                )}

                <form onSubmit={this.handleStudentLogin} className="space-y-4 text-sm font-mono">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">
                      STUDENT ROLL NUMBER / ENROLLMENT ID
                    </label>
                    <input
                      type="text"
                      value={studentRoll}
                      onChange={(e) => {
                        const val = e.target.value;
                        this.setState({ studentRoll: val });
                        this.fetchStudentPhoto(val);
                      }}
                      onBlur={() => this.fetchStudentPhoto(this.state.studentRoll)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2.5 text-slate-100 font-bold focus:outline-none focus:border-emerald-500"
                      placeholder="e.g. 2026-CS-101"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 text-xs mb-1">DESK / SEAT ID</label>
                      <input
                        type="text"
                        value={studentSeat}
                        onChange={(e) => this.setState({ studentSeat: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500"
                        placeholder="DESK-42"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-xs mb-1">EXAM CENTER CODE</label>
                      <input
                        type="text"
                        value={studentCenterCode}
                        onChange={(e) => this.setState({ studentCenterCode: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500"
                        placeholder="CTR-101"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-xs mb-1">SUBJECT CODE</label>
                    <input
                      type="text"
                      value={studentSubjectCode}
                      onChange={(e) => this.setState({ studentSubjectCode: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2.5 text-slate-100 uppercase font-bold focus:outline-none focus:border-emerald-500"
                      placeholder="CS-602"
                      required
                    />
                  </div>

                  <div className="p-3 bg-slate-900/80 border border-amber-900/60 rounded text-xs text-amber-300 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      🔒 ANDROID &amp; STANDALONE KIOSK LOCKDOWN NOTICE
                    </p>
                    <p className="text-slate-400">
                      Device enters hardware LockTask / Screen Pinning mode. Screenshots, screen
                      recording, split-screen, floating overlays, 3-finger gestures, clipboard, and
                      app-switching are blocked and reported live to the Center Supervisor.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={studentLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-slate-950 font-bold py-3.5 rounded transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {studentLoading ? 'CONNECTING TO SERVER...' : '🚀 START SECURE KIOSK READER'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                {/* Top Kiosk Header */}
                <div className="bg-slate-950 border border-emerald-700 p-3 sm:p-4 rounded-lg flex flex-wrap items-center justify-between gap-3 font-mono text-xs select-none">
                  <div className="flex items-center gap-3 sm:gap-4">
                    {studentPhotoUrl && (
                      <div
                        className="relative w-10 h-14 bg-slate-900 border border-emerald-500 rounded overflow-hidden shrink-0 shadow"
                        title="Pre-Exam Verified Candidate Photo"
                      >
                        <img
                          src={studentPhotoUrl}
                          alt="Candidate Verified"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div>
                      <span className="text-emerald-400 font-bold uppercase tracking-wider flex flex-wrap items-center gap-2">
                        🔴 SECURE STUDENT KIOSK READER — ACTIVE
                        {studentPhotoUrl && (
                          <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[9px] px-1.5 py-0.5 rounded font-bold">
                            ✓ VERIFIED PHOTO
                          </span>
                        )}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-slate-300 mt-1">
                        <span>
                          ROLL: <strong>{studentRoll}</strong>
                        </span>
                        <span>|</span>
                        <span>
                          SEAT: <strong>{studentSeat}</strong>
                        </span>
                        <span>|</span>
                        <span>
                          CENTER: <strong>{studentCenterCode}</strong>
                        </span>
                        <span>|</span>
                        <span>
                          SUBJECT: <strong className="text-amber-400">{studentSubjectCode}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span
                      className="bg-slate-900 text-cyan-300 border border-slate-700 px-2.5 py-1 rounded font-bold"
                      title="Remaining Examination Time"
                    >
                      ⏱️ {formatSecondsAsClock(examRemainingSeconds)}
                    </span>

                    <span
                      className={`px-3 py-1 rounded font-bold ${
                        studentViolationsCount === 0
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-red-950 text-red-300 border border-red-800 animate-pulse'
                      }`}
                    >
                      SECURITY VIOLATIONS: {studentViolationsCount}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        this.setState((prev) => ({ showRoughSheet: !prev.showRoughSheet }))
                      }
                      className="bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-700/60 px-2.5 py-1.5 rounded font-bold transition-colors"
                    >
                      📝 ROUGH SHEET
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        this.setState((prev) => ({
                          showSecurityLogDrawer: !prev.showSecurityLogDrawer,
                        }))
                      }
                      className="bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-800/60 px-2.5 py-1.5 rounded font-bold transition-colors"
                    >
                      🛡️ SECURITY LOG
                    </button>

                    <button
                      onClick={this.handleExitStudentKiosk}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded font-bold transition-colors"
                    >
                      🔒 SUBMIT &amp; EXIT
                    </button>
                  </div>
                </div>

                {/* In-Kiosk Volatile Rough Work / Scratchpad Drawer for Tablet & Mobile Candidates */}
                {showRoughSheet && (
                  <div className="bg-slate-950 border border-amber-700/70 rounded-lg p-4 space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-400 font-bold uppercase">
                        📝 IN-KIOSK ROUGH WORK &amp; QUESTION BOOKMARKS (AUTO-WIPED ON EXIT)
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => this.setState({ roughSheetNotes: '' })}
                          className="text-slate-400 hover:text-red-300"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => this.setState({ showRoughSheet: false })}
                          className="text-amber-400 hover:text-white font-bold"
                        >
                          ✕ Close
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={4}
                      value={roughSheetNotes}
                      onChange={(e) => this.setState({ roughSheetNotes: e.target.value })}
                      placeholder="Jot rough calculations, formulas, or question numbers to revisit..."
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {/* Live Security Telemetry & Android Hardware Simulator Drawer */}
                {showSecurityLogDrawer && (
                  <div className="bg-slate-950 border border-cyan-800/70 rounded-lg p-4 space-y-3 font-mono text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-cyan-400 font-bold uppercase">
                        🛡️ ANDROID KIOSK SECURITY LOG &amp; HARDWARE DIAGNOSTICS
                      </span>
                      <button
                        type="button"
                        onClick={() => this.setState({ showSecurityLogDrawer: false })}
                        className="text-cyan-400 hover:text-white font-bold"
                      >
                        ✕ Close
                      </button>
                    </div>

                    {/* Interactive Test Triggers for Proctors / Evaluators */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800">
                      <span className="text-slate-400 text-[11px]">TEST ANDROID LOCKS:</span>
                      <button
                        type="button"
                        onClick={() =>
                          this.handleNativeAndroidViolation(
                            'SCREEN_PINNING_BREACH',
                            'Simulated Android LockTask unpin event'
                          )
                        }
                        className="bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 px-2 py-1 rounded text-[11px]"
                      >
                        Simulate Screen Unpin
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          this.handleNativeAndroidViolation(
                            'SECONDARY_DISPLAY_DETECTED',
                            'Simulated HDMI / Wireless Cast display mirror attached'
                          )
                        }
                        className="bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 px-2 py-1 rounded text-[11px]"
                      >
                        Simulate HDMI/Cast Mirror
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          this.handleNativeAndroidViolation(
                            'MULTI_WINDOW_ATTEMPT',
                            'Simulated Android split-screen multi-window attempt'
                          )
                        }
                        className="bg-amber-950 hover:bg-amber-900 text-amber-200 border border-amber-800 px-2 py-1 rounded text-[11px]"
                      >
                        Simulate Split-Screen
                      </button>
                    </div>

                    {violationHistory.length === 0 ? (
                      <p className="text-emerald-400 text-[11px]">
                        ✓ Zero security violations recorded during this session.
                      </p>
                    ) : (
                      <div className="max-h-36 overflow-y-auto space-y-1 bg-slate-900 p-2 rounded border border-slate-800">
                        {violationHistory.map((v, i) => (
                          <div key={i} className="text-[11px] text-red-300 flex gap-2">
                            <span className="text-slate-500">[{v.timestamp}]</span>
                            <span className="font-bold text-amber-400">{v.type}:</span>
                            <span>{v.details}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Security Warning Toast */}
                {studentSecurityAlert && (
                  <div className="bg-amber-950 border border-amber-700 text-amber-200 px-4 py-2 rounded text-xs font-mono flex items-center justify-between gap-2">
                    <span>⚠️ {studentSecurityAlert}</span>
                    <button
                      onClick={() => this.setState({ studentSecurityAlert: '' })}
                      className="text-amber-400 hover:text-white font-bold shrink-0"
                    >
                      DISMISS
                    </button>
                  </div>
                )}

                <div className="bg-slate-950 border border-slate-800 rounded-t-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono select-none">
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-600 text-white font-bold px-2 py-0.5 rounded text-[10px] tracking-wider uppercase">
                      🖼️ IMAGE DOCUMENT
                    </span>
                    <span className="text-slate-200 font-bold truncate max-w-[200px] sm:max-w-none">
                      {studentSubjectCode}_Question_Paper_2026
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          this.setState((prev) => ({
                            textFontScale: Math.max(80, prev.textFontScale - 10),
                          }))
                        }
                        className="px-1.5 text-slate-300 hover:text-white font-bold"
                        title="Decrease Text Size"
                      >
                        A-
                      </button>
                      <span className="text-[10px] text-slate-400">{textFontScale}%</span>
                      <button
                        type="button"
                        onClick={() =>
                          this.setState((prev) => ({
                            textFontScale: Math.min(150, prev.textFontScale + 10),
                          }))
                        }
                        className="px-1.5 text-slate-300 hover:text-white font-bold"
                        title="Increase Text Size"
                      >
                        A+
                      </button>
                    </div>
                    <span className="bg-slate-900 border border-slate-800 text-emerald-400 px-2.5 py-1 rounded text-[10px] font-bold">
                      🔒 READ-ONLY KIOSK LOCK
                    </span>
                  </div>
                </div>

                {/* Official Permanent PDF / Image / Text Document Sheet Layout */}
                <div
                  className="relative bg-slate-950 p-3 sm:p-6 rounded-b-lg border-2 border-slate-800 max-h-[75vh] overflow-y-auto shadow-2xl select-none"
                  onContextMenu={this.preventStudentContextMenu}
                  onCopy={this.preventStudentClipboard}
                  onCut={this.preventStudentClipboard}
                  onPaste={this.preventStudentClipboard}
                  style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                >
                  {/* Dynamic Forensic Anti-Camera Watermark Overlay */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-around items-center overflow-hidden opacity-10 select-none"
                  >
                    <span className="text-emerald-300 font-mono font-extrabold text-xs sm:text-base tracking-widest uppercase -rotate-12 whitespace-nowrap">
                      {forensicWatermark}
                    </span>
                    <span className="text-amber-300 font-mono font-extrabold text-xs sm:text-base tracking-widest uppercase -rotate-12 whitespace-nowrap">
                      {forensicWatermark}
                    </span>
                  </div>

                  {/* Exact Uploaded PDF Document Stream, Image Pages, or Clean Question Paper Payload */}
                  {(() => {
                    const {
                      text: activePaperText,
                      pages: activePages,
                      dataUrl: pdfDataUrl,
                    } = this.getPaperDetails(studentPaperContent, studentSubjectCode);
                    const displayContent =
                      activePaperText ||
                      this.getCleanPaperContent(studentPaperContent, studentSubjectCode);

                    if (activePages && activePages.length > 0) {
                      return (
                        <div className="w-full relative z-20">
                          <ImagePaperViewer
                            pages={activePages}
                            subjectCode={studentSubjectCode}
                            title={`Official Question Paper (${studentSubjectCode})`}
                          />
                        </div>
                      );
                    }

                    if (pdfDataUrl) {
                      return (
                        <PdfCanvasViewer
                          pdfUrl={pdfDataUrl}
                          subjectCode={studentSubjectCode}
                          seatId={studentSeat}
                          rollNumber={studentRoll}
                          centerCode={studentCenterCode}
                        />
                      );
                    }

                    return (
                      <div className="bg-slate-900/90 text-slate-100 p-4 sm:p-8 rounded-xl shadow-2xl border border-slate-800 max-w-4xl mx-auto font-sans relative z-20 space-y-6">
                        {/* Header Badge */}
                        <div className="border-b border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded font-bold uppercase tracking-wider">
                              📄 OFFICIAL QUESTION PAPER ({studentSubjectCode})
                            </span>
                            <span className="text-slate-400">| Seat: {studentSeat}</span>
                          </div>
                          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded font-bold uppercase text-[10px]">
                            ● DECRYPTED &amp; VERIFIED
                          </span>
                        </div>

                        {/* Question Content Display */}
                        <div className="space-y-4 pt-2">
                          <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1">
                            SECTION A — EXAMINATION QUESTIONS &amp; INSTRUCTIONS
                          </div>
                          <div
                            className="bg-slate-950 p-4 sm:p-5 rounded-lg border border-slate-800 font-mono text-sm leading-relaxed text-slate-200 whitespace-pre-wrap shadow-inner"
                            style={{ fontSize: `${textFontScale}%` }}
                          >
                            {displayContent || 'No question paper payload loaded.'}
                          </div>
                        </div>

                        {/* Document Footer */}
                        <div className="border-t border-slate-800 pt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                          <span>END OF QUESTION PAPER PAYLOAD</span>
                          <span>SECURITY TIME-LOCKED 🔒</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Secondary Display / Screen Mirroring Breach Modal (Android HDMI/Cast Guard) */}
        {displayBreachModal && (
          <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-red-950 border-2 border-red-500 rounded-lg p-6 max-w-md w-full space-y-4 text-center shadow-2xl">
              <div className="text-4xl">🖥️</div>
              <h3 className="text-lg font-extrabold text-red-300 uppercase tracking-wider">
                EXTERNAL DISPLAY / SCREEN CAST DETECTED
              </h3>
              <p className="text-sm text-red-200 font-mono">
                Question paper access is suspended because an external HDMI display or wireless screen cast
                was detected on this device. Disconnect all secondary displays to continue.
              </p>
              <div className="bg-slate-950 p-3 rounded text-xs font-mono text-slate-400 text-left space-y-1">
                <div>Roll No: {studentRoll}</div>
                <div>Seat ID: {studentSeat}</div>
                <div>Total Violations: {studentViolationsCount}</div>
              </div>
              <button
                onClick={this.handleResumeFromFocusLoss}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded transition-colors text-sm"
              >
                VERIFY SINGLE DISPLAY &amp; RESUME SESSION
              </button>
            </div>
          </div>
        )}

        {/* Screen Pinning / LockTask Breach Modal (Android Specific) */}
        {pinBreachModal && !displayBreachModal && (
          <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-red-950 border-2 border-red-500 rounded-lg p-6 max-w-md w-full space-y-4 text-center shadow-2xl">
              <div className="text-4xl">📌</div>
              <h3 className="text-lg font-extrabold text-red-300 uppercase tracking-wider">
                ANDROID SCREEN PINNING BREACHED
              </h3>
              <p className="text-sm text-red-200 font-mono">
                Question paper access is suspended because Android LockTask / Screen Pinning was exited.
                This violation has been reported to the Center Supervisor.
              </p>
              <div className="bg-slate-950 p-3 rounded text-xs font-mono text-slate-400 text-left space-y-1">
                <div>Roll No: {studentRoll}</div>
                <div>Seat ID: {studentSeat}</div>
                <div>Total Violations: {studentViolationsCount}</div>
              </div>
              <button
                onClick={this.handleResumeFromFocusLoss}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-3 rounded transition-colors text-sm"
              >
                📌 RE-PIN SCREEN &amp; RESUME SECURE SESSION
              </button>
            </div>
          </div>
        )}

        {/* Focus Lost Security Warning Modal */}
        {focusLostModal && !pinBreachModal && !displayBreachModal && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-red-950 border-2 border-red-600 rounded-lg p-6 max-w-md w-full space-y-4 text-center shadow-2xl">
              <div className="text-4xl animate-bounce">⚠️</div>
              <h3 className="text-lg font-extrabold text-red-300 uppercase tracking-wider">
                SECURITY VIOLATION DETECTED
              </h3>
              <p className="text-sm text-red-200 font-mono">
                Window focus was lost or tab switched! This security event has been logged to the central server audit trail.
              </p>
              <div className="bg-slate-950 p-3 rounded text-xs font-mono text-slate-400 text-left space-y-1">
                <div>Roll No: {studentRoll}</div>
                <div>Seat ID: {studentSeat}</div>
                <div>Total Violations: {studentViolationsCount}</div>
              </div>
              <button
                onClick={this.handleResumeFromFocusLoss}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded transition-colors text-sm"
              >
                RESUME SECURE SESSION &amp; RE-VERIFY
              </button>
            </div>
          </div>
        )}

        {/* Secret Exit Dialog (Ctrl+A or 5 Rapid Taps on Header Status Badge) */}
        {this.state.secretExitModal && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-sm w-full shadow-2xl">
              <h3 className="text-lg font-bold text-slate-200 mb-2 text-center uppercase tracking-widest">
                Admin override
              </h3>
              <p className="text-xs text-slate-400 font-mono text-center mb-4">
                Enter Proctor / Administrator PIN to unpin Android LockTask and exit kiosk
              </p>
              <form onSubmit={this.handleSecretExit} className="space-y-4">
                <input
                  type="password"
                  inputMode="numeric"
                  value={this.state.secretExitPin}
                  onChange={(e) => this.setState({ secretExitPin: e.target.value })}
                  className="w-full bg-slate-950 border-b-2 border-slate-700 focus:border-amber-500 text-center text-2xl tracking-widest text-white px-4 py-2 outline-none rounded-t"
                  placeholder="***"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => this.setState({ secretExitModal: false, secretExitPin: '' })}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded"
                  >
                    EXIT
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }
}
