import { BaseRepository } from '../core/BaseRepository';
import { Jurusan } from '../core/types/schema';
import { JurusanMetadata } from '../modules/jurusan.meta.ts';
import { initialJurusan } from './InitialData';

export class JurusanService extends BaseRepository<Jurusan> {
  private static instance: JurusanService;

  private constructor() {
    super('Master_Jurusan', JurusanMetadata, initialJurusan);
  }

  public static getInstance(): JurusanService {
    if (!JurusanService.instance) {
      JurusanService.instance = new JurusanService();
    }
    return JurusanService.instance;
  }
}
