import { Dudi, Guru, Jurusan, Kelas, PenempatanPKL, Siswa } from '../core/types/schema';
import { DudiService } from './DudiService';
import { GuruService } from './GuruService';
import { JurusanService } from './JurusanService';
import { KelasService } from './KelasService';
import { SiswaPklService } from './SiswaPklService';
import { SiswaService } from './SiswaService';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { stripNisSymbols } from '../core/utils/nisHelpers';
import {
  getCanonicalNisDigits,
  isActivePlacementStatus,
  normalizeRelationText,
} from '../core/utils/relationHelpers';

export interface RelationSyncSummary {
  updatedPlacements: number;
  updatedDudi: number;
  updatedGuru: number;
  updatedJurusan: number;
  updatedKelas: number;
}

const normalize = normalizeRelationText;

function getStudentIdentityKey(nis?: unknown, nama?: unknown, kelas?: unknown): string {
  const digitsNis = getCanonicalNisDigits(nis);
  if (digitsNis) {
    return `nis:${digitsNis}`;
  }
  const cleanNama = normalize(nama);
  const cleanKelas = normalize(kelas);
  return cleanNama ? `nama:${cleanNama}|${cleanKelas}` : '';
}

function cleanVal(v: unknown): string {
  const s = String(v ?? '').trim();
  return s === '-' ? '' : s;
}

export class RelationSyncService {
  private static instance: RelationSyncService;

  private constructor() {}

  public static getInstance(): RelationSyncService {
    if (!RelationSyncService.instance) {
      RelationSyncService.instance = new RelationSyncService();
    }
    return RelationSyncService.instance;
  }

  /**
   * Cascade Master_Siswa_XI (Single Source of Truth) identity fields keyed strictly by NIS
   * to Pengajuan, Perizinan, Data Siswa PKL, Monitoring, and Sertifikat.
   */
  public async cascadeMasterStudentUpdates(): Promise<{ updatedRecords: number }> {
    const [
      { PengajuanService },
      { PerizinanService },
      { MonitoringService },
      { SertifikatService },
    ] = await Promise.all([
      import('./PengajuanService'),
      import('./PerizinanService'),
      import('./MonitoringService'),
      import('./SertifikatService'),
    ]);

    const [siswaList, pengajuanList, perizinanList, placements, monitorings, sertifikats] =
      await Promise.all([
        SiswaService.getInstance().getAll(),
        PengajuanService.getInstance().getAll().catch(() => []),
        PerizinanService.getInstance().getAll().catch(() => []),
        SiswaPklService.getInstance().getAll().catch(() => []),
        MonitoringService.getInstance().getAll().catch(() => []),
        SertifikatService.getInstance().getAll().catch(() => []),
      ]);

    const siswaByNis = new Map<string, Siswa>();
    for (const s of siswaList) {
      const nisKey = getCanonicalNisDigits(s.nis);
      if (nisKey && !siswaByNis.has(nisKey)) {
        siswaByNis.set(nisKey, s);
      }
    }
    if (siswaByNis.size === 0) return { updatedRecords: 0 };

    let updatedRecords = 0;
    const silent = { silentToast: true };

    for (const req of pengajuanList) {
      const nisKey = getCanonicalNisDigits(req.nis);
      const matched = nisKey ? siswaByNis.get(nisKey) : undefined;
      if (!matched) continue;
      const canonicalNis = stripNisSymbols(matched.nis) || matched.nis;
      const patch: Record<string, any> = {};
      if (matched.nama && req.namaSiswa !== matched.nama) patch.namaSiswa = matched.nama;
      if (canonicalNis && req.nis !== canonicalNis) patch.nis = canonicalNis;
      if (matched.jurusan && req.jurusan !== matched.jurusan) patch.jurusan = matched.jurusan;
      if (matched.kelas && req.kelas !== matched.kelas) patch.kelas = matched.kelas;
      if (cleanVal(matched.namaOrtuWali) && cleanVal(req.namaOrtuWali) !== cleanVal(matched.namaOrtuWali)) {
        patch.namaOrtuWali = matched.namaOrtuWali;
      }
      if (cleanVal(matched.noOrtuWali) && cleanVal(req.noOrtuWali) !== cleanVal(matched.noOrtuWali)) {
        patch.noOrtuWali = matched.noOrtuWali;
      }
      if (cleanVal(matched.noHpSiswa) && cleanVal(req.noWa) !== cleanVal(matched.noHpSiswa)) {
        patch.noWa = matched.noHpSiswa;
      }
      if (Object.keys(patch).length > 0) {
        await PengajuanService.getInstance().update(req.id, patch, silent);
        updatedRecords++;
      }
    }

    for (const izn of perizinanList) {
      const nisKey = getCanonicalNisDigits(izn.nis);
      const matched = nisKey ? siswaByNis.get(nisKey) : undefined;
      if (!matched) continue;
      const canonicalNis = stripNisSymbols(matched.nis) || matched.nis;
      const patch: Record<string, any> = {};
      if (matched.nama && izn.namaSiswa !== matched.nama) patch.namaSiswa = matched.nama;
      if (canonicalNis && izn.nis !== canonicalNis) patch.nis = canonicalNis;
      if (matched.jurusan && izn.jurusan !== matched.jurusan) patch.jurusan = matched.jurusan;
      if (matched.kelas && izn.kelas !== matched.kelas) patch.kelas = matched.kelas;
      if (cleanVal(matched.namaOrtuWali) && cleanVal(izn.namaOrtuWali) !== cleanVal(matched.namaOrtuWali)) {
        patch.namaOrtuWali = matched.namaOrtuWali;
      }
      if (Object.keys(patch).length > 0) {
        await PerizinanService.getInstance().update(izn.id, patch, silent);
        updatedRecords++;
      }
    }

    for (const p of placements) {
      const nisKey = getCanonicalNisDigits(p.nis);
      const matched = nisKey ? siswaByNis.get(nisKey) : undefined;
      if (!matched) continue;
      const canonicalNis = stripNisSymbols(matched.nis) || matched.nis;
      const patch: Record<string, any> = {};
      if (matched.nama && p.namaSiswa !== matched.nama) patch.namaSiswa = matched.nama;
      if (canonicalNis && p.nis !== canonicalNis) patch.nis = canonicalNis;
      if (Object.keys(patch).length > 0) {
        await SiswaPklService.getInstance().update(p.id, patch, silent);
        updatedRecords++;
      }
    }

    for (const m of monitorings) {
      const nisKey = getCanonicalNisDigits(m.nis);
      const matched = nisKey ? siswaByNis.get(nisKey) : undefined;
      if (!matched) continue;
      const canonicalNis = stripNisSymbols(matched.nis) || matched.nis;
      const patch: Record<string, any> = {};
      if (matched.nama && m.namaSiswa !== matched.nama) patch.namaSiswa = matched.nama;
      if (canonicalNis && m.nis !== canonicalNis) patch.nis = canonicalNis;
      if (matched.jurusan && m.jurusan !== matched.jurusan) patch.jurusan = matched.jurusan;
      if (Object.keys(patch).length > 0) {
        await MonitoringService.getInstance().update(m.id, patch, silent);
        updatedRecords++;
      }
    }

    for (const sert of sertifikats) {
      const nisKey = getCanonicalNisDigits(sert.nis);
      const matched = nisKey ? siswaByNis.get(nisKey) : undefined;
      if (!matched) continue;
      const canonicalNis = stripNisSymbols(matched.nis) || matched.nis;
      const patch: Record<string, any> = {};
      if (matched.nama && sert.namaSiswa !== matched.nama) patch.namaSiswa = matched.nama;
      if (canonicalNis && sert.nis !== canonicalNis) patch.nis = canonicalNis;
      if (matched.jurusan && sert.jurusan !== matched.jurusan) patch.jurusan = matched.jurusan;
      if (matched.kelas && sert.kelas !== matched.kelas) patch.kelas = matched.kelas;
      if (Object.keys(patch).length > 0) {
        await SertifikatService.getInstance().update(sert.id, patch, silent);
        updatedRecords++;
      }
    }

    return { updatedRecords };
  }

  /**
   * Sync Master_DUDI name/address changes ONLY by ID_DUDI.
   * Intentionally preserves historical guruPendamping on existing placements & pengajuan.
   */
  public async cascadeMasterDudiNameUpdates(): Promise<{ updatedRecords: number }> {
    const [{ PengajuanService }] = await Promise.all([import('./PengajuanService')]);
    const [dudiList, pengajuanList, placements] = await Promise.all([
      DudiService.getInstance().getAll(),
      PengajuanService.getInstance().getAll().catch(() => []),
      SiswaPklService.getInstance().getAll().catch(() => []),
    ]);

    const dudiById = new Map<string, Dudi>();
    for (const d of dudiList) {
      if (d.id) dudiById.set(d.id, d);
    }
    if (dudiById.size === 0) return { updatedRecords: 0 };

    let updatedRecords = 0;
    const silent = { silentToast: true };

    for (const p of placements) {
      if (!p.idDudi) continue;
      const matched = dudiById.get(p.idDudi);
      if (!matched) continue;
      if (matched.namaDudi && p.namaDudi !== matched.namaDudi) {
        await SiswaPklService.getInstance().update(p.id, { namaDudi: matched.namaDudi }, silent);
        updatedRecords++;
      }
    }

    for (const req of pengajuanList) {
      if (!req.idDudi) continue;
      const matched = dudiById.get(req.idDudi);
      if (!matched) continue;
      const patch: Record<string, any> = {};
      if (matched.namaDudi && req.dudiTujuan !== matched.namaDudi) {
        patch.dudiTujuan = matched.namaDudi;
      }
      if (matched.alamat && req.alamatDudi !== matched.alamat) {
        patch.alamatDudi = matched.alamat;
      }
      if (Object.keys(patch).length > 0) {
        await PengajuanService.getInstance().update(req.id, patch, silent);
        updatedRecords++;
      }
    }

    return { updatedRecords };
  }

  /**
   * Sync Master_Guru_Pendamping name & ID across Master_DUDI, Data_Pengajuan_PKL, Plotting_Pemberangkatan, and Monitoring_5_Tahap.
   */
  public async cascadeMasterGuruNameUpdates(): Promise<{ updatedRecords: number }> {
    const [{ PengajuanService }, { MonitoringService }] = await Promise.all([
      import('./PengajuanService'),
      import('./MonitoringService'),
    ]);
    const [guruList, dudiList, pengajuanList, placements, monitorings] = await Promise.all([
      GuruService.getInstance().getAll().catch(() => []),
      DudiService.getInstance().getAll().catch(() => []),
      PengajuanService.getInstance().getAll().catch(() => []),
      SiswaPklService.getInstance().getAll().catch(() => []),
      MonitoringService.getInstance().getAll().catch(() => []),
    ]);

    const guruById = new Map<string, Guru>();
    const guruNameCount = new Map<string, number>();
    const guruByName = new Map<string, Guru>();
    for (const g of guruList) {
      if (g.id) guruById.set(g.id, g);
      if (g.nama) {
        const key = normalize(g.nama);
        guruNameCount.set(key, (guruNameCount.get(key) || 0) + 1);
        guruByName.set(key, g);
      }
    }
    if (guruById.size === 0) return { updatedRecords: 0 };

    const resolveGuru = (idVal?: string, namaVal?: string): Guru | undefined => {
      if (idVal && guruById.has(idVal)) return guruById.get(idVal);
      const key = namaVal ? normalize(namaVal) : '';
      if (key && guruNameCount.get(key) === 1) return guruByName.get(key);
      return undefined;
    };

    let updatedRecords = 0;
    const silent = { silentToast: true };

    for (const d of dudiList) {
      const matched = resolveGuru(d.idGuruPendamping, d.guruPendamping);
      if (!matched?.nama) continue;
      if (d.idGuruPendamping !== matched.id || d.guruPendamping !== matched.nama) {
        await DudiService.getInstance().update(
          d.id,
          { idGuruPendamping: matched.id, guruPendamping: matched.nama },
          silent
        );
        updatedRecords++;
      }
    }

    for (const req of pengajuanList) {
      const matched = resolveGuru(req.idGuruPendamping, req.guruPendamping);
      if (!matched?.nama) continue;
      if (req.idGuruPendamping !== matched.id || req.guruPendamping !== matched.nama) {
        await PengajuanService.getInstance().update(
          req.id,
          { idGuruPendamping: matched.id, guruPendamping: matched.nama },
          silent
        );
        updatedRecords++;
      }
    }

    for (const p of placements) {
      const matched = resolveGuru(p.idGuruPendamping, p.guruPendamping);
      if (!matched?.nama) continue;
      if (p.idGuruPendamping !== matched.id || p.guruPendamping !== matched.nama) {
        await SiswaPklService.getInstance().update(
          p.id,
          { idGuruPendamping: matched.id, guruPendamping: matched.nama },
          silent
        );
        updatedRecords++;
      }
    }

    const placementByIdPenempatan = new Map<string, (typeof placements)[number]>();
    for (const p of placements) {
      if (p.idPenempatan) placementByIdPenempatan.set(p.idPenempatan, p);
      if (p.id) placementByIdPenempatan.set(p.id, p);
    }

    for (const m of monitorings) {
      const linkedPlacement = m.idPenempatan ? placementByIdPenempatan.get(m.idPenempatan) : undefined;
      const matched = resolveGuru(linkedPlacement?.idGuruPendamping, linkedPlacement?.guruPendamping || m.guruPendamping);
      if (matched?.nama && m.guruPendamping !== matched.nama) {
        await MonitoringService.getInstance().update(m.id, { guruPendamping: matched.nama }, silent);
        updatedRecords++;
      }
    }

    return { updatedRecords };
  }

  /**
   * Recalculates placement-dependent counters:
   * - Master_DUDI.terisi
   * - Master_Guru_Pendamping.jumlahBimbingan
   * ONLY counting ACTIVE placements (Terjadwal / Sedang Berjalan).
   * Selesai PKL, Pindah DUDI, and Dibatalkan automatically release quota and load.
   */
  public async syncPlacementCounts(
    options: { silentToast?: boolean } = { silentToast: true }
  ): Promise<{ updatedDudi: number; updatedGuru: number }> {
    const silentOpts = { silentToast: options.silentToast !== false };
    const [dudiList, guruList, placements] = await Promise.all([
      DudiService.getInstance().getAll(),
      GuruService.getInstance().getAll(),
      SiswaPklService.getInstance().getAll(),
    ]);

    const activePlacements = placements.filter((p) =>
      isActivePlacementStatus(p.statusPenempatan)
    );

    const dudiById = new Map<string, Dudi>();
    const dudiByName = new Map<string, Dudi>();
    for (const d of dudiList) {
      if (d.id) dudiById.set(d.id, d);
      if (d.namaDudi) dudiByName.set(normalize(d.namaDudi), d);
    }

    const guruById = new Map<string, Guru>();
    const guruByName = new Map<string, Guru>();
    for (const g of guruList) {
      if (g.id) guruById.set(g.id, g);
      if (g.nama) guruByName.set(normalize(g.nama), g);
    }

    const dudiCounts = new Map<string, number>();
    const guruCounts = new Map<string, number>();

    for (const p of activePlacements) {
      const matchedDudi =
        (p.idDudi && dudiById.get(p.idDudi)) ||
        (p.namaDudi && dudiByName.get(normalize(p.namaDudi)));
      if (matchedDudi) {
        dudiCounts.set(matchedDudi.id, (dudiCounts.get(matchedDudi.id) || 0) + 1);
      }

      const matchedGuru =
        (p.idGuruPendamping && guruById.get(p.idGuruPendamping)) ||
        (p.guruPendamping && guruByName.get(normalize(p.guruPendamping)));
      if (matchedGuru) {
        guruCounts.set(matchedGuru.id, (guruCounts.get(matchedGuru.id) || 0) + 1);
      }
    }

    let updatedDudi = 0;
    for (const d of dudiList) {
      const nextCount = dudiCounts.get(d.id) || 0;
      if (Number(d.terisi || 0) !== nextCount) {
        await DudiService.getInstance().update(d.id, { terisi: nextCount }, silentOpts);
        updatedDudi++;
      }
    }

    let updatedGuru = 0;
    for (const g of guruList) {
      const nextCount = guruCounts.get(g.id) || 0;
      if (Number(g.jumlahBimbingan || 0) !== nextCount) {
        await GuruService.getInstance().update(g.id, { jumlahBimbingan: nextCount }, silentOpts);
        updatedGuru++;
      }
    }

    return { updatedDudi, updatedGuru };
  }

  /**
   * Recalculates Master_Jurusan.kuotaSiswa (Target Kuota = all students inputted by Hubin in Master_Siswa_XI)
   * and Master_Jurusan.totalTerdaftar (Siswa Terdaftar = unique students in that jurusan actively enrolled in PKL).
   */
  public async syncJurusanCounts(
    options: { silentToast?: boolean } = { silentToast: true }
  ): Promise<{ updatedJurusan: number }> {
    const silentOpts = { silentToast: options.silentToast !== false };
    const [{ PengajuanService }, { PerizinanService }] = await Promise.all([
      import('./PengajuanService'),
      import('./PerizinanService'),
    ]);

    const [siswaList, jurusanList, pengajuanList, perizinanList, placements] = await Promise.all([
      SiswaService.getInstance().getAll(),
      JurusanService.getInstance().getAll(),
      PengajuanService.getInstance().getAll().catch(() => []),
      PerizinanService.getInstance().getAll().catch(() => []),
      SiswaPklService.getInstance().getAll().catch(() => []),
    ]);

    const jurusanByKey = new Map<string, Jurusan>();
    for (const j of jurusanList) {
      if (j.nama) jurusanByKey.set(normalize(j.nama), j);
      if (j.kode) jurusanByKey.set(normalize(j.kode), j);
    }

    const siswaByNis = new Map<string, Siswa>();
    const nameCounts = new Map<string, number>();
    const siswaByName = new Map<string, Siswa>();
    for (const s of siswaList) {
      const nisKey = getCanonicalNisDigits(s.nis);
      if (nisKey) siswaByNis.set(nisKey, s);
      if (s.nama) {
        const n = normalize(s.nama);
        nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
        siswaByName.set(n, s);
      }
    }

    const resolveSiswa = (nis: unknown, nama: unknown): Siswa | undefined => {
      const nisKey = getCanonicalNisDigits(nis);
      if (nisKey) return siswaByNis.get(nisKey);
      const n = normalize(nama);
      return n && (nameCounts.get(n) || 0) === 1 ? siswaByName.get(n) : undefined;
    };

    const kuotaCounts = new Map<string, number>();
    const registeredSets = new Map<string, Set<string>>();
    const ensureSet = (jurId: string) => {
      let set = registeredSets.get(jurId);
      if (!set) {
        set = new Set<string>();
        registeredSets.set(jurId, set);
      }
      return set;
    };

    for (const s of siswaList) {
      const matchedJur = s.jurusan ? jurusanByKey.get(normalize(s.jurusan)) : undefined;
      if (!matchedJur) continue;
      kuotaCounts.set(matchedJur.id, (kuotaCounts.get(matchedJur.id) || 0) + 1);

      const statusNorm = normalize(s.statusPKL);
      if (statusNorm && statusNorm !== 'belum daftar') {
        const key = getStudentIdentityKey(s.nis, s.nama, s.kelas);
        if (key) ensureSet(matchedJur.id).add(key);
      }
    }

    for (const req of pengajuanList) {
      if (normalize(req.statusKakomli) === 'ditolak' || normalize(req.statusHubin) === 'batal') {
        continue;
      }
      const matchedSiswa = resolveSiswa(req.nis, req.namaSiswa);
      const jurName = matchedSiswa?.jurusan || req.jurusan;
      const matchedJur = jurName ? jurusanByKey.get(normalize(jurName)) : undefined;
      if (!matchedJur) continue;

      const key = getStudentIdentityKey(
        matchedSiswa?.nis || req.nis,
        matchedSiswa?.nama || req.namaSiswa,
        matchedSiswa?.kelas || req.kelas
      );
      if (key) ensureSet(matchedJur.id).add(key);
    }

    for (const izn of perizinanList) {
      const matchedSiswa = resolveSiswa(izn.nis, izn.namaSiswa);
      const jurName = matchedSiswa?.jurusan || izn.jurusan;
      const matchedJur = jurName ? jurusanByKey.get(normalize(jurName)) : undefined;
      if (!matchedJur) continue;

      const key = getStudentIdentityKey(
        matchedSiswa?.nis || izn.nis,
        matchedSiswa?.nama || izn.namaSiswa,
        matchedSiswa?.kelas || izn.kelas
      );
      if (key) ensureSet(matchedJur.id).add(key);
    }

    for (const p of placements) {
      const st = normalize(p.statusPenempatan);
      if (st === 'dibatalkan' || st === 'batal') continue;
      const matchedSiswa = resolveSiswa(p.nis, p.namaSiswa);
      const matchedJur = matchedSiswa?.jurusan
        ? jurusanByKey.get(normalize(matchedSiswa.jurusan))
        : undefined;
      if (!matchedJur) continue;

      const key = getStudentIdentityKey(
        matchedSiswa?.nis || p.nis,
        matchedSiswa?.nama || p.namaSiswa,
        matchedSiswa?.kelas
      );
      if (key) ensureSet(matchedJur.id).add(key);
    }

    let updatedJurusan = 0;
    for (const j of jurusanList) {
      const nextKuota = kuotaCounts.get(j.id) || 0;
      const nextTerdaftar = registeredSets.get(j.id)?.size || 0;
      if (
        Number(j.kuotaSiswa || 0) !== nextKuota ||
        Number(j.totalTerdaftar || 0) !== nextTerdaftar
      ) {
        await JurusanService.getInstance().update(
          j.id,
          { kuotaSiswa: nextKuota, totalTerdaftar: nextTerdaftar },
          silentOpts
        );
        updatedJurusan++;
      }
    }

    return { updatedJurusan };
  }

  public async syncKelasCounts(
    options: { silentToast?: boolean } = { silentToast: true }
  ): Promise<{ updatedKelas: number }> {
    const silentOpts = { silentToast: options.silentToast !== false };
    const [siswaList, kelasList] = await Promise.all([
      SiswaService.getInstance().getAll(),
      KelasService.getInstance().getAll(),
    ]);

    const kelasByName = new Map<string, Kelas>();
    for (const k of kelasList) {
      if (k.namaKelas) kelasByName.set(normalize(k.namaKelas), k);
    }

    const kelasCounts = new Map<string, number>();
    for (const s of siswaList) {
      const matchedKls = s.kelas ? kelasByName.get(normalize(s.kelas)) : undefined;
      if (matchedKls) {
        kelasCounts.set(matchedKls.id, (kelasCounts.get(matchedKls.id) || 0) + 1);
      }
    }

    let updatedKelas = 0;
    for (const k of kelasList) {
      const nextCount = kelasCounts.get(k.id) || 0;
      if (Number(k.jumlahSiswa || 0) !== nextCount) {
        await KelasService.getInstance().update(k.id, { jumlahSiswa: nextCount }, silentOpts);
        updatedKelas++;
      }
    }

    return { updatedKelas };
  }

  /**
   * Lightweight automatic sync triggered after mutations on Master or dependent modules.
   */
  public async syncAfterMutation(
    moduleId: string,
    mutationType: 'create' | 'update' | 'delete' | 'import' = 'update'
  ): Promise<void> {
    if (moduleId === 'siswa' && mutationType !== 'create') {
      await this.cascadeMasterStudentUpdates().catch((err) =>
        console.warn('Student cascade sync warning:', err)
      );
    } else if (moduleId === 'dudi' && mutationType !== 'create') {
      await this.cascadeMasterDudiNameUpdates().catch((err) =>
        console.warn('DUDI cascade sync warning:', err)
      );
    } else if (moduleId === 'guru' && mutationType !== 'create') {
      await this.cascadeMasterGuruNameUpdates().catch((err) =>
        console.warn('Guru cascade sync warning:', err)
      );
    }

    if (moduleId === 'guru' || moduleId === 'dudi' || moduleId === 'pengajuan' || moduleId === 'siswa_pkl') {
      import('../core/PublicPortalClient')
        .then(({ PublicPortalClient }) => {
          PublicPortalClient.invalidateCaches?.();
        })
        .catch(() => {});
    }

    const serverRes = await GoogleSheetClient.getInstance()
      .recalculateRelationsOnServer(moduleId, true)
      .catch(() => ({ handledByServer: false, summary: undefined }));
    if (serverRes.handledByServer) {
      const summary = serverRes.summary;
      if (summary?.updatedGuru && summary.updatedGuru > 0 && moduleId !== 'guru') {
        await GuruService.getInstance().reloadFromSpreadsheet().catch(() => {});
      }
      if (summary?.updatedDudi && summary.updatedDudi > 0 && moduleId !== 'dudi') {
        await DudiService.getInstance().reloadFromSpreadsheet().catch(() => {});
      }
      return;
    }

    if (moduleId === 'siswa') {
      await Promise.all([
        this.syncJurusanCounts({ silentToast: true }),
        this.syncKelasCounts({ silentToast: true }),
      ]);
    } else if (moduleId === 'pengajuan' || moduleId === 'perizinan') {
      await Promise.all([
        this.syncJurusanCounts({ silentToast: true }),
        this.syncPlacementCounts({ silentToast: true }),
      ]);
    } else if (moduleId === 'siswa_pkl') {
      await Promise.all([
        this.syncPlacementCounts({ silentToast: true }),
        this.syncJurusanCounts({ silentToast: true }),
      ]);
    }
  }

  /**
   * Automatic sync when viewing summary/master modules so counts stay live.
   */
  public async syncForModuleView(moduleId: string): Promise<number> {
    const serverRes = await GoogleSheetClient.getInstance()
      .recalculateRelationsOnServer(moduleId)
      .catch(() => ({ handledByServer: false, summary: undefined }));
    if (serverRes.handledByServer && serverRes.summary) {
      const s = serverRes.summary;
      return s.updatedDudi + s.updatedGuru + s.updatedJurusan + s.updatedKelas;
    }

    if (moduleId === 'jurusan') {
      const { updatedJurusan } = await this.syncJurusanCounts({ silentToast: true });
      return updatedJurusan;
    }
    if (moduleId === 'guru' || moduleId === 'dudi') {
      const { updatedDudi, updatedGuru } = await this.syncPlacementCounts({ silentToast: true });
      return updatedDudi + updatedGuru;
    }
    if (moduleId === 'kelas') {
      const { updatedKelas } = await this.syncKelasCounts({ silentToast: true });
      return updatedKelas;
    }
    return 0;
  }

  /**
   * Full relational consistency check, Master_Siswa_XI cascade repair, ID backfill, & recalculation.
   */
  public async recalculateAllRelations(
    options: { backfillIds?: boolean } = {}
  ): Promise<RelationSyncSummary> {
    if (!options.backfillIds) {
      const serverRes = await GoogleSheetClient.getInstance()
        .recalculateRelationsOnServer('all')
        .catch(() => ({ handledByServer: false, summary: undefined }));
      if (serverRes.handledByServer && serverRes.summary) {
        return serverRes.summary;
      }
    }

    const [{ PengajuanService }] = await Promise.all([import('./PengajuanService')]);
    const siswaService = SiswaService.getInstance();
    const dudiService = DudiService.getInstance();
    const guruService = GuruService.getInstance();
    const siswaPklService = SiswaPklService.getInstance();
    const pengajuanService = PengajuanService.getInstance();

    // 1. Cascade Master_Siswa_XI names/NIS/jurusan/kelas across all dependent tables
    let updatedPlacements = 0;
    if (options.backfillIds) {
      const studentCascade = await this.cascadeMasterStudentUpdates().catch(() => ({
        updatedRecords: 0,
      }));
      updatedPlacements += studentCascade.updatedRecords;
    }

    const [siswaList, dudiList, guruList, placements, pengajuanList] = await Promise.all([
      siswaService.getAll(),
      dudiService.getAll(),
      guruService.getAll(),
      siswaPklService.getAll(),
      pengajuanService.getAll().catch(() => []),
    ]);

    const siswaByNis = new Map<string, Siswa>();
    for (const s of siswaList) {
      const nisDigits = getCanonicalNisDigits(s.nis);
      if (nisDigits) siswaByNis.set(nisDigits, s);
    }

    const dudiById = new Map<string, Dudi>();
    const dudiByName = new Map<string, Dudi>();
    for (const d of dudiList) {
      if (d.id) dudiById.set(d.id, d);
      if (d.namaDudi) dudiByName.set(normalize(d.namaDudi), d);
    }

    const guruById = new Map<string, Guru>();
    const guruByName = new Map<string, Guru>();
    for (const g of guruList) {
      if (g.id) guruById.set(g.id, g);
      if (g.nama) guruByName.set(normalize(g.nama), g);
    }

    if (options.backfillIds) {
      // Backfill ID_Guru_Pendamping on Master_DUDI if guruPendamping text is present
      for (const d of dudiList) {
        if (d.guruPendamping && !d.idGuruPendamping) {
          const matchedGuru = guruByName.get(normalize(d.guruPendamping));
          if (matchedGuru) {
            await dudiService.update(
              d.id,
              { idGuruPendamping: matchedGuru.id, guruPendamping: matchedGuru.nama },
              { silentToast: true }
            );
          }
        }
      }

      // Backfill ID_DUDI, ID_Guru_Pendamping (and default DUDI guru ONLY if blank) on Data_Pengajuan_PKL
      for (const req of pengajuanList) {
        const patch: Record<string, any> = {};
        const matchedDudi =
          (req.idDudi && dudiById.get(req.idDudi)) ||
          (req.dudiTujuan && dudiByName.get(normalize(req.dudiTujuan)));
        if (matchedDudi) {
          if (req.idDudi !== matchedDudi.id) patch.idDudi = matchedDudi.id;
          if (!req.guruPendamping && matchedDudi.guruPendamping) {
            patch.guruPendamping = matchedDudi.guruPendamping;
            if (matchedDudi.idGuruPendamping) patch.idGuruPendamping = matchedDudi.idGuruPendamping;
          }
        }
        const effectiveGuruName = patch.guruPendamping || req.guruPendamping;
        const matchedGuru =
          (req.idGuruPendamping && guruById.get(req.idGuruPendamping)) ||
          (effectiveGuruName && guruByName.get(normalize(effectiveGuruName)));
        if (matchedGuru) {
          if (req.idGuruPendamping !== matchedGuru.id) patch.idGuruPendamping = matchedGuru.id;
          if (effectiveGuruName !== matchedGuru.nama) patch.guruPendamping = matchedGuru.nama;
        }
        if (Object.keys(patch).length > 0) {
          await pengajuanService.update(req.id, patch, { silentToast: true });
          updatedPlacements++;
        }
      }

      // Backfill ID_DUDI, ID_Guru_Pendamping, and canonical Nama_Siswa on Plotting_Pemberangkatan
      for (const p of placements) {
        const patch: Partial<PenempatanPKL> = {};

        const matchedDudi =
          (p.idDudi && dudiById.get(p.idDudi)) ||
          (p.namaDudi && dudiByName.get(normalize(p.namaDudi)));
        if (matchedDudi) {
          if (p.idDudi !== matchedDudi.id) patch.idDudi = matchedDudi.id;
          if (p.namaDudi !== matchedDudi.namaDudi) patch.namaDudi = matchedDudi.namaDudi;
        }

        const matchedGuru =
          (p.idGuruPendamping && guruById.get(p.idGuruPendamping)) ||
          (p.guruPendamping && guruByName.get(normalize(p.guruPendamping)));
        if (matchedGuru) {
          if (p.idGuruPendamping !== matchedGuru.id) patch.idGuruPendamping = matchedGuru.id;
          if (p.guruPendamping !== matchedGuru.nama) patch.guruPendamping = matchedGuru.nama;
        }

        const pNisDigits = getCanonicalNisDigits(p.nis);
        const matchedSiswa = pNisDigits ? siswaByNis.get(pNisDigits) : undefined;
        if (matchedSiswa && matchedSiswa.nama && p.namaSiswa !== matchedSiswa.nama) {
          patch.namaSiswa = matchedSiswa.nama;
        }

        if (Object.keys(patch).length > 0) {
          await siswaPklService.update(p.id, patch, { silentToast: true });
          updatedPlacements++;
        }
      }
    }

    // 2. Recalculate placements, jurusan (kuotaSiswa + totalTerdaftar), and kelas
    const [placementRes, jurusanRes, kelasRes] = await Promise.all([
      this.syncPlacementCounts({ silentToast: true }),
      this.syncJurusanCounts({ silentToast: true }),
      this.syncKelasCounts({ silentToast: true }),
    ]);

    return {
      updatedPlacements,
      updatedDudi: placementRes.updatedDudi,
      updatedGuru: placementRes.updatedGuru,
      updatedJurusan: jurusanRes.updatedJurusan,
      updatedKelas: kelasRes.updatedKelas,
    };
  }
}

