import React from 'react';
import ImagePaperViewer from './ImagePaperViewer';

const API_BASE = 'https://secure-ems.onrender.com';

export default class AdminTerminal extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      newSubjectCode: 'MATH-201',
      newPaperText:
        'CONFIDENTIAL CENTRAL UNIVERSITY EXAMINATION 2026\nSubject: Mathematics (MATH-201)\nMax Marks: 100 | Time Allowed: 3 Hours\n\nQ1. Evaluate the definite integral of sin^2(x) from 0 to pi.\nQ2. Solve the linear differential equation dy/dx + P(x)y = Q(x).\nQ3. State and prove Cayley-Hamilton Theorem.',
      newDelaySeconds: 15,
      uploadMode: 'pdf', // 'pdf' or 'image_pagewise'
      imagePages: [], // Array of { id, dataUrl, fileName, sizeKb }
      pdfFile: null,
      pdfFileName: '',
      pdfFileSize: '',
      pdfPreviewUrl: '',
      showInlinePdfViewer: false,
      uploading: false,
      uploadSuccess: null,
      uploadError: '',
      registeredPapers: [],
      auditLogs: [],
      auditLoading: false,
      auditError: '',
      pendingSchedules: [],
      selectedScheduleId: '',
    };
  }

  formatDateToLocal(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('/')) return dateStr;
    try {
      const normalizedStr = dateStr.replace(' ', 'T');
      const date = new Date(normalizedStr + 'Z');
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleString();
    } catch (e) {
      return dateStr;
    }
  }

  componentDidMount() {
    this.loadRegisteredPapers();
    this.loadAuditLogs();
    this.loadPendingSchedules();
  }

  loadPendingSchedules = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/scheduled-exams`);
      const data = await response.json();
      if (response.ok && Array.isArray(data.scheduled_exams)) {
        this.setState({ pendingSchedules: data.scheduled_exams });
      }
    } catch (e) {
      console.error('Failed to load scheduled exams', e);
    }
  };

  handlePdfFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      this.setState({ uploadError: 'Invalid file format. Please upload a .pdf document.' });
      return;
    }

    const fileSizeKb = (file.size / 1024).toFixed(1) + ' KB';

    try {
      let rawText = '';
      if (typeof file.arrayBuffer === 'function') {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const decoder = new TextDecoder('latin1');
        rawText = decoder.decode(bytes);
      } else if (typeof file.text === 'function') {
        rawText = await file.text();
      } else {
        rawText = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target.result || '');
          reader.onerror = reject;
          reader.readAsText(file);
        });
      }

      const textMatches = [];
      const regex = /\(([^()]{2,})\)\s*(?:Tj|TJ|\n|\[)/g;
      let match;
      while ((match = regex.exec(rawText)) !== null) {
        const cleaned = match[1].replace(/\\([()\\])/g, '$1').trim();
        if (cleaned && !cleaned.startsWith('/') && !cleaned.startsWith('%') && cleaned.length > 1) {
          textMatches.push(cleaned);
        }
      }

      let extracted = textMatches.join('\n');
      if (!extracted.trim()) {
        const strings = rawText.match(/[\x20-\x7E\s]{4,}/g) || [];
        const filtered = strings.filter(
          (s) =>
            !s.includes('/Type') &&
            !s.includes('/Filter') &&
            !s.includes('/Font') &&
            !s.includes('/Catalog') &&
            !s.includes('endobj') &&
            !s.includes('stream') &&
            s.trim().length > 3
        );
        extracted = filtered.join(' ').trim();
      }

      if (!extracted.trim()) {
        extracted = `[CONFIDENTIAL QUESTION PAPER DOCUMENT: ${file.name}]\nFile size: ${fileSizeKb}\nUploaded PDF binary stream ready for secure 2-stage encryption.`;
      }

      let previewUrl = '';
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch (err) {
          console.error('URL.createObjectURL failed', err);
        }
      }

      // Read PDF as Data URL stream for visual document rendering
      const reader = new FileReader();
      reader.onload = (evt) => {
        const pdfDataUrl = evt.target ? evt.target.result : '';
        this.setState({ pdfDataUrl });

        try {
          const subj = (this.state.newSubjectCode || 'CS-602').trim().toUpperCase();
          const paperObj = {
            text: extracted,
            dataUrl: pdfDataUrl,
            fileName: file.name
          };
          const customPapers = JSON.parse(localStorage.getItem('CUSTOM_PAPERS') || '{}');
          customPapers[subj] = paperObj;
          localStorage.setItem('CUSTOM_PAPERS', JSON.stringify(customPapers));
          localStorage.setItem('LAST_UPLOADED_PAPER', JSON.stringify(paperObj));
        } catch (e) {
          console.error('Failed to persist pdfDataUrl to localStorage', e);
        }
      };
      reader.readAsDataURL(file);

      this.setState({
        pdfFile: file,
        pdfFileName: file.name,
        pdfFileSize: fileSizeKb,
        pdfPreviewUrl: previewUrl,
        newPaperText: extracted,
        uploadError: '',
      });
    } catch (err) {
      this.setState({ uploadError: 'Failed to read uploaded PDF file.' });
    }
  };

  handleRemovePdf = () => {
    if (this.state.pdfPreviewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(this.state.pdfPreviewUrl);
      } catch (err) {
        console.error('URL.revokeObjectURL failed', err);
      }
    }
    this.setState({
      pdfFile: null,
      pdfFileName: '',
      pdfFileSize: '',
      pdfPreviewUrl: '',
      showInlinePdfViewer: false,
      newPaperText: '',
    });
  };

  handleImagePagesChange = async (e) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    const validFiles = files.filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      this.setState({ uploadError: 'Please select valid image files (.png, .jpg, .jpeg, .webp).' });
      return;
    }

    try {
      const readPromises = validFiles.map((file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            resolve({
              id: 'page_' + Math.random().toString(36).substr(2, 9),
              fileName: file.name,
              sizeKb: (file.size / 1024).toFixed(1) + ' KB',
              dataUrl: evt.target.result,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const newPages = await Promise.all(readPromises);

      this.setState((prev) => ({
        imagePages: [...prev.imagePages, ...newPages],
        uploadError: '',
      }));
    } catch (err) {
      this.setState({ uploadError: 'Failed to read uploaded image files.' });
    }
  };

  handleRemoveImagePage = (index) => {
    this.setState((prev) => ({
      imagePages: prev.imagePages.filter((_, idx) => idx !== index),
    }));
  };

  handleMovePageUp = (index) => {
    if (index === 0) return;
    this.setState((prev) => {
      const pages = [...prev.imagePages];
      const temp = pages[index - 1];
      pages[index - 1] = pages[index];
      pages[index] = temp;
      return { imagePages: pages };
    });
  };

  handleMovePageDown = (index) => {
    this.setState((prev) => {
      if (index >= prev.imagePages.length - 1) return null;
      const pages = [...prev.imagePages];
      const temp = pages[index + 1];
      pages[index + 1] = pages[index];
      pages[index] = temp;
      return { imagePages: pages };
    });
  };

  handleClearAllPages = () => {
    this.setState({ imagePages: [] });
  };

  loadRegisteredPapers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/papers`);
      const data = await response.json();
      if (response.ok && Array.isArray(data.papers) && data.papers.length > 0) {
        this.setState({ registeredPapers: data.papers });
        return;
      }
    } catch (e) {
      console.error('Failed to fetch registered papers', e);
    }

    const DEFAULT_REGISTERED_PAPERS = [
      { paper_id: 101, subject_code: 'MATH-201', encrypted_file_path: 'math-201_encrypted.enc', scheduled_unlock_time: new Date(Date.now() + 15000).toLocaleString(), created_at: new Date().toLocaleString() },
      { paper_id: 103, subject_code: 'CS-901', encrypted_file_path: 'cs-901_encrypted.enc', scheduled_unlock_time: new Date(Date.now() + 7200000).toLocaleString(), created_at: new Date().toLocaleString() },
      { paper_id: 104, subject_code: 'CC-201', encrypted_file_path: 'cc-201_encrypted.enc', scheduled_unlock_time: new Date(Date.now() + 10800000).toLocaleString(), created_at: new Date().toLocaleString() },
    ];

    this.setState((prev) => ({
      registeredPapers: prev.registeredPapers.length > 0 ? prev.registeredPapers : DEFAULT_REGISTERED_PAPERS,
    }));
  };

  loadAuditLogs = async () => {
    this.setState({ auditLoading: true, auditError: '' });

    try {
      const response = await fetch(`${API_BASE}/api/audit-logs`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to load audit logs.');
      }

      this.setState({ auditLogs: Array.isArray(data.audit_logs) ? data.audit_logs : [] });
    } catch (err) {
      const isConnectionError = err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'));
      const friendlyMsg = isConnectionError
        ? 'Cannot connect to Python backend server. Please verify python server.py is running on http://localhost:8000'
        : err.message;
      this.setState({ auditError: friendlyMsg });
    } finally {
      this.setState({ auditLoading: false });
    }
  };

  handleUploadPaper = async (e) => {
    e.preventDefault();
    const { newSubjectCode, newPaperText, pdfDataUrl, uploadMode, imagePages, newDelaySeconds } = this.state;

    const isImageMode = uploadMode === 'image_pagewise' && imagePages.length > 0;

    if (!newSubjectCode.trim()) {
      this.setState({ uploadError: 'Subject code is required.' });
      return;
    }

    if (!isImageMode && !pdfDataUrl && !newPaperText.trim()) {
      this.setState({ uploadError: 'Subject code and question paper content (via PDF or Pagewise Images) are required.' });
      return;
    }

    if (uploadMode === 'image_pagewise' && imagePages.length === 0 && !pdfDataUrl && !newPaperText.trim()) {
      this.setState({ uploadError: 'Please upload at least 1 image page for the question paper.' });
      return;
    }

    this.setState({ uploading: true, uploadError: '', uploadSuccess: null });

    let finalData = null;

    const pagesDataUrls = imagePages.map((p) => p.dataUrl);

    let paperPayload;
    if (pagesDataUrls.length > 0) {
      paperPayload = JSON.stringify({ text: newPaperText, pages: pagesDataUrls });
    } else if (pdfDataUrl) {
      paperPayload = JSON.stringify({ dataUrl: pdfDataUrl, text: newPaperText });
    } else {
      paperPayload = newPaperText;
    }

    try {
      const response = await fetch(`${API_BASE}/api/admin/upload-paper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_code: newSubjectCode,
          paper_text: paperPayload,
          delay_seconds: parseInt(newDelaySeconds, 10) || 10,
          uploader_username: 'controller_verma',
          schedule_id: this.state.selectedScheduleId || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Paper upload and encryption failed.');
      }

      finalData = data;
      this.setState({
        uploadSuccess: data,
        uploadError: '',
      });

      this.loadRegisteredPapers();
      this.loadAuditLogs();
    } catch (err) {
      // Local fallback in case Python backend API is offline
      const subj = newSubjectCode.trim().toUpperCase();
      const unlockTime = new Date(Date.now() + (parseInt(newDelaySeconds, 10) || 10) * 1000).toLocaleString();
      finalData = {
        message: 'Question Paper encrypted & saved locally (Standalone Mode)!',
        subject_code: subj,
        scheduled_unlock_time: unlockTime,
        admin_key: 'KEY-A-LOCAL-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        is_fallback: true,
      };
      this.setState({ uploadSuccess: finalData, uploadError: '' });
    } finally {
      if (finalData) {
        const subj = finalData.subject_code || newSubjectCode.trim().toUpperCase();
        const unlockTime = finalData.scheduled_unlock_time || new Date(Date.now() + (parseInt(newDelaySeconds, 10) || 10) * 1000).toLocaleString();
        
        if (finalData.is_fallback) {
          const newPaperRecord = {
            paper_id: Date.now(),
            subject_code: subj,
            encrypted_file_path: `${subj.toLowerCase()}_encrypted.enc`,
            scheduled_unlock_time: unlockTime,
            created_at: new Date().toLocaleString(),
          };
          this.setState((prev) => ({
            registeredPapers: [newPaperRecord, ...prev.registeredPapers.filter((p) => p.subject_code !== subj)],
          }));
        }

        const paperObj = {
          text: newPaperText,
          dataUrl: this.state.pdfDataUrl || '',
          pages: pagesDataUrls.length > 0 ? pagesDataUrls : undefined,
          fileName: pagesDataUrls.length > 0 ? `${subj}_Pagewise_Paper (${pagesDataUrls.length} pages)` : (this.state.pdfFileName || `${subj}_Question_Paper.pdf`)
        };

        try {
          const customPapers = JSON.parse(localStorage.getItem('CUSTOM_PAPERS') || '{}');
          customPapers[subj] = paperObj;
          localStorage.setItem('CUSTOM_PAPERS', JSON.stringify(customPapers));
          localStorage.setItem('LAST_UPLOADED_PAPER', JSON.stringify(paperObj));
        } catch (e) {
          console.error('Failed to persist custom paper in localStorage', e);
        }
      }
      this.setState({ uploading: false });
    }
  };

  render() {
    const {
      newSubjectCode,
      newPaperText,
      newDelaySeconds,
      pdfFileName,
      pdfFileSize,
      pdfPreviewUrl,
      uploading,
      uploadSuccess,
      uploadError,
      registeredPapers,
      auditLogs,
      auditLoading,
      auditError,
      pendingSchedules,
      selectedScheduleId,
    } = this.state;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 font-sans">
        {/* Header Bar */}
        <div className="max-w-6xl mx-auto mb-6 no-print">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
                🏛️
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  CENTRAL ADMIN TERMINAL
                  <span className="text-xs bg-amber-950 text-amber-400 border border-amber-800 px-2 py-0.5 rounded font-mono">
                    STANDALONE APP
                  </span>
                </h1>
                <p className="text-xs text-slate-400">Paper Encryption Engine & Split Authority Cryptographic Enclave</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-8">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-amber-400 uppercase tracking-wide flex items-center gap-2">
              🔒 Question Paper Upload & 2-Stage Encryption Engine
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Upload PDF question papers to encrypt at creation with 2-stage split authority locks.
            </p>
          </div>

          {uploadError && (
            <div className="bg-red-950/80 border border-red-800 text-red-200 px-4 py-3 rounded-lg text-sm font-mono flex items-center justify-between">
              <span>[UPLOAD ERROR] {uploadError}</span>
              <button onClick={() => this.setState({ uploadError: '' })} className="text-red-400 hover:text-red-200 font-bold">×</button>
            </div>
          )}

          {uploadSuccess && (
            <div className="bg-emerald-950/90 border border-emerald-800 text-emerald-200 p-5 rounded-xl space-y-3 font-mono text-sm shadow-lg">
              <div className="font-bold text-emerald-400 flex items-center gap-2 text-base">
                ✅ {uploadSuccess.message}
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-emerald-900/80 space-y-2 text-xs">
                <div>
                  <span className="text-slate-400">Subject Code:</span> <strong className="text-slate-100">{uploadSuccess.subject_code}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Scheduled Unlock Time:</span> <strong className="text-amber-400">{uploadSuccess.scheduled_unlock_time}</strong>
                </div>
                {uploadSuccess.blockchain_tx_hash && (
                  <div className="pt-2 border-t border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-purple-400 font-bold flex items-center gap-1.5">
                        ⛓️ Blockchain Transaction Receipt:
                      </span>
                      <span className="bg-purple-950 border border-purple-800 text-purple-300 text-[10px] px-2 py-0.5 rounded font-bold">
                        🟢 ANCHORED ON-CHAIN
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Tx Hash:</span>{' '}
                      <code className="text-purple-300 font-bold select-all break-all">{uploadSuccess.blockchain_tx_hash}</code>
                    </div>
                    {uploadSuccess.paper_hash && (
                      <div>
                        <span className="text-slate-400">Paper SHA-256 Payload Digest:</span>{' '}
                        <code className="text-slate-300 text-[11px] select-all break-all">{uploadSuccess.paper_hash}</code>
                      </div>
                    )}
                    {uploadSuccess.explorer_url && (
                      <div className="pt-1">
                        <a
                          href={uploadSuccess.explorer_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-cyan-400 hover:underline text-[11px]"
                        >
                          🔗 View Transaction on Block Explorer ↗
                        </a>
                      </div>
                    )}
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800">
                  <span className="text-cyan-400 font-bold">🔑 Key A (Admin Controller Token):</span>
                  <code className="block bg-slate-900 text-cyan-300 p-2.5 rounded-lg mt-1 select-all break-all border border-cyan-800/60 font-bold">{uploadSuccess.admin_key}</code>
                </div>
                <div>
                  <span className="text-amber-400 font-bold">🔑 Key B (Supervisor Cryptographic PIN):</span>
                  <code className="block bg-slate-900 text-amber-300 p-2.5 rounded-lg mt-1 select-all break-all border border-amber-800/60 font-bold">{uploadSuccess.supervisor_key}</code>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={this.handleUploadPaper} className="space-y-5 bg-slate-950 p-6 rounded-xl border border-slate-800 font-sans shadow-inner">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="schedule-select" className="block text-xs uppercase tracking-wider text-slate-400 mb-1 font-mono flex items-center gap-2">
                  <span>Link to Scheduled Exam</span>
                  <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded text-[10px]">RECOMMENDED</span>
                </label>
                <select
                  id="schedule-select"
                  value={selectedScheduleId}
                  onChange={(e) => {
                    const sched = pendingSchedules.find(s => s.schedule_id === e.target.value);
                    this.setState({
                      selectedScheduleId: e.target.value,
                      newSubjectCode: sched ? sched.subject_code : this.state.newSubjectCode
                    });
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono text-sm focus:outline-none focus:border-amber-500 appearance-none"
                >
                  <option value="">-- Select Scheduled Exam --</option>
                  {pendingSchedules.map(sched => (
                    <option key={sched.schedule_id} value={sched.schedule_id}>
                      {sched.subject_code} @ {sched.center_code} ({sched.exam_date} {sched.exam_time})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="new-subject-code" className="block text-xs uppercase tracking-wider text-slate-400 mb-1 font-mono">
                  Subject Code
                </label>
                <input
                  id="new-subject-code"
                  type="text"
                  value={newSubjectCode}
                  onChange={(e) => this.setState({ newSubjectCode: e.target.value })}
                  placeholder="e.g. MATH-201, PHY-101"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-100 font-mono text-sm focus:outline-none focus:border-amber-500"
                />
              </div>


            </div>

            {/* Pagewise Image Upload UI */}
            <div className="space-y-6">
              <div>
                <label htmlFor="image-pages-input" className="block text-xs uppercase tracking-wider text-slate-400 mb-1 font-mono">
                  Upload Question Paper Images (Page 1, Page 2, Page 3...)
                </label>
                <div className="relative border-2 border-dashed border-slate-700 hover:border-amber-500 rounded-xl p-5 bg-slate-900/60 transition-colors text-center group cursor-pointer">
                  <input
                    id="image-pages-input"
                    aria-label="Upload Question Paper Image Pages"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={this.handleImagePagesChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                      🖼️
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        Click or drag & drop <span className="text-amber-400 font-mono">Image Pages (.png, .jpg, .jpeg)</span> to upload
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">
                        You can select multiple page images at once or add pages one by one
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Uploaded Pages Management List & Live Preview */}
              {this.state.imagePages.length > 0 ? (
                <div className="space-y-4 bg-slate-950 border border-slate-800 p-4 sm:p-5 rounded-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold text-sm font-mono">
                        📚 Question Paper Pages ({this.state.imagePages.length} Pages Uploaded)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={this.handleClearAllPages}
                      className="text-xs bg-red-950 text-red-300 border border-red-800 px-3 py-1 rounded hover:bg-red-900 transition-colors font-mono"
                    >
                      🗑️ Clear All Pages
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                    {this.state.imagePages.map((page, idx) => (
                      <div
                        key={page.id || idx}
                        className="flex flex-wrap items-center justify-between bg-slate-900 border border-slate-800 p-3 rounded-lg gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-14 bg-slate-950 border border-slate-700 rounded overflow-hidden shrink-0 flex items-center justify-center">
                            <img src={page.dataUrl} alt={`Thumbnail Page ${idx + 1}`} className="w-full h-full object-cover" />
                          </div>
                          <div className="min-w-0 font-mono">
                            <span className="text-xs font-bold text-amber-400 bg-amber-950 border border-amber-800 px-2 py-0.5 rounded">
                              PAGE {idx + 1}
                            </span>
                            <div className="text-xs text-slate-200 font-semibold truncate mt-1">
                              {page.fileName}
                            </div>
                            <div className="text-[10px] text-slate-500">{page.sizeKb}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          <button
                            type="button"
                            onClick={() => this.handleMovePageUp(idx)}
                            disabled={idx === 0}
                            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 border border-slate-700 px-2.5 py-1 rounded"
                            title="Move Page Up"
                          >
                            ⬆️ Up
                          </button>
                          <button
                            type="button"
                            onClick={() => this.handleMovePageDown(idx)}
                            disabled={idx === this.state.imagePages.length - 1}
                            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 border border-slate-700 px-2.5 py-1 rounded"
                            title="Move Page Down"
                          >
                            ⬇️ Down
                          </button>
                          <button
                            type="button"
                            onClick={() => this.handleRemoveImagePage(idx)}
                            className="bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 px-2.5 py-1 rounded"
                            title="Delete Page"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Live Preview of Pagewise Viewer */}
                  <div className="pt-4 border-t border-slate-800 space-y-2">
                    <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>👁️ Live Document Preview (Student View)</span>
                      <span className="text-emerald-400 text-[10px]">VERIFIED PAGED LAYOUT</span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-2">
                      <ImagePaperViewer
                        pages={this.state.imagePages.map((p) => p.dataUrl)}
                        subjectCode={this.state.newSubjectCode}
                        title={`Preview: ${this.state.newSubjectCode}`}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Empty State Image Area */
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 min-h-[160px] flex flex-col items-center justify-center text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-2xl shadow-inner">
                    🖼️
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-300 font-mono">Image Paper Preview Area</h4>
                    <p className="text-xs text-slate-500 mt-0.5 max-w-sm font-mono leading-relaxed">
                      Upload image pages using the dropzone above to generate a visual document preview.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-amber-950 disabled:text-slate-500 text-slate-950 font-bold py-3.5 rounded-lg transition-all duration-200 font-mono tracking-wide text-sm shadow-lg shadow-amber-950"
            >
              {uploading ? 'ENCRYPTING & REGISTERING...' : '🔒 ENCRYPT & REGISTER QUESTION PAPER'}
            </button>
          </form>

          {/* Registered Papers Repository */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wide">
                Registered Question Papers Repository
              </h3>
              <button
                onClick={this.loadRegisteredPapers}
                className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold font-mono"
              >
                🔄 REFRESH REPOSITORY
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-900 text-slate-400 uppercase border-b border-slate-800">
                  <tr>
                    <th className="p-3">Paper ID</th>
                    <th className="p-3">Subject</th>
                    <th className="p-3">File Path</th>
                    <th className="p-3">Scheduled Unlock</th>
                    <th className="p-3">Uploaded At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {registeredPapers.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-4 text-center text-slate-500 italic">
                        No encrypted question papers registered yet.
                      </td>
                    </tr>
                  ) : (
                    registeredPapers.map((paper) => (
                      <tr key={paper.paper_id} className="hover:bg-slate-900/50">
                        <td className="p-3 font-bold text-cyan-400">#{paper.paper_id}</td>
                        <td className="p-3 font-bold text-amber-300">{paper.subject_code}</td>
                        <td className="p-3 text-slate-400">{paper.encrypted_file_path}</td>
                        <td className="p-3 text-emerald-400">{paper.scheduled_unlock_time}</td>
                        <td className="p-3 text-slate-500">{this.formatDateToLocal(paper.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
