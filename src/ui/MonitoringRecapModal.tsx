import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  BarChart3,
  Copy,
  Printer,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Users,
  Award,
  Loader2,
} from 'lucide-react';
import {
  DEFAULT_MONITORING_STAGE_CONTROL,
  Jurusan,
  Monitoring,
  MonitoringStageControl,
  PenempatanPKL,
  Sertifikat,
  Siswa,
  MONITORING_STAGES,
} from '../core/types/schema';
import { JurusanService } from '../services/JurusanService';
import { SiswaPklService } from '../services/SiswaPklService';
import { SiswaService } from '../services/SiswaService';
import { MonitoringService } from '../services/MonitoringService';
import { SertifikatService } from '../services/SertifikatService';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { ToastManager } from '../core/ToastManager';
import { formatPhoneDisplay, normalizeWhatsAppNumber } from '../core/utils/autoIdHelpers';
import { formatIndonesianDate, getTodayWibIsoDate } from '../core/utils/dateHelpers';
import {
  buildStudentMonitoringSummary,
  getStageValueByNumber,
  resolveMonitoringStagePolicy,
} from '../core/utils/monitoringHelpers';
import { formatNisVisual, stripNisSymbols } from '../core/utils/nisHelpers';
import { PrintPortal } from './PrintPortal';
import { CrudLoadingOverlay, TopProgressBar } from './CrudProgressFeedback';

interface MonitoringRecapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StudentRecapRow {
  nis: string;
  namaSiswa: string;
  kelas: string;
  jurusan: string;
  namaDudi: string;
  guruPendamping: string;
  completedStages: number[];
  highestStage: number;
  hasGrade: boolean;
  rataRataNilai: number | null;
  sakit: number;
  izin: number;
  alpha: number;
}

function matchJurusanCode(rawJurusan: string, jur: Jurusan): boolean {
  const target = String(rawJurusan || '').trim().toLowerCase();
  if (!target) return false;
  const kode = String(jur.kode || '').trim().toLowerCase();
  const nama = String(jur.nama || '').trim().toLowerCase();
  return (
    target === kode ||
    target === nama ||
    (kode.length >= 2 && (target.startsWith(`${kode} `) || target.includes(`(${kode})`) || target.includes(kode))) ||
    (nama.length >= 4 && (target.includes(nama) || nama.includes(target)))
  );
}

export const MonitoringRecapModal: React.FC<MonitoringRecapModalProps> = ({
  isOpen,
  onClose,
}) => {
  const activeYear = GoogleSheetClient.getInstance().getActiveYear();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jurusanList, setJurusanList] = useState<Jurusan[]>([]);
  const [penempatanList, setPenempatanList] = useState<PenempatanPKL[]>([]);
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [monitoringList, setMonitoringList] = useState<Monitoring[]>([]);
  const [sertifikatList, setSertifikatList] = useState<Sertifikat[]>([]);
  const [stageControl, setStageControl] = useState<MonitoringStageControl>(() =>
    GoogleSheetClient.getInstance().getMonitoringStageControl() || DEFAULT_MONITORING_STAGE_CONTROL
  );

  const [selectedJurusanKey, setSelectedJurusanKey] = useState<string>('');
  const [kakomliWaOverride, setKakomliWaOverride] = useState<string>('');
  const [customMessage, setCustomMessage] = useState<string>('');

  const loadAllData = async (forceReload = false) => {
    setLoading(true);
    setError('');
    try {
      await GoogleSheetClient.getInstance().initFromFirestore().catch(() => {});
      setStageControl(GoogleSheetClient.getInstance().getMonitoringStageControl());

      const jSvc = JurusanService.getInstance();
      const pSvc = SiswaPklService.getInstance();
      const sSvc = SiswaService.getInstance();
      const mSvc = MonitoringService.getInstance();
      const cSvc = SertifikatService.getInstance();

      if (forceReload) {
        await Promise.all([
          jSvc.reloadFromSpreadsheet(),
          pSvc.reloadFromSpreadsheet(),
          sSvc.reloadFromSpreadsheet(),
          mSvc.reloadFromSpreadsheet(),
          cSvc.reloadFromSpreadsheet(),
        ]);
      }

      const [jRows, pRows, sRows, mRows, cRows] = await Promise.all([
        jSvc.getAll(),
        pSvc.getAll(),
        sSvc.getAll(),
        mSvc.getAll(),
        cSvc.getAll(),
      ]);

      setJurusanList(jRows);
      setPenempatanList(pRows);
      setSiswaList(sRows);
      setMonitoringList(mRows);
      setSertifikatList(cRows);

      if (jRows.length > 0) {
        setSelectedJurusanKey((prev) =>
          jRows.some((j) => j.kode === prev || j.id === prev) ? prev : jRows[0].kode || jRows[0].id
        );
      }
    } catch (e: any) {
      setError(e?.message || 'Gagal memuat data rekap monitoring dari Cloud Server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAllData(false);
    }
  }, [isOpen]);

  const selectedJurusan = useMemo(() => {
    return (
      jurusanList.find((j) => j.kode === selectedJurusanKey || j.id === selectedJurusanKey) ||
      jurusanList[0] ||
      null
    );
  }, [jurusanList, selectedJurusanKey]);

  const jurusanPolicy = useMemo(
    () =>
      resolveMonitoringStagePolicy(
        stageControl,
        selectedJurusan?.kode || selectedJurusan?.nama,
        jurusanList
      ),
    [stageControl, selectedJurusan, jurusanList]
  );

  const activeStages = useMemo(
    () => MONITORING_STAGES.filter((st) => jurusanPolicy.enabledStages.includes(st.num)),
    [jurusanPolicy]
  );

  const lastEnabledStageNum =
    jurusanPolicy.enabledStages[jurusanPolicy.enabledStages.length - 1] ?? 8;
  const lastStageLabel = getStageValueByNumber(lastEnabledStageNum);

  // Build student monitoring recap rows mapped to Jurusan
  const recapData = useMemo(() => {
    const siswaByNis = new Map<string, Siswa>();
    for (const s of siswaList) {
      const clean = stripNisSymbols(s.nis);
      if (clean) siswaByNis.set(clean, s);
      if (s.nis) siswaByNis.set(s.nis.trim(), s);
    }

    const activePlacements = penempatanList.filter(
      (p) => p.statusPenempatan !== 'Dibatalkan'
    );

    const allStudentRecaps: StudentRecapRow[] = activePlacements.map((p) => {
      const cleanNis = stripNisSymbols(p.nis);
      const matchedSiswa =
        (cleanNis && siswaByNis.get(cleanNis)) || siswaByNis.get(String(p.nis || '').trim());
      const matchedMon = monitoringList.find(
        (m) =>
          (cleanNis && stripNisSymbols(m.nis || '') === cleanNis) ||
          (p.idPenempatan && m.idPenempatan === p.idPenempatan)
      );
      const resolvedJurusan = matchedSiswa?.jurusan || matchedMon?.jurusan || '-';
      const resolvedKelas = matchedSiswa?.kelas || '-';

      const summary = buildStudentMonitoringSummary(
        {
          nis: p.nis,
          nama: p.namaSiswa,
          idPenempatan: p.idPenempatan,
          dudi_name: p.namaDudi,
        },
        monitoringList,
        sertifikatList
      );

      let sakit = 0;
      let izin = 0;
      let alpha = 0;
      Object.values(summary.stageLogs).forEach((log) => {
        sakit += Number(log.sakit || 0);
        izin += Number(log.izin || 0);
        alpha += Number(log.alpha || 0);
      });

      const highestStage =
        summary.completedStages.length > 0
          ? summary.completedStages[summary.completedStages.length - 1]
          : 0;

      return {
        nis: p.nis,
        namaSiswa: p.namaSiswa,
        kelas: resolvedKelas,
        jurusan: resolvedJurusan,
        namaDudi: p.namaDudi,
        guruPendamping: p.guruPendamping || '-',
        completedStages: summary.completedStages,
        highestStage,
        hasGrade: summary.hasSubmittedGrades,
        rataRataNilai: summary.submittedGradeSummary?.rataRata ?? null,
        sakit,
        izin,
        alpha,
      };
    });

    const filteredRows = selectedJurusan
      ? allStudentRecaps.filter((r) => matchJurusanCode(r.jurusan, selectedJurusan))
      : allStudentRecaps;

    const enabledSet = new Set(jurusanPolicy.enabledStages);
    const stageCounts: Record<number, number> = {};
    for (const st of activeStages) {
      stageCounts[st.num] = filteredRows.filter((r) =>
        r.completedStages.includes(st.num)
      ).length;
    }

    const totalSakit = filteredRows.reduce((acc, r) => acc + r.sakit, 0);
    const totalIzin = filteredRows.reduce((acc, r) => acc + r.izin, 0);
    const totalAlpha = filteredRows.reduce((acc, r) => acc + r.alpha, 0);
    const gradesSubmittedCount = filteredRows.filter((r) => r.hasGrade).length;
    const finishedAllCount = filteredRows.filter((r) =>
      jurusanPolicy.enabledStages.every((n) => r.completedStages.includes(n))
    ).length;
    const uniqueDudiCount = new Set(
      filteredRows.map((r) => r.namaDudi.trim().toLowerCase()).filter(Boolean)
    ).size;

    const incompleteRows = filteredRows
      .filter((r) => !jurusanPolicy.enabledStages.every((n) => r.completedStages.includes(n)))
      .sort(
        (a, b) =>
          a.completedStages.filter((n) => enabledSet.has(n)).length -
          b.completedStages.filter((n) => enabledSet.has(n)).length
      );

    return {
      rows: filteredRows,
      stageCounts,
      totalSakit,
      totalIzin,
      totalAlpha,
      gradesSubmittedCount,
      finishedAllCount,
      uniqueDudiCount,
      incompleteRows,
    };
  }, [penempatanList, siswaList, monitoringList, sertifikatList, selectedJurusan, jurusanPolicy, activeStages]);

  useEffect(() => {
    setKakomliWaOverride(selectedJurusan?.kontakWA || '');
  }, [selectedJurusan]);

  useEffect(() => {
    if (!selectedJurusan) {
      setCustomMessage('');
      return;
    }
    const tglLabel = formatIndonesianDate(getTodayWibIsoDate());
    const stageLines = activeStages
      .map((st) => `  • ${st.value}: ${recapData.stageCounts[st.num] || 0}/${recapData.rows.length} siswa`)
      .join('\n');

    const topIncomplete = recapData.incompleteRows
      .slice(0, 8)
      .map((r, i) => {
        const doneCount = r.completedStages.filter((n) =>
          jurusanPolicy.enabledStages.includes(n)
        ).length;
        const nextNum =
          jurusanPolicy.enabledStages.find((n) => !r.completedStages.includes(n)) ??
          lastEnabledStageNum;
        return `  ${i + 1}. ${r.namaSiswa} (${r.namaDudi}) — Selesai ${doneCount}/${jurusanPolicy.totalStages}, lanjut ${getStageValueByNumber(nextNum)}`;
      })
      .join('\n');

    const msg = [
      `Yth. Bapak/Ibu ${selectedJurusan.namaKakomli || 'Ketua Kompetensi Keahlian'}`,
      `Ketua Kompetensi Keahlian ${selectedJurusan.nama} (${selectedJurusan.kode})`,
      'SMK PGRI 2 Ponorogo',
      '',
      'Dengan hormat,',
      `Berikut kami sampaikan Rekap Monitoring PKL Jurusan *${selectedJurusan.kode} - ${selectedJurusan.nama}* Tahun Ajaran ${activeYear} per ${tglLabel}:`,
      '',
      `• Total Siswa PKL Aktif: ${recapData.rows.length} siswa (${recapData.uniqueDudiCount} DUDI)`,
      `• Nilai DUDI Terkumpul: ${recapData.gradesSubmittedCount}/${recapData.rows.length} siswa`,
      `• Selesai ${jurusanPolicy.totalStages} Tahap (${lastStageLabel}): ${recapData.finishedAllCount}/${recapData.rows.length} siswa`,
      `• Akumulasi Absensi: Sakit=${recapData.totalSakit} | Izin=${recapData.totalIzin} | Alpha=${recapData.totalAlpha}`,
      '',
      `*Progres ${jurusanPolicy.totalStages} Tahap Monitoring:*`,
      stageLines,
      ...(recapData.incompleteRows.length > 0
        ? [
            '',
            `*Daftar Belum Selesai ${lastStageLabel} (${recapData.incompleteRows.length} siswa):*`,
            topIncomplete,
            ...(recapData.incompleteRows.length > 8
              ? [`  ...dan ${recapData.incompleteRows.length - 8} siswa lainnya.`]
              : []),
          ]
        : [
            '',
            `Seluruh siswa pada jurusan ini telah menyelesaikan seluruh ${jurusanPolicy.totalStages} tahap PKL.`,
          ]),
      '',
      'Mohon koordinasinya bersama Guru Pendamping terkait. Terima kasih.',
      'Pokja Hubin SMK PGRI 2 Ponorogo',
    ].join('\n');

    setCustomMessage(msg);
  }, [selectedJurusan, recapData, activeYear, activeStages, jurusanPolicy, lastEnabledStageNum, lastStageLabel]);

  if (!isOpen) return null;

  const waDigits = normalizeWhatsAppNumber(kakomliWaOverride);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(customMessage);
      ToastManager.getInstance().show(
        'Laporan Rekap Disalin',
        'success',
        `Rekap monitoring jurusan ${selectedJurusan?.kode || ''} siap ditempel.`
      );
    } catch {
      ToastManager.getInstance().show(
        'Gagal Menyalin Otomatis',
        'info',
        'Silakan blok teks laporan dan tekan Ctrl+C.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/55 backdrop-blur-[2px] no-print"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Rekap Monitoring Per Jurusan &amp; Info ke Kakomli
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Tahun Ajaran {activeYear} · Progres {jurusanPolicy.totalStages} Tahap, Absensi S/I/A &amp; Pengumpulan Nilai
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadAllData(true)}
              disabled={loading}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
              <span>{loading ? 'Memuat...' : 'Segarkan'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup modal rekap monitoring"
              className="w-9 h-9 rounded-lg hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <TopProgressBar
          active={loading}
          label="Memuat rekap monitoring dari Cloud Server"
        />

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Jurusan Picker & Kakomli Target */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/70">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Pilih Kompetensi Keahlian (Jurusan)
              </label>
              <select
                value={selectedJurusanKey}
                onChange={(e) => setSelectedJurusanKey(e.target.value)}
                disabled={loading || jurusanList.length === 0}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                {jurusanList.length === 0 ? (
                  <option value="">-- Memuat Jurusan --</option>
                ) : (
                  jurusanList.map((j) => (
                    <option key={j.id} value={j.kode || j.id}>
                      {j.kode} — {j.nama} (Kakomli: {j.namaKakomli || '-'})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Nomor WhatsApp Kakomli ({selectedJurusan?.namaKakomli || 'Ketua Jurusan'})
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={kakomliWaOverride}
                onChange={(e) => setKakomliWaOverride(e.target.value)}
                placeholder="08xxxxxxxxxx (Otomatis dari Master Jurusan)"
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
              {waDigits ? (
                <p className="text-[11px] text-emerald-700 mt-1 font-mono">
                  Terhubung ke wa.me/{waDigits} ({formatPhoneDisplay(kakomliWaOverride)})
                </p>
              ) : (
                <p className="text-[11px] text-amber-700 mt-1">
                  Kontak WA Kakomli kosong di Master Jurusan — silakan isi manual untuk kirim WA.
                </p>
              )}
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span>Menghitung rekap monitoring dari Cloud Server...</span>
            </div>
          ) : (
            <>
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Siswa PKL Aktif</span>
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                    {recapData.rows.length}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {recapData.uniqueDudiCount} Lokasi DUDI
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Nilai Terkumpul</span>
                    <Award className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-emerald-700 mt-1 tabular-nums">
                    {recapData.gradesSubmittedCount}/{recapData.rows.length}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Tahap {getStageValueByNumber(jurusanPolicy.gradeStage)}+
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Tuntas {jurusanPolicy.totalStages} Tahap</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                    {recapData.finishedAllCount}/{recapData.rows.length}
                  </div>
                  <div className="text-[11px] text-slate-500">Sampai {lastStageLabel}</div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                  <div className="text-[11px] text-slate-500">Akumulasi S / I / A</div>
                  <div className="text-base font-bold font-mono text-slate-900 mt-1.5 tabular-nums">
                    {recapData.totalSakit} / {recapData.totalIzin} / {recapData.totalAlpha}
                  </div>
                  <div className="text-[11px] text-slate-500">Hari Tidak Hadir</div>
                </div>
              </div>

              {/* Dynamic Stage Progress Breakdown */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Progres Per Tahap Monitoring ({jurusanPolicy.totalStages} Tahap)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {activeStages.map((st) => {
                    const done = recapData.stageCounts[st.num] || 0;
                    const total = recapData.rows.length;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    return (
                      <div
                        key={st.num}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <span className="font-semibold text-slate-800 truncate">{st.label}</span>
                          <span className="font-mono font-bold text-blue-700 tabular-nums shrink-0">
                            {done}/{total}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Student Monitoring Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-800">
                    Rincian Siswa Jurusan {selectedJurusan?.kode || ''} ({recapData.rows.length})
                  </span>
                  <span className="text-[11px] text-slate-500 tabular-nums">
                    Belum Selesai {lastStageLabel}: {recapData.incompleteRows.length}
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[11px] text-slate-600">
                      <tr>
                        <th className="py-2 px-3">Siswa &amp; NIS</th>
                        <th className="py-2 px-3">DUDI / Pendamping</th>
                        <th className="py-2 px-3 text-center">Tahap</th>
                        <th className="py-2 px-3 text-center">S/I/A</th>
                        <th className="py-2 px-3 text-center">Nilai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recapData.rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400">
                            Belum ada siswa aktif terplot untuk jurusan ini.
                          </td>
                        </tr>
                      ) : (
                        recapData.rows.map((r, idx) => (
                          <tr key={`${r.nis}_${idx}`} className="hover:bg-slate-50/70">
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-900">{r.namaSiswa}</div>
                              <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                                {formatNisVisual(r.nis)} · {r.kelas}
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-medium text-slate-800">{r.namaDudi}</div>
                              <div className="text-[11px] text-slate-500">
                                Pembimbing: {r.guruPendamping}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-semibold text-blue-700 tabular-nums">
                              {r.completedStages.filter((n) => jurusanPolicy.enabledStages.includes(n)).length}/{jurusanPolicy.totalStages}
                            </td>
                            <td className="py-2 px-3 text-center font-mono text-slate-700 tabular-nums">
                              {r.sakit}/{r.izin}/{r.alpha}
                            </td>
                            <td className="py-2 px-3 text-center font-mono font-bold tabular-nums">
                              {r.hasGrade ? (
                                <span className="text-emerald-700">{r.rataRataNilai ?? 'Ada'}</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Editable WA Report Message */}
              <div>
                <label className="block font-bold text-slate-800 mb-1.5">
                  Pratinjau Pesan Laporan untuk Kakomli (Dapat Diedit)
                </label>
                <textarea
                  rows={8}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCopyMessage}
              disabled={!customMessage}
              className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin Laporan</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={loading || !selectedJurusan}
              className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Rekap</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
            >
              Tutup
            </button>

            {waDigits ? (
              <a
                href={`https://wa.me/${waDigits}?text=${encodeURIComponent(customMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  ToastManager.getInstance().show(
                    'Membuka WhatsApp Kakomli',
                    'success',
                    `Mengirim rekap monitoring jurusan ${selectedJurusan?.kode || ''} ke ${selectedJurusan?.namaKakomli || 'Kakomli'}.`
                  );
                }}
                className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Kirim WhatsApp ke Kakomli</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() =>
                  ToastManager.getInstance().show(
                    'Nomor WA Kakomli Kosong',
                    'error',
                    'Isi nomor WhatsApp Kakomli di atas terlebih dahulu.'
                  )
                }
                className="h-9 px-4 rounded-lg bg-slate-300 text-slate-600 font-semibold inline-flex items-center gap-1.5 cursor-not-allowed whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Isi No. WA Kakomli</span>
              </button>
            )}
          </div>
        </div>

        <CrudLoadingOverlay
          visible={loading && jurusanList.length > 0}
          title="Menyegarkan Rekap Monitoring dari Cloud Server..."
          subtitle="Mohon tunggu sejenak sementara data terbaru disinkronkan."
        />
      </div>

      {/* Print Portal for clean printed recap sheet */}
      {selectedJurusan && (
        <PrintPortal paperSize="A4">
          <div className="print-sheet font-serif text-slate-900 leading-relaxed text-xs space-y-4">
            <div className="border-b-2 border-black pb-2.5 text-center">
              <div className="text-[11px] font-sans font-bold tracking-widest uppercase">
                SMK PGRI 2 PONOROGO — POKJA HUBUNGAN INDUSTRI
              </div>
              <div className="text-base font-bold uppercase mt-0.5 font-sans">
                REKAPITULASI MONITORING PKL PER KOMPETENSI KEAHLIAN
              </div>
              <div className="text-[11px] font-sans text-slate-700">
                Jurusan: {selectedJurusan.kode} — {selectedJurusan.nama} · Tahun Ajaran {activeYear} · Tanggal Cetak: {formatIndonesianDate(getTodayWibIsoDate())}
              </div>
            </div>

            <div className="font-sans text-xs grid grid-cols-2 gap-2 bg-slate-50 border border-slate-300 p-2.5">
              <div><b>Kakomli:</b> {selectedJurusan.namaKakomli || '-'}</div>
              <div><b>Total Siswa PKL:</b> {recapData.rows.length} Siswa ({recapData.uniqueDudiCount} DUDI)</div>
              <div><b>Nilai DUDI Terinput:</b> {recapData.gradesSubmittedCount}/{recapData.rows.length} Siswa</div>
              <div><b>Akumulasi S / I / A:</b> {recapData.totalSakit} / {recapData.totalIzin} / {recapData.totalAlpha} Hari</div>
            </div>

            <table className="w-full text-[11px] font-sans border border-slate-400 border-collapse">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border border-slate-400 p-1.5 w-7 text-center">No</th>
                  <th className="border border-slate-400 p-1.5 text-left">NIS</th>
                  <th className="border border-slate-400 p-1.5 text-left">Nama Siswa</th>
                  <th className="border border-slate-400 p-1.5 text-left">Lokasi DUDI</th>
                  <th className="border border-slate-400 p-1.5 text-left">Guru Pendamping</th>
                  <th className="border border-slate-400 p-1.5 text-center">Tahap</th>
                  <th className="border border-slate-400 p-1.5 text-center">S/I/A</th>
                  <th className="border border-slate-400 p-1.5 text-center">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {recapData.rows.map((r, i) => (
                  <tr key={`${r.nis}_prt_${i}`}>
                    <td className="border border-slate-400 p-1.5 text-center">{i + 1}</td>
                    <td className="border border-slate-400 p-1.5 font-mono">{formatNisVisual(r.nis)}</td>
                    <td className="border border-slate-400 p-1.5 font-semibold">{r.namaSiswa}</td>
                    <td className="border border-slate-400 p-1.5">{r.namaDudi}</td>
                    <td className="border border-slate-400 p-1.5">{r.guruPendamping}</td>
                    <td className="border border-slate-400 p-1.5 text-center font-mono">
                      {r.completedStages.filter((n) => jurusanPolicy.enabledStages.includes(n)).length}/{jurusanPolicy.totalStages}
                    </td>
                    <td className="border border-slate-400 p-1.5 text-center font-mono">{r.sakit}/{r.izin}/{r.alpha}</td>
                    <td className="border border-slate-400 p-1.5 text-center font-mono">{r.rataRataNilai ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-between pt-6 font-sans text-xs print-avoid-break">
              <div className="text-center">
                <div>Mengetahui,</div>
                <div className="font-semibold">Ketua Kompetensi Keahlian {selectedJurusan.kode}</div>
                <div className="h-14" />
                <div className="font-bold underline">{selectedJurusan.namaKakomli || '......................................'}</div>
              </div>
              <div className="text-center">
                <div>Ponorogo, {formatIndonesianDate(getTodayWibIsoDate())}</div>
                <div className="font-semibold">Ketua Pokja Hubin,</div>
                <div className="h-14" />
                <div className="font-bold underline">......................................</div>
              </div>
            </div>
          </div>
        </PrintPortal>
      )}
    </div>
  );
};
