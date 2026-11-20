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

    const created = await this.create(
      {
        id: noPerizinan,
        noPerizinan,
        noPengajuan: pengajuan.noPengajuan || pengajuan.id,
        nis: pengajuanNis,
        namaSiswa: pengajuan.namaSiswa,
        jurusan: pengajuan.jurusan,
        kelas: pengajuan.kelas,
        namaOrtuWali: siswa?.namaOrtuWali || pengajuan.namaOrtuWali || '',
        statusIzinOrtu: '',
        tanggalMulaiIzin: '',
        tanggalSelesaiIzin: '',
        rentangTanggal: '',
        noSuratPermohonan,
        dudiTujuan: pengajuan.dudiTujuan,
        alamatDudi: pengajuan.alamatDudi || '-',
        tanggalKirimSurat: getTodayIsoDate(),
        catatanPerizinan: 'Terbuat otomatis dari pengajuan ACC Kakomli.',
        linkBuktiBalasan: '',
      },
      options
    );

    await RelationSyncService.getInstance()
      .syncJurusanCounts({ silentToast: true })
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

    const [dudiList, guru] = await Promise.all([
      DudiService.getInstance().getAll().catch(() => []),
      GuruService.getInstance().getByNama(guruPendamping).catch(() => null),
    ]);

    const matchedDudi = dudiList.find(
      (d) => d.namaDudi.trim().toLowerCase() === item.dudiTujuan.trim().toLowerCase()
    );

    const existingPlottings = await SiswaPklService.getInstance().getAll();
    const itemNis = stripNisSymbols(item.nis) || String(item.nis || '').trim();
    const existingActive = existingPlottings.find(
      (p) =>
        (stripNisSymbols(p.nis) || p.nis) === itemNis &&
        p.namaDudi.trim().toLowerCase() === item.dudiTujuan.trim().toLowerCase() &&
        p.statusPenempatan !== 'Dibatalkan'
    );

    let penempatan: PenempatanPKL;
    if (existingActive) {
      const updated = await SiswaPklService.getInstance().update(
        existingActive.id,
        {
          idGuruPendamping: guru?.id || existingActive.idGuruPendamping,
          guruPendamping,
          tanggalBerangkat,
          tanggalRencanaTarik,
          statusPenempatan: 'Terjadwal',
        },
        options
      );
      penempatan = updated || existingActive;
    } else {
      const idPenempatan = generateNextSequentialId(
        'Plotting_Pemberangkatan',
        existingPlottings as any
      );
      penempatan = await SiswaPklService.getInstance().create(
        {
          id: idPenempatan,
          idPenempatan,
          nis: itemNis,
          namaSiswa: item.namaSiswa,
          idDudi: matchedDudi?.id || '',
          namaDudi: item.dudiTujuan,
          idGuruPendamping: guru?.id || '',
          guruPendamping,
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

    await Promise.all([
      RelationSyncService.getInstance().syncPlacementCounts({ silentToast: true }),
      RelationSyncService.getInstance().syncJurusanCounts({ silentToast: true }),
    ]).catch((err) => console.warn('Relation count sync warning:', err));

    return penempatan;
  }
}
