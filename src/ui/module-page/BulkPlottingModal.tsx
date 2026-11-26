import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Dudi, Guru, PenempatanPKL, Siswa } from '../../core/types/schema';
import { ToastManager } from '../../core/ToastManager';
import { generateNextSequentialId } from '../../core/utils/autoIdHelpers';
import { getOffsetWibIsoDate, getTodayWibIsoDate } from '../../core/utils/dateHelpers';
import { formatNisVisual, stripNisSymbols } from '../../core/utils/nisHelpers';
import {
  getCanonicalNisDigits,
  isActivePlacementStatus,
  normalizeRelationText,
} from '../../core/utils/relationHelpers';
import { DudiService } from '../../services/DudiService';
import { GuruService } from '../../services/GuruService';
import { RelationSyncService } from '../../services/RelationSyncService';
import { SiswaPklService } from '../../services/SiswaPklService';
import { SiswaService } from '../../services/SiswaService';
import { CrudLoadingOverlay, TopProgressBar } from '../CrudProgressFeedback';

interface BulkPlottingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export const BulkPlottingModal: React.FC<BulkPlottingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progressText, setProgressText] = useState('');

  const [dudiList, setDudiList] = useState<Dudi[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [placements, setPlacements] = useState<PenempatanPKL[]>([]);

  const [selectedDudiId, setSelectedDudiId] = useState('');
  const [dudiSearch, setDudiSearch] = useState('');
  const [guruPendamping, setGuruPendamping] = useState('');
  const [tanggalBerangkat, setTanggalBerangkat] = useState(() => getTodayWibIsoDate());
  const [tanggalRencanaTarik, setTanggalRencanaTarik] = useState(() =>
    getOffsetWibIsoDate(120)
  );
  const [statusPenempatan, setStatusPenempatan] = useState<'Terjadwal' | 'Sedang Berjalan'>(
    'Terjadwal'
  );
  const [catatanPenempatan, setCatatanPenempatan] = useState('');

  // Quick-add DUDI inline state
  const [showNewDudiForm, setShowNewDudiForm] = useState(false);
  const [creatingDudi, setCreatingDudi] = useState(false);
  const [newDudiName, setNewDudiName] = useState('');
  const [newDudiAlamat, setNewDudiAlamat] = useState('');
  const [newDudiKota, setNewDudiKota] = useState('Ponorogo');
  const [newDudiKuota, setNewDudiKuota] = useState(4);
  const [newDudiGuru, setNewDudiGuru] = useState('');

  // Student picker filters & selection
  const [studentSearch, setStudentSearch] = useState('');
  const [jurusanFilter, setJurusanFilter] = useState('ALL');
  const [kelasFilter, setKelasFilter] = useState('ALL');
  const [onlyUnplaced, setOnlyUnplaced] = useState(true);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const today = getTodayWibIsoDate();
    setSelectedDudiId('');
    setDudiSearch('');
    setGuruPendamping('');
    setTanggalBerangkat(today);
    setTanggalRencanaTarik(getOffsetWibIsoDate(120, today));
    setStatusPenempatan('Terjadwal');
    setCatatanPenempatan('');
    setShowNewDudiForm(false);
    setNewDudiName('');
    setNewDudiAlamat('');
    setNewDudiKota('Ponorogo');
    setNewDudiKuota(4);
    setNewDudiGuru('');
    setStudentSearch('');
    setJurusanFilter('ALL');
    setKelasFilter('ALL');
    setOnlyUnplaced(true);
    setSelectedStudentIds(new Set());
    setLoadingData(true);

    Promise.all([
      DudiService.getInstance().getAll().catch(() => [] as Dudi[]),
      GuruService.getInstance().getAll().catch(() => [] as Guru[]),
      SiswaService.getInstance().getAll().catch(() => [] as Siswa[]),
      SiswaPklService.getInstance().getAll().catch(() => [] as PenempatanPKL[]),
    ])
      .then(([dudis, gurus, siswas, plts]) => {
        if (!active) return;
        setDudiList(dudis);
        setGuruList(gurus);
        setSiswaList(siswas);
        setPlacements(plts);
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen]);

  const activePlacementByNis = useMemo(() => {
    const map = new Map<string, PenempatanPKL>();
    for (const p of placements) {
      if (!isActivePlacementStatus(p.statusPenempatan)) continue;
      const digits = getCanonicalNisDigits(p.nis);
      if (digits && !map.has(digits)) {
        map.set(digits, p);
      }
    }
    return map;
  }, [placements]);

  const placedOrCompletedNisSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of placements) {
      const st = normalizeRelationText(p.statusPenempatan);
      if (st === 'dibatalkan' || st === 'batal' || st === 'pindah dudi') continue;
      const digits = getCanonicalNisDigits(p.nis);
      if (digits) set.add(digits);
    }
    return set;
  }, [placements]);

  const filteredDudis = useMemo(() => {
    const q = normalizeRelationText(dudiSearch);
    const sorted = [...dudiList].sort((a, b) => a.namaDudi.localeCompare(b.namaDudi));
    if (!q) return sorted;
    return sorted.filter(
      (d) =>
        normalizeRelationText(d.namaDudi).includes(q) ||
        normalizeRelationText(d.wilayahKota).includes(q) ||
        normalizeRelationText(d.guruPendamping).includes(q)
    );
  }, [dudiList, dudiSearch]);

  const selectedDudi = useMemo(
    () => dudiList.find((d) => d.id === selectedDudiId) || null,
    [dudiList, selectedDudiId]
  );

  // Count active placements currently occupying the selected DUDI directly from live placements
  const currentDudiTerisi = useMemo(() => {
    if (!selectedDudi) return 0;
    const dudiNorm = normalizeRelationText(selectedDudi.namaDudi);
    const uniqueNis = new Set<string>();
    for (const p of placements) {
      if (!isActivePlacementStatus(p.statusPenempatan)) continue;
      const matched =
        (selectedDudi.id && p.idDudi === selectedDudi.id) ||
        (dudiNorm && normalizeRelationText(p.namaDudi) === dudiNorm);
      if (matched) {
        uniqueNis.add(getCanonicalNisDigits(p.nis) || p.id);
      }
    }
    return Math.max(uniqueNis.size, Number(selectedDudi.terisi || 0));
  }, [selectedDudi, placements]);

  const jurusanOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of siswaList) {
      const j = String(s.jurusan || '').trim();
      if (j && j !== '-') set.add(j);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [siswaList]);

  const kelasOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of siswaList) {
      if (jurusanFilter !== 'ALL' && String(s.jurusan || '').trim() !== jurusanFilter) {
        continue;
      }
      const k = String(s.kelas || '').trim();
      if (k && k !== '-') set.add(k);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [siswaList, jurusanFilter]);

  const filteredStudents = useMemo(() => {
    const q = normalizeRelationText(studentSearch);
    const qDigits = !/[a-z]/i.test(studentSearch) ? stripNisSymbols(studentSearch) : '';

    return siswaList
      .filter((s) => {
        if (jurusanFilter !== 'ALL' && String(s.jurusan || '').trim() !== jurusanFilter) {
          return false;
        }
        if (kelasFilter !== 'ALL' && String(s.kelas || '').trim() !== kelasFilter) {
          return false;
        }
        const digits = getCanonicalNisDigits(s.nis);
        if (onlyUnplaced && digits && placedOrCompletedNisSet.has(digits)) {
          return false;
        }
        if (q || qDigits) {
          const textHay = `${s.nama} ${s.nis} ${s.kelas} ${s.jurusan}`.toLowerCase();
          const nisDigits = stripNisSymbols(s.nis);
          const matchText = q ? textHay.includes(q) : false;
          const matchDigits = qDigits ? nisDigits.includes(qDigits) : false;
          if (!matchText && !matchDigits) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const kCmp = String(a.kelas || '').localeCompare(String(b.kelas || ''), undefined, {
          numeric: true,
        });
        if (kCmp !== 0) return kCmp;
        return String(a.nama || '').localeCompare(String(b.nama || ''));
      });
  }, [siswaList, jurusanFilter, kelasFilter, onlyUnplaced, placedOrCompletedNisSet, studentSearch]);

  const selectableVisibleStudents = useMemo(
    () =>
      filteredStudents.filter((s) => {
        const digits = getCanonicalNisDigits(s.nis);
        return !(digits && activePlacementByNis.has(digits));
      }),
    [filteredStudents, activePlacementByNis]
  );

  const selectedStudents = useMemo(
    () => siswaList.filter((s) => selectedStudentIds.has(s.id)),
    [siswaList, selectedStudentIds]
  );

  if (!isOpen) return null;

  const handleSelectDudi = (dudiId: string) => {
    setSelectedDudiId(dudiId);
    const dudi = dudiList.find((d) => d.id === dudiId);
    if (dudi?.guruPendamping) {
      setGuruPendamping(dudi.guruPendamping);
    }
  };

  const handleCreateNewDudi = async () => {
    const cleanName = newDudiName.trim();
    const cleanAlamat = newDudiAlamat.trim();
    if (!cleanName || !cleanAlamat) {
      ToastManager.getInstance().show(
        'Data DUDI Belum Lengkap',
        'error',
        'Nama Mitra DUDI dan Alamat wajib diisi.'
      );
      return;
    }

    setCreatingDudi(true);
    try {
      const matchedGuru = guruList.find(
        (g) => normalizeRelationText(g.nama) === normalizeRelationText(newDudiGuru)
      );
      const nextId = generateNextSequentialId('Master_DUDI', dudiList as any);
      const created = await DudiService.getInstance().create(
        {
          id: nextId,
          namaDudi: cleanName,
          bidangKeahlian: '',
          alamat: cleanAlamat,
          wilayahKota: newDudiKota.trim() || 'Ponorogo',
          namaPic: '',
          kontakPic: '',
          kuotaMaksimal: Math.max(1, Number(newDudiKuota) || 4),
          terisi: 0,
          statusKerjasama: 'Mitra Baru',
          idGuruPendamping: matchedGuru?.id || '',
          guruPendamping: matchedGuru?.nama || newDudiGuru.trim(),
        },
        { silentToast: true }
      );
      const updatedDudis = await DudiService.getInstance().getAll().catch(() => dudiList);
      setDudiList(updatedDudis);
      setSelectedDudiId(created.id);
      if (created.guruPendamping) {
        setGuruPendamping(created.guruPendamping);
      }
      setShowNewDudiForm(false);
      setNewDudiName('');
      setNewDudiAlamat('');
      setNewDudiKota('Ponorogo');
      setNewDudiKuota(4);
      setNewDudiGuru('');
      ToastManager.getInstance().show(
        'Mitra DUDI Baru Ditambahkan',
        'success',
        `${created.namaDudi} otomatis terpilih untuk plotting massal.`
      );
    } catch (err: any) {
      ToastManager.getInstance().show(
        'Gagal Menambah DUDI',
        'error',
        err?.message || 'Periksa kembali koneksi Cloud Server.'
      );
    } finally {
      setCreatingDudi(false);
    }
  };

  const toggleStudent = (student: Siswa) => {
    const digits = getCanonicalNisDigits(student.nis);
    if (digits && activePlacementByNis.has(digits)) return;
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(student.id)) next.delete(student.id);
      else next.add(student.id);
      return next;
    });
  };

  const handleToggleAllVisible = () => {
    const allSelected =
      selectableVisibleStudents.length > 0 &&
      selectableVisibleStudents.every((s) => selectedStudentIds.has(s.id));
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const s of selectableVisibleStudents) next.delete(s.id);
      } else {
        for (const s of selectableVisibleStudents) next.add(s.id);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDudi) {
      ToastManager.getInstance().show(
        'Pilih DUDI Tujuan',
        'error',
        'Pilih 1 Mitra DUDI tujuan atau buat DUDI baru terlebih dahulu.'
      );
      return;
    }
    if (!guruPendamping.trim()) {
      ToastManager.getInstance().show(
        'Guru Pendamping Wajib Diisi',
        'error',
        'Pilih Guru Pendamping lapangan sebelum menyimpan plotting.'
      );
      return;
    }
    if (!tanggalBerangkat) {
      ToastManager.getInstance().show(
        'Tanggal Berangkat Kosong',
        'error',
        'Tentukan tanggal keberangkatan siswa PKL.'
      );
      return;
    }
    if (selectedStudents.length === 0) {
      ToastManager.getInstance().show(
        'Belum Ada Siswa Dipilih',
        'error',
        'Centang minimal 1 siswa untuk di-plotting ke DUDI terpilih.'
      );
      return;
    }

    setSubmitting(true);
    setProgressText(`Menyiapkan plotting ${selectedStudents.length} siswa...`);
    const toastId = ToastManager.getInstance().show(
      `Memproses Plotting Massal (${selectedStudents.length} Siswa)...`,
      'pending',
      `Menempatkan siswa ke ${selectedDudi.namaDudi} di Cloud Server`
    );

    try {
      const matchedGuru = guruList.find(
        (g) => normalizeRelationText(g.nama) === normalizeRelationText(guruPendamping)
      );
      const resolvedGuruName = matchedGuru?.nama || guruPendamping.trim();
      const resolvedGuruId = matchedGuru?.id || selectedDudi.idGuruPendamping || '';

      const accumulatedPlts: Array<Record<string, any>> = [...(placements as any[])];
      const newPlacementRows: Partial<PenempatanPKL>[] = [];

      for (const s of selectedStudents) {
        const nextId = generateNextSequentialId('data_plotting', accumulatedPlts);
        const cleanNis = getCanonicalNisDigits(s.nis) || String(s.nis || '').trim();
        const payload: Partial<PenempatanPKL> = {
          id: nextId,
          idPenempatan: nextId,
          nis: cleanNis,
          namaSiswa: s.nama,
          idDudi: selectedDudi.id,
          namaDudi: selectedDudi.namaDudi,
          idGuruPendamping: resolvedGuruId,
          guruPendamping: resolvedGuruName,
          tanggalBerangkat,
          tanggalRencanaTarik: tanggalRencanaTarik || '',
          statusPenempatan,
          catatanPenempatan: catatanPenempatan.trim() || 'Plotting Massal 1-Langkah',
        };
        accumulatedPlts.push(payload);
        newPlacementRows.push(payload);
      }

      setProgressText(`Menyimpan ${newPlacementRows.length} data plotting...`);
      await SiswaPklService.getInstance().importRows(newPlacementRows, {
        silentToast: true,
        onProgress: (done, total) => {
          setProgressText(`Mengirim ${done}/${total} data plotting ke Cloud Server...`);
        },
      });

      setProgressText('Memperbarui status siswa & kuota DUDI...');
      await SiswaService.getInstance()
        .bulkUpdateMany(
          selectedStudents.map((s) => ({
            id: s.id,
            updates: { statusPKL: 'Sedang PKL' as const },
          })),
          { silentToast: true }
        )
        .catch(() => 0);

      await RelationSyncService.getInstance()
        .syncAfterMutation('siswa_pkl', 'import')
        .catch(() => {});

      ToastManager.getInstance().update(
        toastId,
        'Plotting Massal Berhasil Disimpan',
        'success',
        `${selectedStudents.length} siswa resmi terplotting ke ${selectedDudi.namaDudi} (${resolvedGuruName}).`
      );

      await onSuccess();
      onClose();
    } catch (err: any) {
      ToastManager.getInstance().update(
        toastId,
        'Gagal Menyimpan Plotting Massal',
        'error',
        err?.message || 'Periksa kembali koneksi Cloud Server dan coba ulang.'
      );
    } finally {
      setSubmitting(false);
      setProgressText('');
    }
  };

  const kuotaMax = Number(selectedDudi?.kuotaMaksimal || 0);
  const projectedTotal = currentDudiTerisi + selectedStudents.length;
  const isOverQuota = Boolean(selectedDudi && kuotaMax > 0 && projectedTotal > kuotaMax);
  const allVisibleSelected =
    selectableVisibleStudents.length > 0 &&
    selectableVisibleStudents.every((s) => selectedStudentIds.has(s.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/55 backdrop-blur-[2px]"
      onClick={() => !submitting && !creatingDudi && onClose()}
    >
      <div
        className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Plotting Massal Siswa PKL (1-Langkah)
              </h3>
              <p className="text-xs text-slate-500 truncate">
                Pilih 1 Mitra DUDI lalu centang beberapa siswa sekaligus — otomatis memperbarui
                kuota DUDI &amp; status siswa
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={submitting || creatingDudi}
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer shrink-0 disabled:opacity-40"
            aria-label="Tutup modal plotting massal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <TopProgressBar
          active={loadingData || submitting || creatingDudi}
          label={progressText || (loadingData ? 'Memuat data DUDI & Siswa...' : 'Memproses...')}
        />

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-y-auto lg:overflow-hidden">
            {/* Left Column: DUDI, Guru, Schedule */}
            <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/50 p-4 sm:p-5 space-y-4 lg:overflow-y-auto text-xs">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      1. Pilih Mitra DUDI Tujuan <span className="text-rose-500">*</span>
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setShowNewDudiForm((p) => !p)}
                    className="h-7 px-2.5 rounded-md border border-blue-200 bg-white hover:bg-blue-50 text-blue-700 font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{showNewDudiForm ? 'Tutup Form DUDI' : 'Tambah DUDI Baru'}</span>
                  </button>
                </div>

                {showNewDudiForm && (
                  <div className="p-3.5 rounded-xl border border-blue-200 bg-white space-y-2.5">
                    <div className="font-bold text-slate-900 text-xs">
                      Pendaftaran Cepat Mitra DUDI Baru
                    </div>
                    <input
                      type="text"
                      value={newDudiName}
                      onChange={(e) => setNewDudiName(e.target.value)}
                      placeholder="Nama Perusahaan / Bengkel / Instansi *"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                    <input
                      type="text"
                      value={newDudiAlamat}
                      onChange={(e) => setNewDudiAlamat(e.target.value)}
                      placeholder="Alamat Lengkap DUDI *"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newDudiKota}
                        onChange={(e) => setNewDudiKota(e.target.value)}
                        placeholder="Wilayah / Kota"
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                      <input
                        type="number"
                        min={1}
                        value={newDudiKuota}
                        onChange={(e) => setNewDudiKuota(Number(e.target.value) || 4)}
                        placeholder="Kuota Max"
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <select
                      value={newDudiGuru}
                      onChange={(e) => setNewDudiGuru(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    >
                      <option value="">-- Guru Pendamping Default (Opsional) --</option>
                      {guruList.map((g) => (
                        <option key={g.id} value={g.nama}>
                          {g.nama} ({g.peranUtama})
                        </option>
                      ))}
                    </select>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        disabled={creatingDudi}
                        onClick={() => setShowNewDudiForm(false)}
                        className="h-8 px-3 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={creatingDudi}
                        onClick={handleCreateNewDudi}
                        className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {creatingDudi && <Loader2 className="w-3 h-3 animate-spin" />}
                        <span>Simpan DUDI &amp; Pilih</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={dudiSearch}
                    onChange={(e) => setDudiSearch(e.target.value)}
                    placeholder="Filter daftar DUDI (nama/kota/pembimbing)..."
                    className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  />
                </div>

                <select
                  required
                  value={selectedDudiId}
                  onChange={(e) => handleSelectDudi(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                >
                  <option value="">-- Pilih Mitra DUDI ({filteredDudis.length} tersedia) --</option>
                  {filteredDudis.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.namaDudi}
                      {d.wilayahKota ? ` · ${d.wilayahKota}` : ''} ({d.terisi ?? 0}/
                      {d.kuotaMaksimal ?? 0})
                    </option>
                  ))}
                </select>

                {/* Quota Summary Card */}
                {selectedDudi && (
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                      isOverQuota
                        ? 'bg-amber-50 border-amber-200 text-amber-950'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="truncate">{selectedDudi.namaDudi}</span>
                      <span className="tabular-nums shrink-0">
                        Kuota: {projectedTotal}/{kuotaMax || '∞'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {selectedDudi.alamat || '-'}
                      {selectedDudi.wilayahKota ? `, ${selectedDudi.wilayahKota}` : ''}
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200/70 text-[11px] tabular-nums">
                      <div>
                        <span className="text-slate-500 block">Terisi Saat Ini</span>
                        <span className="font-bold text-slate-900">{currentDudiTerisi}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Dipilih Baru</span>
                        <span className="font-bold text-emerald-700">+{selectedStudents.length}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Total Proyeksi</span>
                        <span
                          className={`font-bold ${
                            isOverQuota ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {projectedTotal}
                        </span>
                      </div>
                    </div>
                    {isOverQuota && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-800 pt-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>
                          Melebihi kuota awal ({kuotaMax} siswa). Tetap dapat disimpan bila sudah
                          dikonfirmasi dengan DUDI.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1.5">
                  2. Guru Pendamping Lapangan <span className="text-rose-500">*</span>
                </label>
                {guruList.length > 0 ? (
                  <select
                    required
                    value={guruPendamping}
                    onChange={(e) => setGuruPendamping(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  >
                    <option value="">-- Pilih Guru Pendamping --</option>
                    {guruList.map((g) => (
                      <option key={g.id} value={g.nama}>
                        {g.nama} ({g.peranUtama || 'Guru Pendamping'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={guruPendamping}
                    onChange={(e) => setGuruPendamping(e.target.value)}
                    placeholder="Ketik nama Guru Pendamping..."
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm"
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Tanggal Berangkat <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggalBerangkat}
                    onChange={(e) => setTanggalBerangkat(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Tanggal Rencana Tarik
                  </label>
                  <input
                    type="date"
                    value={tanggalRencanaTarik}
                    onChange={(e) => setTanggalRencanaTarik(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Status Penempatan
                  </label>
                  <select
                    value={statusPenempatan}
                    onChange={(e) =>
                      setStatusPenempatan(e.target.value as 'Terjadwal' | 'Sedang Berjalan')
                    }
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="Terjadwal">Terjadwal</option>
                    <option value="Sedang Berjalan">Sedang Berjalan</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1.5">
                    Catatan Batch (Opsional)
                  </label>
                  <input
                    type="text"
                    value={catatanPenempatan}
                    onChange={(e) => setCatatanPenempatan(e.target.value)}
                    placeholder="Gelombang 1 / Keterangan"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Student Multi-Select */}
            <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col min-h-[360px] lg:min-h-0 overflow-hidden text-xs">
              <div className="space-y-2.5 shrink-0 pb-3 border-b border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-800">
                    3. Centang Siswa untuk Ditempatkan
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none text-slate-700 font-semibold">
                    <input
                      type="checkbox"
                      checked={onlyUnplaced}
                      onChange={(e) => setOnlyUnplaced(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>Hanya Belum Terplotting</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="relative sm:col-span-5">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Cari NIS atau Nama Siswa..."
                      className="w-full h-9 pl-8 pr-7 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                    {studentSearch && (
                      <button
                        type="button"
                        onClick={() => setStudentSearch('')}
                        className="w-6 h-6 rounded text-slate-400 hover:text-slate-700 absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <select
                    value={jurusanFilter}
                    onChange={(e) => {
                      setJurusanFilter(e.target.value);
                      setKelasFilter('ALL');
                    }}
                    className="sm:col-span-4 h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="ALL">Semua Jurusan</option>
                    {jurusanOptions.map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>

                  <select
                    value={kelasFilter}
                    onChange={(e) => setKelasFilter(e.target.value)}
                    className="sm:col-span-3 h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="ALL">Semua Kelas</option>
                    {kelasOptions.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    disabled={selectableVisibleStudents.length === 0}
                    onClick={handleToggleAllVisible}
                    className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      {allVisibleSelected
                        ? `Batal Pilih Tampil (${selectableVisibleStudents.length})`
                        : `Pilih Semua Tampil (${selectableVisibleStudents.length})`}
                    </span>
                  </button>
                  <div className="text-slate-600 font-semibold tabular-nums">
                    Ditampilkan: {filteredStudents.length} · Dipilih:{' '}
                    <span className="text-emerald-700 font-bold">{selectedStudents.length}</span>
                  </div>
                </div>
              </div>

              {/* Scrollable checklist */}
              <div className="mt-3 flex-1 min-h-[220px] max-h-[340px] lg:max-h-none border border-slate-200 rounded-xl overflow-y-auto divide-y divide-slate-100 bg-white">
                {loadingData ? (
                  <div className="p-8 text-center text-slate-500">
                    Memuat daftar siswa &amp; penempatan...
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    Tidak ada siswa yang sesuai filter saat ini.
                  </div>
                ) : (
                  filteredStudents.map((stu) => {
                    const digits = getCanonicalNisDigits(stu.nis);
                    const existingPlt = digits ? activePlacementByNis.get(digits) : undefined;
                    const isChecked = selectedStudentIds.has(stu.id);
                    const isBlocked = Boolean(existingPlt);

                    return (
                      <label
                        key={stu.id}
                        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors ${
                          isBlocked
                            ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
                            : isChecked
                            ? 'bg-emerald-50/70 hover:bg-emerald-50 cursor-pointer'
                            : 'hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            disabled={isBlocked}
                            checked={isChecked}
                            onChange={() => toggleStudent(stu)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{stu.nama}</div>
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2">
                              <span className="font-mono tabular-nums">
                                {formatNisVisual(stu.nis)}
                              </span>
                              <span>·</span>
                              <span>{stu.kelas || '-'}</span>
                              <span>·</span>
                              <span className="truncate">{stu.jurusan || '-'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {existingPlt ? (
                            <span className="text-[11px] font-medium text-amber-700">
                              Aktif: {existingPlt.namaDudi}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {stu.statusPKL || 'Belum Daftar'}
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
            <div className="text-slate-600 tabular-nums">
              {selectedDudi ? (
                <span>
                  Target: <b className="text-slate-900">{selectedDudi.namaDudi}</b> ·{' '}
                  <b className="text-emerald-700">{selectedStudents.length} siswa</b> siap
                  diplotting
                </span>
              ) : (
                <span>Pilih 1 DUDI &amp; centang siswa yang akan diberangkatkan</span>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                disabled={submitting}
                onClick={onClose}
                className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting || !selectedDudi || selectedStudents.length === 0}
                className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 tabular-nums"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {submitting
                    ? 'Menyimpan Plotting...'
                    : `Simpan Plotting Massal (${selectedStudents.length} Siswa)`}
                </span>
              </button>
            </div>
          </div>
        </form>

        <CrudLoadingOverlay
          visible={submitting}
          tone="emerald"
          title="Menyimpan Plotting Massal ke Cloud Server..."
          subtitle={progressText || 'Memperbarui data_plotting dan status Master Siswa...'}
        />
      </div>
    </div>
  );
};
