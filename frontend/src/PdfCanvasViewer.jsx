import React from 'react';

export default class PdfCanvasViewer extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      numPages: 0,
      currentPage: 1,
      scale: 1.2,
      loading: true,
      error: '',
    };
    this.canvasRef = React.createRef();
    this.pdfDoc = null;
  }

  componentDidMount() {
    this.loadPdf();
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.pdfDataUrl !== this.props.pdfDataUrl) {
      this.loadPdf();
    } else if (
      prevState.currentPage !== this.state.currentPage ||
      prevState.scale !== this.state.scale
    ) {
      this.renderPage(this.state.currentPage);
    }
  }

  loadPdf = async () => {
    const { pdfDataUrl } = this.props;
    if (!pdfDataUrl) {
      this.setState({ loading: false, error: 'No PDF document URL provided.' });
      return;
    }

    this.setState({ loading: true, error: '' });

    try {
      if (typeof window.pdfjsLib === 'undefined') {
        await this.loadPdfJsScript();
      }

      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }

      let loadingTask;
      if (pdfDataUrl.includes('base64,')) {
        const b64 = pdfDataUrl.split('base64,')[1];
        const binary = atob(b64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        loadingTask = window.pdfjsLib.getDocument({ data: bytes });
      } else {
        loadingTask = window.pdfjsLib.getDocument(pdfDataUrl);
      }

      this.pdfDoc = await loadingTask.promise;
      this.setState(
        { numPages: this.pdfDoc.numPages, currentPage: 1, loading: false },
        () => {
          this.renderPage(1);
        }
      );
    } catch (err) {
      console.error('pdf.js failed to load PDF', err);
      this.setState({
        loading: false,
        error: err.message || 'Failed to parse PDF document.',
      });
    }
  };

  loadPdfJsScript = () => {
    return new Promise((resolve, reject) => {
      if (typeof window.pdfjsLib !== 'undefined') return resolve();
      const script = document.createElement('script');
      script.src =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error('Failed to load pdf.js script from CDN'));
      document.head.appendChild(script);
    });
  };

  renderPage = async (pageNum) => {
    if (!this.pdfDoc || !this.canvasRef.current) return;
    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.state.scale });
      const canvas = this.canvasRef.current;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
    } catch (err) {
      console.error('Page render error', err);
    }
  };

  prevPage = () => {
    this.setState((prev) => ({ currentPage: Math.max(prev.currentPage - 1, 1) }));
  };

  nextPage = () => {
    this.setState((prev) => ({
      currentPage: Math.min(prev.currentPage + 1, prev.numPages),
    }));
  };

  zoomIn = () => {
    this.setState((prev) => ({ scale: Math.min(prev.scale + 0.2, 2.5) }));
  };

  zoomOut = () => {
    this.setState((prev) => ({ scale: Math.max(prev.scale - 0.2, 0.6) }));
  };

  render() {
    const { numPages, currentPage, scale, loading, error } = this.state;

    return (
      <div className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col items-center">
        {/* PDF Toolbar */}
        <div className="w-full bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-200 select-none">
          <div className="flex items-center gap-2">
            <span className="bg-red-600 text-white font-bold px-2 py-0.5 rounded text-[10px] tracking-wider uppercase">
              📕 CANVAS PDF VIEWER
            </span>
            <span className="font-bold text-slate-300">
              Page {currentPage} of {numPages || 1}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={this.prevPage}
              disabled={currentPage <= 1}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 px-3 py-1 rounded font-bold transition-all cursor-pointer"
            >
              ◀ Prev
            </button>
            <button
              type="button"
              onClick={this.nextPage}
              disabled={currentPage >= numPages}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 px-3 py-1 rounded font-bold transition-all cursor-pointer"
            >
              Next ▶
            </button>

            <span className="text-slate-600">|</span>

            <button
              type="button"
              onClick={this.zoomOut}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded font-bold cursor-pointer"
              title="Zoom Out"
            >
              🔍-
            </button>
            <span className="text-[11px] text-amber-400 font-bold">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={this.zoomIn}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded font-bold cursor-pointer"
              title="Zoom In"
            >
              🔍+
            </button>
          </div>
        </div>

        {/* Canvas Display Container */}
        <div className="w-full p-4 flex flex-col items-center justify-center bg-slate-900/90 overflow-auto min-h-[600px] max-h-[780px]">
          {loading && (
            <div className="flex flex-col items-center justify-center space-y-3 py-20 font-mono text-amber-400">
              <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
              <span>Rendering PDF document onto Canvas...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-950/80 border border-red-800 text-red-300 p-4 rounded-lg text-xs font-mono max-w-md text-center">
              ❌ {error}
            </div>
          )}

          <canvas
            ref={this.canvasRef}
            className={`shadow-2xl rounded border border-slate-300 bg-white transition-transform ${
              loading ? 'hidden' : 'block'
            }`}
          />
        </div>
      </div>
    );
  }
}
