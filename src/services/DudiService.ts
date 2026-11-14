import { BaseRepository } from '../core/BaseRepository';
import { Dudi } from '../core/types/schema';
import { DudiMetadata } from '../modules/dudi.meta.ts';
import { initialDudi } from './InitialData';

export class DudiService extends BaseRepository<Dudi> {
  private static instance: DudiService;

  private constructor() {
    super('Master_DUDI', DudiMetadata, initialDudi);
  }

  public static getInstance(): DudiService {
    if (!DudiService.instance) {
      DudiService.instance = new DudiService();
    }
    return DudiService.instance;
  }

  public async getAvailableDudi(): Promise<Dudi[]> {
    const list = await this.getAll();
    return list.filter((d) => d.terisi < d.kuotaMaksimal);
  }

  public async incrementTerisi(dudiName: string): Promise<void> {
    const list = await this.getAll();
    const dudi = list.find((d) => d.namaDudi === dudiName);
    if (dudi) {
      await this.update(dudi.id, { terisi: Math.min(dudi.kuotaMaksimal, dudi.terisi + 1) });
    }
  }
}
