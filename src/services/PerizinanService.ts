import { BaseRepository } from '../core/BaseRepository';
import { Pengajuan, PerizinanPKL, PenempatanPKL } from '../core/types/schema';
import { PerizinanMetadata } from '../modules/perizinan.meta.ts';
import { initialPerizinan } from './InitialData';
import { SiswaService } from './SiswaService';
import { DudiService } from './DudiService';
import { GuruService } from './GuruService';
import { SiswaPklService } from './SiswaPklService';
import { RelationSyncService } from './RelationSyncService';
import {
  generateNextSequentialId,
  generateNextSuratPermohonan,
  getTodayIsoDate,
} from '../core/utils/autoIdHelpers';
import { stripNisSymbols } from '../core/utils/nisHelpers';
import {
  getCanonicalNisDigits,
  isActivePlacementStatus,
  normalizeRelationText,
} from '../core/utils/relationHelpers';

export class PerizinanService extends BaseRepository<PerizinanPKL> {
  private static instance: PerizinanService;

  private constructor() {
    super('Data_Perizinan_PKL', PerizinanMetadata, initialPerizinan);
  }

  public static getInstance(): PerizinanService {
    if (!PerizinanService.instance) {
      PerizinanService.instance = new PerizinanService();
    }
    return PerizinanService.instance;
  }

  /**
   * Automatically create a Perizinan PKL tracking record from an approved Pengajuan PKL row
   * if one does not already exist for that noPengajuan or active NIS+DUDI.
   */
  public async createFromPengajuan(
    pengajuan: Pengajuan,
    options?: { silentToast?: boolean }
  ): Promise<PerizinanPKL> {
    const existingList = await this.getAll();
    const pengajuanNis = stripNisSymbols(pengajuan.nis) || String(pengajuan.nis || '').trim();
    const alreadyExists = existingList.find(
      (p) =>
        (pengajuan.noPengajuan && p.noPengajuan === pengajuan.noPengajuan) ||
        ((stripNisSymbols(p.nis) || p.nis) === pengajuanNis &&
          p.dudiTujuan.trim().toLowerCase() === pengajuan.dudiTujuan.trim().toLowerCase())
    );

    if (alreadyExists) {
      return alreadyExists;
    }

    const siswa = pengajuanNis
      ? await SiswaService.getInstance().getByNis(pengajuanNis).catch(() => null)
      : null;

    const noPerizinan = generateNextSequentialId('Data_Perizinan_PKL', existingList as any);
    const noSuratPermohonan = generateNextSuratPermohonan(existingList as any);

    let resolvedDudiId = pengajuan.idDudi || '';
    if (!resolvedDudiId && pengajuan.dudiTujuan) {
      const dudiList = await DudiService.getInstance().getAll().catch(() => []);
      const targetNorm = normalizeRelationText(pengajuan.dudiTujuan);
      const matched = dudiList.find((d) => normalizeRelationText(d.namaDudi) === targetNorm);
      if (matched) resolvedDudiId = matched.id;
    }

    const canonicalNis = siswa ? stripNisSymbols(siswa.nis) || siswa.nis : pengajuanNis;
    const created = await this.create(
      {
        id: noPerizinan,
        noPerizinan,
        noPengajuan: pengajuan.noPengajuan || pengajuan.id,
        nis: canonicalNis,
        namaSiswa: siswa?.nama || pengajuan.namaSiswa,
        jurusan: siswa?.jurusan || pengajuan.jurusan,
        kelas: siswa?.kelas || pengajuan.kelas,
        namaOrtuWali: siswa?.namaOrtuWali || pengajuan.namaOrtuWali || '',
        statusIzinOrtu: '',
        tanggalMulaiIzin: '',
        tanggalSelesaiIzin: '',
        rentangTanggal: '',
        noSuratPermohonan,
        idDudi: resolvedDudiId,
        dudiTujuan: pengajuan.dudiTujuan,
        alamatDudi: pengajuan.alamatDudi || '-',
        tanggalKirimSurat: getTodayIsoDate(),
        catatanPerizinan: 'Terbuat otomatis dari pengajuan ACC Kakomli.',
        linkBuktiBalasan: '',
      },
      options
    );

    await RelationSyncService.getInstance()
      .syncAfterMutation('perizinan', 'create')
      .catch(() => {});

    return created;
  }

  public async markSuratSentToday(
    id: string,
    options?: { silentToast?: boolean }
  ): Promise<PerizinanPKL | null> {
    const item = await this.getById(id);
    if (!item) return null;
    if (item.tanggalKirimSurat && item.tanggalKirimSurat.trim() !== '') {
      return item;
    }
    return this.update(
      id,
      {
        tanggalKirimSurat: getTodayIsoDate(),
      },
      options
    );
  }

  /**
   * 1-Click Promote: Moves a permitted student from Data_Perizinan_PKL into Data Siswa PKL (Plotting_Pemberangkatan)
   * and updates Master Siswa status to 'Sedang PKL'.
   */
  public async promoteToPenempatan(
    perizinanId: string,
    guruPendamping: string,
    tanggalBerangkat: string,
    tanggalRencanaTarik: string,
    options?: { silentToast?: boolean }
  ): Promise<PenempatanPKL> {
    const item = await this.getById(perizinanId);
    if (!item) {
      throw new Error('Data perizinan tidak ditemukan.');
    }

    const [dudiList, guru, existingPlottings, siswaMaster] = await Promise.all([
      DudiService.getInstance().getAll().catch(() => []),
      GuruService.getInstance().getByNama(guruPendamping).catch(() => null),
      SiswaPklService.getInstance().getAll(),
      item.nis ? SiswaService.getInstance().getByNis(item.nis).catch(() => null) : Promise.resolve(null),
    ]);

    const itemNis = getCanonicalNisDigits(siswaMaster?.nis || item.nis);
    const canonicalNama = siswaMaster?.nama || item.namaSiswa;
    const targetDudiNorm = normalizeRelationText(item.dudiTujuan);
    const matchedDudi =
      (item.idDudi ? dudiList.find((d) => d.id === item.idDudi) : undefined) ||
      dudiList.find((d) => normalizeRelationText(d.namaDudi) === targetDudiNorm);
    const effectiveDudiName = matchedDudi?.namaDudi || item.dudiTujuan;
    const effectiveGuruName = guru?.nama || guruPendamping || matchedDudi?.guruPendamping || '';
    const effectiveGuruId = guru?.id || matchedDudi?.idGuruPendamping || '';

    const activeForNis = itemNis
      ? existingPlottings.filter(
          (p) =>
            getCanonicalNisDigits(p.nis) === itemNis &&
            isActivePlacementStatus(p.statusPenempatan)
        )
      : [];

    const existingSameDudi = activeForNis.find(
      (p) =>
        (matchedDudi?.id && p.idDudi === matchedDudi.id) ||
        normalizeRelationText(p.namaDudi) === targetDudiNorm
    );
    const existingOtherDudi = activeForNis.find(
      (p) => !existingSameDudi || p.id !== existingSameDudi.id
    );

    if (existingOtherDudi) {
      throw new Error(
        `Siswa ${canonicalNama} (${itemNis}) masih memiliki penempatan PKL aktif (${existingOtherDudi.statusPenempatan}) di ${existingOtherDudi.namaDudi}. Ubah status lama ke "Selesai PKL" / "Pindah DUDI" terlebih dahulu.`
      );
    }

    let penempatan: PenempatanPKL;
    if (existingSameDudi) {
      const updated = await SiswaPklService.getInstance().update(
        existingSameDudi.id,
        {
          nis: itemNis || existingSameDudi.nis,
          namaSiswa: canonicalNama,
          idDudi: matchedDudi?.id || existingSameDudi.idDudi,
          namaDudi: effectiveDudiName,
          idGuruPendamping: effectiveGuruId || existingSameDudi.idGuruPendamping,
          guruPendamping: effectiveGuruName,
          tanggalBerangkat,
          tanggalRencanaTarik,
          statusPenempatan: 'Terjadwal',
        },
        options
      );
      penempatan = updated || existingSameDudi;
    } else {
      const idPenempatan = generateNextSequentialId(
        'Plotting_Pemberangkatan',
        existingPlottings as any
      );
      penempatan = await SiswaPklService.getInstance().create(
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
          tanggalRencanaTarik,
          statusPenempatan: 'Terjadwal',
        },
        options
      );
    }

    if (!item.tanggalKirimSurat) {
      await this.update(
        perizinanId,
        {
          tanggalKirimSurat: getTodayIsoDate(),
        },
        { silentToast: true }
      );
    }

    if (item.nis) {
      await SiswaService.getInstance().updateStatusPKL(item.nis, 'Sedang PKL', {
        silentToast: true,
      });
    }

    await RelationSyncService.getInstance()
      .syncAfterMutation('perizinan', 'update')
      .catch((err) => console.warn('Relation sync warning:', err));

    return penempatan;
  }
}
