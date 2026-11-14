import { BaseRepository } from '../core/BaseRepository';
import { Monitoring } from '../core/types/schema';
import { MonitoringMetadata } from '../modules/monitoring.meta.ts';
import { initialMonitoring } from './InitialData';

export class MonitoringService extends BaseRepository<Monitoring> {
  private static instance: MonitoringService;

  private constructor() {
    super('Monitoring_5_Tahap', MonitoringMetadata, initialMonitoring);
  }

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  public async getByGuru(guruName: string): Promise<Monitoring[]> {
    const list = await this.getAll();
    return list.filter((m) => m.guruPendamping.toLowerCase().includes(guruName.toLowerCase()));
  }

  public async updateTahapProgress(id: string, updates: Partial<Monitoring>): Promise<Monitoring | null> {
    return this.update(id, updates);
  }
}
