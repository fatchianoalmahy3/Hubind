import { BaseRepository } from '../core/BaseRepository';
import { Pengajuan, PerizinanPKL, PenempatanPKL } from '../core/types/schema';
import { PerizinanMetadata } from '../modules/perizinan.meta.ts';
import { initialPerizinan } from './InitialData';
import { SiswaService } from './SiswaService';
import { DudiService } from './DudiService';
import { GuruService } from './GuruService';
import { SiswaPklService } from './SiswaPklService';
import { RelationSyncService } from './RelationSyncService';

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
    const alreadyExists = existingList.find(
      (p) =>
        (pengajuan.noPengajuan && p.noPengajuan === pengajuan.noPengajuan) ||
        (p.nis === pengajuan.nis &&
          p.dudiTujuan.trim().toLowerCase() === pengajuan.dudiTujuan.trim().toLowerCase() &&
          p.statusBalasanDudi !== 'Ditolak DUDI')
    );

    if (alreadyExists) {
      return alreadyExists;
    }

    const siswa = pengajuan.nis
      ? await SiswaService.getInstance().getByNis(pengajuan.nis).catch(() => null)
      : null;

    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const noPerizinan = `IZN-${year}-${randomSuffix}`;
    const noSuratPermohonan = `421.5/${randomSuffix}/Hubin/SMK.PGRI2/${year}`;

    return this.create(
      {
        id: noPerizinan,
        noPerizinan,
        noPengajuan: pengajuan.noPengajuan || pengajuan.id,
        nis: pengajuan.nis,
        namaSiswa: pengajuan.namaSiswa,
        jurusan: pengajuan.jurusan,
        kelas: pengajuan.kelas,
        namaOrtuWali: siswa?.namaOrtuWali || '-',
        noOrtuWali: siswa?.noOrtuWali || pengajuan.noWa || '-',
        statusIzinOrtu: 'Menunggu Izin',
        noSuratPermohonan,
        dudiTujuan: pengajuan.dudiTujuan,
        alamatDudi: pengajuan.alamatDudi || '-',
        tanggalKirimSurat: '',
        statusBalasanDudi: 'Belum Dikirim',
        tanggalBalasan: '',
        catatanPerizinan: 'Terbuat otomatis dari pengajuan ACC Kakomli.',
        linkBuktiBalasan: '',
      },
      options
    );
  }

  public async markOrtuApproved(
    id: string,
    options?: { silentToast?: boolean }
  ): Promise<PerizinanPKL | null> {
    return this.update(
      id,
      {
        statusIzinOrtu: 'Diizinkan Ortu',
      },
      options
    );
  }

  public async markDudiAccepted(
    id: string,
    tanggalBalasan?: string,
    options?: { silentToast?: boolean }
  ): Promise<PerizinanPKL | null> {
    const tgl = tanggalBalasan || new Date().toISOString().split('T')[0];
    const item = await this.getById(id);
    if (!item) return null;

    const updated = await this.update(
      id,
      {
        statusBalasanDudi: 'Diterima DUDI',
        tanggalBalasan: tgl,
        tanggalKirimSurat: item.tanggalKirimSurat || tgl,
      },
      options
    );

    if (item.nis) {
      await SiswaService.getInstance().updateStatusPKL(item.nis, 'Diterima DUDI', {
        silentToast: true,
      });
    }
    return updated;
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
    const existingActive = existingPlottings.find(
      (p) =>
        p.nis === item.nis &&
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
      const idPenempatan = `PLT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      penempatan = await SiswaPklService.getInstance().create(
        {
          id: idPenempatan,
          idPenempatan,
          nis: item.nis,
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

    await this.update(
      perizinanId,
      {
        statusIzinOrtu: 'Diizinkan Ortu',
        statusBalasanDudi: 'Diterima DUDI',
        tanggalBalasan: item.tanggalBalasan || new Date().toISOString().split('T')[0],
      },
      { silentToast: true }
    );

    if (item.nis) {
      await SiswaService.getInstance().updateStatusPKL(item.nis, 'Sedang PKL', {
        silentToast: true,
      });
    }

    await RelationSyncService.getInstance()
      .syncPlacementCounts({ silentToast: true })
      .catch((err) => console.warn('Relation count sync warning:', err));

    return penempatan;
  }
}
