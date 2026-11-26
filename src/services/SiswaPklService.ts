import { BaseRepository } from '../core/BaseRepository';
import { PenempatanPKL } from '../core/types/schema';
import { SiswaPklMetadata } from '../modules/siswaPkl.meta.ts';
import { initialSiswaPkl } from './InitialData';
import { generateNextSequentialId } from '../core/utils/autoIdHelpers';
import { getTodayWibIsoDate } from '../core/utils/dateHelpers';
import {
  getCanonicalNisDigits,
  normalizeRelationText,
} from '../core/utils/relationHelpers';

export class SiswaPklService extends BaseRepository<PenempatanPKL> {
  private static instance: SiswaPklService;

  private constructor() {
    super('data_plotting', SiswaPklMetadata, initialSiswaPkl);
  }

  public static getInstance(): SiswaPklService {
    if (!SiswaPklService.instance) {
      SiswaPklService.instance = new SiswaPklService();
    }
    return SiswaPklService.instance;
  }

  public async getByNis(nis: string): Promise<PenempatanPKL | null> {
    const list = await this.getAll();
    const digits = getCanonicalNisDigits(nis);
    return (
      (digits ? list.find((p) => getCanonicalNisDigits(p.nis) === digits) : undefined) ||
      list.find((p) => p.nis === nis) ||
      null
    );
  }

  public async transferDudi(params: {
    sourcePlacementId: string;
    newDudiName: string;
    newGuruPendamping: string;
    tanggalBerangkat: string;
    tanggalRencanaTarik?: string;
    reason?: string;
  }): Promise<{ closedPlacement: PenempatanPKL | null; newPlacement: PenempatanPKL }> {
    const source = await this.getById(params.sourcePlacementId);
    if (!source) {
      throw new Error('Data penempatan asal tidak ditemukan.');
    }
    const cleanNewDudi = String(params.newDudiName || '').trim();
    if (!cleanNewDudi) {
      throw new Error('DUDI tujuan baru wajib diisi.');
    }
    if (normalizeRelationText(cleanNewDudi) === normalizeRelationText(source.namaDudi)) {
      throw new Error('DUDI tujuan baru harus berbeda dari DUDI sebelumnya.');
    }

    const [
      { DudiService },
      { GuruService },
      { SiswaService },
      { RelationSyncService },
    ] = await Promise.all([
      import('./DudiService'),
      import('./GuruService'),
      import('./SiswaService'),
      import('./RelationSyncService'),
    ]);

    const [dudiList, guruList, allPlottings, siswaMaster] = await Promise.all([
      DudiService.getInstance().getAll().catch(() => []),
      GuruService.getInstance().getAll().catch(() => []),
      this.getAll(),
      source.nis
        ? SiswaService.getInstance().getByNis(source.nis).catch(() => null)
        : Promise.resolve(null),
    ]);

    const matchedDudi = dudiList.find(
      (d) => normalizeRelationText(d.namaDudi) === normalizeRelationText(cleanNewDudi)
    );
    const resolvedDudiName = matchedDudi?.namaDudi || cleanNewDudi;
    const resolvedGuruInput =
      String(params.newGuruPendamping || '').trim() || matchedDudi?.guruPendamping || '';
    const matchedGuru = guruList.find(
      (g) => normalizeRelationText(g.nama) === normalizeRelationText(resolvedGuruInput)
    );
    const resolvedGuruName = matchedGuru?.nama || resolvedGuruInput || source.guruPendamping;
    const resolvedGuruId = matchedGuru?.id || matchedDudi?.idGuruPendamping || '';

    const canonicalNis = getCanonicalNisDigits(siswaMaster?.nis || source.nis) || source.nis;
    const canonicalNama = siswaMaster?.nama || source.namaSiswa;
    const today = getTodayWibIsoDate();
    const cleanReason = String(params.reason || '').trim();
    const reasonSuffix = cleanReason ? ` — Alasan: ${cleanReason}` : '';

    const oldLog = `[${today}] Pindah ke ${resolvedDudiName}${reasonSuffix}`;
    const closedNote = source.catatanPenempatan
      ? `${source.catatanPenempatan}\n${oldLog}`
      : oldLog;

    const closedPlacement = await this.update(
      source.id,
      {
        statusPenempatan: 'Pindah DUDI',
        catatanPenempatan: closedNote,
      },
      { silentToast: true }
    );

    const newId = generateNextSequentialId('data_plotting', allPlottings as any);
    const newLog = `[${today}] Pindahan dari ${source.namaDudi}${reasonSuffix}`;

    const newPlacement = await this.create(
      {
        id: newId,
        idPenempatan: newId,
        nis: canonicalNis,
        namaSiswa: canonicalNama,
        idDudi: matchedDudi?.id || '',
        namaDudi: resolvedDudiName,
        idGuruPendamping: resolvedGuruId,
        guruPendamping: resolvedGuruName,
        tanggalBerangkat: params.tanggalBerangkat || today,
        tanggalRencanaTarik: params.tanggalRencanaTarik || '',
        statusPenempatan: 'Terjadwal',
        catatanPenempatan: newLog,
      },
      { silentToast: false }
    );

    if (canonicalNis) {
      await SiswaService.getInstance().updateStatusPKL(canonicalNis, 'Sedang PKL', {
        silentToast: true,
      });
    }

    await RelationSyncService.getInstance()
      .syncAfterMutation('siswa_pkl')
      .catch(() => {});

    return { closedPlacement, newPlacement };
  }
}

