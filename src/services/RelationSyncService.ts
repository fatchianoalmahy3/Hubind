import { Dudi, Guru, Jurusan, Kelas, PenempatanPKL, Pengajuan, Siswa } from '../core/types/schema';
import { DudiService } from './DudiService';
import { GuruService } from './GuruService';
import { JurusanService } from './JurusanService';
import { KelasService } from './KelasService';
import { SiswaPklService } from './SiswaPklService';
import { SiswaService } from './SiswaService';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { generateJurusanCode } from '../core/utils/autoIdHelpers';
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
  formulasApplied?: boolean;
}

const normalize = normalizeRelationText;

/**
 * Layanan sinkronisasi relasi Hybrid (Opsi 2):
 * - Kolom teks tampilan & agregat di Google Sheets dikelola oleh ARRAYFORMULA Baris-1 (read-only).
 * - RelationSyncService berfokus pada:
 *   1) Backfill & perbaikan Foreign Key (`ID_Jurusan`, `ID_DUDI`, `ID_Guru_Pendamping`, `ID_Penempatan`) + `Status_PKL`.
 *   2) Invalidasi cache klien & server secara cascading (`SHEET_DEPENDENTS_MAP`).
 *   3) Memicu `MIGRATE_RELATIONAL_FORMULAS` / server recalculation agar rumus tetap terpasang rapi.
 */
export class RelationSyncService {
  private static instance: RelationSyncService;

  private constructor() {}

  public static getInstance(): RelationSyncService {
    if (!RelationSyncService.instance) {
      RelationSyncService.instance = new RelationSyncService();
    }
    return RelationSyncService.instance;
  }

  private invalidatePortalCachesIfNeeded(moduleId: string): void {
    if (
      moduleId === 'all' ||
      moduleId === 'guru' ||
      moduleId === 'dudi' ||
      moduleId === 'pengajuan' ||
      moduleId === 'siswa_pkl' ||
      moduleId === 'monitoring' ||
      moduleId === 'sertifikat'
    ) {
      import('../core/PublicPortalClient')
        .then(({ PublicPortalClient }) => {
          PublicPortalClient.invalidateCaches?.();
        })
        .catch(() => {});
    }
  }

  /**
   * Sinkronisasi ringan otomatis setelah mutasi CRUD/Import pada modul.
   * Server membaca dari cache untuk tabel tak berubah & hanya menulis ulang sheet yang terpengaruh.
   */
  public async syncAfterMutation(
    moduleId: string,
    _mutationType: 'create' | 'update' | 'delete' | 'import' = 'update',
    mutationHint?: {
      mutatedId?: string;
      previousName?: string;
      nextName?: string;
    }
  ): Promise<void> {
    this.invalidatePortalCachesIfNeeded(moduleId);

    const client = GoogleSheetClient.getInstance();
    const serverRes = await client
      .recalculateRelationsOnServer(moduleId, false, mutationHint)
      .catch(() => ({ handledByServer: false, summary: undefined }));

    this.invalidatePortalCachesIfNeeded(moduleId);

    if (serverRes.handledByServer) {
      return;
    }

    // Static SPA fallback: pastikan cache turunan dibersihkan agar fetch berikutnya mendapat nilai terbaru
    if (moduleId === 'siswa') {
      client.invalidateClientSheetCache('Master_Siswa_XI');
    } else if (moduleId === 'jurusan') {
      client.invalidateClientSheetCache('Master_Jurusan');
    } else if (moduleId === 'dudi') {
      client.invalidateClientSheetCache('Master_DUDI');
    } else if (moduleId === 'guru') {
      client.invalidateClientSheetCache('Master_Guru_Pendamping');
    } else if (moduleId === 'pengajuan') {
      client.invalidateClientSheetCache('Data_Pengajuan_PKL');
    } else if (moduleId === 'siswa_pkl') {
      client.invalidateClientSheetCache('Plotting_Pemberangkatan');
    } else if (moduleId === 'monitoring') {
      client.invalidateClientSheetCache('Monitoring_5_Tahap');
    }
  }

  /**
   * Dipanggil saat membuka tampilan ringkasan/master modul agar cache formula ter-refresh bila perlu.
   */
  public async syncForModuleView(moduleId: string): Promise<number> {
    const serverRes = await GoogleSheetClient.getInstance()
      .recalculateRelationsOnServer(moduleId, false)
      .catch(() => ({ handledByServer: false, summary: undefined }));

    if (serverRes.handledByServer && serverRes.summary) {
      const s = serverRes.summary;
      return (
        (s.updatedPlacements || 0) +
        (s.updatedDudi || 0) +
        (s.updatedGuru || 0) +
        (s.updatedJurusan || 0) +
        (s.updatedKelas || 0)
      );
    }
    return 0;
  }

  /**
   * Backfill Foreign Key (`ID_Jurusan`, `ID_DUDI`, `ID_Guru_Pendamping`, `ID_Penempatan`) + `Status_PKL`,
   * lalu pasang/segarkan seluruh header ARRAYFORMULA via GAS `MIGRATE_RELATIONAL_FORMULAS`.
   */
  public async recalculateAllRelations(
    _options: { backfillIds?: boolean } = {}
  ): Promise<RelationSyncSummary> {
    const client = GoogleSheetClient.getInstance();

    // Always prefer server-side batch recalculation to avoid N+1 browser writes
    const serverRes = await client
      .recalculateRelationsOnServer('all', true)
      .catch(() => ({ handledByServer: false, summary: undefined }));
    if (serverRes.handledByServer && serverRes.summary) {
      client.invalidateClientSheetCache(undefined);
      this.invalidatePortalCachesIfNeeded('all');
      return serverRes.summary;
    }

    const [{ PengajuanService }, { PerizinanService }, { MonitoringService }, { SertifikatService }] =
      await Promise.all([
        import('./PengajuanService'),
        import('./PerizinanService'),
        import('./MonitoringService'),
        import('./SertifikatService'),
      ]);

    const siswaService = SiswaService.getInstance();
    const jurusanService = JurusanService.getInstance();
    const kelasService = KelasService.getInstance();
    const dudiService = DudiService.getInstance();
    const guruService = GuruService.getInstance();
    const pengajuanService = PengajuanService.getInstance();
    const perizinanService = PerizinanService.getInstance();
    const siswaPklService = SiswaPklService.getInstance();
    const monitoringService = MonitoringService.getInstance();
    const sertifikatService = SertifikatService.getInstance();

    const [
      siswaList,
      jurusanList,
      kelasList,
      dudiList,
      guruList,
      pengajuanList,
      perizinanList,
      placements,
      monitorings,
      sertifikats,
    ] = await Promise.all([
      siswaService.getAll().catch(() => [] as Siswa[]),
      jurusanService.getAll().catch(() => [] as Jurusan[]),
      kelasService.getAll().catch(() => [] as Kelas[]),
      dudiService.getAll().catch(() => [] as Dudi[]),
      guruService.getAll().catch(() => [] as Guru[]),
      pengajuanService.getAll().catch(() => [] as Pengajuan[]),
      perizinanService.getAll().catch(() => []),
      siswaPklService.getAll().catch(() => [] as PenempatanPKL[]),
      monitoringService.getAll().catch(() => []),
      sertifikatService.getAll().catch(() => []),
    ]);

    const jurusanByKey = new Map<string, Jurusan>();
    for (const j of jurusanList) {
      if (j.kode) jurusanByKey.set(normalize(j.kode), j);
      if (j.nama) jurusanByKey.set(normalize(j.nama), j);
    }
    const resolveJurusanCode = (rawVal?: string): string => {
      const clean = String(rawVal || '').trim();
      if (!clean) return '';
      const matched = jurusanByKey.get(normalize(clean));
      if (matched?.kode) return matched.kode;
      return generateJurusanCode(clean) || clean;
    };

    const dudiById = new Map<string, Dudi>();
    const dudiByName = new Map<string, Dudi>();
    for (const d of dudiList) {
      if (d.id) dudiById.set(d.id, d);
      if (d.namaDudi) dudiByName.set(normalize(d.namaDudi), d);
    }

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
    const resolveGuru = (idVal?: string, namaVal?: string): Guru | undefined => {
      if (idVal && guruById.has(idVal)) return guruById.get(idVal);
      const key = namaVal ? normalize(namaVal) : '';
      if (key && guruNameCount.get(key) === 1) return guruByName.get(key);
      return undefined;
    };

    const placementByNis = new Map<string, PenempatanPKL>();
    const activePlacementNisSet = new Set<string>();
    const pengajuanNisSet = new Set<string>();

    for (const p of placements) {
      const nisDigits = getCanonicalNisDigits(p.nis);
      if (!nisDigits) continue;
      if (isActivePlacementStatus(p.statusPenempatan)) {
        activePlacementNisSet.add(nisDigits);
        placementByNis.set(nisDigits, p);
      } else if (!placementByNis.has(nisDigits)) {
        placementByNis.set(nisDigits, p);
      }
    }
    for (const req of pengajuanList) {
      if (normalize(req.statusKakomli) === 'ditolak' || normalize(req.statusHubin) === 'batal') {
        continue;
      }
      const nisDigits = getCanonicalNisDigits(req.nis);
      if (nisDigits) pengajuanNisSet.add(nisDigits);
    }

    const silent = { silentToast: true };
    const jurusanPatches: Array<{ id: string; updates: Partial<Jurusan> }> = [];
    const siswaPatches: Array<{ id: string; updates: Partial<Siswa> }> = [];
    const kelasPatches: Array<{ id: string; updates: Partial<Kelas> }> = [];
    const dudiPatches: Array<{ id: string; updates: Partial<Dudi> }> = [];
    const pengajuanPatches: Array<{ id: string; updates: Partial<Pengajuan> }> = [];
    const perizinanPatches: Array<{ id: string; updates: Record<string, any> }> = [];
    const placementPatches: Array<{ id: string; updates: Partial<PenempatanPKL> }> = [];
    const monitoringPatches: Array<{ id: string; updates: Record<string, any> }> = [];
    const sertifikatPatches: Array<{ id: string; updates: Record<string, any> }> = [];

    if (_options.backfillIds) {
      for (const j of jurusanList) {
        const matchedGuru = resolveGuru(j.idKakomli, j.namaKakomli);
        if (matchedGuru) {
          const patch: Partial<Jurusan> = {};
          if (j.idKakomli !== matchedGuru.id) patch.idKakomli = matchedGuru.id;
          if (matchedGuru.nama && j.namaKakomli !== matchedGuru.nama) patch.namaKakomli = matchedGuru.nama;
          if ((!j.nipKakomli || j.nipKakomli === '-') && matchedGuru.nip) patch.nipKakomli = matchedGuru.nip;
          if (Object.keys(patch).length > 0) jurusanPatches.push({ id: j.id, updates: patch });
        }
      }
      for (const s of siswaList) {
        const patch: Partial<Siswa> = {};
        const canonicalJurCode = resolveJurusanCode(s.idJurusan || s.jurusan);
        if (canonicalJurCode && s.idJurusan !== canonicalJurCode) {
          patch.idJurusan = canonicalJurCode;
        }
        const nisDigits = getCanonicalNisDigits(s.nis);
        if (nisDigits) {
          if (activePlacementNisSet.has(nisDigits) && s.statusPKL === 'Belum Daftar') {
            patch.statusPKL = 'Sedang PKL';
          } else if (pengajuanNisSet.has(nisDigits) && s.statusPKL === 'Belum Daftar') {
            patch.statusPKL = 'Diajukan';
          }
        }
        if (Object.keys(patch).length > 0) siswaPatches.push({ id: s.id, updates: patch });
      }

      for (const k of kelasList) {
        const canonicalJurCode = resolveJurusanCode(k.idJurusan || k.jurusan);
        if (canonicalJurCode && k.idJurusan !== canonicalJurCode) {
          kelasPatches.push({ id: k.id, updates: { idJurusan: canonicalJurCode } });
        }
      }

      for (const d of dudiList) {
        if (!d.idGuruPendamping && d.guruPendamping) {
          const matchedGuru = resolveGuru(d.idGuruPendamping, d.guruPendamping);
          if (matchedGuru) {
            dudiPatches.push({ id: d.id, updates: { idGuruPendamping: matchedGuru.id } });
          }
        }
      }

      for (const req of pengajuanList) {
        const patch: Partial<Pengajuan> = {};
        const matchedDudi =
          (req.idDudi ? dudiById.get(req.idDudi) : undefined) ||
          (req.dudiTujuan ? dudiByName.get(normalize(req.dudiTujuan)) : undefined);
        if (matchedDudi && req.idDudi !== matchedDudi.id) {
          patch.idDudi = matchedDudi.id;
        }
        const matchedGuru = resolveGuru(
          req.idGuruPendamping || matchedDudi?.idGuruPendamping,
          req.guruPendamping || matchedDudi?.guruPendamping
        );
        if (matchedGuru && req.idGuruPendamping !== matchedGuru.id) {
          patch.idGuruPendamping = matchedGuru.id;
        }
        if (Object.keys(patch).length > 0) pengajuanPatches.push({ id: req.id, updates: patch });
      }

      for (const izn of perizinanList) {
        if (!izn.idDudi && izn.dudiTujuan) {
          const matchedDudi = dudiByName.get(normalize(izn.dudiTujuan));
          if (matchedDudi) {
            perizinanPatches.push({ id: izn.id, updates: { idDudi: matchedDudi.id } });
          }
        }
      }

      for (const p of placements) {
        const patch: Partial<PenempatanPKL> = {};
        const matchedDudi =
          (p.idDudi && dudiById.get(p.idDudi)) ||
          (p.namaDudi && dudiByName.get(normalize(p.namaDudi)));
        if (matchedDudi && p.idDudi !== matchedDudi.id) {
          patch.idDudi = matchedDudi.id;
        }
        const matchedGuru = resolveGuru(p.idGuruPendamping, p.guruPendamping);
        if (matchedGuru && p.idGuruPendamping !== matchedGuru.id) {
          patch.idGuruPendamping = matchedGuru.id;
        }
        if (Object.keys(patch).length > 0) placementPatches.push({ id: p.id, updates: patch });
      }

      for (const m of monitorings) {
        const patch: Record<string, any> = {};
        const nisDigits = getCanonicalNisDigits(m.nis);
        const linkedPlt = nisDigits ? placementByNis.get(nisDigits) : undefined;
        if (
          linkedPlt?.idPenempatan &&
          (!m.idPenempatan || String(m.idPenempatan).startsWith('PLT-2')) &&
          m.idPenempatan !== linkedPlt.idPenempatan
        ) {
          patch.idPenempatan = linkedPlt.idPenempatan;
        }
        const matchedDudi =
          (m.idDudi && dudiById.get(m.idDudi)) ||
          (linkedPlt?.idDudi && dudiById.get(linkedPlt.idDudi)) ||
          (m.dudiTujuan && dudiByName.get(normalize(m.dudiTujuan)));
        if (matchedDudi && m.idDudi !== matchedDudi.id) {
          patch.idDudi = matchedDudi.id;
        }
        const matchedGuru = resolveGuru(
          m.idGuruPendamping || linkedPlt?.idGuruPendamping,
          m.guruPendamping || linkedPlt?.guruPendamping
        );
        if (matchedGuru && m.idGuruPendamping !== matchedGuru.id) {
          patch.idGuruPendamping = matchedGuru.id;
        }
        if (Object.keys(patch).length > 0) monitoringPatches.push({ id: m.id, updates: patch });
      }

      for (const sert of sertifikats) {
        const patch: Record<string, any> = {};
        const nisDigits = getCanonicalNisDigits(sert.nis);
        const linkedPlt = nisDigits ? placementByNis.get(nisDigits) : undefined;
        if (
          linkedPlt?.idPenempatan &&
          (!sert.idPenempatan || String(sert.idPenempatan).startsWith('PLT-2')) &&
          sert.idPenempatan !== linkedPlt.idPenempatan
        ) {
          patch.idPenempatan = linkedPlt.idPenempatan;
        }
        const matchedDudi =
          (sert.idDudi && dudiById.get(sert.idDudi)) ||
          (linkedPlt?.idDudi && dudiById.get(linkedPlt.idDudi)) ||
          (sert.dudiTujuan && dudiByName.get(normalize(sert.dudiTujuan)));
        if (matchedDudi && sert.idDudi !== matchedDudi.id) {
          patch.idDudi = matchedDudi.id;
        }
        if (Object.keys(patch).length > 0) sertifikatPatches.push({ id: sert.id, updates: patch });
      }
    }

    const [
      flushedJurusan,
      flushedSiswa,
      updatedKelas,
      updatedDudi,
      ,
      ,
      updatedPlacements,
      flushedMonitoring,
    ] = await Promise.all([
      jurusanPatches.length ? jurusanService.bulkUpdateMany(jurusanPatches, silent).catch(() => 0) : 0,
      siswaPatches.length ? siswaService.bulkUpdateMany(siswaPatches, silent).catch(() => 0) : 0,
      kelasPatches.length ? kelasService.bulkUpdateMany(kelasPatches, silent).catch(() => 0) : 0,
      dudiPatches.length ? dudiService.bulkUpdateMany(dudiPatches, silent).catch(() => 0) : 0,
      pengajuanPatches.length
        ? pengajuanService.bulkUpdateMany(pengajuanPatches, silent).catch(() => 0)
        : 0,
      perizinanPatches.length
        ? perizinanService.bulkUpdateMany(perizinanPatches, silent).catch(() => 0)
        : 0,
      placementPatches.length
        ? siswaPklService.bulkUpdateMany(placementPatches, silent).catch(() => 0)
        : 0,
      monitoringPatches.length
        ? monitoringService.bulkUpdateMany(monitoringPatches, silent).catch(() => 0)
        : 0,
      sertifikatPatches.length
        ? sertifikatService.bulkUpdateMany(sertifikatPatches, silent).catch(() => 0)
        : 0,
    ]);

    const updatedJurusan = flushedJurusan + flushedSiswa;
    const updatedGuru = flushedMonitoring + flushedJurusan + updatedDudi;

    const gasMigrate = await client.triggerMigrateRelationalFormulas().catch(() => ({ success: false }));
    const formulasApplied = Boolean(gasMigrate.success);

    client.invalidateClientSheetCache(undefined);
    this.invalidatePortalCachesIfNeeded('all');

    return {
      updatedPlacements,
      updatedDudi,
      updatedGuru,
      updatedJurusan,
      updatedKelas,
      formulasApplied,
    };
  }
}
