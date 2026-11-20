import { BaseRepository } from '../core/BaseRepository';
import { Pengajuan } from '../core/types/schema';
import { PengajuanMetadata } from '../modules/pengajuan.meta.ts';
import { initialPengajuan } from './InitialData';
import { SiswaService } from './SiswaService';
import { DudiService } from './DudiService';
import { GuruService } from './GuruService';
import { SiswaPklService } from './SiswaPklService';
import { PerizinanService } from './PerizinanService';
import { RelationSyncService } from './RelationSyncService';
import { generateNextSequentialId } from '../core/utils/autoIdHelpers';
import { getOffsetWibIsoDate } from '../core/utils/dateHelpers';
import { stripNisSymbols } from '../core/utils/nisHelpers';

import {
  getCanonicalNisDigits,
  isActivePlacementStatus,
  normalizeRelationText,
} from '../core/utils/relationHelpers';

export class PengajuanService extends BaseRepository<Pengajuan> {
  private static instance: PengajuanService;

  private constructor() {
    super('Data_Pengajuan_PKL', PengajuanMetadata, initialPengajuan);
  }

  public static getInstance(): PengajuanService {
    if (!PengajuanService.instance) {
      PengajuanService.instance = new PengajuanService();
    }
    return PengajuanService.instance;
  }

  public async approveByKakomli(
    id: string,
    catatan?: string,
    options?: { silentToast?: boolean }
  ): Promise<Pengajuan | null> {
    const item = await this.getById(id);
    if (!item) return null;

    const [dudiList, matchedSiswa] = await Promise.all([
      DudiService.getInstance().getAll().catch(() => []),
      item.nis ? SiswaService.getInstance().getByNis(item.nis).catch(() => null) : Promise.resolve(null),
    ]);
    const targetDudiNorm = normalizeRelationText(item.dudiTujuan);
    const matchedDudi =
      (item.idDudi ? dudiList.find((d) => d.id === item.idDudi) : undefined) ||
      dudiList.find((d) => normalizeRelationText(d.namaDudi) === targetDudiNorm);

    const patch: Partial<Pengajuan> = {
      statusKakomli: 'Disetujui',
      statusHubin: 'Siap Diberangkatkan',
      catatanKakomli:
        catatan || 'Disetujui oleh Ketua Kompetensi Keahlian (Kakomli). Sesuai standar industri.',
    };
    if (matchedSiswa?.nama) {
      patch.namaSiswa = matchedSiswa.nama;
      patch.nis = stripNisSymbols(matchedSiswa.nis) || matchedSiswa.nis;
    }
    if (matchedDudi) {
      patch.idDudi = matchedDudi.id;
      if (!item.guruPendamping && matchedDudi.guruPendamping) {
        patch.guruPendamping = matchedDudi.guruPendamping;
        if (matchedDudi.idGuruPendamping) patch.idGuruPendamping = matchedDudi.idGuruPendamping;
      }
    }

    const updated = await this.update(id, patch, options);

    if (item.nis) {
      await SiswaService.getInstance().updateStatusPKL(item.nis, 'Diterima DUDI', {
        silentToast: true,
      });
    }

    if (updated) {
      await PerizinanService.getInstance()
        .createFromPengajuan(updated, { silentToast: true })
        .catch((err) => console.warn('Auto-create PerizinanPKL warning:', err));
    }

    return updated;
  }

  public async createPerizinanFromPengajuan(
    id: string,
    options?: { silentToast?: boolean }
  ): Promise<void> {
    const item = await this.getById(id);
    if (!item) throw new Error('Data pengajuan tidak ditemukan.');
    await PerizinanService.getInstance().createFromPengajuan(item, options);
  }

  public async rejectByKakomli(
    id: string,
    reason: string,
    options?: { silentToast?: boolean }
  ): Promise<Pengajuan | null> {
    const item = await this.getById(id);
    if (!item) return null;

    const updated = await this.update(
      id,
      {
        statusKakomli: 'Ditolak',
        statusHubin: 'Batal',
        catatanKakomli: reason || 'Ditolak: DUDI tidak linier dengan kompetensi keahlian.',
      },
      options
    );

    if (item.nis) {
      await SiswaService.getInstance().updateStatusPKL(item.nis, 'Belum Daftar', {
        silentToast: true,
      });
    }

    return updated;
  }

  public async scheduleHubin(
    id: string,
    guruPendamping: string,
    tanggalBerangkat: string,
    options?: { silentToast?: boolean }
  ): Promise<Pengajuan | null> {
    const item = await this.getById(id);
    if (!item) return null;

    const [dudiList, guruList, existingPlottings, siswaMaster] = await Promise.all([
      DudiService.getInstance().getAll().catch(() => []),
      GuruService.getInstance().getAll().catch(() => []),
      SiswaPklService.getInstance().getAll().catch(() => []),
      item.nis ? SiswaService.getInstance().getByNis(item.nis).catch(() => null) : Promise.resolve(null),
    ]);

    const itemNis = getCanonicalNisDigits(siswaMaster?.nis || item.nis);
    const canonicalNama = siswaMaster?.nama || item.namaSiswa;

    const targetDudiNorm = normalizeRelationText(item.dudiTujuan);
    const matchedDudi =
      (item.idDudi ? dudiList.find((d) => d.id === item.idDudi) : undefined) ||
      dudiList.find((d) => normalizeRelationText(d.namaDudi) === targetDudiNorm);
    const effectiveDudiName = matchedDudi?.namaDudi || item.dudiTujuan;
    const effectiveDudiNorm = normalizeRelationText(effectiveDudiName);

    const effectiveGuruInput = guruPendamping || item.guruPendamping || matchedDudi?.guruPendamping || '';
    const guru = guruList.find(
      (g) => normalizeRelationText(g.nama) === normalizeRelationText(effectiveGuruInput)
    );
    const effectiveGuruName = guru?.nama || effectiveGuruInput;
    const effectiveGuruId = guru?.id || matchedDudi?.idGuruPendamping || item.idGuruPendamping || '';

    // Enforce max 1 active placement per NIS across different DUDIs
    const activePlacementsForNis = itemNis
      ? existingPlottings.filter(
          (p) =>
            getCanonicalNisDigits(p.nis) === itemNis &&
            isActivePlacementStatus(p.statusPenempatan)
        )
      : [];

    const existingSameDudi = activePlacementsForNis.find(
      (p) =>
        (matchedDudi?.id && p.idDudi === matchedDudi.id) ||
        normalizeRelationText(p.namaDudi) === effectiveDudiNorm
    );
    const existingOtherDudi = activePlacementsForNis.find(
      (p) => !existingSameDudi || p.id !== existingSameDudi.id
    );

    if (existingOtherDudi) {
      throw new Error(
        `Siswa ${canonicalNama} (${itemNis}) masih memiliki penempatan PKL aktif (${existingOtherDudi.statusPenempatan}) di ${existingOtherDudi.namaDudi}. Ubah status lama ke "Selesai PKL" / "Pindah DUDI" atau gunakan fitur Pindah DUDI terlebih dahulu.`
      );
    }

    const updated = await this.update(
      id,
      {
        nis: itemNis || item.nis,
        namaSiswa: canonicalNama,
        idDudi: matchedDudi?.id || item.idDudi || '',
        dudiTujuan: effectiveDudiName,
        idGuruPendamping: effectiveGuruId,
        statusHubin: 'Terjadwal',
        guruPendamping: effectiveGuruName,
        tanggalBerangkat,
      },
      options
    );

    if (itemNis) {
      await SiswaService.getInstance().updateStatusPKL(itemNis, 'Sedang PKL', {
        silentToast: true,
      });
    }

    const defaultTarik = tanggalBerangkat ? getOffsetWibIsoDate(120, tanggalBerangkat) : '';

    if (existingSameDudi) {
      await SiswaPklService.getInstance().update(
        existingSameDudi.id,
        {
          nis: itemNis || existingSameDudi.nis,
          namaSiswa: canonicalNama,
          idDudi: matchedDudi?.id || existingSameDudi.idDudi,
          namaDudi: effectiveDudiName,
          idGuruPendamping: effectiveGuruId || existingSameDudi.idGuruPendamping,
          guruPendamping: effectiveGuruName,
          tanggalBerangkat,
          statusPenempatan: 'Terjadwal',
        },
        { silentToast: true }
      );
    } else {
      const idPenempatan = generateNextSequentialId(
        'Plotting_Pemberangkatan',
        existingPlottings as any
      );
      await SiswaPklService.getInstance().create(
        {
          id: idPenempatan,
          idPenempatan,
          nis: itemNis || String(item.nis || '').trim(),
          namaSiswa: canonicalNama,
          idDudi: matchedDudi?.id || '',
          namaDudi: effectiveDudiName,
          idGuruPendamping: effectiveGuruId,
          guruPendamping: effectiveGuruName,
          tanggalBerangkat,
          tanggalRencanaTarik: defaultTarik,
          statusPenempatan: 'Terjadwal',
        },
        { silentToast: true }
      );
    }

    await Promise.all([
      RelationSyncService.getInstance().syncPlacementCounts({ silentToast: true }),
      RelationSyncService.getInstance().syncJurusanCounts({ silentToast: true }),
    ]).catch((err) => console.warn('Relation count sync warning:', err));

    return updated;
  }
}
