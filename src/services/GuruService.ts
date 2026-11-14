import { BaseRepository } from '../core/BaseRepository';
import { Guru } from '../core/types/schema';
import { GuruMetadata } from '../modules/guru.meta.ts';
import { initialGuru } from './InitialData';

export class GuruService extends BaseRepository<Guru> {
  private static instance: GuruService;

  private constructor() {
    super('Master_Guru_Pendamping', GuruMetadata, initialGuru);
  }

  public static getInstance(): GuruService {
    if (!GuruService.instance) {
      GuruService.instance = new GuruService();
    }
    return GuruService.instance;
  }

  public async getByNama(nama: string): Promise<Guru | null> {
    const list = await this.getAll();
    const target = nama.trim().toLowerCase();
    return list.find((g) => g.nama.trim().toLowerCase() === target) || null;
  }
}
