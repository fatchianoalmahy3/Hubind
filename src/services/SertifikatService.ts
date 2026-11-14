import { BaseRepository } from '../core/BaseRepository';
import { Sertifikat } from '../core/types/schema';
import { SertifikatMetadata } from '../modules/sertifikat.meta.ts';
import { initialSertifikat } from './InitialData';

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

  public async updateGrades(id: string, nilaiDudi: number, nilaiGuru: number): Promise<Sertifikat | null> {
    const nilaiAkhir = Math.round(nilaiDudi * 0.6 + nilaiGuru * 0.4);
    let predikat: Sertifikat['predikat'] = 'Cukup (C)';
    if (nilaiAkhir >= 88) predikat = 'Sangat Baik (A)';
    else if (nilaiAkhir >= 78) predikat = 'Baik (B)';

    return this.update(id, {
      nilaiDudi,
      nilaiGuru,
      nilaiAkhir,
      predikat,
      statusRaport: 'Siap Cetak',
    });
  }
}
