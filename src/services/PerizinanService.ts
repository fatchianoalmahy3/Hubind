import { BaseRepository } from '../core/BaseRepository';
import { PerizinanPKL } from '../core/types/schema';
import { PerizinanMetadata } from '../modules/perizinan.meta.ts';
import { initialPerizinan } from './InitialData';
import { SiswaPklService } from './SiswaPklService';
import { getCanonicalNisDigits, isActivePlacementStatus } from '../core/utils/relationHelpers';

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

  public async resolvePlacementDudiForNis(
    nis: string
  ): Promise<{ idDudi: string; dudiTujuan: string } | null> {
    const digits = getCanonicalNisDigits(nis);
    if (!digits) return null;
    const placements = await SiswaPklService.getInstance().getAll().catch(() => []);
    const active =
      placements.find(
        (p) =>
          getCanonicalNisDigits(p.nis) === digits &&
          isActivePlacementStatus(p.statusPenempatan)
      ) || placements.find((p) => getCanonicalNisDigits(p.nis) === digits);
    if (!active) return null;
    return {
      idDudi: active.idDudi || '',
      dudiTujuan: active.namaDudi || '',
    };
  }
}

