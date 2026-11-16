import { Dudi, Guru, Jurusan, Kelas, PenempatanPKL, Siswa } from '../core/types/schema';
import { DudiService } from './DudiService';
import { GuruService } from './GuruService';
import { JurusanService } from './JurusanService';
import { KelasService } from './KelasService';
import { SiswaPklService } from './SiswaPklService';
import { SiswaService } from './SiswaService';
import { GoogleSheetClient } from '../core/GoogleSheetClient';

export interface RelationSyncSummary {
  updatedPlacements: number;
  updatedDudi: number;
  updatedGuru: number;
  updatedJurusan: number;
  updatedKelas: number;
}

function normalize(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getStudentIdentityKey(nis?: unknown, nama?: unknown, kelas?: unknown): string {
  const cleanNis = String(nis ?? '').trim();
  if (cleanNis && cleanNis !== '-') {
    return `nis:${cleanNis.toLowerCase()}`;
  }
  const cleanNama = normalize(nama);
  const cleanKelas = normalize(kelas);
  return cleanNama ? `nama:${cleanNama}|${cleanKelas}` : '';
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
   * Recalculates placement-dependent counters:
   * - Master_DUDI.terisi
   * - Master_Guru_Pendamping.jumlahBimbingan
   * from active rows in Plotting_Pemberangkatan (statusPenempatan !== 'Dibatalkan').
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

    const activePlacements = placements.filter(
      (p) => normalize(p.statusPenempatan) !== 'dibatalkan'
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
    const siswaByName = new Map<string, Siswa>();
    for (const s of siswaList) {
      if (s.nis) siswaByNis.set(String(s.nis).trim().toLowerCase(), s);
      if (s.nama) siswaByName.set(normalize(s.nama), s);
    }

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
      if (normalize(req.statusKakomli) === 'ditolak') continue;
      const matchedSiswa: Siswa | undefined =
        (req.nis ? siswaByNis.get(String(req.nis).trim().toLowerCase()) : undefined) ||
        (req.namaSiswa ? siswaByName.get(normalize(req.namaSiswa)) : undefined);
      const jurName = req.jurusan || matchedSiswa?.jurusan;
      const matchedJur = jurName ? jurusanByKey.get(normalize(jurName)) : undefined;
      if (!matchedJur) continue;

      const key = getStudentIdentityKey(
        req.nis || matchedSiswa?.nis,
        req.namaSiswa || matchedSiswa?.nama,
        req.kelas || matchedSiswa?.kelas
      );
      if (key) ensureSet(matchedJur.id).add(key);
    }

    for (const izn of perizinanList) {
      const matchedSiswa: Siswa | undefined =
        (izn.nis ? siswaByNis.get(String(izn.nis).trim().toLowerCase()) : undefined) ||
        (izn.namaSiswa ? siswaByName.get(normalize(izn.namaSiswa)) : undefined);
      const jurName = izn.jurusan || matchedSiswa?.jurusan;
      const matchedJur = jurName ? jurusanByKey.get(normalize(jurName)) : undefined;
      if (!matchedJur) continue;

      const key = getStudentIdentityKey(
        izn.nis || matchedSiswa?.nis,
        izn.namaSiswa || matchedSiswa?.nama,
        izn.kelas || matchedSiswa?.kelas
      );
      if (key) ensureSet(matchedJur.id).add(key);
    }

    for (const p of placements) {
      if (normalize(p.statusPenempatan) === 'dibatalkan') continue;
      const matchedSiswa: Siswa | undefined =
        (p.nis ? siswaByNis.get(String(p.nis).trim().toLowerCase()) : undefined) ||
        (p.namaSiswa ? siswaByName.get(normalize(p.namaSiswa)) : undefined);
      const matchedJur = matchedSiswa?.jurusan
        ? jurusanByKey.get(normalize(matchedSiswa.jurusan))
        : undefined;
      if (!matchedJur) continue;

      const key = getStudentIdentityKey(p.nis || matchedSiswa?.nis, p.namaSiswa || matchedSiswa?.nama, matchedSiswa?.kelas);
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
   * Lightweight automatic sync triggered after mutations on dependent modules.
   */
  public async syncAfterMutation(moduleId: string): Promise<void> {
    const serverRes = await GoogleSheetClient.getInstance()
      .recalculateRelationsOnServer(moduleId)
      .catch(() => ({ handledByServer: false }));
    if (serverRes.handledByServer) return;

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
   * Full relational consistency check & recalculation purely in application logic
   * (zero Excel/Spreadsheet formulas).
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

    const siswaService = SiswaService.getInstance();
    const dudiService = DudiService.getInstance();
    const guruService = GuruService.getInstance();
    const siswaPklService = SiswaPklService.getInstance();

    const [siswaList, dudiList, guruList, placements] = await Promise.all([
      siswaService.getAll(),
      dudiService.getAll(),
      guruService.getAll(),
      siswaPklService.getAll(),
    ]);

    const siswaByNis = new Map<string, Siswa>();
    for (const s of siswaList) {
      if (s.nis) siswaByNis.set(String(s.nis).trim(), s);
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

    // 1. Optional backfill of missing ID_DUDI, ID_Guru_Pendamping, and Nama_Siswa on Plotting_Pemberangkatan
    let updatedPlacements = 0;
    const effectivePlacements: PenempatanPKL[] = [...placements];

    if (options.backfillIds) {
      for (let i = 0; i < effectivePlacements.length; i++) {
        const p = effectivePlacements[i];
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

        const matchedSiswa = p.nis ? siswaByNis.get(String(p.nis).trim()) : undefined;
        if (matchedSiswa && (!p.namaSiswa || p.namaSiswa === '-')) {
          patch.namaSiswa = matchedSiswa.nama;
        }

        if (Object.keys(patch).length > 0) {
          const updated = await siswaPklService.update(p.id, patch, { silentToast: true });
          if (updated) {
            effectivePlacements[i] = updated;
          }
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
