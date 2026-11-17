import React, { useEffect, useState, useMemo, useRef } from 'react';
import { FieldConfig } from '../core/types/metadata';
import { Dudi, Guru, Jurusan, Kelas, PenempatanPKL, Pengajuan, Siswa } from '../core/types/schema';
import { useDynamicForm } from '../hooks/useDynamicForm';
import { DudiService } from '../services/DudiService';
import { GuruService } from '../services/GuruService';
import { JurusanService } from '../services/JurusanService';
import { KelasService } from '../services/KelasService';
import { PengajuanService } from '../services/PengajuanService';
import { SiswaPklService } from '../services/SiswaPklService';
import { SiswaService } from '../services/SiswaService';
import {
  getPredikatFromScore,
  stripStructuredTagsFromNote,
} from '../core/utils/monitoringHelpers';
import { getTodayWibIsoDate, normalizeToIsoDate } from '../core/utils/dateHelpers';
import {
  formatNisVisual,
  handleNisKeyDown,
  processNisInputChange,
  stripNisSymbols,
} from '../core/utils/nisHelpers';
import {
  formatPhoneDisplay,
  generateJurusanCode,
  generateNextSequentialId,
  generateNextSuratPermohonan,
  getWhatsAppHref,
  isPhoneFieldKey,
} from '../core/utils/autoIdHelpers';
import {
  X,
  Save,
  Upload,
  AlertCircle,
  Link2,
  Search,
  Lock,
  Check,
  MessageCircle,
} from 'lucide-react';

interface DynamicFormModalProps<T = any> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fields: FieldConfig<T>[];
  initialData?: Partial<T>;
  existingRows?: T[];
  moduleId?: string;
  tableName?: string;
  onSubmit: (values: T) => Promise<void> | void;
  onOpenImageCropper?: (currentImage: string, onDone: (croppedUrl: string) => void) => void;
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanPlaceholderDash(v: unknown): string {
  const s = String(v ?? '').trim();
  return s === '-' ? '' : s;
}

export function DynamicFormModal<T extends Record<string, any>>({
  isOpen,
  onClose,
  title,
  fields,
  initialData = {},
  existingRows = [],
  moduleId,
  tableName,
  onSubmit,
  onOpenImageCropper,
}: DynamicFormModalProps<T>) {
  const formFields = useMemo(
    () => fields.filter((f) => f.isFormInput !== false),
    [fields]
  );
  const formFieldKeys = useMemo(
    () => new Set(formFields.map((f) => String(f.key))),
    [formFields]
  );

  const resolvedTableName = useMemo(() => {
    if (tableName) return tableName;
    switch (moduleId) {
      case 'siswa':
        return 'Master_Siswa_XI';
      case 'jurusan':
        return 'Master_Jurusan';
      case 'kelas':
        return 'Master_Kelas_Walas';
      case 'dudi':
        return 'Master_DUDI';
      case 'guru':
        return 'Master_Guru_Pendamping';
      case 'pengajuan':
        return 'Data_Pengajuan_PKL';
      case 'perizinan':
        return 'Data_Perizinan_PKL';
      case 'siswa_pkl':
        return 'Plotting_Pemberangkatan';
      case 'monitoring':
        return 'Monitoring_5_Tahap';
      case 'sertifikat':
        return 'Nilai_Dan_Sertifikat';
      default:
        return '';
    }
  }, [moduleId, tableName]);

  const {
    values,
    setValue,
    setMultipleValues,
    errors,
    submitting,
    handleSubmit,
    resetForm,
  } = useDynamicForm<T>(formFields, initialData, async (formValues) => {
    await onSubmit(formValues);
    onClose();
  });

  const [masterJurusan, setMasterJurusan] = useState<Jurusan[]>([]);
  const [masterKelas, setMasterKelas] = useState<Kelas[]>([]);
  const [masterDudi, setMasterDudi] = useState<Dudi[]>([]);
  const [masterGuru, setMasterGuru] = useState<Guru[]>([]);
  const [masterSiswa, setMasterSiswa] = useState<Siswa[]>([]);
  const [masterPengajuan, setMasterPengajuan] = useState<Pengajuan[]>([]);
  const [masterPenempatan, setMasterPenempatan] = useState<PenempatanPKL[]>([]);
  const [loadingRelations, setLoadingRelations] = useState(false);
  const [manualFields, setManualFields] = useState<Record<string, boolean>>({});
  const [imageUrlInputKey, setImageUrlInputKey] = useState<string | null>(null);
  const [openAutocompleteKey, setOpenAutocompleteKey] = useState<string | null>(null);
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
    setManualFields({});

    // Prepare seeded initial values with deterministic auto-IDs, codes & today's date
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
    if (moduleId === 'monitoring' && seed.catatanKunjungan) {
      seed.catatanKunjungan = stripStructuredTagsFromNote(seed.catatanKunjungan);
    }

    if (formFieldKeys.has('id') && !String(seed.id || '').trim()) {
      seed.id = generateNextSequentialId(resolvedTableName, existingList as any);
    }
    if (moduleId === 'jurusan' && formFieldKeys.has('kode') && !String(seed.kode || '').trim() && seed.nama) {
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
    if (
      moduleId === 'perizinan' &&
      formFieldKeys.has('tanggalKirimSurat') &&
      !String(seed.tanggalKirimSurat || '').trim()
    ) {
      seed.tanggalKirimSurat = getTodayWibIsoDate();
    }
    if (formFieldKeys.has('idPenempatan') && !String(seed.idPenempatan || '').trim()) {
      seed.idPenempatan =
        (moduleId === 'sertifikat' && String(seed.id || '').trim()) ||
        generateNextSequentialId('Plotting_Pemberangkatan', existingList as any);
    }
    if (
      moduleId === 'sertifikat' &&
      formFieldKeys.has('tanggalTerbit') &&
      !String(seed.tanggalTerbit || '').trim()
    ) {
      seed.tanggalTerbit = getTodayWibIsoDate();
    }

    resetForm(seed as Partial<T>);

    const sources = new Set(formFields.map((f) => f.relationSource).filter(Boolean));
    const needsPengajuanLookup = moduleId === 'perizinan' || sources.has('siswa');
    if (sources.size === 0 && !needsPengajuanLookup) return;

    let cancelled = false;
    setLoadingRelations(true);

    const tasks: Promise<void>[] = [];
    if (sources.has('jurusan')) {
      tasks.push(
        JurusanService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterJurusan(list);
          })
          .catch(() => {})
      );
    }
    if (sources.has('kelas')) {
      tasks.push(
        KelasService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterKelas(list);
          })
          .catch(() => {})
      );
    }
    if (sources.has('dudi') || needsPengajuanLookup) {
      tasks.push(
        DudiService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterDudi(list);
          })
          .catch(() => {})
      );
    }
    if (sources.has('guru')) {
      tasks.push(
        GuruService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterGuru(list);
          })
          .catch(() => {})
      );
    }
    if (sources.has('siswa')) {
      tasks.push(
        SiswaService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterSiswa(list);
          })
          .catch(() => {})
      );
    }
    if (needsPengajuanLookup) {
      tasks.push(
        PengajuanService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled && !initialData?.noPengajuan && moduleId === 'perizinan' && !hasMatchedPengajuanRef.current) {
              setValue(
                'noPengajuan',
                generateNextSequentialId('Data_Pengajuan_PKL', list as any)
              );
            }
            if (!cancelled) setMasterPengajuan(list);
          })
          .catch(() => {})
      );
      tasks.push(
        SiswaPklService.getInstance()
          .getAll()
          .then((list) => {
            if (!cancelled) setMasterPenempatan(list);
          })
          .catch(() => {})
      );
    }

    Promise.all(tasks).finally(() => {
      if (!cancelled) setLoadingRelations(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Build combined student directory from Master_Siswa_XI + Data_Pengajuan_PKL + Plotting_Pemberangkatan
  const studentDirectory = useMemo(() => {
    type DirectoryEntry = {
      nis: string;
      nama: string;
      jurusan: string;
      kelas: string;
      namaOrtuWali: string;
      noOrtuWali: string;
      noWa: string;
      pengajuan?: Pengajuan;
      penempatan?: PenempatanPKL;
      existingPerizinan?: Record<string, any>;
    };

    const scorePengajuan = (req: Pengajuan): number => {
      let score = 0;
      if (cleanPlaceholderDash(req.dudiTujuan)) score += 10;
      if (norm(req.statusKakomli) === 'disetujui') score += 5;
      else if (norm(req.statusKakomli) === 'pending') score += 2;
      if (cleanPlaceholderDash(req.alamatDudi)) score += 1;
      return score;
    };

    const normalizeNisKey = (raw: unknown): string => {
      const digits = stripNisSymbols(raw);
      if (digits) return `nis:${digits}`;
      const s = norm(raw);
      return s && s !== '-' ? `nis:${s}` : '';
    };

    const pengajuanByKey = new Map<string, Pengajuan>();
    for (const req of masterPengajuan) {
      if (norm(req.statusKakomli) === 'ditolak') continue;
      const candidateScore = scorePengajuan(req);
      const nisKey = normalizeNisKey(req.nis);
      const nameKey = req.namaSiswa ? `nama:${norm(req.namaSiswa)}` : '';

      if (nisKey) {
        const existing = pengajuanByKey.get(nisKey);
        if (!existing || candidateScore > scorePengajuan(existing)) {
          pengajuanByKey.set(nisKey, req);
        }
      }
      if (nameKey) {
        const existing = pengajuanByKey.get(nameKey);
        if (!existing || candidateScore > scorePengajuan(existing)) {
          pengajuanByKey.set(nameKey, req);
        }
      }
    }

    const scorePenempatan = (p: PenempatanPKL): number => {
      let score = cleanPlaceholderDash(p.namaDudi) ? 10 : 0;
      const st = norm(p.statusPenempatan);
      if (st === 'sedang berjalan') score += 5;
      else if (st === 'terjadwal') score += 4;
      else if (st === 'selesai pkl') score += 2;
      return score;
    };

    const penempatanByKey = new Map<string, PenempatanPKL>();
    for (const p of masterPenempatan) {
      if (norm(p.statusPenempatan) === 'dibatalkan') continue;
      const candidateScore = scorePenempatan(p);
      const nisKey = normalizeNisKey(p.nis);
      const nameKey = p.namaSiswa ? `nama:${norm(p.namaSiswa)}` : '';

      if (nisKey) {
        const existing = penempatanByKey.get(nisKey);
        if (!existing || candidateScore > scorePenempatan(existing)) {
          penempatanByKey.set(nisKey, p);
        }
      }
      if (nameKey) {
        const existing = penempatanByKey.get(nameKey);
        if (!existing || candidateScore > scorePenempatan(existing)) {
          penempatanByKey.set(nameKey, p);
        }
      }
    }

    const perizinanByKey = new Map<string, Record<string, any>>();
    if (moduleId === 'perizinan' && Array.isArray(existingRows)) {
      for (const row of existingRows) {
        if (initialData?.id && row?.id === initialData.id) continue;
        if (!cleanPlaceholderDash(row?.dudiTujuan)) continue;
        const nisKey = normalizeNisKey(row?.nis);
        const nameKey = row?.namaSiswa ? `nama:${norm(row.namaSiswa)}` : '';
        if (nisKey && !perizinanByKey.has(nisKey)) perizinanByKey.set(nisKey, row);
        if (nameKey && !perizinanByKey.has(nameKey)) perizinanByKey.set(nameKey, row);
      }
    }

    const map = new Map<string, DirectoryEntry>();

    for (const s of masterSiswa) {
      const nisKey = normalizeNisKey(s.nis);
      const namaNorm = norm(s.nama);
      const key = nisKey || `nama:${namaNorm}`;
      const matchedReq =
        (nisKey && pengajuanByKey.get(nisKey)) ||
        (namaNorm ? pengajuanByKey.get(`nama:${namaNorm}`) : undefined);
      const matchedPlt =
        (nisKey && penempatanByKey.get(nisKey)) ||
        (namaNorm ? penempatanByKey.get(`nama:${namaNorm}`) : undefined);
      const matchedIzn =
        (nisKey && perizinanByKey.get(nisKey)) ||
        (namaNorm ? perizinanByKey.get(`nama:${namaNorm}`) : undefined);

      map.set(key, {
        nis: stripNisSymbols(s.nis) || String(s.nis || '').trim(),
        nama: String(s.nama || '').trim(),
        jurusan: String(s.jurusan || matchedReq?.jurusan || '').trim(),
        kelas: String(s.kelas || matchedReq?.kelas || '').trim(),
        namaOrtuWali:
          cleanPlaceholderDash(s.namaOrtuWali) ||
          cleanPlaceholderDash(matchedReq?.namaOrtuWali) ||
          cleanPlaceholderDash(matchedIzn?.namaOrtuWali),
        noOrtuWali:
          cleanPlaceholderDash(s.noOrtuWali) || cleanPlaceholderDash(matchedReq?.noOrtuWali),
        noWa: cleanPlaceholderDash(s.noHpSiswa) || cleanPlaceholderDash(matchedReq?.noWa),
        pengajuan: matchedReq,
        penempatan: matchedPlt,
        existingPerizinan: matchedIzn,
      });
    }

    for (const req of masterPengajuan) {
      if (norm(req.statusKakomli) === 'ditolak') continue;
      const nisKey = normalizeNisKey(req.nis);
      const namaNorm = norm(req.namaSiswa);
      const key = nisKey || `nama:${namaNorm}`;
      const existing =
        map.get(key) ||
        (namaNorm
          ? Array.from(map.values()).find((e) => norm(e.nama) === namaNorm)
          : undefined);
      if (existing) {
        if (!existing.pengajuan) existing.pengajuan = req;
        continue;
      }
      if (req.namaSiswa || req.nis) {
        const matchedPlt =
          (nisKey && penempatanByKey.get(nisKey)) ||
          (namaNorm ? penempatanByKey.get(`nama:${namaNorm}`) : undefined);
        const matchedIzn =
          (nisKey && perizinanByKey.get(nisKey)) ||
          (namaNorm ? perizinanByKey.get(`nama:${namaNorm}`) : undefined);
        map.set(key, {
          nis: stripNisSymbols(req.nis) || String(req.nis || '').trim(),
          nama: String(req.namaSiswa || '').trim(),
          jurusan: String(req.jurusan || '').trim(),
          kelas: String(req.kelas || '').trim(),
          namaOrtuWali:
            cleanPlaceholderDash(req.namaOrtuWali) || cleanPlaceholderDash(matchedIzn?.namaOrtuWali),
          noOrtuWali: cleanPlaceholderDash(req.noOrtuWali),
          noWa: cleanPlaceholderDash(req.noWa),
          pengajuan: pengajuanByKey.get(key) || req,
          penempatan: matchedPlt,
          existingPerizinan: matchedIzn,
        });
      }
    }

    for (const plt of masterPenempatan) {
      if (norm(plt.statusPenempatan) === 'dibatalkan') continue;
      const nisKey = normalizeNisKey(plt.nis);
      const namaNorm = norm(plt.namaSiswa);
      const key = nisKey || `nama:${namaNorm}`;
      const existing =
        map.get(key) ||
        (namaNorm
          ? Array.from(map.values()).find((e) => norm(e.nama) === namaNorm)
          : undefined);
      if (existing) {
        if (!existing.penempatan) existing.penempatan = plt;
        continue;
      }
      if (plt.namaSiswa || plt.nis) {
        map.set(key, {
          nis: stripNisSymbols(plt.nis) || String(plt.nis || '').trim(),
          nama: String(plt.namaSiswa || '').trim(),
          jurusan: '',
          kelas: '',
          namaOrtuWali: '',
          noOrtuWali: '',
          noWa: '',
          penempatan: penempatanByKey.get(key) || plt,
          existingPerizinan:
            (nisKey && perizinanByKey.get(nisKey)) ||
            (namaNorm ? perizinanByKey.get(`nama:${namaNorm}`) : undefined),
        });
      }
    }

    return Array.from(map.values());
  }, [masterSiswa, masterPengajuan, masterPenempatan, existingRows, moduleId, initialData?.id]);

  const resolveDudiAddress = (dudiName: string, preferredAlamat?: unknown): string => {
    const direct = cleanPlaceholderDash(preferredAlamat);
    if (direct) return direct;
    const target = norm(dudiName);
    if (!target) return '';
    const dudiFromMaster = masterDudi.find((d) => norm(d.namaDudi) === target);
    return cleanPlaceholderDash(dudiFromMaster?.alamat);
  };

  const resolvePreferredDudi = (
    matched?: (typeof studentDirectory)[number]
  ): { dudiTujuan: string; alamatDudi: string } => {
    if (!matched) return { dudiTujuan: '', alamatDudi: '' };
    const candidates = [
      {
        name: cleanPlaceholderDash(matched.pengajuan?.dudiTujuan),
        addr: matched.pengajuan?.alamatDudi,
      },
      {
        name: cleanPlaceholderDash(matched.penempatan?.namaDudi),
        addr: '',
      },
      {
        name: cleanPlaceholderDash(matched.existingPerizinan?.dudiTujuan),
        addr: matched.existingPerizinan?.alamatDudi,
      },
    ];
    for (const c of candidates) {
      if (c.name) {
        return {
          dudiTujuan: c.name,
          alamatDudi: resolveDudiAddress(c.name, c.addr),
        };
      }
    }
    return { dudiTujuan: '', alamatDudi: '' };
  };

  // Reactive sync: eliminates race conditions when masterPengajuan/masterPenempatan/masterDudi load after student selection
  useEffect(() => {
    if (!isOpen) return;

    const currentNis = String(values.nis || '').trim();
    const currentNisDigits = stripNisSymbols(currentNis);
    const currentNama = norm(values.namaSiswa);

    const matched =
      (currentNis && currentNis !== '-'
        ? studentDirectory.find(
            (s) =>
              (currentNisDigits && stripNisSymbols(s.nis) === currentNisDigits) ||
              norm(s.nis) === norm(currentNis)
          )
        : undefined) ||
      (currentNama ? studentDirectory.find((s) => norm(s.nama) === currentNama) : undefined);

    const patch: Record<string, any> = {};

    if (matched) {
      if (formFieldKeys.has('nis') && !currentNis && matched.nis) {
        patch.nis = stripNisSymbols(matched.nis) || matched.nis;
      }
      if (formFieldKeys.has('namaSiswa') && !currentNama && matched.nama) {
        patch.namaSiswa = matched.nama;
      }
      if (formFieldKeys.has('jurusan') && !cleanPlaceholderDash(values.jurusan) && matched.jurusan) {
        patch.jurusan = matched.jurusan;
      }
      if (formFieldKeys.has('kelas') && !cleanPlaceholderDash(values.kelas) && matched.kelas) {
        patch.kelas = matched.kelas;
      }
      if (
        formFieldKeys.has('namaOrtuWali') &&
        !cleanPlaceholderDash(values.namaOrtuWali) &&
        matched.namaOrtuWali
      ) {
        patch.namaOrtuWali = matched.namaOrtuWali;
      }
      if (
        moduleId === 'perizinan' &&
        formFieldKeys.has('noPengajuan') &&
        matched.pengajuan?.noPengajuan &&
        !hasMatchedPengajuanRef.current &&
        values.noPengajuan !== matched.pengajuan.noPengajuan
      ) {
        hasMatchedPengajuanRef.current = true;
        patch.noPengajuan = matched.pengajuan.noPengajuan;
      }

      if (
        formFieldKeys.has('dudiTujuan') &&
        !dudiManuallyEditedRef.current &&
        !cleanPlaceholderDash(values.dudiTujuan)
      ) {
        const resolved = resolvePreferredDudi(matched);
        if (resolved.dudiTujuan) {
          patch.dudiTujuan = resolved.dudiTujuan;
          autoFilledDudiRef.current = resolved.dudiTujuan;
          if (
            formFieldKeys.has('alamatDudi') &&
            !cleanPlaceholderDash(values.alamatDudi) &&
            resolved.alamatDudi
          ) {
            patch.alamatDudi = resolved.alamatDudi;
          }
        }
      }
    }

    const activeDudi = cleanPlaceholderDash(patch.dudiTujuan ?? values.dudiTujuan);
    if (
      activeDudi &&
      formFieldKeys.has('alamatDudi') &&
      !cleanPlaceholderDash(patch.alamatDudi ?? values.alamatDudi)
    ) {
      const addr = resolveDudiAddress(
        activeDudi,
        matched?.pengajuan?.alamatDudi || matched?.existingPerizinan?.alamatDudi
      );
      if (addr) {
        patch.alamatDudi = addr;
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
    values.nis,
    values.namaSiswa,
    values.jurusan,
    values.kelas,
    values.namaOrtuWali,
    values.noPengajuan,
    values.dudiTujuan,
    values.alamatDudi,
  ]);

  if (!isOpen) return null;

  const applyStudentSelection = (matched: (typeof studentDirectory)[number], triggerPatch: Record<string, any> = {}) => {
    dudiManuallyEditedRef.current = false;
    const patch: Record<string, any> = { ...triggerPatch };
    if (formFieldKeys.has('nis') && matched.nis) {
      patch.nis = stripNisSymbols(matched.nis) || matched.nis;
    }
    if (formFieldKeys.has('namaSiswa') && matched.nama) patch.namaSiswa = matched.nama;
    if (formFieldKeys.has('jurusan') && matched.jurusan) patch.jurusan = matched.jurusan;
    if (formFieldKeys.has('kelas') && matched.kelas) patch.kelas = matched.kelas;
    if (formFieldKeys.has('namaOrtuWali') && matched.namaOrtuWali) {
      patch.namaOrtuWali = matched.namaOrtuWali;
    }
    if (formFieldKeys.has('noOrtuWali') && matched.noOrtuWali) {
      patch.noOrtuWali = matched.noOrtuWali;
    }
    if (formFieldKeys.has('noWa') && matched.noWa) {
      patch.noWa = matched.noWa;
    }

    if (matched.pengajuan) {
      hasMatchedPengajuanRef.current = true;
      if (formFieldKeys.has('noPengajuan') && matched.pengajuan.noPengajuan) {
        patch.noPengajuan = matched.pengajuan.noPengajuan;
      }
    } else if (
      moduleId === 'perizinan' &&
      isCreateMode &&
      formFieldKeys.has('noPengajuan')
    ) {
      hasMatchedPengajuanRef.current = false;
      patch.noPengajuan = generateNextSequentialId('Data_Pengajuan_PKL', masterPengajuan as any);
    }

    const resolvedDudi = resolvePreferredDudi(matched);
    if (formFieldKeys.has('dudiTujuan')) {
      if (resolvedDudi.dudiTujuan) {
        patch.dudiTujuan = resolvedDudi.dudiTujuan;
        autoFilledDudiRef.current = resolvedDudi.dudiTujuan;
        if (formFieldKeys.has('alamatDudi')) {
          patch.alamatDudi = resolvedDudi.alamatDudi || '';
        }
      } else if (
        autoFilledDudiRef.current &&
        norm(values.dudiTujuan) === norm(autoFilledDudiRef.current)
      ) {
        patch.dudiTujuan = '';
        autoFilledDudiRef.current = '';
        if (formFieldKeys.has('alamatDudi')) {
          patch.alamatDudi = '';
        }
      }
    }

    if (formFieldKeys.has('daftarSiswa') && !cleanPlaceholderDash(values.daftarSiswa) && matched.nama) {
      patch.daftarSiswa = matched.nis ? `${matched.nama} (${matched.nis})` : matched.nama;
    }
    if (
      formFieldKeys.has('guruPendamping') &&
      !cleanPlaceholderDash(values.guruPendamping) &&
      (matched.penempatan?.guruPendamping || matched.pengajuan?.guruPendamping)
    ) {
      patch.guruPendamping =
        matched.penempatan?.guruPendamping || matched.pengajuan?.guruPendamping;
    }
    if (
      moduleId === 'sertifikat' &&
      isCreateMode &&
      formFieldKeys.has('idPenempatan') &&
      matched.penempatan?.idPenempatan
    ) {
      patch.idPenempatan = matched.penempatan.idPenempatan;
    }

    if (
      moduleId === 'perizinan' &&
      formFieldKeys.has('tanggalKirimSurat') &&
      !String(values.tanggalKirimSurat || '').trim()
    ) {
      patch.tanggalKirimSurat = getTodayWibIsoDate();
    }

    setMultipleValues(patch);
  };

  const applyDudiSelection = (matched: Dudi, fieldKey: string, selectedValue?: string) => {
    dudiManuallyEditedRef.current = true;
    const patch: Record<string, any> = {
      [fieldKey]: selectedValue ?? matched.namaDudi,
    };
    if (formFieldKeys.has('idDudi')) patch.idDudi = matched.id;
    if (formFieldKeys.has('alamatDudi') && matched.alamat) {
      patch.alamatDudi = matched.alamat;
    }
    if (formFieldKeys.has('bidangPekerjaan') && matched.bidangKeahlian) {
      patch.bidangPekerjaan = matched.bidangKeahlian;
    }
    if (formFieldKeys.has('noTelpDudi') && (matched.kontakPic || matched.noTelpDudi)) {
      patch.noTelpDudi = matched.kontakPic || matched.noTelpDudi;
    }
    setMultipleValues(patch);
  };

  const handleRelationSelect = (field: FieldConfig<T>, selectedValue: string) => {
    const key = String(field.key);
    const patch: Record<string, any> = { [key]: selectedValue };

    if (!selectedValue) {
      setMultipleValues(patch);
      return;
    }

    if (field.relationSource === 'siswa') {
      const selectedDigits = stripNisSymbols(selectedValue);
      const matched = studentDirectory.find((s) =>
        key === 'nis'
          ? (selectedDigits && stripNisSymbols(s.nis) === selectedDigits) ||
            String(s.nis).trim() === selectedValue.trim()
          : norm(s.nama) === norm(selectedValue)
      );
      if (matched) {
        applyStudentSelection(matched, patch);
        return;
      }
    } else if (field.relationSource === 'dudi') {
      const matched = masterDudi.find((d) => norm(d.namaDudi) === norm(selectedValue));
      if (matched) {
        applyDudiSelection(matched, key, selectedValue);
        return;
      }
    } else if (field.relationSource === 'guru') {
      const matched = masterGuru.find((g) => norm(g.nama) === norm(selectedValue));
      if (matched && formFieldKeys.has('idGuruPendamping')) {
        patch.idGuruPendamping = matched.id;
      }
    }

    setMultipleValues(patch);
  };

  const getRelationOptions = (
    field: FieldConfig<T>
  ): { label: string; value: string }[] => {
    const key = String(field.key);
    switch (field.relationSource) {
      case 'jurusan': {
        if (masterJurusan.length > 0) {
          return masterJurusan.map((j) => ({
            label: j.kode ? `${j.nama} (${j.kode})` : j.nama,
            value: j.nama,
          }));
        }
        return (field.options || []).map((o) => ({
          label: o.label,
          value: String(o.value),
        }));
      }
      case 'kelas': {
        if (masterKelas.length > 0) {
          const selectedJur = norm(values.jurusan);
          const filtered = selectedJur
            ? masterKelas.filter(
                (k) =>
                  norm(k.jurusan) === selectedJur ||
                  norm(k.jurusan).includes(selectedJur) ||
                  selectedJur.includes(norm(k.jurusan))
              )
            : masterKelas;
          const list = filtered.length > 0 ? filtered : masterKelas;
          return list.map((k) => ({
            label: k.jurusan ? `${k.namaKelas} — ${k.jurusan}` : k.namaKelas,
            value: k.namaKelas,
          }));
        }
        return (field.options || []).map((o) => ({
          label: o.label,
          value: String(o.value),
        }));
      }
      case 'dudi':
        return masterDudi.map((d) => ({
          label: `${d.namaDudi}${d.wilayahKota ? ` · ${d.wilayahKota}` : ''} (${d.terisi ?? 0}/${d.kuotaMaksimal ?? 0})`,
          value: d.namaDudi,
        }));
      case 'guru':
        return masterGuru.map((g) => ({
          label: `${g.nama} (${g.peranUtama || 'Guru Pendamping'})`,
          value: g.nama,
        }));
      case 'siswa':
        return studentDirectory.map((s) =>
          key === 'nis'
            ? {
                label: `${formatNisVisual(s.nis)} — ${s.nama} (${s.kelas || '-'})`,
                value: stripNisSymbols(s.nis) || s.nis,
              }
            : {
                label: `${s.nama} (${formatNisVisual(s.nis)} · ${s.kelas || '-'})`,
                value: s.nama,
              }
        );
      default:
        return (field.options || []).map((o) => ({
          label: o.label,
          value: String(o.value),
        }));
    }
  };

  const renderAutocompleteInput = (field: FieldConfig<T>) => {
    const key = String(field.key);
    const val = String(values[key] ?? '');
    const err = errors[key];
    const isDropdownOpen = openAutocompleteKey === key;
    const query = norm(val);

    if (field.relationSource === 'siswa') {
      const isNisField = key === 'nis';
      const nisDigits = isNisField ? stripNisSymbols(val) : '';
      const displayVal = isNisField ? formatNisVisual(nisDigits, '') : val;
      const queryDigits = stripNisSymbols(val);

      const filtered = studentDirectory
        .filter((s) => {
          if (!query && !queryDigits) return true;
          return (
            norm(s.nama).includes(query) ||
            norm(s.nis).includes(query) ||
            (queryDigits && stripNisSymbols(s.nis).includes(queryDigits)) ||
            norm(s.kelas).includes(query) ||
            norm(s.jurusan).includes(query)
          );
        })
        .sort((a, b) => {
          const aStarts =
            norm(a.nama).startsWith(query) ||
            (queryDigits && stripNisSymbols(a.nis).startsWith(queryDigits)) ||
            norm(a.nis).startsWith(query)
              ? 0
              : 1;
          const bStarts =
            norm(b.nama).startsWith(query) ||
            (queryDigits && stripNisSymbols(b.nis).startsWith(queryDigits)) ||
            norm(b.nis).startsWith(query)
              ? 0
              : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          return a.nama.localeCompare(b.nama);
        })
        .slice(0, 25);

      return (
        <div className="relative">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              inputMode={isNisField ? 'numeric' : undefined}
              value={displayVal}
              autoComplete="off"
              onFocus={() => setOpenAutocompleteKey(key)}
              onBlur={() => setTimeout(() => setOpenAutocompleteKey((k) => (k === key ? null : k)), 140)}
              onKeyDown={(e) => {
                if (!isNisField) return;
                handleNisKeyDown(e, nisDigits, (nextDigits, nextPos) => {
                  const inputEl = e.currentTarget;
                  setValue(key, nextDigits);
                  setOpenAutocompleteKey(key);
                  if (nextDigits.length >= 4) {
                    const exactMatch = studentDirectory.find(
                      (s) => stripNisSymbols(s.nis) === nextDigits
                    );
                    if (exactMatch) {
                      applyStudentSelection(exactMatch, { [key]: nextDigits });
                    }
                  }
                  if (nextPos !== undefined) {
                    requestAnimationFrame(() => {
                      try {
                        inputEl.setSelectionRange(nextPos, nextPos);
                      } catch {
                        // ignore
                      }
                    });
                  }
                });
              }}
              onChange={(e) => {
                if (isNisField) {
                  processNisInputChange(e, (nextDigits) => {
                    setValue(key, nextDigits);
                    setOpenAutocompleteKey(key);
                    if (nextDigits.length >= 4) {
                      const exactMatch = studentDirectory.find(
                        (s) => stripNisSymbols(s.nis) === nextDigits
                      );
                      if (exactMatch) {
                        applyStudentSelection(exactMatch, { [key]: nextDigits });
                      }
                    }
                  });
                  return;
                }
                const next = e.target.value;
                setValue(key, next);
                setOpenAutocompleteKey(key);
                const qTrim = next.trim();
                if (qTrim.length >= 4) {
                  const exactMatch = studentDirectory.find(
                    (s) => s.nis === qTrim || norm(s.nama) === norm(qTrim)
                  );
                  if (exactMatch) {
                    applyStudentSelection(exactMatch, { [key]: next });
                  }
                }
              }}
              placeholder={
                loadingRelations
                  ? `Memuat daftar siswa...`
                  : isNisField
                  ? 'Ketik angka NIS (cth: 23241/001/001)...'
                  : field.placeholder || `Ketik nama atau NIS siswa...`
              }
              className={`w-full h-10 pl-8 pr-8 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
                isNisField ? 'font-mono tabular-nums' : ''
              } ${err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'}`}
            />
            {displayVal && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setValue(key, '');
                  setOpenAutocompleteKey(key);
                }}
                aria-label="Bersihkan pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {isDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
              {loadingRelations ? (
                <div className="px-3 py-2.5 text-xs text-slate-500">
                  Memuat daftar siswa dari Cloud Server...
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-slate-500">
                  Tidak ada siswa cocok dengan &quot;{displayVal}&quot;. Anda tetap dapat menyimpan input manual ini.
                </div>
              ) : (
                filtered.map((stu, idx) => {
                  const isCurrent =
                    (key === 'nis' && nisDigits !== '' && stripNisSymbols(stu.nis) === nisDigits) ||
                    (key !== 'nis' && norm(stu.nama) === query);
                  return (
                    <button
                      type="button"
                      key={`${stu.nis || stu.nama}_${idx}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyStudentSelection(stu);
                        setOpenAutocompleteKey(null);
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        isCurrent ? 'bg-blue-50/80' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {stu.nama}{' '}
                          <span className="font-mono text-[11px] font-normal text-slate-500">
                            ({stu.nis ? formatNisVisual(stu.nis) : 'Tanpa NIS'})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {stu.kelas || '-'} · {stu.jurusan || '-'}
                          {resolvePreferredDudi(stu).dudiTujuan
                            ? ` · DUDI: ${resolvePreferredDudi(stu).dudiTujuan}`
                            : ''}
                        </div>
                      </div>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      );
    }

    if (field.relationSource === 'dudi') {
      const selectedJurusanRaw = String(values.jurusan || '').trim();
      const selectedJurusanNorm = norm(selectedJurusanRaw);
      const selectedJurusanCode = norm(generateJurusanCode(selectedJurusanRaw));

      const isJurusanMatchedDudi = (d: Dudi): boolean => {
        if (!selectedJurusanNorm) return false;
        const bidang = norm(d.bidangKeahlian);
        const nama = norm(d.namaDudi);
        return Boolean(
          (bidang && (bidang.includes(selectedJurusanNorm) || (selectedJurusanCode && bidang.includes(selectedJurusanCode)))) ||
            (selectedJurusanCode && nama.includes(selectedJurusanCode))
        );
      };

      const filteredDudi = masterDudi
        .filter((d) => {
          if (!query) return true;
          return (
            norm(d.namaDudi).includes(query) ||
            norm(d.wilayahKota).includes(query) ||
            norm(d.alamat).includes(query) ||
            norm(d.bidangKeahlian).includes(query)
          );
        })
        .sort((a, b) => {
          const aMatch = isJurusanMatchedDudi(a) ? 0 : 1;
          const bMatch = isJurusanMatchedDudi(b) ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
          return String(a.namaDudi || '').localeCompare(String(b.namaDudi || ''));
        })
        .slice(0, 25);

      return (
        <div className="relative">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={val}
              autoComplete="off"
              onFocus={() => setOpenAutocompleteKey(key)}
              onBlur={() => setTimeout(() => setOpenAutocompleteKey((k) => (k === key ? null : k)), 140)}
              onChange={(e) => {
                const next = e.target.value;
                dudiManuallyEditedRef.current = true;
                setValue(key, next);
                setOpenAutocompleteKey(key);
                const exact = masterDudi.find((d) => norm(d.namaDudi) === norm(next));
                if (exact) {
                  applyDudiSelection(exact, key, next);
                }
              }}
              placeholder={
                loadingRelations
                  ? `Memuat daftar DUDI...`
                  : field.placeholder || `Ketik atau pilih nama DUDI mitra...`
              }
              className={`w-full h-10 pl-8 pr-8 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
                err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
              }`}
            />
            {val && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  dudiManuallyEditedRef.current = true;
                  setValue(key, '');
                  setOpenAutocompleteKey(key);
                }}
                aria-label="Bersihkan pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {isDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
              {loadingRelations ? (
                <div className="px-3 py-2.5 text-xs text-slate-500">
                  Memuat daftar DUDI dari Cloud Server...
                </div>
              ) : filteredDudi.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-slate-500">
                  Tidak ada mitra DUDI cocok dengan &quot;{val}&quot;. Anda tetap dapat menggunakan nama manual ini.
                </div>
              ) : (
                filteredDudi.map((d, idx) => {
                  const isCurrent = norm(d.namaDudi) === query;
                  const jurusanFit = isJurusanMatchedDudi(d);
                  return (
                    <button
                      type="button"
                      key={`${d.id || d.namaDudi}_${idx}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyDudiSelection(d, key);
                        setOpenAutocompleteKey(null);
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        isCurrent ? 'bg-blue-50/80' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1.5">
                          <span className="truncate">{d.namaDudi}</span>
                          <span className="text-[11px] font-normal text-slate-500 shrink-0">
                            ({d.terisi ?? 0}/{d.kuotaMaksimal ?? 0})
                          </span>
                          {jurusanFit && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded shrink-0">
                              Sesuai Jurusan
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {d.wilayahKota ? `${d.wilayahKota} · ` : ''}
                          {d.alamat || '-'}
                        </div>
                      </div>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const renderFieldInput = (field: FieldConfig<T>) => {
    const key = String(field.key);
    const val = values[key];
    const err = errors[key];
    const isDisabled = Boolean(field.disabled);

    if (isDisabled) {
      return (
        <div className="relative">
          <input
            type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
            value={val ?? ''}
            disabled
            readOnly
            placeholder={field.placeholder || 'Otomatis oleh sistem'}
            className="w-full h-10 px-3 pr-8 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-600 font-medium cursor-not-allowed tabular-nums"
          />
          <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      );
    }

    if (
      field.autocomplete &&
      field.relationSource &&
      (field.relationSource === 'siswa' || field.relationSource === 'dudi') &&
      !manualFields[key]
    ) {
      return renderAutocompleteInput(field);
    }

    if (field.relationSource) {
      const dynamicOpts = getRelationOptions(field);
      const isManual =
        Boolean(manualFields[key]) ||
        (field.allowCustomValue && dynamicOpts.length === 0 && !loadingRelations);

      if (!isManual && dynamicOpts.length > 0) {
        const currentStr = String(val ?? '').trim();
        const hasCurrentInList =
          !currentStr || dynamicOpts.some((opt) => opt.value === currentStr);

        return (
          <select
            value={val ?? ''}
            onChange={(e) => handleRelationSelect(field, e.target.value)}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          >
            <option value="">
              {loadingRelations
                ? `Memuat daftar ${field.label}...`
                : `-- Pilih ${field.label} --`}
            </option>
            {!hasCurrentInList && (
              <option value={currentStr}>{currentStr} (Data Saat Ini)</option>
            )}
            {dynamicOpts.map((opt, idx) => (
              <option key={`${opt.value}-${idx}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }
    }

    const handleFieldChange = (fieldKey: string, nextVal: any) => {
      // Auto-fill Kode Jurusan when typing Nama Program Keahlian
      if (moduleId === 'jurusan' && fieldKey === 'nama' && formFieldKeys.has('kode')) {
        const autoKode = generateJurusanCode(String(nextVal || ''));
        setMultipleValues({
          nama: nextVal,
          kode: autoKode || values.kode || '',
        });
        return;
      }

      const gradeKeys = new Set([
        'nilaiK3lh',
        'nilaiSoftskill',
        'nilaiKompetensiTeknis',
        'nilaiAlurBisnis',
      ]);
      if (gradeKeys.has(fieldKey) && formFieldKeys.has('nilaiRataRata')) {
        const mergedGrades: Record<string, any> = {
          nilaiK3lh: fieldKey === 'nilaiK3lh' ? nextVal : values.nilaiK3lh,
          nilaiSoftskill: fieldKey === 'nilaiSoftskill' ? nextVal : values.nilaiSoftskill,
          nilaiKompetensiTeknis:
            fieldKey === 'nilaiKompetensiTeknis' ? nextVal : values.nilaiKompetensiTeknis,
          nilaiAlurBisnis: fieldKey === 'nilaiAlurBisnis' ? nextVal : values.nilaiAlurBisnis,
        };
        const nums = Object.values(mergedGrades)
          .filter((v) => v !== '' && v !== null && v !== undefined && !isNaN(Number(v)))
          .map((v) => Math.min(100, Math.max(0, Number(v))));
        const patch: Record<string, any> = { [fieldKey]: nextVal };
        if (nums.length > 0) {
          const avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
          patch.nilaiRataRata = avg;
          if (formFieldKeys.has('predikat')) {
            patch.predikat = getPredikatFromScore(avg);
          }
        }
        setMultipleValues(patch);
        return;
      }
      setValue(fieldKey, nextVal);
    };

    switch (field.type) {
      case 'select': {
        const currentStr = String(val ?? '').trim();
        const hasMatch =
          !currentStr || (field.options || []).some((opt) => String(opt.value) === currentStr);
        return (
          <select
            value={val ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          >
            <option value="">-- Pilih {field.label} --</option>
            {!hasMatch && (
              <option value={currentStr}>{currentStr} (Data Saat Ini)</option>
            )}
            {field.options?.map((opt) => (
              <option key={String(opt.value)} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }

      case 'textarea':
        return (
          <textarea
            rows={3}
            value={val ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            placeholder={field.placeholder || `Masukkan ${field.label}...`}
            className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={val ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={field.placeholder}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={val ?? ''}
            onChange={(e) => setValue(key, e.target.value)}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
        );

      case 'boolean':
        return (
          <label className="flex items-center gap-2.5 h-10 cursor-pointer">
            <input
              type="checkbox"
              checked={!!val}
              onChange={(e) => setValue(key, e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            <span className="text-sm text-slate-700 select-none">
              {val ? 'Sudah Terlaksana / Ya' : 'Belum Terlaksana / Tidak'}
            </span>
          </label>
        );

      case 'image':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {val ? (
                <img
                  src={val}
                  alt="Preview"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[11px] shrink-0">
                  Foto
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (onOpenImageCropper) {
                    onOpenImageCropper(val || '', (newUrl) => setValue(key, newUrl));
                  } else {
                    setImageUrlInputKey((prev) => (prev === key ? null : key));
                  }
                }}
                className="h-9 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{val ? 'Ganti Foto (Crop/Resize)' : 'Pilih Foto (Crop/Resize)'}</span>
              </button>
            </div>
            {imageUrlInputKey === key && (
              <input
                type="url"
                value={val ?? ''}
                onChange={(e) => setValue(key, e.target.value)}
                placeholder="Tempel URL gambar atau data URL..."
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            )}
          </div>
        );

      case 'text':
      default: {
        if (key === 'nis') {
          const nisDigits = stripNisSymbols(val);
          return (
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={formatNisVisual(nisDigits, '')}
              onKeyDown={(e) =>
                handleNisKeyDown(e, nisDigits, (nextDigits, nextPos) => {
                  const inputEl = e.currentTarget;
                  handleFieldChange(key, nextDigits);
                  if (nextPos !== undefined) {
                    requestAnimationFrame(() => {
                      try {
                        inputEl.setSelectionRange(nextPos, nextPos);
                      } catch {
                        // ignore
                      }
                    });
                  }
                })
              }
              onChange={(e) =>
                processNisInputChange(e, (nextDigits) => handleFieldChange(key, nextDigits))
              }
              placeholder={field.placeholder || 'Contoh: 23241/001/001'}
              className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
                err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
              }`}
            />
          );
        }
        if (isPhoneFieldKey(key)) {
          const waHref = getWhatsAppHref(val);
          const displayPhone = formatPhoneDisplay(val, '');
          return (
            <div className="flex items-center gap-2">
              <input
                type="tel"
                inputMode="tel"
                value={val ?? ''}
                onChange={(e) => handleFieldChange(key, e.target.value)}
                placeholder={field.placeholder || `Masukkan ${field.label}...`}
                className={`flex-1 min-w-0 h-10 px-3 bg-white border rounded-lg text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
                  err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
                }`}
              />
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Buka chat WhatsApp ke ${displayPhone}`}
                  className="h-10 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Chat WA</span>
                </a>
              )}
            </div>
          );
        }
        return (
          <input
            type="text"
            value={val ?? ''}
            onChange={(e) => handleFieldChange(key, e.target.value)}
            placeholder={field.placeholder || `Masukkan ${field.label}...`}
            className={`w-full h-10 px-3 bg-white border rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors ${
              err ? 'border-rose-400 focus:ring-rose-400/30' : 'border-slate-300'
            }`}
          />
        );
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="min-w-0 pr-3">
            <h3 className="text-base font-bold text-slate-900 truncate">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Isi data sesuai standar administrasi Hubin SMK PGRI 2 Ponorogo
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 flex items-center justify-center transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form with Scrollable Body + Fixed Footer */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {formFields.map((field) => {
                const key = String(field.key);
                const isFullWidth = field.type === 'textarea' || field.type === 'image';
                const err = errors[key];
                const canToggleManual =
                  !field.disabled &&
                  !field.autocomplete &&
                  Boolean(field.relationSource) &&
                  Boolean(field.allowCustomValue) &&
                  getRelationOptions(field).length > 0;
                const isManual = Boolean(manualFields[key]);

                return (
                  <div key={key} className={isFullWidth ? 'sm:col-span-2' : ''}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        {field.label}
                        {field.validation?.required && !field.disabled && (
                          <span className="text-rose-500 ml-1">*</span>
                        )}
                      </label>
                      {field.disabled && (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                          Otomatis
                        </span>
                      )}
                      {canToggleManual && (
                        <button
                          type="button"
                          onClick={() =>
                            setManualFields((prev) => ({ ...prev, [key]: !prev[key] }))
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>{isManual ? 'Pilih dari Master' : 'Input Manual'}</span>
                        </button>
                      )}
                    </div>
                    {renderFieldInput(field)}
                    {err && (
                      <div className="flex items-center gap-1 text-xs text-rose-600 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{err}</span>
                      </div>
                    )}
                    {field.helperText && !err && (
                      <p className="text-[11px] text-slate-400 mt-1">{field.helperText}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fixed Footer Actions */}
          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-9 px-4 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 inline-flex items-center gap-1.5 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>{submitting ? 'Menyimpan...' : 'Simpan Data'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
