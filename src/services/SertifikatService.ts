import { BaseRepository } from '../core/BaseRepository';
import { GoogleSheetClient } from '../core/GoogleSheetClient';
import { Sertifikat } from '../core/types/schema';
import { SertifikatMetadata } from '../modules/sertifikat.meta.ts';
import { initialSertifikat } from './InitialData';
import {
  calculateEqualWeightedAverage,
  getPredikatFromScore,
} from '../core/utils/monitoringHelpers';
import { getTodayWibIsoDate } from '../core/utils/dateHelpers';
import { getCanonicalNisDigits } from '../core/utils/relationHelpers';

export interface GradeScoresInput {
  nilaiK3lh: number;
  nilaiSoftskill: number;
  nilaiKompetensiTeknis: number;
  nilaiAlurBisnis: number;
}

export class SertifikatService extends BaseRepository<Sertifikat> {
  private static instance: SertifikatService;

  private constructor() {
    super('Nilai_Dan_Sertifikat', SertifikatMetadata, initialSertifikat);
  }

  public static getInstance(): SertifikatService {
    if (!SertifikatService.instance) {
      SertifikatService.instance = new SertifikatService();
    }
    return SertifikatService.instance;
  }

  public generateNextSerial(jurusanKode: string): string {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(100 + Math.random() * 900);
    return `SERI-${year}-${jurusanKode.toUpperCase()}-${randomNum}`;
  }

  /**
   * Single Source of Truth (SSOT) Nilai PKL:
   * Seluruh perubahan 4 komponen nilai PKL ditulis ke Monitoring_5_Tahap;
   * Nilai_Dan_Sertifikat menarik nilai, rata-rata, dan predikat secara otomatis via ARRAYFORMULA.
   */
  public async syncGradesViaMonitoring(
    target: Partial<Sertifikat>,
    scores: GradeScoresInput,
    options?: { silentToast?: boolean }
  ): Promise<{ nilaiRataRata: number; predikat: Sertifikat['predikat'] }> {
    const [{ MonitoringService }, { SiswaPklService }, { DudiService }] = await Promise.all([
      import('./MonitoringService'),
      import('./SiswaPklService'),
      import('./DudiService'),
    ]);

    const k3lh = Math.min(100, Math.max(0, Number(scores.nilaiK3lh || 0)));
    const softskill = Math.min(100, Math.max(0, Number(scores.nilaiSoftskill || 0)));
    const teknis = Math.min(100, Math.max(0, Number(scores.nilaiKompetensiTeknis || 0)));
    const alurBisnis = Math.min(100, Math.max(0, Number(scores.nilaiAlurBisnis || 0)));
    const nilaiRataRata = calculateEqualWeightedAverage(k3lh, softskill, teknis, alurBisnis);
    const predikat = getPredikatFromScore(nilaiRataRata) as Sertifikat['predikat'];

    const monService = MonitoringService.getInstance();
    const [monRows, placements, dudis] = await Promise.all([
      monService.getAll().catch(() => []),
      SiswaPklService.getInstance().getAll().catch(() => []),
      DudiService.getInstance().getAll().catch(() => []),
    ]);

    const nisDigits = getCanonicalNisDigits(target.nis);
    const targetPltId = String(target.idPenempatan || target.id || '').trim();

    const matchedPlt =
      (targetPltId ? placements.find((p) => p.idPenempatan === targetPltId || p.id === targetPltId) : undefined) ||
      (nisDigits ? placements.find((p) => getCanonicalNisDigits(p.nis) === nisDigits) : undefined);

    const matchedDudi =
      (target.idDudi ? dudis.find((d) => d.id === target.idDudi) : undefined) ||
      (matchedPlt?.idDudi ? dudis.find((d) => d.id === matchedPlt.idDudi) : undefined) ||
      (target.dudiTujuan
        ? dudis.find((d) => d.namaDudi.trim().toLowerCase() === String(target.dudiTujuan).trim().toLowerCase())
        : undefined);

    const effectivePltId = targetPltId || matchedPlt?.idPenempatan || (nisDigits ? `PLT-${nisDigits}` : '');

    const candidateMons = monRows.filter((m) => {
      const mPlt = String(m.idPenempatan || '').trim();
      const mNis = getCanonicalNisDigits(m.nis);
      return (
        (effectivePltId && mPlt === effectivePltId) ||
        (nisDigits && mNis === nisDigits)
      );
    });

    const targetMon =
      [...candidateMons].reverse().find(
        (m) => m.nilaiDudiTerkumpul || Number(m.nilaiRataRata || 0) > 0
      ) || candidateMons[candidateMons.length - 1];

    const silentOpts = { silentToast: options?.silentToast ?? true };

    if (targetMon) {
      await monService.update(
        targetMon.id,
        {
          idPenempatan: targetMon.idPenempatan || effectivePltId,
          idDudi: targetMon.idDudi || target.idDudi || matchedPlt?.idDudi || matchedDudi?.id || '',
          nilaiPklMuncul: true,
          nilaiDudiTerkumpul: true,
          nilaiK3lh: k3lh,
          nilaiSoftskill: softskill,
          nilaiKompetensiTeknis: teknis,
          nilaiAlurBisnis: alurBisnis,
          nilaiRataRata,
        },
        silentOpts
      );
    } else {
      const newMonId = `MON-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await monService.create(
        {
          id: newMonId,
          idPenempatan: effectivePltId,
          nis: nisDigits || String(target.nis || '').trim(),
          namaSiswa: target.namaSiswa || '',
          idDudi: target.idDudi || matchedPlt?.idDudi || matchedDudi?.id || '',
          dudiTujuan: target.dudiTujuan || matchedDudi?.namaDudi || '',
          alamatDudi: matchedDudi?.alamat || '',
          jurusan: target.jurusan || '',
          idGuruPendamping: matchedPlt?.idGuruPendamping || matchedDudi?.idGuruPendamping || '',
          guruPendamping: matchedPlt?.guruPendamping || matchedDudi?.guruPendamping || '',
          tahap: '5. Monitoring 4',
          tanggalKunjungan: target.tanggalTerbit || getTodayWibIsoDate(),
          sakit: 0,
          izin: 0,
          alpha: 0,
          nilaiPklMuncul: true,
          nilaiK3lh: k3lh,
          nilaiSoftskill: softskill,
          nilaiKompetensiTeknis: teknis,
          nilaiAlurBisnis: alurBisnis,
          nilaiRataRata,
          catatanKunjungan: 'Input/pembaruan nilai dari modul Raport & Sertifikat.',
          fotoBuktiUrl: '',
          nilaiDudiTerkumpul: true,
          blangkoSertifikatBawa: true,
          statusTahap: 'Terlaksana',
        },
        silentOpts
      );
    }

    GoogleSheetClient.getInstance().invalidateClientSheetCache('Monitoring_5_Tahap');
    return { nilaiRataRata, predikat };
  }

  public async updateGrades(
    id: string,
    scores: GradeScoresInput
  ): Promise<Sertifikat | null> {
    const existing = await this.getById(id);
    const { nilaiRataRata, predikat } = await this.syncGradesViaMonitoring(
      existing || { id, idPenempatan: id },
      scores,
      { silentToast: true }
    );

    const updated = await this.update(id, {
      nilaiK3lh: scores.nilaiK3lh,
      nilaiSoftskill: scores.nilaiSoftskill,
      nilaiKompetensiTeknis: scores.nilaiKompetensiTeknis,
      nilaiAlurBisnis: scores.nilaiAlurBisnis,
      nilaiRataRata,
      predikat,
      statusRaport: 'Siap Cetak',
    });

    if (updated) {
      updated.nilaiK3lh = scores.nilaiK3lh;
      updated.nilaiSoftskill = scores.nilaiSoftskill;
      updated.nilaiKompetensiTeknis = scores.nilaiKompetensiTeknis;
      updated.nilaiAlurBisnis = scores.nilaiAlurBisnis;
      updated.nilaiRataRata = nilaiRataRata;
      updated.predikat = predikat;
    }

    return updated;
  }
}
