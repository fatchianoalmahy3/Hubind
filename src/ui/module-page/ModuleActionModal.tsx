import React from 'react';
import { Loader2, X } from 'lucide-react';
import { Dudi, Guru } from '../../core/types/schema';
import { formatNisVisual } from '../../core/utils/nisHelpers';
import { normalizeRelationText } from '../../core/utils/relationHelpers';
import { CrudLoadingOverlay, TopProgressBar } from '../CrudProgressFeedback';

export interface ModuleActionModalState {
  isOpen: boolean;
  type: 'reject_kakomli' | 'schedule_hubin' | 'promote_to_pkl' | 'transfer_dudi' | null;
  row: any | null;
  reason: string;
  newDudi: string;
  guruPendamping: string;
  tanggalBerangkat: string;
  tanggalRencanaTarik: string;
  submitting: boolean;
}

interface ModuleActionModalProps {
  state: ModuleActionModalState;
  setState: React.Dispatch<React.SetStateAction<ModuleActionModalState>>;
  dudiList: Dudi[];
  guruList: Guru[];
  onSubmit: (e: React.FormEvent) => Promise<void> | void;
}

export const ModuleActionModal: React.FC<ModuleActionModalProps> = ({
  state,
  setState,
  dudiList,
  guruList,
  onSubmit,
}) => {
  if (!state.isOpen || !state.row) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={() => !state.submitting && setState((p) => ({ ...p, isOpen: false }))}
    >
      <div
        className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="min-w-0 pr-2">
            <h3 className="text-sm font-bold text-slate-900">
              {state.type === 'reject_kakomli' && 'Tolak Pengajuan PKL'}
              {state.type === 'schedule_hubin' && 'Jadwalkan Pemberangkatan PKL'}
              {state.type === 'promote_to_pkl' && 'Terbitkan ke Data Siswa PKL'}
              {state.type === 'transfer_dudi' && 'Pindah DUDI Siswa PKL'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {state.row.namaSiswa} ({formatNisVisual(state.row.nis)}) ·{' '}
              {state.row.dudiTujuan || state.row.namaDudi}
            </p>
          </div>
          <button
            type="button"
            disabled={state.submitting}
            onClick={() => setState((p) => ({ ...p, isOpen: false }))}
            className="w-9 h-9 rounded-lg hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <TopProgressBar active={state.submitting} label="Menyimpan aksi modul ke Cloud Server" />

        <form onSubmit={onSubmit} className="p-5 space-y-4 text-xs">
          {state.type === 'reject_kakomli' ? (
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Alasan Penolakan (Catatan Kakomli):
              </label>
              <textarea
                rows={3}
                required
                value={state.reason}
                onChange={(e) => setState((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Contoh: DUDI tidak linier dengan kompetensi keahlian"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
              />
            </div>
          ) : (
            <>
              {state.type === 'transfer_dudi' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Mitra DUDI Tujuan Baru <span className="text-rose-500">*</span>
                  </label>
                  {dudiList.length > 0 ? (
                    <select
                      required
                      value={state.newDudi}
                      onChange={(e) => {
                        const selectedName = e.target.value;
                        const matched = dudiList.find(
                          (d) =>
                            normalizeRelationText(d.namaDudi) === normalizeRelationText(selectedName)
                        );
                        setState((prev) => ({
                          ...prev,
                          newDudi: selectedName,
                          guruPendamping: matched?.guruPendamping || prev.guruPendamping,
                        }));
                      }}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    >
                      <option value="">-- Pilih Mitra DUDI Baru --</option>
                      {dudiList
                        .filter(
                          (d) =>
                            normalizeRelationText(d.namaDudi) !==
                            normalizeRelationText(state.row.namaDudi)
                        )
                        .map((d, idx) => (
                          <option key={`${d.id || 'dudi'}_${idx}`} value={d.namaDudi}>
                            {d.namaDudi} ({d.terisi ?? 0}/{d.kuotaMaksimal ?? 0})
                            {d.guruPendamping ? ` · ${d.guruPendamping}` : ''}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={state.newDudi}
                      onChange={(e) => setState((prev) => ({ ...prev, newDudi: e.target.value }))}
                      placeholder="Ketik nama DUDI tujuan baru..."
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Guru Pendamping Lapangan <span className="text-rose-500">*</span>
                </label>
                {guruList.length > 0 ? (
                  <select
                    required
                    value={state.guruPendamping}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        guruPendamping: e.target.value,
                      }))
                    }
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    <option value="">-- Pilih Guru Pendamping --</option>
                    {guruList.map((g, idx) => (
                      <option key={`${g.id || 'guru'}_${idx}`} value={g.nama}>
                        {g.nama} ({g.peranUtama || 'Guru Pendamping'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={state.guruPendamping}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        guruPendamping: e.target.value,
                      }))
                    }
                    placeholder="Ketik nama lengkap Guru Pendamping..."
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                )}
                {guruList.length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    Daftar Guru Pendamping di Cloud Server masih kosong; Anda dapat mengetik nama
                    guru secara langsung.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Tanggal Berangkat <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={state.tanggalBerangkat}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        tanggalBerangkat: e.target.value,
                      }))
                    }
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 tabular-nums"
                  />
                </div>
                {(state.type === 'promote_to_pkl' || state.type === 'transfer_dudi') && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">
                      Rencana Tanggal Tarik
                    </label>
                    <input
                      type="date"
                      value={state.tanggalRencanaTarik}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          tanggalRencanaTarik: e.target.value,
                        }))
                      }
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 tabular-nums"
                    />
                  </div>
                )}
              </div>

              {state.type === 'transfer_dudi' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Alasan Pindah / Catatan Mutasi
                  </label>
                  <textarea
                    rows={2}
                    value={state.reason}
                    onChange={(e) => setState((prev) => ({ ...prev, reason: e.target.value }))}
                    placeholder="Contoh: Ketidakcocokan shift/lingkungan atau relokasi mitra DUDI"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  />
                </div>
              )}
            </>
          )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={state.submitting}
              onClick={() => setState((p) => ({ ...p, isOpen: false }))}
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={state.submitting}
              className={`h-9 px-4 rounded-lg text-white font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                state.type === 'reject_kakomli'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : state.type === 'transfer_dudi'
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {state.submitting && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
              <span>
                {state.submitting
                  ? 'Menyimpan...'
                  : state.type === 'reject_kakomli'
                  ? 'Tolak Pengajuan'
                  : state.type === 'promote_to_pkl'
                  ? 'Terbitkan ke Data Siswa PKL'
                  : state.type === 'transfer_dudi'
                  ? 'Proses Pindah DUDI'
                  : 'Simpan Jadwal'}
              </span>
            </button>
          </div>
        </form>

        <CrudLoadingOverlay
          visible={state.submitting}
          tone={state.type === 'reject_kakomli' ? 'rose' : 'blue'}
          title={
            state.type === 'reject_kakomli'
              ? 'Menyimpan Penolakan ke Cloud Server...'
              : state.type === 'transfer_dudi'
              ? 'Memproses Mutasi DUDI di Cloud Server...'
              : 'Menyimpan Perubahan ke Cloud Server...'
          }
        />
      </div>
    </div>
  );
};
