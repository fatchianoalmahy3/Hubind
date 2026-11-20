import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';

export const PAPER_DIMENSIONS = {
  A4: {
    widthPx: 794,
    heightPx: 1123,
    label: 'A4 (210 × 297 mm)',
  },
  F4: {
    widthPx: 812,
    heightPx: 1247,
    label: 'F4 (215 × 330 mm)',
  },
} as const;

export const PAPER_SHEET_PADDING = '23px 38px 26px 38px';

export type PreviewZoomMode = 'auto' | number;

interface ResizablePaperPreviewProps {
  paperSize: 'A4' | 'F4';
  zoomMode: PreviewZoomMode;
  onChangeZoomMode: (next: PreviewZoomMode) => void;
  sheetId?: string;
  sheetClassName?: string;
  unstyledCanvas?: boolean;
  topSlot?: React.ReactNode;
  children: React.ReactNode;
}

const ZOOM_PRESETS = [0.5, 0.65, 0.75, 0.9, 1, 1.25, 1.5] as const;

export const ResizablePaperPreview: React.FC<ResizablePaperPreviewProps> = ({
  paperSize,
  zoomMode,
  onChangeZoomMode,
  sheetId,
  sheetClassName = '',
  unstyledCanvas = false,
  topSlot,
  children,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const paper = PAPER_DIMENSIONS[paperSize];

  const [stageWidth, setStageWidth] = useState<number>(paper.widthPx);
  const [contentHeight, setContentHeight] = useState<number>(paper.heightPx);

  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl || typeof ResizeObserver === 'undefined') return;

    const updateWidth = () => {
      const nextWidth = stageEl.clientWidth;
      if (nextWidth > 0) {
        setStageWidth(nextWidth);
      }
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(stageEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const updateHeight = () => {
      const measured = Math.max(paper.heightPx, Math.ceil(canvasEl.scrollHeight));
      setContentHeight(measured);
    };

    updateHeight();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(canvasEl);
    return () => observer.disconnect();
  }, [paper.heightPx, paperSize, children]);

  const autoScale = Math.min(1, Math.max(0.32, (stageWidth - 4) / paper.widthPx));
  const activeScale = zoomMode === 'auto' ? autoScale : Math.min(1.5, Math.max(0.4, zoomMode));
  const activePercent = Math.round(activeScale * 100);

  const stepZoom = (delta: number) => {
    const base = zoomMode === 'auto' ? autoScale : zoomMode;
    const next = Math.round(Math.min(1.5, Math.max(0.4, base + delta)) * 100) / 100;
    onChangeZoomMode(next);
  };

  const pageBreakCount = !unstyledCanvas
    ? Math.max(0, Math.floor((contentHeight - 16) / paper.heightPx))
    : 0;

  return (
    <div className="w-full space-y-3">
      {topSlot}

      {/* Interactive Resize / Zoom Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs no-print">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-slate-800 whitespace-nowrap">{paper.label}</span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="text-slate-500 font-mono tabular-nums whitespace-nowrap">
            {zoomMode === 'auto' ? `Auto (${activePercent}%)` : `${activePercent}%`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onChangeZoomMode('auto')}
            className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
              zoomMode === 'auto'
                ? 'bg-blue-50 border-blue-400 text-blue-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Sesuaikan lebar kertas otomatis dengan ukuran layar perangkat"
          >
            <Minimize2 className="w-3.5 h-3.5 shrink-0" />
            <span>Fit Layar</span>
          </button>

          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
            <button
              type="button"
              onClick={() => stepZoom(-0.1)}
              disabled={activeScale <= 0.4}
              aria-label="Perkecil dokumen"
              title="Perkecil (-10%)"
              className="h-8 w-8 inline-flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-40 cursor-pointer transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <select
              value={zoomMode === 'auto' ? 'auto' : String(zoomMode)}
              onChange={(e) => {
                const v = e.target.value;
                onChangeZoomMode(v === 'auto' ? 'auto' : Number(v));
              }}
              aria-label="Pilih skala ukuran dokumen"
              className="h-8 px-2 bg-white border-x border-slate-200 text-xs font-semibold text-slate-800 tabular-nums focus:outline-none cursor-pointer"
            >
              <option value="auto">Auto ({Math.round(autoScale * 100)}%)</option>
              {!ZOOM_PRESETS.some((p) => p === zoomMode) && zoomMode !== 'auto' && (
                <option value={String(zoomMode)}>{activePercent}%</option>
              )}
              {ZOOM_PRESETS.map((preset) => (
                <option key={preset} value={String(preset)}>
                  {Math.round(preset * 100)}% {preset === 1 ? '(Asli)' : ''}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => stepZoom(0.1)}
              disabled={activeScale >= 1.5}
              aria-label="Perbesar dokumen"
              title="Perbesar (+10%)"
              className="h-8 w-8 inline-flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-40 cursor-pointer transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onChangeZoomMode(1)}
            className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors tabular-nums whitespace-nowrap ${
              zoomMode === 1
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Tampilkan ukuran fisik 100%"
          >
            <Maximize2 className="w-3 h-3 shrink-0" />
            <span>100%</span>
          </button>
        </div>
      </div>

      {/* Scaled Fixed-Paper Stage */}
      <div ref={stageRef} className="w-full overflow-x-auto pb-2">
        <div className="flex justify-center min-w-full">
          <div
            style={{
              width: `${Math.round(paper.widthPx * activeScale)}px`,
              height: `${Math.round(contentHeight * activeScale)}px`,
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <div
              ref={canvasRef}
              id={sheetId}
              style={{
                width: `${paper.widthPx}px`,
                minHeight: `${paper.heightPx}px`,
                padding: unstyledCanvas ? undefined : PAPER_SHEET_PADDING,
                boxSizing: 'border-box',
                transform: `scale(${activeScale})`,
                transformOrigin: 'top left',
              }}
              className={
                unstyledCanvas
                  ? 'relative'
                  : `relative bg-white rounded-xl shadow-md border border-slate-300 text-slate-950 ${sheetClassName}`
              }
            >
              {children}

              {/* Subtle visual page break boundary indicators for multi-page checks */}
              {pageBreakCount > 0 &&
                Array.from({ length: pageBreakCount }).map((_, idx) => {
                  const topPx = (idx + 1) * paper.heightPx;
                  return (
                    <div
                      key={`pg_break_${idx}`}
                      style={{ top: `${topPx}px` }}
                      className="no-print pointer-events-none absolute left-2 right-2 border-t border-dashed border-blue-400/70 flex justify-end"
                    >
                      <span className="-mt-2.5 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-sans font-semibold">
                        Batas Hal. {idx + 1} ({paperSize})
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
