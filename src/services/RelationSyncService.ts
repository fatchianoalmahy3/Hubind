import { Dudi, Guru, Jurusan, Kelas, PenempatanPKL, Siswa } from '../core/types/schema';
import { DudiService } from './DudiService';
import { GuruService } from './GuruService';
import { JurusanService } from './JurusanService';
import { KelasService } from './KelasService';
import { SiswaPklService } from './SiswaPklService';
import { SiswaService } from './SiswaService';

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
  public async syncPlacementCounts(): Promise<{ updatedDudi: number; updatedGuru: number }> {
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
        await DudiService.getInstance().update(d.id, { terisi: nextCount });
        updatedDudi++;
      }
    }

    let updatedGuru = 0;
    for (const g of guruList) {
      const nextCount = guruCounts.get(g.id) || 0;
      if (Number(g.jumlahBimbingan || 0) !== nextCount) {
        await GuruService.getInstance().update(g.id, { jumlahBimbingan: nextCount });
        updatedGuru++;
      }
    }

    return { updatedDudi, updatedGuru };
  }

  /**
   * Full relational consistency check & recalculation purely in application logic
   * (zero Excel/Spreadsheet formulas).
   */
  public async recalculateAllRelations(
    options: { backfillIds?: boolean } = {}
  ): Promise<RelationSyncSummary> {
    const siswaService = SiswaService.getInstance();
    const jurusanService = JurusanService.getInstance();
    const kelasService = KelasService.getInstance();
    const dudiService = DudiService.getInstance();
    const guruService = GuruService.getInstance();
    const siswaPklService = SiswaPklService.getInstance();

    const [siswaList, jurusanList, kelasList, dudiList, guruList, placements] =
      await Promise.all([
        siswaService.getAll(),
        jurusanService.getAll(),
        kelasService.getAll(),
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
          const updated = await siswaPklService.update(p.id, patch);
          if (updated) {
            effectivePlacements[i] = updated;
          }
          updatedPlacements++;
        }
      }
    }

    // 2. Recalculate Master_DUDI.terisi & Master_Guru_Pendamping.jumlahBimbingan from active placements
    const activePlacements = effectivePlacements.filter(
      (p) => normalize(p.statusPenempatan) !== 'dibatalkan'
    );

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
        await dudiService.update(d.id, { terisi: nextCount });
        updatedDudi++;
      }
    }

    let updatedGuru = 0;
    for (const g of guruList) {
      const nextCount = guruCounts.get(g.id) || 0;
      if (Number(g.jumlahBimbingan || 0) !== nextCount) {
        await guruService.update(g.id, { jumlahBimbingan: nextCount });
        updatedGuru++;
      }
    }

    // 3. Recalculate Master_Jurusan.totalTerdaftar & Master_Kelas_Walas.jumlahSiswa from Master_Siswa_XI
    const jurusanByKey = new Map<string, Jurusan>();
    for (const j of jurusanList) {
      if (j.nama) jurusanByKey.set(normalize(j.nama), j);
      if (j.kode) jurusanByKey.set(normalize(j.kode), j);
    }

    const kelasByName = new Map<string, Kelas>();
    for (const k of kelasList) {
      if (k.namaKelas) kelasByName.set(normalize(k.namaKelas), k);
    }

    const jurusanCounts = new Map<string, number>();
    const kelasCounts = new Map<string, number>();

    for (const s of siswaList) {
      const matchedJur = s.jurusan ? jurusanByKey.get(normalize(s.jurusan)) : undefined;
      if (matchedJur) {
        jurusanCounts.set(matchedJur.id, (jurusanCounts.get(matchedJur.id) || 0) + 1);
      }

      const matchedKls = s.kelas ? kelasByName.get(normalize(s.kelas)) : undefined;
      if (matchedKls) {
        kelasCounts.set(matchedKls.id, (kelasCounts.get(matchedKls.id) || 0) + 1);
      }
    }

    let updatedJurusan = 0;
    for (const j of jurusanList) {
      const nextCount = jurusanCounts.get(j.id) || 0;
      if (Number(j.totalTerdaftar || 0) !== nextCount) {
        await jurusanService.update(j.id, { totalTerdaftar: nextCount });
        updatedJurusan++;
      }
    }

    let updatedKelas = 0;
    for (const k of kelasList) {
      const nextCount = kelasCounts.get(k.id) || 0;
      if (Number(k.jumlahSiswa || 0) !== nextCount) {
        await kelasService.update(k.id, { jumlahSiswa: nextCount });
        updatedKelas++;
      }
    }

    return {
      updatedPlacements,
      updatedDudi,
      updatedGuru,
      updatedJurusan,
      updatedKelas,
    };
  }
}
