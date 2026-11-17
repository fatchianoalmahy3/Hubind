import { BaseRepository } from '../core/BaseRepository';
import { Siswa } from '../core/types/schema';
import { SiswaMetadata } from '../modules/siswa.meta.ts';
import { initialSiswa } from './InitialData';
import { stripNisSymbols } from '../core/utils/nisHelpers';

export class SiswaService extends BaseRepository<Siswa> {
  private static instance: SiswaService;

  private constructor() {
    super('Master_Siswa_XI', SiswaMetadata, initialSiswa);
  }

  public static getInstance(): SiswaService {
    if (!SiswaService.instance) {
      SiswaService.instance = new SiswaService();
    }
    return SiswaService.instance;
  }

  public async getByNis(nis: string): Promise<Siswa | null> {
    const list = await this.getAll();
    const targetDigits = stripNisSymbols(nis);
    if (targetDigits) {
      const matched = list.find((s) => stripNisSymbols(s.nis) === targetDigits);
      if (matched) return matched;
    }
    return list.find((s) => s.nis === nis) || null;
  }

  public async getByJurusan(jurusan: string): Promise<Siswa[]> {
    const list = await this.getAll();
    return list.filter((s) => s.jurusan === jurusan);
  }

  public async updateStatusPKL(
    nis: string,
    status: Siswa['statusPKL'],
    options?: { silentToast?: boolean }
  ): Promise<void> {
    const siswa = await this.getByNis(nis);
    if (siswa) {
      await this.update(siswa.id, { statusPKL: status }, options);
    }
  }
}
