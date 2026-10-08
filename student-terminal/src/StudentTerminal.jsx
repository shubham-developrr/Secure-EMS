import React from 'react';
import ImagePaperViewer from './ImagePaperViewer.jsx';

const API_BASE = 'https://secure-ems.onrender.com';

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
    } catch (e) {}
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
      viewMode: 'pdf',
      kioskSubmitted: false,
      adminUnlockPin: '',
      secretExitModal: false,
      secretExitPin: '',
    };

    this.heartbeatTimer = null;
  }

  componentDidMount() {
    this.fetchStudentPhoto(this.state.studentRoll);
    window.addEventListener('keydown', this.handleStudentKeyDown);
    window.addEventListener('blur', this.handleStudentFocusLoss);
    document.addEventListener('visibilitychange', this.handleStudentVisibilityChange);
    window.addEventListener('contextmenu', this.preventStudentContextMenu);
    window.addEventListener('copy', this.preventStudentClipboard);
    window.addEventListener('cut', this.preventStudentClipboard);
    window.addEventListener('paste', this.preventStudentClipboard);
  }

  fetchStudentPhoto = async (roll) => {
    const cleanRoll = (roll || this.state.studentRoll || '').trim().toUpperCase();
    if (!cleanRoll) return;

    try {
      const cached = localStorage.getItem(`STUDENT_VERIFICATION_${cleanRoll}`);
      if (cached) {
        this.setState({ studentPhotoUrl: cached });
      }
    } catch (e) {}

    try {
      const res = await fetch(`${API_BASE}/api/student/verification/${encodeURIComponent(cleanRoll)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.verified && data.captured_image_base64) {
          this.setState({ studentPhotoUrl: data.captured_image_base64 });
          try {
            localStorage.setItem(`STUDENT_VERIFICATION_${cleanRoll}`, data.captured_image_base64);
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('Could not fetch student verification photo', e);
    }
  };

  componentWillUnmount() {
    this.stopHeartbeat();
    window.removeEventListener('keydown', this.handleStudentKeyDown);
    window.removeEventListener('blur', this.handleStudentFocusLoss);
    document.removeEventListener('visibilitychange', this.handleStudentVisibilityChange);
    window.removeEventListener('contextmenu', this.preventStudentContextMenu);
    window.removeEventListener('copy', this.preventStudentClipboard);
    window.removeEventListener('cut', this.preventStudentClipboard);
    window.removeEventListener('paste', this.preventStudentClipboard);
  }

  startHeartbeat = () => {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.sendHeartbeat();
    this.heartbeatTimer = setInterval(this.sendHeartbeat, 3000);
  };

  stopHeartbeat = () => {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  };

  sendHeartbeat = async () => {
    if (!this.state.studentUnlocked) return;
    const { studentRoll, studentSeat, studentCenterCode, studentSubjectCode, studentViolationsCount, focusLostModal } = this.state;
    try {
      await fetch(`${API_BASE}/api/student/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll_number: studentRoll,
          seat_id: studentSeat,
          center_code: studentCenterCode,
          subject_code: studentSubjectCode,
          status: focusLostModal ? 'FOCUS_LOSS' : 'ACTIVE',
          violations_count: studentViolationsCount,
        }),
      });
    } catch (e) {
      console.error('Heartbeat ping failed', e);
    }
  };

  preventStudentContextMenu = (e) => {
    if (this.state.studentUnlocked) {
      e.preventDefault();
      this.reportStudentAlert('RIGHT_CLICK_ATTEMPT', 'Right-click context menu attempt blocked on standalone student terminal');
    }
  };

  preventStudentClipboard = (e) => {
    if (this.state.studentUnlocked) {
      e.preventDefault();
      this.reportStudentAlert('CLIPBOARD_TAMPER_ATTEMPT', 'Copy/Cut/Paste operation blocked on standalone student terminal');
    }
  };

  handleStudentFocusLoss = () => {
    if (this.state.studentUnlocked) {
      this.setState((prev) => ({
        studentViolationsCount: prev.studentViolationsCount + 1,
        focusLostModal: true,
        studentSecurityAlert: 'SECURITY WARNING: Window focus lost or external app switch detected!',
      }));
      this.reportStudentAlert('FOCUS_LOSS', 'Student navigated away or blurred browser window');
    }
  };

  handleStudentVisibilityChange = () => {
    if (this.state.studentUnlocked && document.hidden) {
      this.setState((prev) => ({
        studentViolationsCount: prev.studentViolationsCount + 1,
        focusLostModal: true,
        studentSecurityAlert: 'SECURITY VIOLATION: Tab switch or window minimization detected!',
      }));
      this.reportStudentAlert('TAB_SWITCH', 'Document hidden or tab switch detected on student terminal');
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
        this.reportStudentAlert('RESTRICTED_KEY_PRESS', `Forbidden key combination attempted: ${e.key}`);
      }
    }
  };

  reportStudentAlert = async (violationType, details) => {
    const { studentRoll, studentSeat, studentCenterCode, studentSubjectCode } = this.state;
    try {
      await fetch(`${API_BASE}/api/student/security-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll_number: studentRoll,
          seat_id: studentSeat,
          center_code: studentCenterCode,
          subject_code: studentSubjectCode,
          violation_type: violationType,
          details,
        }),
      });
    } catch (e) {
      console.error('Failed to report student security alert', e);
    }
  };

  handleStudentLogin = async (e) => {
    e.preventDefault();
    const { studentRoll, studentSeat, studentCenterCode, studentSubjectCode } = this.state;

    if (!studentRoll.trim() || !studentCenterCode.trim() || !studentSubjectCode.trim()) {
      this.setState({ studentError: 'Roll Number, Center Code, and Subject Code are required.' });
      return;
    }

    this.setState({ studentLoading: true, studentError: '' });

    try {
      const response = await fetch(`${API_BASE}/api/student/paper`, {
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

      this.setState({
        studentPaperContent: data.content,
        studentPhotoUrl: data.captured_image_base64 || this.state.studentPhotoUrl,
        studentUnlocked: true,
        studentLoading: false,
        studentError: '',
        studentViolationsCount: 0,
      }, () => {
        if (!data.captured_image_base64) {
          this.fetchStudentPhoto(studentRoll);
        }
        this.startHeartbeat();
      });

      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (err) {
      const isConnectionError = err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('Load failed'));

      if (isConnectionError) {
        const fallbackText = this.getFallbackPaperText(studentSubjectCode) || `--- CONFIDENTIAL EXAMINATION PAPER ---
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

        this.setState({
          studentPaperContent: fallbackText,
          studentUnlocked: true,
          studentLoading: false,
          studentError: '',
          studentViolationsCount: 0,
        }, () => {
          this.startHeartbeat();
        });

        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
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
      this.setState({ kioskSubmitted: true, focusLostModal: false });
      if (document.fullscreenElement && document.exitFullscreen) {
        // stay in fullscreen if possible, this is kiosk mode
      }
    }
  };

  handleAdminUnlock = (e) => {
    e.preventDefault();
    if (this.state.adminUnlockPin === '9999') {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('admin-quit');
      } catch (err) {
        console.warn('Electron IPC not available, mimicking close.');
        window.close();
      }
    } else {
      alert('Invalid Admin PIN');
    }
  };

  handleSecretExit = (e) => {
    e.preventDefault();
    if (this.state.secretExitPin === '999') {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('admin-quit');
      } catch (err) {
        window.close();
      }
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
              } catch (e) {
                text = parsed.text;
              }
            } else {
              text = parsed.text;
            }
          }
        } catch (e) {
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
              } catch (e) {}
            } else {
              text = paperObj.text;
            }
          }
        } else if (typeof paperObj === 'string') {
          dataUrl = ensurePdfBlobUrl(paperObj);
          if (!dataUrl && !text) text = paperObj;
        }
      } catch (e) {}
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
      viewMode,
      kioskSubmitted,
      adminUnlockPin,
    } = this.state;

    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 p-6 flex flex-col items-center font-sans select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
        <div className="w-full max-w-4xl bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          {/* Header Bar */}
          <div className="bg-slate-950 px-6 py-4 flex flex-wrap justify-between items-center border-b border-slate-700 gap-4">
            <div>
              <h1 className="font-bold text-lg tracking-wide text-emerald-400">STUDENT SECURE KIOSK TERMINAL</h1>
              <p className="text-xs text-slate-400 font-mono">Standalone Client Examination Reader Terminal</p>
            </div>
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded border border-slate-800 text-xs font-mono text-emerald-400 font-bold">
              <span>● CLIENT ONLINE</span>
            </div>
          </div>

          <div className="p-8">
            {kioskSubmitted ? (
              <div className="max-w-md mx-auto bg-slate-950 p-8 rounded-xl border border-red-800/80 space-y-6 shadow-2xl text-center">
                <div className="text-5xl">🔒</div>
                <h2 className="text-2xl font-bold text-red-400 uppercase tracking-widest">
                  Terminal Locked
                </h2>
                <p className="text-slate-300 text-sm font-mono">
                  The examination has been submitted. This terminal is now securely locked.
                </p>
                <div className="bg-slate-900 border border-slate-700 p-4 rounded text-left space-y-2 mt-4">
                  <p className="text-xs text-slate-400 font-mono">Student: <span className="text-emerald-400">{studentRoll}</span></p>
                  <p className="text-xs text-slate-400 font-mono">Seat: <span className="text-emerald-400">{studentSeat}</span></p>
                  <p className="text-xs text-slate-400 font-mono">Center: <span className="text-emerald-400">{studentCenterCode}</span></p>
                </div>
                
                <form onSubmit={this.handleAdminUnlock} className="space-y-4 pt-6 border-t border-slate-800">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1 text-left">ADMINISTRATOR PIN</label>
                    <input
                      type="password"
                      value={adminUnlockPin}
                      onChange={(e) => this.setState({ adminUnlockPin: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 font-bold focus:outline-none focus:border-red-500 text-center tracking-widest"
                      placeholder="****"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-red-900 hover:bg-red-800 text-red-100 font-bold py-3 rounded transition-colors text-sm border border-red-700"
                  >
                    AUTHORIZE UNLOCK & CLOSE APP
                  </button>
                </form>
              </div>
            ) : !studentUnlocked ? (
              <div className="max-w-xl mx-auto bg-slate-950 p-6 rounded-lg border border-emerald-800/80 space-y-5">
                <div className="flex items-start justify-between border-b border-slate-800 pb-4 gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-2">
                      👨‍🎓 Student Terminal Authorization
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Enter Roll Number and Desk ID to load your question paper in locked kiosk mode.
                    </p>
                  </div>

                  {/* Single 3:4 Aspect Ratio Passport Photo Frame (10% Incremented 106px x 142px, Right-Aligned) */}
                  <div
                    className="relative bg-slate-900 border-2 border-slate-700 rounded-sm overflow-hidden shadow-lg flex flex-col items-center justify-center shrink-0 ml-auto"
                    style={{ width: '106px', height: '142px', minWidth: '106px', minHeight: '142px', maxWidth: '106px', maxHeight: '142px' }}
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
                        <span className="text-[10px] font-bold text-slate-800 tracking-wider font-mono uppercase shrink-0">PHOTO (3:4)</span>
                      </div>
                    )}
                  </div>
                </div>

                {studentError && (
                  <div className="bg-red-950 border border-red-800 text-red-200 px-4 py-3 rounded text-sm font-mono">
                    [AUTHORIZATION ERROR] {studentError}
                  </div>
                )}

                <form onSubmit={this.handleStudentLogin} className="space-y-4 text-sm font-mono">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">STUDENT ROLL NUMBER / ENROLLMENT ID</label>
                    <input
                      type="text"
                      value={studentRoll}
                      onChange={(e) => {
                        const val = e.target.value;
                        this.setState({ studentRoll: val });
                        this.fetchStudentPhoto(val);
                      }}
                      onBlur={() => this.fetchStudentPhoto(this.state.studentRoll)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 font-bold focus:outline-none focus:border-emerald-500"
                      placeholder="e.g. 2026-CS-101"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 text-xs mb-1">DESK / SEAT ID</label>
                      <input
                        type="text"
                        value={studentSeat}
                        onChange={(e) => this.setState({ studentSeat: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                        placeholder="DESK-42"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-xs mb-1">EXAM CENTER CODE</label>
                      <input
                        type="text"
                        value={studentCenterCode}
                        onChange={(e) => this.setState({ studentCenterCode: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
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
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-100 uppercase font-bold focus:outline-none focus:border-emerald-500"
                      placeholder="CS-602"
                      required
                    />
                  </div>

                  <div className="p-3 bg-slate-900/80 border border-amber-900/60 rounded text-xs text-amber-300 space-y-1">
                    <p className="font-bold flex items-center gap-1">🔒 STANDALONE KIOSK LOCKDOWN NOTICE</p>
                    <p className="text-slate-400">
                      System enters locked mode. Text selection, right-click, clipboard operations, and tab-switching are strictly disabled and logged to central server audit trail.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={studentLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-slate-950 font-bold py-3 rounded transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    {studentLoading ? 'CONNECTING TO SERVER...' : '🚀 START SECURE KIOSK READER'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Top Kiosk Header */}
                <div className="bg-slate-950 border border-emerald-700 p-4 rounded-lg flex flex-wrap items-center justify-between gap-4 font-mono text-xs select-none">
                  <div className="flex items-center gap-4">
                    {studentPhotoUrl && (
                      <div className="relative w-10 h-14 bg-slate-900 border border-emerald-500 rounded overflow-hidden shrink-0 shadow" title="Pre-Exam Verified Candidate Photo">
                        <img src={studentPhotoUrl} alt="Candidate Verified" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div>
                      <span className="text-emerald-400 font-bold uppercase tracking-wider block flex items-center gap-2">
                        🔴 SECURE STUDENT KIOSK READER — ACTIVE
                        {studentPhotoUrl && (
                          <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[9px] px-1.5 py-0.5 rounded font-bold">
                            ✓ VERIFIED PHOTO
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-3 text-slate-300 mt-1">
                        <span>ROLL: <strong>{studentRoll}</strong></span>
                        <span>|</span>
                        <span>SEAT: <strong>{studentSeat}</strong></span>
                        <span>|</span>
                        <span>CENTER: <strong>{studentCenterCode}</strong></span>
                        <span>|</span>
                        <span>SUBJECT: <strong className="text-amber-400">{studentSubjectCode}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
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
                      onClick={this.handleExitStudentKiosk}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded font-bold transition-colors"
                    >
                      🔒 SUBMIT & EXIT
                    </button>
                  </div>
                </div>

                {/* Security Warning Toast */}
                {studentSecurityAlert && (
                  <div className="bg-amber-950 border border-amber-700 text-amber-200 px-4 py-2 rounded text-xs font-mono flex items-center justify-between">
                    <span>⚠️ {studentSecurityAlert}</span>
                    <button
                      onClick={() => this.setState({ studentSecurityAlert: '' })}
                      className="text-amber-400 hover:text-white font-bold"
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

                  <div className="flex items-center gap-2">
                    <span className="bg-slate-900 border border-slate-800 text-emerald-400 px-2.5 py-1 rounded text-[10px] font-bold">
                      🔒 READ-ONLY KIOSK LOCK
                    </span>
                  </div>
                </div>

                {/* Official Permanent PDF Document Sheet Layout */}
                <div
                  className="relative bg-slate-950 p-4 sm:p-6 rounded-b-lg border-2 border-slate-800 max-h-[75vh] overflow-y-auto shadow-2xl select-none"
                  onContextMenu={this.preventStudentContextMenu}
                  onCopy={this.preventStudentClipboard}
                  onCut={this.preventStudentClipboard}
                  onPaste={this.preventStudentClipboard}
                  style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                >


                  {/* Exact Uploaded PDF Document Stream or Clean Question Paper Payload */}
                  {(() => {
                    const { text: activePaperText, pages: activePages } = this.getPaperDetails(studentPaperContent, studentSubjectCode);
                    const displayContent = activePaperText || this.getCleanPaperContent(studentPaperContent, studentSubjectCode);

                    if (activePages && activePages.length > 0) {
                      return (
                        <div className="w-full relative z-20">
                          <ImagePaperViewer pages={activePages} subjectCode={studentSubjectCode} title={`Official Question Paper (${studentSubjectCode})`} />
                        </div>
                      );
                    }

                    return (
                      <div className="bg-slate-900/90 text-slate-100 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-800 max-w-4xl mx-auto font-sans relative z-20 space-y-6">
                        {/* Header Badge */}
                        <div className="border-b border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded font-bold uppercase tracking-wider">
                              📄 OFFICIAL QUESTION PAPER ({studentSubjectCode})
                            </span>
                            <span className="text-slate-400">| Seat: {studentSeat}</span>
                          </div>
                          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded font-bold uppercase text-[10px]">
                            ● DECRYPTED & VERIFIED
                          </span>
                        </div>

                        {/* Question Content Display */}
                        <div className="space-y-4 pt-2">
                          <div className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1">
                            SECTION A — EXAMINATION QUESTIONS & INSTRUCTIONS
                          </div>
                          <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 font-mono text-sm leading-relaxed text-slate-200 whitespace-pre-wrap shadow-inner">
                            {displayContent || 'No question paper payload loaded.'}
                          </div>
                        </div>

                        {/* Document Footer */}
                        <div className="border-t border-slate-800 pt-4 flex items-center justify-between text-[11px] font-mono text-slate-500">
                          <span>END OF QUESTION PAPER PAYLOAD</span>
                          <span>SECURITY TIME-LOCKED 🔒</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Focus Lost Security Warning Modal */}
                {focusLostModal && (
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
                        onClick={() => this.setState({ focusLostModal: false })}
                        className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded transition-colors text-sm"
                      >
                        RESUME SECURE SESSION & RE-VERIFY
                      </button>
                    </div>
                  </div>
                )}

                {/* Secret Exit Dialog */}
                {this.state.secretExitModal && (
                  <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-sm w-full shadow-2xl">
                      <h3 className="text-lg font-bold text-slate-200 mb-4 text-center uppercase tracking-widest">
                        Admin override
                      </h3>
                      <form onSubmit={this.handleSecretExit} className="space-y-4">
                        <input
                          type="password"
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
            )}
          </div>
        </div>
      </div>
    );
  }
}
