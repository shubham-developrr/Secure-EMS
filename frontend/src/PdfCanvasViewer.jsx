import React, { useEffect, useRef, useState } from 'react';

export default function PdfCanvasViewer({
  pdfUrl = '',
  subjectCode = '',
  seatId = '',
  rollNumber = '',
  centerCode = '',
}) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.2);
  const [viewMode, setViewMode] = useState('continuous'); // 'continuous' | 'single'
  const [useCanvasRenderer, setUseCanvasRenderer] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [renderError, setRenderError] = useState('');

  const pdfDocRef = useRef(null);
  const canvasRefs = useRef({});

  useEffect(() => {
    let cancelled = false;
    const pdfjsLib = typeof window !== 'undefined' ? window.pdfjsLib : null;

    if (!pdfUrl || !pdfjsLib || typeof pdfjsLib.getDocument !== 'function') {
      setUseCanvasRenderer(false);
      return;
    }

    try {
      if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    } catch (e) {}

    setLoadingPdf(true);
    setRenderError('');

    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    loadingTask.promise
      .then((pdfDoc) => {
        if (cancelled) return;
        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages || 1);
        setCurrentPage(1);
        setUseCanvasRenderer(true);
        setLoadingPdf(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('PDF.js canvas load fallback to iframe:', err);
        setUseCanvasRenderer(false);
        setLoadingPdf(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!useCanvasRenderer || !pdfDocRef.current || numPages === 0) return;

    let cancelled = false;
    const pagesToRender =
      viewMode === 'single'
        ? [currentPage]
        : Array.from({ length: numPages }, (_, idx) => idx + 1);

    const renderPages = async () => {
      for (const pageNum of pagesToRender) {
        if (cancelled) return;
        try {
          const page = await pdfDocRef.current.getPage(pageNum);
          if (cancelled) return;
          const canvas = canvasRefs.current[pageNum];
          if (!canvas) continue;

          const viewport = page.getViewport({ scale: zoom });
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context,
            viewport,
          }).promise;
        } catch (err) {
          if (!cancelled) {
            setRenderError('Could not render PDF page onto secure canvas.');
          }
        }
      }
    };

    renderPages();

    return () => {
      cancelled = true;
    };
  }, [useCanvasRenderer, numPages, currentPage, zoom, viewMode]);

  const watermarkLabel = [rollNumber, seatId, centerCode, subjectCode]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="w-full relative z-20 bg-slate-900 p-2 sm:p-3 rounded-xl border border-slate-800 shadow-2xl select-none">
      {/* Toolbar */}
      <div className="border-b border-slate-800 pb-2 mb-2 flex flex-wrap items-center justify-between gap-2 px-2 text-xs font-mono">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
            📄 OFFICIAL PDF QUESTION PAPER ({subjectCode})
          </span>
          <span className="text-slate-400">Seat: {seatId}</span>
        </div>

        {useCanvasRenderer && numPages > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex bg-slate-950 border border-slate-800 rounded p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode('continuous')}
                className={`px-2 py-0.5 rounded text-[11px] ${
                  viewMode === 'continuous'
                    ? 'bg-amber-600 text-slate-950 font-bold'
                    : 'text-slate-400'
                }`}
              >
                All ({numPages})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('single')}
                className={`px-2 py-0.5 rounded text-[11px] ${
                  viewMode === 'single'
                    ? 'bg-amber-600 text-slate-950 font-bold'
                    : 'text-slate-400'
                }`}
              >
                Single
              </button>
            </div>

            {viewMode === 'single' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded disabled:opacity-40"
                >
                  ◀
                </button>
                <span className="text-slate-300">
                  {currentPage}/{numPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                  disabled={currentPage >= numPages}
                  className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded disabled:opacity-40"
                >
                  ▶
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded"
              title="Zoom Out"
            >
              🔍-
            </button>
            <span className="text-slate-400 min-w-[38px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.6, +(z + 0.2).toFixed(1)))}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded"
              title="Zoom In"
            >
              🔍+
            </button>
          </div>
        )}
      </div>

      {loadingPdf && (
        <div className="py-12 text-center text-xs font-mono text-emerald-400">
          Rendering encrypted PDF onto secure Android Kiosk canvas...
        </div>
      )}

      {renderError && (
        <div className="mb-2 bg-amber-950/80 border border-amber-800 text-amber-200 px-3 py-1.5 rounded text-xs font-mono">
          {renderError}
        </div>
      )}

      {useCanvasRenderer && numPages > 0 ? (
        <div className="relative max-h-[68vh] overflow-auto flex flex-col items-center gap-4 p-2 bg-slate-950 rounded">
          {(viewMode === 'single'
            ? [currentPage]
            : Array.from({ length: numPages }, (_, idx) => idx + 1)
          ).map((pageNum) => (
            <div key={pageNum} className="relative flex flex-col items-center">
              <div className="text-[10px] font-mono text-amber-400 mb-1">
                PAGE {pageNum} OF {numPages}
              </div>
              <div className="relative overflow-hidden rounded shadow-xl border border-slate-800 bg-white">
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current[pageNum] = el;
                  }}
                  className="max-w-full h-auto block pointer-events-none"
                />
                {watermarkLabel && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden opacity-15"
                  >
                    <span className="text-slate-900 font-mono font-extrabold text-sm sm:text-lg tracking-widest uppercase -rotate-12 text-center px-4">
                      {watermarkLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <iframe
          src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          className="w-full h-[600px] border-0 rounded"
          title={`Official Question Paper PDF (${subjectCode})`}
        />
      )}
    </div>
  );
}
