import React, { useState, useEffect, useRef } from 'react';

export default function ImagePaperViewer({ pages = [], title = 'Question Paper', subjectCode = '' }) {
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewLayout, setViewLayout] = useState('single'); // 'single' | 'continuous' | 'grid'
  const containerRef = useRef(null);

  const prevPagesKeyRef = useRef('');

  // Only reset zoom & page when pages content actually changes (not on array reference change)
  useEffect(() => {
    if (!pages || pages.length === 0) return;
    const currentKey = `${pages.length}_${pages[0]?.slice(0, 40)}_${pages[pages.length - 1]?.slice(0, 40)}`;
    if (prevPagesKeyRef.current && prevPagesKeyRef.current !== currentKey) {
      setCurrentPage(0);
      setZoom(1);
    }
    prevPagesKeyRef.current = currentKey;
  }, [pages]);

  // Ensure currentPage stays within valid bounds if pages length changes
  useEffect(() => {
    if (pages && pages.length > 0 && currentPage >= pages.length) {
      setCurrentPage(pages.length - 1);
    }
  }, [pages, currentPage]);

  // Handle ESC key to exit fullscreen and Arrow keys for page navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
      if (viewLayout === 'single') {
        if (e.key === 'ArrowLeft') {
          setCurrentPage((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'ArrowRight') {
          setCurrentPage((prev) => Math.min(prev + 1, pages.length - 1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, viewLayout, pages.length]);

  if (!pages || pages.length === 0) {
    return (
      <div className="image-paper-empty">
        <p>⚠️ No image pages available for this question paper.</p>
      </div>
    );
  }

  const handlePrev = () => {
    if (currentPage > 0) setCurrentPage(currentPage - 1);
  };

  const handleNext = () => {
    if (currentPage < pages.length - 1) setCurrentPage(currentPage + 1);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.2, 2.5));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.2, 0.6));
  const handleResetZoom = () => {
    setZoom(1);
    setFitWidth(true);
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const mainContainerClasses = `image-paper-container ${
    isFullscreen
      ? 'fixed inset-0 z-50 w-screen h-screen rounded-none border-0 bg-slate-950 flex flex-col overflow-hidden'
      : 'relative'
  }`;

  return (
    <div ref={containerRef} className={mainContainerClasses}>
      {/* Header Toolbar */}
      <div className="image-paper-toolbar flex flex-wrap items-center justify-between p-3 bg-slate-950 border-b border-slate-800 gap-3 font-mono">
        <div className="toolbar-info flex items-center gap-2">
          <span className="paper-tag bg-amber-600 text-slate-950 font-bold text-xs px-2 py-0.5 rounded">
            {subjectCode || 'EXAM'}
          </span>
          <span className="paper-title text-slate-100 font-bold text-sm truncate max-w-[200px] sm:max-w-xs">
            {title}
          </span>
        </div>

        <div className="toolbar-controls flex flex-wrap items-center gap-2 text-xs">
          {/* Page Layout Selector */}
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 gap-0.5">
            <button
              type="button"
              className={`px-2 py-1 rounded transition-colors ${
                viewLayout === 'single'
                  ? 'bg-amber-600 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setViewLayout('single')}
              title="Single Page View"
            >
              📄 Single
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded transition-colors ${
                viewLayout === 'continuous'
                  ? 'bg-amber-600 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setViewLayout('continuous')}
              title="Continuous Vertical Scroll View"
            >
              📜 All Pages
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded transition-colors ${
                viewLayout === 'grid'
                  ? 'bg-amber-600 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setViewLayout('grid')}
              title="Grid Overview Mode"
            >
              ▦ Grid
            </button>
          </div>

          <span className="toolbar-divider text-slate-700">|</span>

          {/* Navigation Controls (Only for Single Page view mode) */}
          {viewLayout === 'single' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="toolbar-btn bg-slate-800 text-slate-200 border border-slate-700 px-2 py-1 rounded hover:bg-slate-700 disabled:opacity-40"
                onClick={handlePrev}
                disabled={currentPage === 0}
                title="Previous Page"
              >
                ◀ Prev
              </button>
              <span className="page-indicator text-slate-300 px-1">
                Page <strong className="text-amber-400">{currentPage + 1}</strong> of{' '}
                <strong>{pages.length}</strong>
              </span>
              <button
                type="button"
                className="toolbar-btn bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-1 rounded hover:bg-slate-700 disabled:opacity-40"
                onClick={handleNext}
                disabled={currentPage === pages.length - 1}
                title="Next Page"
              >
                Next ▶
              </button>
              <span className="toolbar-divider text-slate-700">|</span>
            </div>
          )}

          {/* Zoom controls */}
          {viewLayout !== 'grid' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="toolbar-btn bg-slate-800 text-slate-200 border border-slate-700 px-2 py-1 rounded hover:bg-slate-700"
                onClick={handleZoomOut}
                title="Zoom Out"
              >
                🔍-
              </button>
              <span className="zoom-indicator text-slate-400 min-w-[36px] text-center font-bold">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="toolbar-btn bg-slate-800 text-slate-200 border border-slate-700 px-2 py-1 rounded hover:bg-slate-700"
                onClick={handleZoomIn}
                title="Zoom In"
              >
                🔍+
              </button>
              <button
                type="button"
                className="toolbar-btn bg-slate-800 text-slate-200 border border-slate-700 px-2 py-1 rounded hover:bg-slate-700"
                onClick={handleResetZoom}
                title="Reset Zoom"
              >
                Reset
              </button>
            </div>
          )}

          <span className="toolbar-divider text-slate-700">|</span>

          {/* Full Screen Toggle Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex items-center gap-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-3 py-1 rounded transition-colors shadow cursor-pointer"
            title={isFullscreen ? 'Exit Full Screen' : 'View Full Screen'}
          >
            {isFullscreen ? '✕ Exit Full Screen' : '⛶ Full Screen'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className={`image-paper-body p-4 bg-slate-950 flex-1 overflow-auto ${
          isFullscreen ? 'h-full max-h-none' : 'min-h-[480px] max-h-[75vh]'
        }`}
      >
        {/* Single Page Layout */}
        {viewLayout === 'single' && (
          <div className="image-display-wrapper flex justify-center items-start w-full">
            <img
              key={currentPage}
              src={pages[currentPage]}
              alt={`Page ${currentPage + 1}`}
              className="paper-page-image shadow-2xl rounded border border-slate-800 transition-transform duration-200 bg-white"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
                maxWidth: fitWidth ? '100%' : 'none',
              }}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />
          </div>
        )}

        {/* Continuous All Pages Layout */}
        {viewLayout === 'continuous' && (
          <div className="w-full space-y-6 flex flex-col items-center">
            {pages.map((pageSrc, idx) => (
              <div key={idx} className="flex flex-col items-center space-y-2 max-w-4xl w-full">
                <div className="text-xs font-mono font-bold text-amber-400 bg-amber-950/80 border border-amber-800 px-3 py-1 rounded">
                  PAGE {idx + 1} OF {pages.length}
                </div>
                <img
                  src={pageSrc}
                  alt={`Page ${idx + 1}`}
                  className="paper-page-image shadow-2xl rounded border border-slate-800 bg-white w-full"
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top center',
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                />
              </div>
            ))}
          </div>
        )}

        {/* Grid View Layout */}
        {viewLayout === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-6xl mx-auto">
            {pages.map((pageSrc, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setCurrentPage(idx);
                  setViewLayout('single');
                }}
                className={`group relative bg-slate-900 border-2 rounded-xl p-2 cursor-pointer transition-all hover:scale-[1.02] ${
                  idx === currentPage ? 'border-amber-500 shadow-lg shadow-amber-500/20' : 'border-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="aspect-[3/4] overflow-hidden rounded bg-slate-950 flex items-center justify-center">
                  <img
                    src={pageSrc}
                    alt={`Grid Page ${idx + 1}`}
                    className="w-full h-full object-contain"
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between px-1 text-xs font-mono">
                  <span className="font-bold text-amber-400">PAGE {idx + 1}</span>
                  <span className="text-slate-400 group-hover:text-slate-200">Click to View ↗</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Page Thumbnails Bar (Only for Single Page view mode) */}
      {viewLayout === 'single' && pages.length > 1 && (
        <div className="image-paper-thumbnails flex items-center gap-3 p-3 bg-slate-950 border-t border-slate-800 overflow-x-auto">
          {pages.map((pageSrc, idx) => (
            <button
              key={idx}
              className={`thumbnail-card relative w-14 h-18 rounded border-2 overflow-hidden shrink-0 transition-all ${
                idx === currentPage ? 'border-amber-500 scale-105 shadow-md shadow-amber-500/20' : 'border-slate-800 opacity-70 hover:opacity-100'
              }`}
              onClick={() => setCurrentPage(idx)}
              title={`Jump to Page ${idx + 1}`}
            >
              <img
                src={pageSrc}
                alt={`Thumbnail ${idx + 1}`}
                className="w-full h-full object-cover"
                onContextMenu={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
              />
              <span className="thumb-label absolute bottom-1 right-1 bg-slate-950/80 text-amber-400 text-[10px] font-bold px-1 rounded font-mono">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
