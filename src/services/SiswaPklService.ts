import { BaseRepository } from '../core/BaseRepository';
import { PenempatanPKL } from '../core/types/schema';
import { SiswaPklMetadata } from '../modules/siswaPkl.meta.ts';
import { initialSiswaPkl } from './InitialData';

export class SiswaPklService extends BaseRepository<PenempatanPKL> {
  private static instance: SiswaPklService;

  private constructor() {
    super('Plotting_Pemberangkatan', SiswaPklMetadata, initialSiswaPkl);
  }

  public static getInstance(): SiswaPklService {
    if (!SiswaPklService.instance) {
      SiswaPklService.instance = new SiswaPklService();
    }
    return SiswaPklService.instance;
  }

  public async getByNis(nis: string): Promise<PenempatanPKL | null> {
    const list = await this.getAll();
    return list.find((p) => p.nis === nis) || null;
  }
}
