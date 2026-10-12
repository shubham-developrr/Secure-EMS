import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.2;

const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value) || 1));
const getDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export default function ImagePaperViewer({ pages = [], title = 'Question Paper', subjectCode = '' }) {
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewLayout, setViewLayout] = useState('single'); // 'single' | 'continuous' | 'grid'

  const normalStageRef = useRef(null);
  const fullscreenStageRef = useRef(null);
  const closeFullscreenRef = useRef(null);
  const fullscreenButtonRef = useRef(null);
  const previousFullscreenRef = useRef(false);
  const previousPagesKeyRef = useRef('');
  const zoomRef = useRef(1);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const pendingScrollRef = useRef(null);
  const scrollFrameRef = useRef(null);

  const updateZoom = (value) => {
    const nextZoom = Number(clampZoom(value).toFixed(2));
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    return nextZoom;
  };

  const queueStageScroll = (stage, scrollLeft, scrollTop) => {
    pendingScrollRef.current = { stage, scrollLeft, scrollTop };
    if (scrollFrameRef.current !== null) return;

    const flushScroll = () => {
      scrollFrameRef.current = null;
      const pending = pendingScrollRef.current;
      pendingScrollRef.current = null;
      if (!pending || !pending.stage?.isConnected) return;
      pending.stage.scrollLeft = Math.max(0, pending.scrollLeft);
      pending.stage.scrollTop = Math.max(0, pending.scrollTop);
    };

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      scrollFrameRef.current = window.requestAnimationFrame(flushScroll);
    } else {
      scrollFrameRef.current = setTimeout(flushScroll, 0);
    }
  };

  const zoomAroundStageCenter = (requestedZoom) => {
    const stage = isFullscreen ? fullscreenStageRef.current : normalStageRef.current;
    const previousZoom = zoomRef.current;
    const nextZoom = clampZoom(requestedZoom);

    if (stage && previousZoom !== nextZoom) {
      const anchorX = stage.clientWidth / 2;
      const anchorY = stage.clientHeight / 2;
      const ratio = nextZoom / previousZoom;
      queueStageScroll(
        stage,
        (stage.scrollLeft + anchorX) * ratio - anchorX,
        (stage.scrollTop + anchorY) * ratio - anchorY
      );
    }
    updateZoom(nextZoom);
  };

  const resetZoom = () => {
    updateZoom(1);
    [normalStageRef.current, fullscreenStageRef.current].forEach((stage) => {
      if (stage) queueStageScroll(stage, 0, 0);
    });
  };

  // Only reset page and zoom when paper contents change, not when React recreates the array.
  useEffect(() => {
    if (!pages || pages.length === 0) return;
    const currentKey = `${pages.length}_${pages[0]?.slice(0, 40)}_${pages[pages.length - 1]?.slice(0, 40)}`;
    if (previousPagesKeyRef.current && previousPagesKeyRef.current !== currentKey) {
      setCurrentPage(0);
      resetZoom();
    }
    previousPagesKeyRef.current = currentKey;
  }, [pages]);

  useEffect(() => {
    if (pages && pages.length > 0 && currentPage >= pages.length) {
      setCurrentPage(pages.length - 1);
    }
  }, [pages, currentPage]);

  useEffect(() => {
    if (!isFullscreen || typeof document === 'undefined') return undefined;

    const originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeFullscreenRef.current?.focus();

    return () => {
      document.body.style.overflow = originalBodyOverflow;
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (previousFullscreenRef.current && !isFullscreen) {
      fullscreenButtonRef.current?.focus();
    }
    previousFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && isFullscreen) {
        event.preventDefault();
        setIsFullscreen(false);
        return;
      }
      if (event.key === 'Tab' && isFullscreen) {
        event.preventDefault();
        closeFullscreenRef.current?.focus();
        return;
      }
      if (event.target?.tagName === 'INPUT' && event.target.type === 'range') return;
      if (!pages.length || (!isFullscreen && viewLayout !== 'single')) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setCurrentPage((page) => Math.max(page - 1, 0));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setCurrentPage((page) => Math.min(page + 1, pages.length - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, pages.length, viewLayout]);

  useEffect(() => {
    [normalStageRef.current, fullscreenStageRef.current].forEach((stage) => {
      if (stage) queueStageScroll(stage, 0, 0);
    });
  }, [currentPage]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current === null) return;
      if (typeof window !== 'undefined' && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      } else {
        clearTimeout(scrollFrameRef.current);
      }
    },
    []
  );

  if (!pages || pages.length === 0) {
    return (
      <div className="image-paper-empty">
        <p>⚠️ No image pages available for this question paper.</p>
      </div>
    );
  }

  const handlePrev = () => setCurrentPage((page) => Math.max(page - 1, 0));
  const handleNext = () => setCurrentPage((page) => Math.min(page + 1, pages.length - 1));

  const beginPinch = (stage, pointers) => {
    const [first, second] = [...pointers.values()];
    const rect = stage.getBoundingClientRect();
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    gestureRef.current = {
      type: 'pinch',
      startDistance: Math.max(1, getDistance(first, second)),
      startZoom: zoomRef.current,
      startCenterX: centerX - rect.left,
      startCenterY: centerY - rect.top,
      startScrollLeft: stage.scrollLeft,
      startScrollTop: stage.scrollTop,
    };
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.cancelable) event.preventDefault();

    const stage = event.currentTarget;
    try {
      stage.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is not available in every WebView/test environment.
    }

    const pointers = pointersRef.current;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      gestureRef.current = {
        type: 'pan',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        startedAtZoom: zoomRef.current,
        allowPageSwipe: stage.dataset.fullscreen === 'true' && zoomRef.current <= 1.05,
      };
    } else if (pointers.size === 2) {
      beginPinch(stage, pointers);
    }
  };

  const handlePointerMove = (event) => {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    if (event.cancelable) event.preventDefault();

    const stage = event.currentTarget;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      if (gestureRef.current?.type !== 'pinch') beginPinch(stage, pointers);
      const gesture = gestureRef.current;
      const [first, second] = [...pointers.values()];
      const rect = stage.getBoundingClientRect();
      const centerX = (first.x + second.x) / 2 - rect.left;
      const centerY = (first.y + second.y) / 2 - rect.top;
      const distanceRatio = getDistance(first, second) / gesture.startDistance;
      const nextZoom = updateZoom(gesture.startZoom * distanceRatio);
      const zoomRatio = nextZoom / gesture.startZoom;

      queueStageScroll(
        stage,
        (gesture.startScrollLeft + gesture.startCenterX) * zoomRatio - centerX,
        (gesture.startScrollTop + gesture.startCenterY) * zoomRatio - centerY
      );
      return;
    }

    const gesture = gestureRef.current;
    if (gesture?.type === 'pan' && gesture.pointerId === event.pointerId) {
      stage.scrollLeft -= event.clientX - gesture.lastX;
      stage.scrollTop -= event.clientY - gesture.lastY;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
    }
  };

  const finishPointer = (event, allowPageSwipe = false) => {
    const stage = event.currentTarget;
    const gesture = gestureRef.current;
    const point = pointersRef.current.get(event.pointerId);
    if (point) {
      point.x = event.clientX;
      point.y = event.clientY;
    }

    if (
      allowPageSwipe &&
      gesture?.type === 'pan' &&
      gesture.pointerId === event.pointerId &&
      gesture.allowPageSwipe &&
      zoomRef.current <= 1.05
    ) {
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (Math.abs(deltaX) > 64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
        if (deltaX < 0) handleNext();
        else handlePrev();
      }
    }

    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const [[pointerId, remainingPoint]] = pointersRef.current.entries();
      gestureRef.current = {
        type: 'pan',
        pointerId,
        startX: remainingPoint.x,
        startY: remainingPoint.y,
        lastX: remainingPoint.x,
        lastY: remainingPoint.y,
        startedAtZoom: zoomRef.current,
        allowPageSwipe: false,
      };
    } else if (pointersRef.current.size === 0) {
      gestureRef.current = null;
    }

    try {
      stage.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore when the browser already released this pointer.
    }
  };

  const handlePointerUp = (event) => finishPointer(event, true);
  const handlePointerCancel = (event) => finishPointer(event, false);

  const renderImage = (pageIndex, fullscreen = false) => (
    <div
      className="image-paper-scaled-page"
      style={{
        width: `${zoom * 100}%`,
        minWidth: `${zoom * 100}%`,
        marginInline: zoom <= 1 ? 'auto' : 0,
      }}
    >
      <img
        key={`${pageIndex}-${fullscreen ? 'fullscreen' : 'inline'}`}
        src={pages[pageIndex]}
        alt={`Question paper page ${pageIndex + 1}`}
        className="paper-page-image"
        draggable="false"
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
      />
    </div>
  );

  return (
    <div
      className="image-paper-container relative"
      aria-hidden={isFullscreen ? 'true' : undefined}
      inert={isFullscreen}
    >
      {/* Compact controls remain available in the normal reader. */}
      <div className="image-paper-toolbar">
        <div className="toolbar-info">
          <span className="paper-tag">{subjectCode || 'EXAM'}</span>
          <span className="paper-title" title={title}>{title}</span>
        </div>

        <div className="toolbar-controls">
          <div className="image-paper-layout-controls" aria-label="Question paper layout">
            <button
              type="button"
              className={`image-paper-control ${viewLayout === 'single' ? 'active' : ''}`}
              onClick={() => setViewLayout('single')}
              aria-pressed={viewLayout === 'single'}
              title="Single page"
            >
              Single
            </button>
            <button
              type="button"
              className={`image-paper-control ${viewLayout === 'continuous' ? 'active' : ''}`}
              onClick={() => setViewLayout('continuous')}
              aria-pressed={viewLayout === 'continuous'}
              title="Scroll all pages"
            >
              All pages
            </button>
            <button
              type="button"
              className={`image-paper-control ${viewLayout === 'grid' ? 'active' : ''}`}
              onClick={() => setViewLayout('grid')}
              aria-pressed={viewLayout === 'grid'}
              title="Page overview"
            >
              Grid
            </button>
          </div>

          {viewLayout === 'single' && (
            <div className="image-paper-page-controls">
              <button
                type="button"
                className="image-paper-control"
                onClick={handlePrev}
                disabled={currentPage === 0}
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="page-indicator" aria-live="polite">
                {currentPage + 1} / {pages.length}
              </span>
              <button
                type="button"
                className="image-paper-control"
                onClick={handleNext}
                disabled={currentPage === pages.length - 1}
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          )}

          {viewLayout !== 'grid' && (
            <div className="image-paper-zoom-controls">
              <button
                type="button"
                className="image-paper-control zoom-button"
                onClick={() => zoomAroundStageCenter(zoomRef.current - ZOOM_STEP)}
                aria-label="Zoom out question paper"
                title="Zoom out"
              >
                −
              </button>
              <input
                className="image-paper-zoom-slider"
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step="0.1"
                value={zoom}
                onChange={(event) => zoomAroundStageCenter(Number(event.target.value))}
                aria-label="Question paper zoom"
                title="Drag to adjust zoom"
              />
              <span className="zoom-indicator" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="image-paper-control zoom-button"
                onClick={() => zoomAroundStageCenter(zoomRef.current + ZOOM_STEP)}
                aria-label="Zoom in question paper"
                title="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                className="image-paper-control fit-button"
                onClick={resetZoom}
                aria-label="Fit question paper to width"
                title="Fit to width"
              >
                Fit
              </button>
            </div>
          )}

          <button
            ref={fullscreenButtonRef}
            type="button"
            onClick={() => setIsFullscreen(true)}
            className="image-paper-fullscreen-button"
            aria-label="Open question paper full screen"
            title="Open full screen"
          >
            ⛶ <span>Full screen</span>
          </button>
        </div>
      </div>

      <div
        ref={normalStageRef}
        className={`image-paper-body ${viewLayout === 'grid' ? 'is-grid' : ''}`}
        data-fullscreen="false"
        onPointerDown={viewLayout === 'grid' ? undefined : handlePointerDown}
        onPointerMove={viewLayout === 'grid' ? undefined : handlePointerMove}
        onPointerUp={viewLayout === 'grid' ? undefined : handlePointerUp}
        onPointerCancel={viewLayout === 'grid' ? undefined : handlePointerCancel}
        onLostPointerCapture={viewLayout === 'grid' ? undefined : handlePointerCancel}
        style={{
          touchAction: viewLayout === 'grid' ? 'auto' : 'none',
          justifyContent: zoom <= 1 ? 'center' : 'flex-start',
        }}
      >
        {viewLayout === 'single' && renderImage(currentPage)}

        {viewLayout === 'continuous' && (
          <div className="image-paper-continuous-pages">
            {pages.map((pageSrc, index) => (
              <div
                key={`${index}-${pageSrc.slice(0, 24)}`}
                className="image-paper-continuous-page"
                style={{
                  width: `${zoom * 100}%`,
                  minWidth: `${zoom * 100}%`,
                  maxWidth: zoom <= 1 ? '64rem' : 'none',
                  marginInline: zoom <= 1 ? 'auto' : 0,
                }}
              >
                <div className="image-paper-page-label">PAGE {index + 1} OF {pages.length}</div>
                <img
                  src={pageSrc}
                  alt={`Question paper page ${index + 1}`}
                  className="paper-page-image"
                  draggable="false"
                  onContextMenu={(event) => event.preventDefault()}
                  onDragStart={(event) => event.preventDefault()}
                />
              </div>
            ))}
          </div>
        )}

        {viewLayout === 'grid' && (
          <div className="image-paper-grid">
            {pages.map((pageSrc, index) => (
              <button
                key={`${index}-${pageSrc.slice(0, 24)}`}
                type="button"
                onClick={() => {
                  setCurrentPage(index);
                  setViewLayout('single');
                  resetZoom();
                }}
                className={`image-paper-grid-card ${index === currentPage ? 'active' : ''}`}
                aria-label={`Open page ${index + 1}`}
              >
                <span className="image-paper-grid-image-frame">
                  <img src={pageSrc} alt="" draggable="false" />
                </span>
                <span className="image-paper-grid-label">PAGE {index + 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {viewLayout === 'single' && pages.length > 1 && (
        <div className="image-paper-thumbnails" aria-label="Question paper pages">
          {pages.map((pageSrc, index) => (
            <button
              key={`${index}-${pageSrc.slice(0, 24)}`}
              type="button"
              className={`thumbnail-card ${index === currentPage ? 'active' : ''}`}
              onClick={() => setCurrentPage(index)}
              aria-label={`Jump to page ${index + 1}`}
              aria-current={index === currentPage ? 'page' : undefined}
            >
              <img src={pageSrc} alt="" draggable="false" />
              <span className="thumb-label">{index + 1}</span>
            </button>
          ))}
        </div>
      )}

      {isFullscreen && typeof document !== 'undefined' && createPortal(
        <div
          className="image-paper-fullscreen"
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen question paper"
          onContextMenu={(event) => event.preventDefault()}
          onCopy={(event) => event.preventDefault()}
          onCut={(event) => event.preventDefault()}
          onPaste={(event) => event.preventDefault()}
          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        >
          <button
            ref={closeFullscreenRef}
            type="button"
            className="image-paper-fullscreen-close"
            onClick={() => setIsFullscreen(false)}
            aria-label="Close full-screen question paper"
            title="Close"
          >
            ×
          </button>
          <div
            ref={fullscreenStageRef}
            className="image-paper-fullscreen-stage"
            data-fullscreen="true"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
            style={{ touchAction: 'none', justifyContent: zoom <= 1 ? 'center' : 'flex-start' }}
          >
            {renderImage(currentPage, true)}
          </div>
          {pages.length > 1 && (
            <span className="image-paper-sr-only" aria-live="polite">
              Page {currentPage + 1} of {pages.length}. Swipe left or right to change pages.
            </span>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
