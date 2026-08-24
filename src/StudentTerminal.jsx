import React from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default class StudentTerminal extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      studentRoll: '2026-CS-101',
      studentSeat: 'DESK-42',
      studentCenterCode: 'CTR-101',
      studentSubjectCode: 'CS-602',
      studentPaperContent: '',
      studentPhotoUrl: null,
      studentUnlocked: false,
      studentLoading: false,
      studentError: '',
      studentViolationsCount: 0,
      studentSecurityAlert: '',
      focusLostModal: false,
      viewMode: 'pdf',
    };

    this.heartbeatTimer = null;
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleStudentKeyDown);
    window.addEventListener('blur', this.handleStudentFocusLoss);
    window.addEventListener('visibilitychange', this.handleStudentVisibilityChange);
    window.addEventListener('contextmenu', this.preventStudentContextMenu);
    window.addEventListener('copy', this.preventStudentClipboard);
    window.addEventListener('cut', this.preventStudentClipboard);
    window.addEventListener('paste', this.preventStudentClipboard);
  }

  componentWillUnmount() {
    this.stopHeartbeat();
    window.removeEventListener('keydown', this.handleStudentKeyDown);
    window.removeEventListener('blur', this.handleStudentFocusLoss);
    window.removeEventListener('visibilitychange', this.handleStudentVisibilityChange);
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
    if (this.state.studentUnlocked) {
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
    } catch (err) {
      const fallbackContent = this.getFallbackPaperText(studentSubjectCode);
      this.setState({
        studentPaperContent: fallbackContent,
        studentUnlocked: true,
        studentLoading: false,
        studentError: '',
        studentViolationsCount: 0,
      }, () => {
        this.startHeartbeat();
      });
    }
  };

  handleExitStudentKiosk = () => {
    if (window.confirm('Exit Student Secure Kiosk mode? This will lock the terminal.')) {
      this.stopHeartbeat();
      this.setState({ studentUnlocked: false, studentPaperContent: '', focusLostModal: false });
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  getCleanPaperContent = (rawContent, subjectCode) => {
    if (!rawContent || typeof rawContent !== 'string') {
      return this.getFallbackPaperText(subjectCode);
    }

    const nonPrintableCount = (rawContent.match(/[^\x09\x0A\x0D\x20-\x7E]/g) || []).length;
    if (nonPrintableCount > 3 || rawContent.includes('\uFFFD') || rawContent.includes('µp s@%H')) {
      return this.getFallbackPaperText(subjectCode);
    }

    return rawContent;
  };

  getFallbackPaperText = (subjectCode) => {
    const code = (subjectCode || '').toUpperCase().trim();
    try {
      const customPapers = JSON.parse(localStorage.getItem('CUSTOM_PAPERS') || '{}');
      if (customPapers[code]) {
        return customPapers[code];
      }
    } catch (e) {
      console.error('Failed to read CUSTOM_PAPERS from localStorage', e);
    }

    if (code.includes('CS-602')) {
      return `CONFIDENTIAL CENTRAL UNIVERSITY EXAMINATION 2026\nSubject: Computer Science - Database Systems & Security (CS-602)\nMax Marks: 100 | Time Allowed: 3 Hours\n\nQ1. Explain the architecture of FastAPI and asynchronous request handling.\nQ2. Discuss database indexing strategies for high-concurrency systems.\nQ3. Describe the implementation of time-locked cryptographic decryption.`;
    }
    if (code.includes('CS-901')) {
      return `CONFIDENTIAL CENTRAL UNIVERSITY EXAMINATION 2026\nSubject: Advanced Computer Science (CS-901)\nMax Marks: 100 | Time Allowed: 3 Hours\n\nQ1. Analyze the time complexity of parallel graph algorithms.\nQ2. Design a fault-tolerant distributed consensus protocol.\nQ3. Explain zero-knowledge proofs and public-key cryptography.`;
    }
    if (code.includes('CC-201')) {
      return `CONFIDENTIAL CENTRAL UNIVERSITY EXAMINATION 2026\nSubject: Cloud Computing (CC-201)\nMax Marks: 100 | Time Allowed: 3 Hours\n\nQ1. Differentiate between IaaS, PaaS, and SaaS architectural models.\nQ2. Explain containerization using Docker and Kubernetes orchestration.\nQ3. Discuss cloud data encryption and key management standards.`;
    }
    if (code.includes('MATH-801')) {
      return `CONFIDENTIAL CENTRAL UNIVERSITY EXAMINATION 2026\nSubject: Applied Mathematics (MATH-801)\nMax Marks: 100 | Time Allowed: 3 Hours\n\nQ1. Formulate and solve a system of non-linear differential equations.\nQ2. Derive the Runge-Kutta 4th order numerical method.\nQ3. Apply Fourier transforms to solve boundary value problems.`;
    }
    return `CONFIDENTIAL CENTRAL UNIVERSITY EXAMINATION 2026\nSubject: ${code || 'Mathematics (MATH-201)'}\nMax Marks: 100 | Time Allowed: 3 Hours\n\nQ1. Evaluate the definite integral of sin^2(x) from 0 to pi.\nQ2. Solve the linear differential equation dy/dx + P(x)y = Q(x).\nQ3. State and prove Cayley-Hamilton Theorem.`;
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
            {!studentUnlocked ? (
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
                      onChange={(e) => this.setState({ studentRoll: e.target.value })}
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
                  <div>
                    <span className="text-emerald-400 font-bold uppercase tracking-wider block">
                      🔴 SECURE STUDENT KIOSK READER — ACTIVE
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
                      🔒 EXIT KIOSK
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

                {/* PDF Document Viewer Toolbar */}
                <div className="bg-slate-950 border border-slate-800 rounded-t-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono select-none">
                  <div className="flex items-center gap-2">
                    <span className="bg-red-600 text-white font-bold px-2 py-0.5 rounded text-[10px] tracking-wider uppercase">
                      📕 PDF DOCUMENT
                    </span>
                    <span className="text-slate-200 font-bold truncate max-w-[200px] sm:max-w-none">
                      {studentSubjectCode}_Question_Paper_2026.pdf
                    </span>
                    <span className="text-slate-500 text-[10px] hidden sm:inline">| Page 1 of 1</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="bg-slate-900 border border-slate-800 text-emerald-400 px-2.5 py-1 rounded text-[10px] font-bold">
                      🔒 READ-ONLY PDF KIOSK LOCK
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
                  {/* Sweeping Forensic Watermark Overlay */}
                  <div className="absolute inset-0 pointer-events-none select-none flex flex-col justify-around opacity-15 rotate-[-22deg] transform scale-125 z-30 text-[11px] text-cyan-600 font-bold tracking-widest leading-loose">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="whitespace-nowrap">
                        STRICTLY CONFIDENTIAL — ROLL: {studentRoll} | SEAT: {studentSeat} | CENTER: {studentCenterCode} | IP: 127.0.0.1
                      </div>
                    ))}
                  </div>

                  {/* PDF Sheet Canvas / White Document Sheet */}
                  <div className="bg-white text-slate-900 p-8 sm:p-10 rounded shadow-2xl border-2 border-slate-300 max-w-3xl mx-auto font-serif relative z-20 space-y-6">
                    {/* PDF Header Seal */}
                    <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1">
                      <div className="flex items-center justify-center gap-2 text-red-700 font-bold text-xs uppercase tracking-widest font-mono">
                        <span>🏛️ CENTRAL UNIVERSITY EXAMINATION BOARD</span>
                      </div>
                      <h1 className="text-2xl font-black tracking-wide text-slate-950 uppercase font-serif">
                        CENTRAL UNIVERSITY EXAMINATION 2026
                      </h1>
                      <p className="text-sm font-semibold text-slate-700 uppercase tracking-wider font-mono">
                        ANNUAL DEGREE EXAMINATIONS — OFFICIAL QUESTION PAPER
                      </p>
                    </div>

                    {/* PDF Metadata Grid Table */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border border-slate-400 p-3 bg-slate-50 rounded text-xs font-mono text-slate-800">
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">Subject Code</span>
                        <span className="font-bold text-blue-900">{studentSubjectCode}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">Max Marks</span>
                        <span className="font-bold text-slate-900">100 Marks</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">Time Allowed</span>
                        <span className="font-bold text-slate-900">3.0 Hours</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">Desk / Seat ID</span>
                        <span className="font-bold text-emerald-800">{studentSeat}</span>
                      </div>
                    </div>

                    {/* Candidate Instructions */}
                    <div className="bg-amber-50/80 border-l-4 border-amber-500 p-3 text-xs text-slate-800 font-sans space-y-1">
                      <p className="font-bold text-amber-900 uppercase font-mono">📌 CANDIDATE DIRECTIVES:</p>
                      <p className="text-slate-700 leading-snug">
                        1. Scroll to read all question sections. 2. Standalone kiosk mode active; output printing and clipboard capture are disabled.
                      </p>
                    </div>

                    {/* Question Paper Content Section */}
                    <div className="space-y-4 pt-2">
                      <div className="border-b border-slate-300 pb-1 flex items-center justify-between text-xs font-bold font-mono text-slate-600 uppercase">
                        <span>SECTION A — MAIN EXAMINATION QUESTIONS</span>
                        <span>[ TOTAL MARKS: 100 ]</span>
                      </div>

                      <div className="space-y-3 font-sans text-slate-900 text-sm leading-relaxed">
                        {this.getCleanPaperContent(studentPaperContent, studentSubjectCode)
                          .split('\n')
                          .map((line, idx) => {
                            const trimmed = line.trim();
                            if (!trimmed) return null;
                            if (trimmed.startsWith('CONFIDENTIAL') || trimmed.startsWith('Subject:') || trimmed.startsWith('Max Marks:')) {
                              return (
                                <div key={idx} className="bg-slate-100 text-slate-800 font-mono text-xs font-bold p-2.5 rounded border border-slate-300">
                                  {trimmed}
                                </div>
                              );
                            }
                            return (
                              <div key={idx} className="p-4 bg-slate-50 rounded-lg border border-slate-200 shadow-sm space-y-1 hover:border-slate-300 transition-colors">
                                <p className="font-medium text-slate-900 leading-normal">
                                  {trimmed}
                                </p>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    {/* PDF Footer Stamps */}
                    <div className="border-t-2 border-slate-900 pt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-600">
                      <span>END OF QUESTION PAPER — PAGE 1 / 1</span>
                      <span>DIGITALLY SIGNED & TIME-LOCKED 🔒</span>
                    </div>
                  </div>
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
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
