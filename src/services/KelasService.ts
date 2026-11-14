import { BaseRepository } from '../core/BaseRepository';
import { Kelas } from '../core/types/schema';
import { KelasMetadata } from '../modules/kelas.meta.ts';
import { initialKelas } from './InitialData';

export class KelasService extends BaseRepository<Kelas> {
  private static instance: KelasService;

  private constructor() {
    super('Master_Kelas_Walas', KelasMetadata, initialKelas);
  }

  public static getInstance(): KelasService {
    if (!KelasService.instance) {
      KelasService.instance = new KelasService();
    }
    return KelasService.instance;
  }

  public async getByJurusan(jurusan: string): Promise<Kelas[]> {
    const list = await this.getAll();
    return list.filter((k) => k.jurusan === jurusan);
  }
}
