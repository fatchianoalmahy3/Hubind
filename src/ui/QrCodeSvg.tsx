import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  className?: string;
  label?: string;
  sublabel?: string;
  emptyText?: string;
}

/**
 * Generates an authentic, scannable inline SVG QR code offline-safe for both screen preview and print/PDF.
 */
export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({
  value,
  size = 84,
  className = '',
  label,
  sublabel,
  emptyText = 'Link Maps belum tersedia',
}) => {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const cleanValue = String(value || '').trim();

  useEffect(() => {
    let cancelled = false;
    if (!cleanValue) {
      setSvgMarkup('');
      return;
    }

    QRCode.toString(cleanValue, {
      type: 'svg',
      margin: 1,
      width: size,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((svg) => {
        if (!cancelled) setSvgMarkup(svg);
      })
      .catch(() => {
        if (!cancelled) setSvgMarkup('');
      });

    return () => {
      cancelled = true;
    };
  }, [cleanValue, size]);

  if (!cleanValue || !svgMarkup) {
    return (
      <div
        className={`inline-flex flex-col items-center justify-center p-2 border border-dashed border-slate-300 rounded-lg bg-slate-50 text-center ${className}`}
        style={{ minWidth: size + 16 }}
      >
        <div
          className="flex items-center justify-center text-[9px] text-slate-400 font-sans px-1"
          style={{ width: size, height: Math.max(48, Math.round(size * 0.72)) }}
        >
          {emptyText}
        </div>
        {label && <span className="text-[9px] font-bold text-slate-600 mt-1">{label}</span>}
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center p-1.5 border border-slate-300 rounded-lg bg-white text-center ${className}`}>
      <div
        className="leading-none [&_svg]:block [&_svg]:max-w-full [&_svg]:h-auto"
        style={{ width: size, height: size }}
        aria-label={label ? `QR Code ${label}` : 'QR Code'}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      {label && (
        <span className="text-[9px] font-bold text-slate-800 font-sans mt-1 leading-tight">
          {label}
        </span>
      )}
      {sublabel && (
        <span className="text-[8px] text-slate-500 font-mono leading-tight max-w-[120px] truncate">
          {sublabel}
        </span>
      )}
    </div>
  );
};
