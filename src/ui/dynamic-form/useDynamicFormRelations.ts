import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FieldConfig } from '../../core/types/metadata';
import { Dudi, Guru, Jurusan, Kelas, PenempatanPKL, Pengajuan, Siswa } from '../../core/types/schema';
import { DudiService } from '../../services/DudiService';
import { GuruService } from '../../services/GuruService';
import { JurusanService } from '../../services/JurusanService';
import { KelasService } from '../../services/KelasService';
import { PengajuanService } from '../../services/PengajuanService';
import { SiswaPklService } from '../../services/SiswaPklService';
import { SiswaService } from '../../services/SiswaService';
import { stripStructuredTagsFromNote } from '../../core/utils/monitoringHelpers';
import { getTodayWibIsoDate, normalizeToIsoDate } from '../../core/utils/dateHelpers';
import { formatNisVisual, stripNisSymbols } from '../../core/utils/nisHelpers';
import { getCanonicalNisDigits } from '../../core/utils/relationHelpers';
import {
  generateJurusanCode,
  generateNextSequentialId,
  generateNextSuratPermohonan,
} from '../../core/utils/autoIdHelpers';
import { resolveSheetNameByModuleId } from '../../core/constants/sheetResourceMap';

export interface StudentDirectoryEntry {
  nis: string;
  nama: string;
  jurusan: string;
  kelas: string;
  namaOrtuWali: string;
  noOrtuWali: string;
  noWa: string;
  _searchNorm?: string;
  _namaNorm?: string;
  _nisNorm?: string;
  _nisDigits?: string;
  pengajuan?: Pengajuan;
  penempatan?: PenempatanPKL;
  existingPerizinan?: Record<string, any>;
}

export function normFormValue(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function cleanPlaceholderDash(v: unknown): string {
  const s = String(v ?? '').trim();
  return s === '-' ? '' : s;
}

interface UseDynamicFormRelationsParams<T> {
  isOpen: boolean;
  moduleId?: string;
  tableName?: string;
  formFields: FieldConfig<T>[];
  formFieldKeys: Set<string>;
  initialData: Partial<T>;
  existingRows: T[];
  values: Record<string, any>;
  setValue: (key: string, value: any) => void;
  setMultipleValues: (patch: Record<string, any>) => void;
  resetForm: (seed: Partial<T>) => void;
  openAutocompleteKey: string | null;
  setOpenAutocompleteKey: (key: string | null) => void;
  onResetLocalUi: () => void;
}

export function useDynamicFormRelations<T extends Record<string, any>>({
  isOpen,
  moduleId,
  tableName,
  formFields,
  formFieldKeys,
  initialData,
  existingRows,
  values,
  setValue,
  setMultipleValues,
  resetForm,
  openAutocompleteKey,
  setOpenAutocompleteKey,
  onResetLocalUi,
}: UseDynamicFormRelationsParams<T>) {
  const resolvedTableName = useMemo(
    () => tableName || resolveSheetNameByModuleId(moduleId),
    [moduleId, tableName]
  );

  const [masterJurusan, setMasterJurusan] = useState<Jurusan[]>([]);
  const [masterKelas, setMasterKelas] = useState<Kelas[]>([]);
  const [masterDudi, setMasterDudi] = useState<Dudi[]>([]);
  const [masterGuru, setMasterGuru] = useState<Guru[]>([]);
  const [masterSiswa, setMasterSiswa] = useState<Siswa[]>([]);
  const [masterPengajuan, setMasterPengajuan] = useState<Pengajuan[]>([]);
  const [masterPenempatan, setMasterPenempatan] = useState<PenempatanPKL[]>([]);
  const [loadingRelations, setLoadingRelations] = useState(false);

  const hasMatchedPengajuanRef = useRef(false);
  const dudiManuallyEditedRef = useRef(false);
  const autoFilledDudiRef = useRef('');
  const isCreateMode = !initialData?.id;

  useEffect(() => {
    if (!isOpen) {
      setOpenAutocompleteKey(null);
      return;
    }

    hasMatchedPengajuanRef.current = false;
    dudiManuallyEditedRef.current = false;
    autoFilledDudiRef.current = '';
    onResetLocalUi();

    const seed: Record<string, any> = { ...(initialData as Record<string, any>) };
    const existingList = Array.isArray(existingRows) ? existingRows : [];

    formFields.forEach((f) => {
      const k = String(f.key);
      if (f.type === 'date' && seed[k]) {
        const iso = normalizeToIsoDate(seed[k]);
        if (iso) seed[k] = iso;
      }
    });
    if (seed.nis !== undefined && seed.nis !== null && String(seed.nis).trim() !== '-') {
      seed.nis = stripNisSymbols(seed.nis) || String(seed.nis).trim();
    }
    if (formFieldKeys.has('catatanKunjungan') && seed.catatanKunjungan) {
      seed.catatanKunjungan = stripStructuredTagsFromNote(seed.catatanKunjungan);
    }

    if (formFieldKeys.has('id') && !String(seed.id || '').trim()) {
      seed.id = generateNextSequentialId(resolvedTableName, existingList as any);
    }
    if (formFieldKeys.has('kode') && formFieldKeys.has('nama') && !String(seed.kode || '').trim() && seed.nama) {
      seed.kode = generateJurusanCode(String(seed.nama));
    }
    if (formFieldKeys.has('noPengajuan') && !String(seed.noPengajuan || '').trim()) {
      seed.noPengajuan = generateNextSequentialId('Data_Pengajuan_PKL', existingList as any);
    }
    if (formFieldKeys.has('noPerizinan') && !String(seed.noPerizinan || '').trim()) {
      seed.noPerizinan = generateNextSequentialId('Data_Perizinan_PKL', existingList as any);
    }
    if (formFieldKeys.has('noSuratPermohonan') && !String(seed.noSuratPermohonan || '').trim()) {
      seed.noSuratPermohonan = generateNextSuratPermohonan(existingList as any);
    }
    if (formFieldKeys.has('tanggalKirimSurat') && !String(seed.tanggalKirimSurat || '').trim()) {
      seed.tanggalKirimSurat = getTodayWibIsoDate();
    }
    if (formFieldKeys.has('idPenempatan') && !String(seed.idPenempatan || '').trim()) {
      seed.idPenempatan =
        (formFieldKeys.has('statusRaport') && String(seed.id || '').trim()) ||
        generateNextSequentialId('Plotting_Pemberangkatan', existingList as any);
    }
    if (formFieldKeys.has('tanggalTerbit') && !String(seed.tanggalTerbit || '').trim()) {
      seed.tanggalTerbit = getTodayWibIsoDate();
    }

    resetForm(seed as Partial<T>);

    const sources = new Set(formFields.map((f) => f.relationSource).filter(Boolean));
    const needsPengajuanLookup = sources.has('siswa') || formFieldKeys.has('noPengajuan');
    if (sources.size === 0 && !needsPengajuanLookup) return;

    let cancelled = false;
    setLoadingRelations(true);

    const tasks: Promise<void>[] = [];
    const unsubs: Array<() => void> = [];

    if (sources.has('jurusan')) {
      const svc = JurusanService.getInstance();
      tasks.push(svc.getAll().then((list) => { if (!cancelled) setMasterJurusan(list); }).catch(() => {}));
      unsubs.push(svc.onDataUpdated(() => {
        svc.getAll().then((list) => { if (!cancelled) setMasterJurusan(list); }).catch(() => {});
      }));
    }
    if (sources.has('kelas')) {
      const svc = KelasService.getInstance();
      tasks.push(svc.getAll().then((list) => { if (!cancelled) setMasterKelas(list); }).catch(() => {}));
      unsubs.push(svc.onDataUpdated(() => {
        svc.getAll().then((list) => { if (!cancelled) setMasterKelas(list); }).catch(() => {});
      }));
    }
    if (sources.has('dudi') || needsPengajuanLookup) {
      const svc = DudiService.getInstance();
      tasks.push(svc.getAll().then((list) => { if (!cancelled) setMasterDudi(list); }).catch(() => {}));
      unsubs.push(svc.onDataUpdated(() => {
        svc.getAll().then((list) => { if (!cancelled) setMasterDudi(list); }).catch(() => {});
      }));
      if (sources.has('dudi')) void svc.reloadFromSpreadsheet().catch(() => {});
    }
    if (sources.has('guru') || sources.has('dudi') || sources.has('siswa')) {
      const svc = GuruService.getInstance();
      tasks.push(svc.getAll().then((list) => { if (!cancelled) setMasterGuru(list); }).catch(() => {}));
      unsubs.push(svc.onDataUpdated(() => {
        svc.getAll().then((list) => { if (!cancelled) setMasterGuru(list); }).catch(() => {});
      }));
      if (sources.has('guru') || sources.has('dudi')) void svc.reloadFromSpreadsheet().catch(() => {});
    }
    if (sources.has('siswa')) {
      const svc = SiswaService.getInstance();
      tasks.push(svc.getAll().then((list) => { if (!cancelled) setMasterSiswa(list); }).catch(() => {}));
      unsubs.push(svc.onDataUpdated(() => {
        svc.getAll().then((list) => { if (!cancelled) setMasterSiswa(list); }).catch(() => {});
      }));
    }
    if (needsPengajuanLookup) {
      tasks.push(
        PengajuanService.getInstance().getAll().then((list) => {
          if (
            !cancelled &&
            !initialData?.noPengajuan &&
            formFieldKeys.has('noPerizinan') &&
            formFieldKeys.has('noPengajuan') &&
            !hasMatchedPengajuanRef.current
          ) {
            setValue('noPengajuan', generateNextSequentialId('Data_Pengajuan_PKL', list as any));
          }
          if (!cancelled) setMasterPengajuan(list);
        }).catch(() => {})
      );
      tasks.push(
        SiswaPklService.getInstance().getAll().then((list) => {
          if (!cancelled) setMasterPenempatan(list);
        }).catch(() => {})
      );
    }

    Promise.all(tasks).finally(() => {
      if (!cancelled) setLoadingRelations(false);
    });

    return () => {
      cancelled = true;
      unsubs.forEach((fn) => fn());
    };
  }, [isOpen]);

  const studentDirectory = useMemo<StudentDirectoryEntry[]>(() => {
    const scorePengajuan = (req: Pengajuan): number => {
      let score = 0;
      if (cleanPlaceholderDash(req.dudiTujuan)) score += 10;
      if (normFormValue(req.statusKakomli) === 'disetujui') score += 5;
      else if (normFormValue(req.statusKakomli) === 'pending') score += 2;
      if (cleanPlaceholderDash(req.alamatDudi)) score += 1;
      return score;
    };

    const normalizeNisKey = (raw: unknown): string => {
      const digits = getCanonicalNisDigits(raw);
      return digits ? `nis:${digits}` : '';
    };

    const nameCount = new Map<string, number>();
    for (const s of masterSiswa) {
      const n = normFormValue(s.nama);
      if (n) nameCount.set(n, (nameCount.get(n) || 0) + 1);
    }

    const pengajuanByNis = new Map<string, Pengajuan>();
    const pengajuanByUniqueName = new Map<string, Pengajuan>();
    for (const req of masterPengajuan) {
      if (normFormValue(req.statusKakomli) === 'ditolak') continue;
      const candidateScore = scorePengajuan(req);
      const nisKey = normalizeNisKey(req.nis);
      const nameKey = req.namaSiswa ? normFormValue(req.namaSiswa) : '';

      if (nisKey) {
        const existing = pengajuanByNis.get(nisKey);
        if (!existing || candidateScore > scorePengajuan(existing)) pengajuanByNis.set(nisKey, req);
      } else if (nameKey && (nameCount.get(nameKey) || 0) === 1) {
        const existing = pengajuanByUniqueName.get(nameKey);
        if (!existing || candidateScore > scorePengajuan(existing)) pengajuanByUniqueName.set(nameKey, req);
      }
    }

    const scorePenempatan = (p: PenempatanPKL): number => {
      let score = cleanPlaceholderDash(p.namaDudi) ? 10 : 0;
      const st = normFormValue(p.statusPenempatan);
      if (st === 'sedang berjalan') score += 6;
      else if (st === 'terjadwal') score += 5;
      else if (st === 'selesai pkl') score += 2;
      return score;
    };

    const penempatanByNis = new Map<string, PenempatanPKL>();
    const penempatanByUniqueName = new Map<string, PenempatanPKL>();
    for (const p of masterPenempatan) {
      const st = normFormValue(p.statusPenempatan);
      if (st === 'dibatalkan' || st === 'batal' || st === 'pindah dudi') continue;
      const candidateScore = scorePenempatan(p);
      const nisKey = normalizeNisKey(p.nis);
      const nameKey = p.namaSiswa ? normFormValue(p.namaSiswa) : '';

      if (nisKey) {
        const existing = penempatanByNis.get(nisKey);
        if (!existing || candidateScore > scorePenempatan(existing)) penempatanByNis.set(nisKey, p);
      } else if (nameKey && (nameCount.get(nameKey) || 0) === 1) {
        const existing = penempatanByUniqueName.get(nameKey);
        if (!existing || candidateScore > scorePenempatan(existing)) penempatanByUniqueName.set(nameKey, p);
      }
    }

    const perizinanByNis = new Map<string, Record<string, any>>();
    const perizinanByUniqueName = new Map<string, Record<string, any>>();
    if (formFieldKeys.has('noPerizinan') && Array.isArray(existingRows)) {
      for (const row of existingRows) {
        if (initialData?.id && row?.id === initialData.id) continue;
        if (!cleanPlaceholderDash(row?.dudiTujuan)) continue;
        const nisKey = normalizeNisKey(row?.nis);
        const nameKey = row?.namaSiswa ? normFormValue(row.namaSiswa) : '';
        if (nisKey && !perizinanByNis.has(nisKey)) perizinanByNis.set(nisKey, row);
        else if (!nisKey && nameKey && (nameCount.get(nameKey) || 0) === 1 && !perizinanByUniqueName.has(nameKey)) {
          perizinanByUniqueName.set(nameKey, row);
        }
      }
    }

    const map = new Map<string, StudentDirectoryEntry>();
    masterSiswa.forEach((s, idx) => {
      const nisKey = normalizeNisKey(s.nis);
      const namaNorm = normFormValue(s.nama);
      const uniqueKey = nisKey || `id:${s.id || idx}`;
      if (map.has(uniqueKey)) return;

      const matchedReq =
        (nisKey ? pengajuanByNis.get(nisKey) : undefined) ||
        (namaNorm && (nameCount.get(namaNorm) || 0) === 1 ? pengajuanByUniqueName.get(namaNorm) : undefined);
      const matchedPlt =
        (nisKey ? penempatanByNis.get(nisKey) : undefined) ||
        (namaNorm && (nameCount.get(namaNorm) || 0) === 1 ? penempatanByUniqueName.get(namaNorm) : undefined);
      const matchedIzn =
        (nisKey ? perizinanByNis.get(nisKey) : undefined) ||
        (namaNorm && (nameCount.get(namaNorm) || 0) === 1 ? perizinanByUniqueName.get(namaNorm) : undefined);

      const cleanNis = stripNisSymbols(s.nis) || String(s.nis || '').trim();
      const cleanNama = String(s.nama || '').trim();
      const cleanJurusan = String(s.jurusan || matchedReq?.jurusan || '').trim();
      const cleanKelas = String(s.kelas || matchedReq?.kelas || '').trim();
      const namaNormS = normFormValue(cleanNama);
      const nisNormS = normFormValue(cleanNis);
      const nisDigitsS = stripNisSymbols(cleanNis);

      map.set(uniqueKey, {
        nis: cleanNis,
        nama: cleanNama,
        jurusan: cleanJurusan,
        kelas: cleanKelas,
        namaOrtuWali:
          cleanPlaceholderDash(s.namaOrtuWali) ||
          cleanPlaceholderDash(matchedReq?.namaOrtuWali) ||
          cleanPlaceholderDash(matchedIzn?.namaOrtuWali),
        noOrtuWali: cleanPlaceholderDash(s.noOrtuWali) || cleanPlaceholderDash(matchedReq?.noOrtuWali),
        noWa: cleanPlaceholderDash(s.noHpSiswa) || cleanPlaceholderDash(matchedReq?.noWa),
        _searchNorm: `${namaNormS} ${nisNormS} ${normFormValue(cleanKelas)} ${normFormValue(cleanJurusan)}`,
        _namaNorm: namaNormS,
        _nisNorm: nisNormS,
        _nisDigits: nisDigitsS,
        pengajuan: matchedReq,
        penempatan: matchedPlt,
        existingPerizinan: matchedIzn,
      });
    });

    return Array.from(map.values());
  }, [masterSiswa, masterPengajuan, masterPenempatan, existingRows, formFieldKeys, initialData?.id]);

  const resolveDudiAddress = (dudiName: string, preferredAlamat?: unknown): string => {
    const direct = cleanPlaceholderDash(preferredAlamat);
    if (direct) return direct;
    const target = normFormValue(dudiName);
    if (!target) return '';
    const dudiFromMaster = masterDudi.find((d) => normFormValue(d.namaDudi) === target);
    return cleanPlaceholderDash(dudiFromMaster?.alamat);
  };

  const resolvePreferredDudi = (
    matched?: StudentDirectoryEntry
  ): { dudiTujuan: string; alamatDudi: string } => {
    if (!matched) return { dudiTujuan: '', alamatDudi: '' };
    const candidates = [
      { name: cleanPlaceholderDash(matched.pengajuan?.dudiTujuan), addr: matched.pengajuan?.alamatDudi },
      { name: cleanPlaceholderDash(matched.penempatan?.namaDudi), addr: '' },
      { name: cleanPlaceholderDash(matched.existingPerizinan?.dudiTujuan), addr: matched.existingPerizinan?.alamatDudi },
    ];
    for (const c of candidates) {
      if (c.name) {
        return { dudiTujuan: c.name, alamatDudi: resolveDudiAddress(c.name, c.addr) };
      }
    }
    return { dudiTujuan: '', alamatDudi: '' };
  };

  useEffect(() => {
    if (!isOpen) return;

    const currentNis = String(values.nis || '').trim();
    const currentNisDigits = getCanonicalNisDigits(currentNis);
    const currentNama = normFormValue(values.namaSiswa);

    let matched: StudentDirectoryEntry | undefined;
    if (currentNisDigits) {
      matched = studentDirectory.find((s) => getCanonicalNisDigits(s.nis) === currentNisDigits);
    } else if (currentNama) {
      const sameNameMatches = studentDirectory.filter((s) => normFormValue(s.nama) === currentNama);
      if (sameNameMatches.length === 1) matched = sameNameMatches[0];
    }

    const patch: Record<string, any> = {};

    if (matched) {
      if (formFieldKeys.has('nis') && !currentNis && matched.nis) {
        patch.nis = stripNisSymbols(matched.nis) || matched.nis;
      }
      if (
        formFieldKeys.has('namaSiswa') &&
        matched.nama &&
        openAutocompleteKey !== 'namaSiswa' &&
        (!currentNama || (currentNisDigits && normFormValue(matched.nama) !== currentNama))
      ) {
        patch.namaSiswa = matched.nama;
      }
      if (formFieldKeys.has('jurusan') && !cleanPlaceholderDash(values.jurusan) && matched.jurusan) {
        patch.jurusan = matched.jurusan;
      }
      if (formFieldKeys.has('kelas') && !cleanPlaceholderDash(values.kelas) && matched.kelas) {
        patch.kelas = matched.kelas;
      }
      if (formFieldKeys.has('namaOrtuWali') && !cleanPlaceholderDash(values.namaOrtuWali) && matched.namaOrtuWali) {
        patch.namaOrtuWali = matched.namaOrtuWali;
      }
      if (
        formFieldKeys.has('noPerizinan') &&
        formFieldKeys.has('noPengajuan') &&
        matched.pengajuan?.noPengajuan &&
        !hasMatchedPengajuanRef.current &&
        values.noPengajuan !== matched.pengajuan.noPengajuan
      ) {
        hasMatchedPengajuanRef.current = true;
        patch.noPengajuan = matched.pengajuan.noPengajuan;
      }

      if (formFieldKeys.has('dudiTujuan') && !dudiManuallyEditedRef.current && !cleanPlaceholderDash(values.dudiTujuan)) {
        const resolved = resolvePreferredDudi(matched);
        if (resolved.dudiTujuan) {
          patch.dudiTujuan = resolved.dudiTujuan;
          autoFilledDudiRef.current = resolved.dudiTujuan;
          if (formFieldKeys.has('alamatDudi') && !cleanPlaceholderDash(values.alamatDudi) && resolved.alamatDudi) {
            patch.alamatDudi = resolved.alamatDudi;
          }
        }
      }
    }

    const activeDudi = cleanPlaceholderDash(patch.dudiTujuan ?? values.dudiTujuan ?? values.namaDudi);
    const matchedDudiObj = activeDudi
      ? masterDudi.find((d) => normFormValue(d.namaDudi) === normFormValue(activeDudi))
      : undefined;

    if (activeDudi && formFieldKeys.has('alamatDudi') && !cleanPlaceholderDash(patch.alamatDudi ?? values.alamatDudi)) {
      const addr = resolveDudiAddress(
        activeDudi,
        matched?.pengajuan?.alamatDudi || matched?.existingPerizinan?.alamatDudi
      );
      if (addr) patch.alamatDudi = addr;
    }

    if (matchedDudiObj && formFieldKeys.has('idDudi') && !cleanPlaceholderDash(values.idDudi)) {
      patch.idDudi = matchedDudiObj.id;
    }

    if (matchedDudiObj?.guruPendamping && formFieldKeys.has('guruPendamping') && !cleanPlaceholderDash(values.guruPendamping)) {
      const guruObj =
        (matchedDudiObj.idGuruPendamping && masterGuru.find((g) => g.id === matchedDudiObj.idGuruPendamping)) ||
        masterGuru.find((g) => normFormValue(g.nama) === normFormValue(matchedDudiObj.guruPendamping));
      patch.guruPendamping = guruObj?.nama || matchedDudiObj.guruPendamping;
      if (formFieldKeys.has('idGuruPendamping') && !cleanPlaceholderDash(values.idGuruPendamping)) {
        patch.idGuruPendamping = guruObj?.id || matchedDudiObj.idGuruPendamping || '';
      }
    }

    if (formFieldKeys.has('guruPendamping') && masterGuru.length > 0 && openAutocompleteKey !== 'guruPendamping') {
      const effectiveGuruName = cleanPlaceholderDash(patch.guruPendamping ?? values.guruPendamping);
      const effectiveGuruId = cleanPlaceholderDash(patch.idGuruPendamping ?? values.idGuruPendamping);
      const matchedById = effectiveGuruId ? masterGuru.find((g) => g.id === effectiveGuruId) : undefined;
      const matchedByName = effectiveGuruName
        ? masterGuru.find((g) => normFormValue(g.nama) === normFormValue(effectiveGuruName))
        : undefined;

      if (matchedByName) {
        if (effectiveGuruName !== matchedByName.nama) patch.guruPendamping = matchedByName.nama;
        if (formFieldKeys.has('idGuruPendamping') && effectiveGuruId !== matchedByName.id) {
          patch.idGuruPendamping = matchedByName.id;
        }
      } else if (matchedById && effectiveGuruName !== matchedById.nama && !effectiveGuruName) {
        patch.guruPendamping = matchedById.nama;
      }
    }

    if (Object.keys(patch).length > 0) {
      setMultipleValues(patch);
    }
  }, [
    isOpen,
    moduleId,
    studentDirectory,
    masterDudi,
    masterGuru,
    openAutocompleteKey,
    values.nis,
    values.namaSiswa,
    values.jurusan,
    values.kelas,
    values.namaOrtuWali,
    values.noPengajuan,
    values.dudiTujuan,
    values.namaDudi,
    values.idDudi,
    values.alamatDudi,
    values.guruPendamping,
    values.idGuruPendamping,
  ]);

  const applyStudentSelection = (matched: StudentDirectoryEntry, triggerPatch: Record<string, any> = {}) => {
    dudiManuallyEditedRef.current = false;
    const patch: Record<string, any> = { ...triggerPatch };
    if (formFieldKeys.has('nis') && matched.nis) patch.nis = stripNisSymbols(matched.nis) || matched.nis;
    if (formFieldKeys.has('namaSiswa') && matched.nama) patch.namaSiswa = matched.nama;
    if (formFieldKeys.has('jurusan') && matched.jurusan) patch.jurusan = matched.jurusan;
    if (formFieldKeys.has('kelas') && matched.kelas) patch.kelas = matched.kelas;
    if (formFieldKeys.has('namaOrtuWali') && matched.namaOrtuWali) patch.namaOrtuWali = matched.namaOrtuWali;
    if (formFieldKeys.has('noOrtuWali') && matched.noOrtuWali) patch.noOrtuWali = matched.noOrtuWali;
    if (formFieldKeys.has('noWa') && matched.noWa) patch.noWa = matched.noWa;

    if (matched.pengajuan) {
      hasMatchedPengajuanRef.current = true;
      if (formFieldKeys.has('noPengajuan') && matched.pengajuan.noPengajuan) {
        patch.noPengajuan = matched.pengajuan.noPengajuan;
      }
    } else if (formFieldKeys.has('noPerizinan') && isCreateMode && formFieldKeys.has('noPengajuan')) {
      hasMatchedPengajuanRef.current = false;
      patch.noPengajuan = generateNextSequentialId('Data_Pengajuan_PKL', masterPengajuan as any);
    }

    const resolvedDudi = resolvePreferredDudi(matched);
    if (formFieldKeys.has('dudiTujuan')) {
      if (resolvedDudi.dudiTujuan) {
        patch.dudiTujuan = resolvedDudi.dudiTujuan;
        autoFilledDudiRef.current = resolvedDudi.dudiTujuan;
        if (formFieldKeys.has('alamatDudi')) patch.alamatDudi = resolvedDudi.alamatDudi || '';
        if (formFieldKeys.has('idDudi')) {
          const dudiFromMaster = masterDudi.find((d) => normFormValue(d.namaDudi) === normFormValue(resolvedDudi.dudiTujuan));
          const resolvedDudiId = matched.penempatan?.idDudi || matched.pengajuan?.idDudi || dudiFromMaster?.id || '';
          if (resolvedDudiId) patch.idDudi = resolvedDudiId;
        }
      } else if (autoFilledDudiRef.current && normFormValue(values.dudiTujuan) === normFormValue(autoFilledDudiRef.current)) {
        patch.dudiTujuan = '';
        autoFilledDudiRef.current = '';
        if (formFieldKeys.has('alamatDudi')) patch.alamatDudi = '';
        if (formFieldKeys.has('idDudi')) patch.idDudi = '';
      }
    } else if (formFieldKeys.has('idDudi')) {
      const resolvedDudiId = matched.penempatan?.idDudi || matched.pengajuan?.idDudi || '';
      if (resolvedDudiId) patch.idDudi = resolvedDudiId;
    }

    if (formFieldKeys.has('guruPendamping') && !cleanPlaceholderDash(values.guruPendamping)) {
      const resolvedDudiName = patch.dudiTujuan || values.dudiTujuan || resolvedDudi.dudiTujuan;
      const dudiFromMaster = resolvedDudiName
        ? masterDudi.find((d) => normFormValue(d.namaDudi) === normFormValue(resolvedDudiName))
        : undefined;
      const resolvedGuruName =
        matched.penempatan?.guruPendamping ||
        matched.pengajuan?.guruPendamping ||
        dudiFromMaster?.guruPendamping ||
        '';
      if (resolvedGuruName) {
        const guruObj = masterGuru.find((g) => normFormValue(g.nama) === normFormValue(resolvedGuruName));
        patch.guruPendamping = guruObj?.nama || resolvedGuruName;
        if (formFieldKeys.has('idGuruPendamping')) {
          patch.idGuruPendamping =
            matched.penempatan?.idGuruPendamping ||
            matched.pengajuan?.idGuruPendamping ||
            dudiFromMaster?.idGuruPendamping ||
            guruObj?.id ||
            '';
        }
      }
    }

    if (
      isCreateMode &&
      formFieldKeys.has('idPenempatan') &&
      !formFieldKeys.has('tanggalBerangkat') &&
      matched.penempatan?.idPenempatan
    ) {
      patch.idPenempatan = matched.penempatan.idPenempatan;
    }

    if (formFieldKeys.has('tanggalKirimSurat') && !String(values.tanggalKirimSurat || '').trim()) {
      patch.tanggalKirimSurat = getTodayWibIsoDate();
    }

    setMultipleValues(patch);
  };

  const applyDudiSelection = (matched: Dudi, fieldKey: string, selectedValue?: string) => {
    dudiManuallyEditedRef.current = true;
    const patch: Record<string, any> = { [fieldKey]: selectedValue ?? matched.namaDudi };
    if (formFieldKeys.has('idDudi')) patch.idDudi = matched.id;
    if (formFieldKeys.has('alamatDudi') && matched.alamat) patch.alamatDudi = matched.alamat;
    if (formFieldKeys.has('bidangPekerjaan') && matched.bidangKeahlian) patch.bidangPekerjaan = matched.bidangKeahlian;
    if (formFieldKeys.has('namaPemimpin') && matched.namaPemimpin) patch.namaPemimpin = matched.namaPemimpin;
    if (formFieldKeys.has('namaPic') && matched.namaPic) patch.namaPic = matched.namaPic;
    if (formFieldKeys.has('noTelpDudi') && (matched.noTelpDudi || matched.kontakPic)) {
      patch.noTelpDudi = matched.noTelpDudi || matched.kontakPic;
    }
    if (formFieldKeys.has('linkMaps') && matched.linkMaps) patch.linkMaps = matched.linkMaps;
    if (formFieldKeys.has('guruPendamping') && matched.guruPendamping) {
      const guruObj =
        (matched.idGuruPendamping && masterGuru.find((g) => g.id === matched.idGuruPendamping)) ||
        masterGuru.find((g) => normFormValue(g.nama) === normFormValue(matched.guruPendamping));
      patch.guruPendamping = guruObj?.nama || matched.guruPendamping;
      if (formFieldKeys.has('idGuruPendamping')) {
        patch.idGuruPendamping = guruObj?.id || matched.idGuruPendamping || '';
      }
    }
    setMultipleValues(patch);
  };

  const applyGuruSelection = (matched: Guru, fieldKey: string, selectedValue?: string) => {
    const patch: Record<string, any> = { [fieldKey]: selectedValue ?? matched.nama };
    if (fieldKey === 'namaKakomli' && formFieldKeys.has('idKakomli')) {
      patch.idKakomli = matched.id;
      if (
        formFieldKeys.has('kontakWA') &&
        matched.kontakWA &&
        matched.kontakWA !== '-' &&
        !String(values.kontakWA || '').trim()
      ) {
        patch.kontakWA = matched.kontakWA;
      }
    } else if (formFieldKeys.has('idGuruPendamping')) {
      patch.idGuruPendamping = matched.id;
    }
    setMultipleValues(patch);
  };

  const handleRelationSelect = (field: FieldConfig<T>, selectedValue: string) => {
    const key = String(field.key);
    const patch: Record<string, any> = { [key]: selectedValue };

    if (!selectedValue) {
      if (field.relationSource === 'guru') {
        if (key === 'namaKakomli' && formFieldKeys.has('idKakomli')) {
          patch.idKakomli = '';
        } else if (formFieldKeys.has('idGuruPendamping')) {
          patch.idGuruPendamping = '';
        }
      }
      if (field.relationSource === 'dudi' && formFieldKeys.has('idDudi')) patch.idDudi = '';
      if (field.relationSource === 'jurusan' && formFieldKeys.has('idJurusan')) patch.idJurusan = '';
      setMultipleValues(patch);
      return;
    }

    if (field.relationSource === 'siswa') {
      const selectedDigits = getCanonicalNisDigits(selectedValue);
      const matched =
        key === 'nis'
          ? studentDirectory.find((s) => getCanonicalNisDigits(s.nis) === selectedDigits)
          : (() => {
              const nameMatches = studentDirectory.filter((s) => normFormValue(s.nama) === normFormValue(selectedValue));
              return nameMatches.length === 1 ? nameMatches[0] : undefined;
            })();
      if (matched) {
        applyStudentSelection(matched, patch);
        return;
      }
    } else if (field.relationSource === 'dudi') {
      const matched = masterDudi.find((d) => normFormValue(d.namaDudi) === normFormValue(selectedValue));
      if (matched) {
        applyDudiSelection(matched, key, selectedValue);
        return;
      }
    } else if (field.relationSource === 'guru') {
      const matched = masterGuru.find((g) => normFormValue(g.nama) === normFormValue(selectedValue));
      if (matched) {
        applyGuruSelection(matched, key, selectedValue);
        return;
      }
    } else if (field.relationSource === 'jurusan' && formFieldKeys.has('idJurusan')) {
      const matchedJur = masterJurusan.find(
        (j) => normFormValue(j.nama) === normFormValue(selectedValue) || normFormValue(j.kode) === normFormValue(selectedValue)
      );
      patch.idJurusan = matchedJur?.kode || generateJurusanCode(selectedValue) || '';
    }

    setMultipleValues(patch);
  };

  const jurusanOptionsMemo = useMemo(
    () =>
      masterJurusan.map((j) => ({
        label: j.kode ? `${j.nama} (${j.kode})` : j.nama,
        value: j.nama,
      })),
    [masterJurusan]
  );

  const dudiOptionsMemo = useMemo(
    () =>
      masterDudi.map((d) => ({
        label: `${d.namaDudi}${d.wilayahKota ? ` · ${d.wilayahKota}` : ''} (${d.terisi ?? 0}/${d.kuotaMaksimal ?? 0})`,
        value: d.namaDudi,
      })),
    [masterDudi]
  );

  const guruOptionsMemo = useMemo(
    () =>
      masterGuru.map((g) => ({
        label: `${g.nama} (${g.peranUtama || 'Guru Pendamping'})`,
        value: g.nama,
      })),
    [masterGuru]
  );

  const siswaNisOptionsMemo = useMemo(
    () =>
      studentDirectory.map((s) => ({
        label: `${formatNisVisual(s.nis)} — ${s.nama} (${s.kelas || '-'})`,
        value: stripNisSymbols(s.nis) || s.nis,
      })),
    [studentDirectory]
  );

  const siswaNameOptionsMemo = useMemo(
    () =>
      studentDirectory.map((s) => ({
        label: `${s.nama} (${formatNisVisual(s.nis)} · ${s.kelas || '-'})`,
        value: s.nama,
      })),
    [studentDirectory]
  );

  const hasRelationOptions = useCallback(
    (field: FieldConfig<T>): boolean => {
      switch (field.relationSource) {
        case 'jurusan':
          return masterJurusan.length > 0 || (field.options?.length ?? 0) > 0;
        case 'kelas':
          return masterKelas.length > 0 || (field.options?.length ?? 0) > 0;
        case 'dudi':
          return masterDudi.length > 0;
        case 'guru':
          return masterGuru.length > 0;
        case 'siswa':
          return studentDirectory.length > 0;
        default:
          return (field.options?.length ?? 0) > 0;
      }
    },
    [masterJurusan.length, masterKelas.length, masterDudi.length, masterGuru.length, studentDirectory.length]
  );

  const getRelationOptions = useCallback(
    (field: FieldConfig<T>): { label: string; value: string }[] => {
      const key = String(field.key);
      switch (field.relationSource) {
        case 'jurusan':
          return jurusanOptionsMemo.length > 0
            ? jurusanOptionsMemo
            : (field.options || []).map((o) => ({ label: o.label, value: String(o.value) }));
        case 'kelas': {
          if (masterKelas.length > 0) {
            const selectedJur = normFormValue(values.jurusan);
            const selectedJurCode = normFormValue(generateJurusanCode(String(values.jurusan || '')));
            const filtered = selectedJur
              ? masterKelas.filter(
                  (k) =>
                    normFormValue(k.jurusan) === selectedJur ||
                    normFormValue(k.jurusan).includes(selectedJur) ||
                    selectedJur.includes(normFormValue(k.jurusan)) ||
                    (selectedJurCode && normFormValue((k as any).idJurusan) === selectedJurCode)
                )
              : masterKelas;
            const list = filtered.length > 0 ? filtered : masterKelas;
            return list.map((k) => ({
              label: k.jurusan ? `${k.namaKelas} — ${k.jurusan}` : k.namaKelas,
              value: k.namaKelas,
            }));
          }
          return (field.options || []).map((o) => ({ label: o.label, value: String(o.value) }));
        }
        case 'dudi':
          return dudiOptionsMemo;
        case 'guru':
          return guruOptionsMemo;
        case 'siswa':
          return key === 'nis' ? siswaNisOptionsMemo : siswaNameOptionsMemo;
        default:
          return (field.options || []).map((o) => ({ label: o.label, value: String(o.value) }));
      }
    },
    [
      jurusanOptionsMemo,
      dudiOptionsMemo,
      guruOptionsMemo,
      siswaNisOptionsMemo,
      siswaNameOptionsMemo,
      masterKelas,
      values.jurusan,
    ]
  );

  return {
    resolvedTableName,
    masterDudi,
    masterGuru,
    masterSiswa,
    loadingRelations,
    studentDirectory,
    dudiManuallyEditedRef,
    resolvePreferredDudi,
    applyStudentSelection,
    applyDudiSelection,
    applyGuruSelection,
    handleRelationSelect,
    hasRelationOptions,
    getRelationOptions,
  };
}
