import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, ShieldCheck } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up the worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFModalProps {
  fileUrl: string;
  onClose: () => void;
}

export default function PDFModal({ fileUrl, onClose }: PDFModalProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth - 32);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-8">
      <div className="bg-white w-full max-w-5xl h-[95vh] sm:h-full rounded-xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-blue-900 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
            <h3 className="font-bold text-sm sm:text-lg truncate">VTU Document Viewer</h3>
            <span className="hidden xs:inline-block text-[8px] sm:text-xs bg-blue-800 px-2 py-1 rounded border border-blue-700 text-blue-200">Read-Only</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1 sm:gap-2 bg-blue-800 rounded-lg px-1.5 py-1">
              <button 
                onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                className="p-1 hover:bg-blue-700 rounded transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
              <span className="text-[10px] sm:text-xs font-mono w-8 sm:w-12 text-center">{Math.round(scale * 100)}%</span>
              <button 
                onClick={() => setScale(s => Math.min(2.0, s + 0.1))}
                className="p-1 hover:bg-blue-700 rounded transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 sm:p-2 hover:bg-red-500 rounded-full transition-all"
              title="Close Viewer"
            >
              <X className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* PDF Content */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-slate-100 flex justify-center p-2 sm:p-4 relative select-none">
          {/* Watermark */}
          <div className="absolute inset-0 z-10 pointer-events-none opacity-5 flex items-center justify-center rotate-45 overflow-hidden">
            <span className="text-6xl sm:text-9xl font-black text-blue-900 whitespace-nowrap">VTU OFFICIAL</span>
          </div>
          
          <div className="shadow-2xl bg-white h-fit">
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className="flex flex-col items-center justify-center h-64 sm:h-96 w-full sm:w-[600px] gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-blue-900 font-bold animate-pulse text-sm">Loading Document...</p>
                </div>
              }
            >
              <Page 
                pageNumber={pageNumber} 
                scale={scale}
                width={containerWidth > 0 ? containerWidth : undefined}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
            </Document>
          </div>
        </div>

        {/* Footer Controls */}
        <div className="bg-white border-t border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-between sm:justify-start">
            <button
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber(p => p - 1)}
              className="flex items-center gap-1 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-50 text-blue-900 rounded-lg font-bold hover:bg-blue-100 disabled:opacity-30 transition-all border border-blue-100 text-xs sm:text-sm"
            >
              <ChevronLeft className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /> Prev
            </button>
            <span className="text-[10px] sm:text-sm font-bold text-slate-600">
              Page <span className="text-blue-900">{pageNumber}</span> of {numPages || '?'}
            </span>
            <button
              disabled={numPages ? pageNumber >= numPages : true}
              onClick={() => setPageNumber(p => p + 1)}
              className="flex items-center gap-1 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-50 text-blue-900 rounded-lg font-bold hover:bg-blue-100 disabled:opacity-30 transition-all border border-blue-100 text-xs sm:text-sm"
            >
              Next <ChevronRight className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
          
          <div className="hidden xs:flex items-center gap-2 text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <ShieldCheck size={12} className="text-blue-400" />
            Secure Protocol
          </div>
        </div>
      </div>
    </div>
  );
}
