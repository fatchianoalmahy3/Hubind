import React, { useState, useEffect } from 'react';
import { X, Layers, CheckCircle2, Trash2, Download, UserCheck, AlertTriangle, Printer, Loader2 } from 'lucide-react';
import { GuruService } from '../services/GuruService';
import { Guru } from '../core/types/schema';
import { CrudLoadingOverlay, TopProgressBar } from './CrudProgressFeedback';

interface BulkActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onBulkDelete?: () => Promise<void>;
  onBulkApprove?: () => Promise<void>;
  onBulkAssignTeacher?: (teacherName: string) => Promise<void>;
  onBulkPrint?: () => void;
  onExportSelected: () => void;
  moduleTitle: string;
}

export const BulkActionModal: React.FC<BulkActionModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  onBulkDelete,
  onBulkApprove,
  onBulkAssignTeacher,
  onBulkPrint,
  onExportSelected,
  moduleTitle,
}) => {
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setConfirmDelete(false);
      return;
    }
    if (onBulkAssignTeacher) {
      GuruService.getInstance()
        .getAll()
        .then((list) => {
          setGuruList(list);
          if (list.length > 0 && !selectedTeacher) {
            setSelectedTeacher(list[0].nama);
          }
        })
        .catch(() => setGuruList([]));
    }
  }, [isOpen, onBulkAssignTeacher]);

  if (!isOpen) return null;

  const handleDelete = async () => {
    if (!onBulkDelete) return;
    setLoading(true);
    try {
      await onBulkDelete();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!onBulkApprove) return;
    setLoading(true);
    try {
      await onBulkApprove();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!onBulkAssignTeacher || !selectedTeacher.trim()) return;
    setLoading(true);
    try {
      await onBulkAssignTeacher(selectedTeacher.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={!loading ? onClose : undefined}
    >
      <div
        className="relative bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-9 h-9 bg-blue-50 border border-blue-200 rounded-lg text-blue-600 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Aksi Massal</h3>
              <p className="text-xs text-slate-500 truncate tabular-nums">
                {selectedCount} baris terpilih pada {moduleTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <TopProgressBar active={loading} label="Memproses aksi massal di Cloud Server" />

        {/* Action List */}
        <div className="p-5 space-y-2.5">
          {onBulkApprove && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={loading}
              className="w-full min-h-12 flex items-center gap-3 p-3.5 bg-white hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900">
                  Setujui Massal (ACC Kakomli)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Ubah status menjadi Disetujui &amp; kunci kuota DUDI
                </div>
              </div>
            </button>
          )}

          {onBulkAssignTeacher && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Tugaskan Guru Pendamping</span>
              </div>
              <div className="flex gap-2">
                {guruList.length > 0 ? (
                  <select
                    value={selectedTeacher}
                    onChange={(e) => setSelectedTeacher(e.target.value)}
                    className="flex-1 h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    {guruList.map((g, idx) => (
                      <option key={`${g.id || 'guru'}_${idx}`} value={g.nama}>
                        {g.nama} ({g.peranUtama || 'Guru'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedTeacher}
                    onChange={(e) => setSelectedTeacher(e.target.value)}
                    placeholder="Nama guru pendamping..."
                    className="flex-1 h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
                  />
                )}
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={loading || !selectedTeacher.trim()}
                  className="h-9 px-3.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  <span>Terapkan</span>
                </button>
              </div>
            </div>
          )}

          {onBulkPrint && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                onBulkPrint();
                onClose();
              }}
              className="w-full min-h-12 flex items-center gap-3 p-3.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-left transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                <Printer className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 tabular-nums">
                  Cetak Dokumen Massal ({selectedCount} Siswa)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Cetak Pengajuan, Permohonan DUDI, atau Blangko Sertifikat
                </div>
              </div>
            </button>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              onExportSelected();
              onClose();
            }}
            className="w-full min-h-12 flex items-center gap-3 p-3.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-left transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-9 h-9 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900">
                Ekspor Data Terpilih (.xlsx)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                Unduh {selectedCount} baris dalam format Excel (.xlsx)
              </div>
            </div>
          </button>

          {/* Delete Danger Section */}
          {onBulkDelete && (
            <div className="pt-2 border-t border-slate-100">
              {!confirmDelete ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setConfirmDelete(true)}
                  className="w-full min-h-12 flex items-center gap-3 p-3.5 bg-white hover:bg-rose-50 border border-rose-200 rounded-xl text-left transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-9 h-9 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-rose-800 tabular-nums">
                      Hapus {selectedCount} Data Terpilih
                    </div>
                    <div className="text-[11px] text-rose-600 mt-0.5">
                      Memerlukan konfirmasi keamanan sebelum penghapusan
                    </div>
                  </div>
                </button>
              ) : (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-center space-y-3">
                  <div className="flex items-center justify-center gap-1.5 text-rose-900 font-bold text-xs tabular-nums">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Yakin ingin menghapus {selectedCount} baris?</span>
                  </div>
                  <p className="text-[11px] text-rose-700">
                    Data yang dihapus akan disinkronkan ke Cloud Server.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setConfirmDelete(false)}
                      className="h-9 px-4 bg-white border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg hover:bg-rose-100/60 cursor-pointer disabled:opacity-50"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={loading}
                      className="h-9 px-4 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                      <span>{loading ? 'Menghapus...' : 'Ya, Hapus Sekarang'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="h-9 px-4 border border-slate-200 bg-white hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Tutup
          </button>
        </div>

        <CrudLoadingOverlay
          visible={loading}
          tone={confirmDelete ? 'rose' : 'blue'}
          title={
            confirmDelete
              ? 'Menghapus Data Terpilih di Cloud Server...'
              : 'Memproses Aksi Massal di Cloud Server...'
          }
        />
      </div>
    </div>
  );
};
