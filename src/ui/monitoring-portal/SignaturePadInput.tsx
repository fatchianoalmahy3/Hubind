import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, PenTool } from 'lucide-react';
import { normalizeSignatureSvgPath } from '../../core/utils/monitoringHelpers';

interface SignaturePadInputProps {
  value: string;
  studentName?: string;
  disabled?: boolean;
  onChange: (svgPathValue: string) => void;
}

const LOGICAL_WIDTH = 280;
const LOGICAL_HEIGHT = 90;

type StrokePoint = { x: number; y: number };

function strokesToSvgPathValue(strokes: StrokePoint[][]): string {
  const segments: string[] = [];
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    const first = stroke[0];
    if (stroke.length === 1) {
      segments.push(
        `M${first.x.toFixed(1)},${first.y.toFixed(1)}L${(first.x + 0.5).toFixed(1)},${first.y.toFixed(1)}`
      );
      continue;
    }
    const parts = [`M${first.x.toFixed(1)},${first.y.toFixed(1)}`];
    for (let i = 1; i < stroke.length; i += 1) {
      parts.push(`L${stroke[i].x.toFixed(1)},${stroke[i].y.toFixed(1)}`);
    }
    segments.push(parts.join(''));
  }
  const d = segments.join('');
  return d ? `svgpath:${LOGICAL_WIDTH}x${LOGICAL_HEIGHT}|${d}` : '';
}

function parseSvgPathToStrokes(pathD: string): StrokePoint[][] {
  const strokes: StrokePoint[][] = [];
  const subpaths = pathD.split(/(?=M)/i).filter(Boolean);
  for (const sub of subpaths) {
    const pts: StrokePoint[] = [];
    const coordRegex = /[ML]\s*([\d.]+)\s*,\s*([\d.]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = coordRegex.exec(sub)) !== null) {
      pts.push({ x: Number(m[1]), y: Number(m[2]) });
    }
    if (pts.length > 0) strokes.push(pts);
  }
  return strokes;
}

export const SignaturePadInput: React.FC<SignaturePadInputProps> = ({
  value,
  studentName,
  disabled = false,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<StrokePoint[][]>([]);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(Boolean(value));

  const parsedValue = useMemo(() => normalizeSignatureSvgPath(value), [value]);

  const redrawCanvas = (strokes: StrokePoint[][]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.1;

    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      if (stroke.length === 1) {
        ctx.lineTo(stroke[0].x + 0.5, stroke[0].y);
      } else {
        for (let i = 1; i < stroke.length; i += 1) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
      }
      ctx.stroke();
    }
  };

  useEffect(() => {
    if (drawingRef.current) return;
    if (!value) {
      strokesRef.current = [];
      setHasStroke(false);
      redrawCanvas([]);
      return;
    }
    const parsed = normalizeSignatureSvgPath(value);
    if (parsed) {
      const parsedStrokes = parseSvgPathToStrokes(parsed.pathD);
      strokesRef.current = parsedStrokes;
      setHasStroke(parsedStrokes.length > 0);
      redrawCanvas(parsedStrokes);
    }
  }, [value, disabled]);

  const getRelativeCoords = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = LOGICAL_WIDTH / (rect.width || LOGICAL_WIDTH);
    const scaleY = LOGICAL_HEIGHT / (rect.height || LOGICAL_HEIGHT);
    const x = Math.max(0, Math.min(LOGICAL_WIDTH, (e.clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(LOGICAL_HEIGHT, (e.clientY - rect.top) * scaleY));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !canvasRef.current) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    const pt = getRelativeCoords(e);
    drawingRef.current = true;
    strokesRef.current = [...strokesRef.current, [pt]];
    setHasStroke(true);
    redrawCanvas(strokesRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const pt = getRelativeCoords(e);
    const activeStroke = strokesRef.current[strokesRef.current.length - 1];
    if (!activeStroke) return;
    const prevPt = activeStroke[activeStroke.length - 1];
    if (prevPt) {
      const dist = Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y);
      if (dist < 2.2) return;
    }
    activeStroke.push(pt);
    redrawCanvas(strokesRef.current);
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const encoded = strokesToSvgPathValue(strokesRef.current);
    onChange(encoded);
  };

  const handleClear = () => {
    if (disabled) return;
    drawingRef.current = false;
    strokesRef.current = [];
    setHasStroke(false);
    redrawCanvas([]);
    onChange('');
  };

  return (
    <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
          <PenTool className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            Tanda Tangan Siswa {studentName ? `(${studentName})` : ''} *
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
              hasStroke
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {hasStroke ? 'TTD Terisi' : 'Belum TTD'}
          </span>
          {!disabled && hasStroke && (
            <button
              type="button"
              onClick={handleClear}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Ulangi TTD</span>
            </button>
          )}
        </div>
      </div>

      {disabled ? (
        <div className="w-full sm:max-w-[360px] h-[112px] rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center p-2">
          {parsedValue ? (
            <svg
              viewBox={parsedValue.viewBox}
              className="w-full h-full"
              aria-label="Tanda tangan siswa"
            >
              <path
                d={parsedValue.pathD}
                fill="none"
                stroke="#0f172a"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <span className="text-[11px] text-slate-400 italic">Belum ada tanda tangan siswa</span>
          )}
        </div>
      ) : (
        <div className="relative w-full sm:max-w-[360px]">
          <canvas
            ref={canvasRef}
            width={LOGICAL_WIDTH}
            height={LOGICAL_HEIGHT}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            className="w-full h-[116px] sm:h-[112px] rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 hover:border-blue-400 cursor-crosshair touch-none block"
          />
          {!hasStroke && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-[11px]">
              <span>Goreskan tanda tangan siswa di area ini</span>
            </div>
          )}
          <div className="pointer-events-none absolute left-4 right-4 bottom-3 border-b border-slate-300/80" />
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        {hasStroke
          ? 'Tanda tangan tersimpan ringan dalam format vektor untuk dicetak pada Lembar Monitoring 07.01.'
          : 'Minta siswa menandatangani langsung di kotak di atas setelah absensi diperiksa.'}
      </p>
    </div>
  );
};
