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

  public async approveByKakomli(id: string, catatan?: string): Promise<Pengajuan | null> {
    const item = await this.getById(id);
    if (!item) return null;

    const updated = await this.update(id, {
      statusKakomli: 'Disetujui',
      statusHubin: 'Siap Diberangkatkan',
      catatanKakomli:
        catatan || 'Disetujui oleh Ketua Kompetensi Keahlian (Kakomli). Sesuai standar industri.',
    });

    if (item.nis) {
      await SiswaService.getInstance().updateStatusPKL(item.nis, 'Diterima DUDI');
    }

    if (updated) {
      await PerizinanService.getInstance()
        .createFromPengajuan(updated)
        .catch((err) => console.warn('Auto-create PerizinanPKL warning:', err));
    }

    return updated;
  }

  public async createPerizinanFromPengajuan(id: string): Promise<void> {
    const item = await this.getById(id);
    if (!item) throw new Error('Data pengajuan tidak ditemukan.');
    await PerizinanService.getInstance().createFromPengajuan(item);
  }

  public async rejectByKakomli(id: string, reason: string): Promise<Pengajuan | null> {
    const item = await this.getById(id);
    if (!item) return null;

    const updated = await this.update(id, {
      statusKakomli: 'Ditolak',
      statusHubin: 'Batal',
      catatanKakomli: reason || 'Ditolak: DUDI tidak linier dengan kompetensi keahlian.',
    });

    if (item.nis) {
      await SiswaService.getInstance().updateStatusPKL(item.nis, 'Belum Daftar');
    }

    return updated;
  }

  public async scheduleHubin(
    id: string,
    guruPendamping: string,
    tanggalBerangkat: string
  ): Promise<Pengajuan | null> {
    const item = await this.getById(id);
    if (!item) return null;

    const updated = await this.update(id, {
      statusHubin: 'Terjadwal',
      guruPendamping,
      tanggalBerangkat,
    });

    if (item.nis) {
      await SiswaService.getInstance().updateStatusPKL(item.nis, 'Sedang PKL');
    }

    // Resolve canonical Master IDs and upsert into Plotting_Pemberangkatan so Portal Supervisi Guru & Data Siswa PKL stay 100% synced
    const [dudiList, guru, existingPlottings] = await Promise.all([
      DudiService.getInstance().getAll().catch(() => []),
      GuruService.getInstance().getByNama(guruPendamping).catch(() => null),
      SiswaPklService.getInstance().getAll().catch(() => []),
    ]);

    const targetDudiNorm = String(item.dudiTujuan || '').trim().toLowerCase();
    const matchedDudi = dudiList.find(
      (d) => d.namaDudi.trim().toLowerCase() === targetDudiNorm
    );

    const existingActive = existingPlottings.find(
      (p) =>
        p.nis === item.nis &&
        p.namaDudi.trim().toLowerCase() === targetDudiNorm &&
        p.statusPenempatan !== 'Dibatalkan'
    );

    const startDateMs = new Date(tanggalBerangkat).getTime();
    const defaultTarik = !Number.isNaN(startDateMs)
      ? new Date(startDateMs + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : '';

    if (existingActive) {
      await SiswaPklService.getInstance().update(existingActive.id, {
        idDudi: matchedDudi?.id || existingActive.idDudi,
        namaDudi: matchedDudi?.namaDudi || item.dudiTujuan,
        idGuruPendamping: guru?.id || existingActive.idGuruPendamping,
        guruPendamping: guru?.nama || guruPendamping,
        tanggalBerangkat,
        statusPenempatan: 'Terjadwal',
      });
    } else {
      const idPenempatan = `PLT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      await SiswaPklService.getInstance().create({
        id: idPenempatan,
        idPenempatan,
        nis: item.nis,
        namaSiswa: item.namaSiswa,
        idDudi: matchedDudi?.id || '',
        namaDudi: matchedDudi?.namaDudi || item.dudiTujuan,
        idGuruPendamping: guru?.id || '',
        guruPendamping: guru?.nama || guruPendamping,
        tanggalBerangkat,
        tanggalRencanaTarik: defaultTarik,
        statusPenempatan: 'Terjadwal',
      });
    }

    await RelationSyncService.getInstance()
      .syncPlacementCounts()
      .catch((err) => console.warn('Relation count sync warning:', err));

    return updated;
  }
}
