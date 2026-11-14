import React, { useState, useRef } from 'react';
import { X, Crop, Upload, Check, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImage?: string;
  onSave: (croppedDataUrl: string) => void;
}

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  isOpen,
  onClose,
  currentImage,
  onSave,
}) => {
  const [selectedRatio, setSelectedRatio] = useState<'1:1' | '4:3' | '16:9'>('1:1');
  const [imageSrc, setImageSrc] = useState<string>(currentImage || '');
  const [zoom, setZoom] = useState<number>(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropAndSave = () => {
    if (!imageSrc) return;

    // Canvas crop & auto-resize
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let targetWidth = 400;
      let targetHeight = 400;

      if (selectedRatio === '4:3') {
        targetWidth = 480;
        targetHeight = 360;
      } else if (selectedRatio === '16:9') {
        targetWidth = 640;
        targetHeight = 360;
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Center and scale image
        const scale = Math.max(targetWidth / img.width, targetHeight / img.height) * zoom;
        const x = (targetWidth - img.width * scale) / 2;
        const y = (targetHeight - img.height * scale) / 2;

        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        onSave(dataUrl);
        onClose();
      }
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
              <Crop className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Upload &amp; Crop Gambar (Auto-Resize)
              </h3>
              <p className="text-xs text-slate-500">
                Pilih rasio aspek sesuai kebutuhan pasfoto atau dokumentasi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Aspect Ratio Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Pilih Rasio Aspek:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedRatio('1:1')}
                className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                  selectedRatio === '1:1'
                    ? 'bg-blue-50 border-blue-600 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                1:1 (Pasfoto Siswa)
              </button>
              <button
                type="button"
                onClick={() => setSelectedRatio('4:3')}
                className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                  selectedRatio === '4:3'
                    ? 'bg-blue-50 border-blue-600 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                4:3 (Dokumentasi)
              </button>
              <button
                type="button"
                onClick={() => setSelectedRatio('16:9')}
                className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                  selectedRatio === '16:9'
                    ? 'bg-blue-50 border-blue-600 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                16:9 (Industri/Banner)
              </button>
            </div>
          </div>

          {/* Image Preview / Canvas viewport */}
          <div className="relative bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center min-h-[220px] max-h-[300px]">
            {imageSrc ? (
              <div
                className={`overflow-hidden border-2 border-white/80 shadow-lg relative flex items-center justify-center ${
                  selectedRatio === '1:1'
                    ? 'w-48 h-48 rounded-lg'
                    : selectedRatio === '4:3'
                    ? 'w-56 h-42 rounded-lg'
                    : 'w-64 h-36 rounded-lg'
                }`}
              >
                <img
                  src={imageSrc}
                  alt="Crop Target"
                  style={{ transform: `scale(${zoom})` }}
                  className="max-h-full max-w-full object-cover transition-transform"
                />
              </div>
            ) : (
              <div className="text-center p-6 text-slate-400">
                <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <div className="text-xs font-medium">Belum ada gambar dipilih</div>
              </div>
            )}
          </div>

          {/* Zoom controls */}
          {imageSrc && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold text-slate-600">
                Zoom: {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Upload input button */}
          <label className="w-full flex items-center justify-center gap-2 p-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-slate-700 text-xs font-semibold cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            <span>Pilih File Gambar dari Komputer / HP</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleCropAndSave}
            disabled={!imageSrc}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-xs disabled:opacity-40 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Terapkan &amp; Kompres</span>
          </button>
        </div>
      </div>
    </div>
  );
};
