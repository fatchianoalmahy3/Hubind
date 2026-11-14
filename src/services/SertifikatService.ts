import { BaseRepository } from '../core/BaseRepository';
import { Sertifikat } from '../core/types/schema';
import { SertifikatMetadata } from '../modules/sertifikat.meta.ts';
import { initialSertifikat } from './InitialData';
import {
  calculateEqualWeightedAverage,
  getPredikatFromScore,
} from '../core/utils/monitoringHelpers';

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

  public async updateGrades(
    id: string,
    scores: {
      nilaiK3lh: number;
      nilaiSoftskill: number;
      nilaiKompetensiTeknis: number;
      nilaiAlurBisnis: number;
    }
  ): Promise<Sertifikat | null> {
    const nilaiRataRata = calculateEqualWeightedAverage(
      scores.nilaiK3lh,
      scores.nilaiSoftskill,
      scores.nilaiKompetensiTeknis,
      scores.nilaiAlurBisnis
    );
    const predikat = getPredikatFromScore(nilaiRataRata) as Sertifikat['predikat'];

    return this.update(id, {
      nilaiK3lh: scores.nilaiK3lh,
      nilaiSoftskill: scores.nilaiSoftskill,
      nilaiKompetensiTeknis: scores.nilaiKompetensiTeknis,
      nilaiAlurBisnis: scores.nilaiAlurBisnis,
      nilaiRataRata,
      predikat,
      statusRaport: 'Siap Cetak',
    });
  }
}
