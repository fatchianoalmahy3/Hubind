import { BaseRepository } from '../core/BaseRepository';
import { Pengajuan } from '../core/types/schema';
import { PengajuanMetadata } from '../modules/pengajuan.meta.ts';
import { initialPengajuan } from './InitialData';
import { SiswaService } from './SiswaService';
import { DudiService } from './DudiService';
import { GuruService } from './GuruService';
import { SiswaPklService } from './SiswaPklService';
import { PerizinanService } from './PerizinanService';
import { RelationSyncService } from './RelationSyncService';
import { generateNextSequentialId } from '../core/utils/autoIdHelpers';
import { getOffsetWibIsoDate } from '../core/utils/dateHelpers';
import { stripNisSymbols } from '../core/utils/nisHelpers';

import {
  getCanonicalNisDigits,
  isActivePlacementStatus,
  normalizeRelationText,
} from '../core/utils/relationHelpers';

export class PengajuanService extends BaseRepository<Pengajuan> {
  private static instance: PengajuanService;

  private constructor() {
    super('Data_Pengajuan_PKL', PengajuanMetadata, initialPengajuan);
  }

  public static getInstance(): PengajuanService {
    if (!PengajuanService.instance) {
      PengajuanService.instance = new PengajuanService();
    }
    return PengajuanService.instance;
  }

  public async approveByKakomli(
    id: string,
    catatan?: string,
    options?: { silentToast?: boolean }
  ): Promise<Pengajuan | null> {
    const item = await this.getById(id);
    if (!item) return null;

    const [dudiList, matchedSiswa] = await Promise.all([
      DudiService.getInstance().getAll().catch(() => []),
      item.nis ? SiswaService.getInstance().getByNis(item.nis).catch(() => null) : Promise.resolve(null),
    ]);
    const targetDudiNorm = normalizeRelationText(item.dudiTujuan);
    const matchedDudi =
      (item.idDudi ? dudiList.find((d) => d.id === item.idDudi) : undefined) ||
      dudiList.find((d) => normalizeRelationText(d.namaDudi) === targetDudiNorm);

    const patch: Partial<Pengajuan> = {
      statusKakomli: 'Disetujui',
      statusHubin: 'Siap Diberangkatkan',
      catatanKakomli:
        catatan || 'Disetujui oleh Ketua Kompetensi Keahlian (Kakomli). Sesuai standar industri.',
    };
    if (matchedSiswa?.nama) {
      patch.namaSiswa = matchedSiswa.nama;
      patch.nis = stripNisSymbols(matchedSiswa.nis) || matchedSiswa.nis;
    }
    if (matchedDudi) {
      patch.idDudi = matchedDudi.id;
      if (!item.guruPendamping && matchedDudi.guruPendamping) {
        patch.guruPendamping = matchedDudi.guruPendamping;
        if (matchedDudi.idGuruPendamping) patch.idGuruPendamping = matchedDudi.idGuruPendamping;
      }
    }

    const updated = await this.update(id, patch, options);

    if (item.nis) {
      await SiswaService.getInstance().updateStatusPKL(item.nis, 'Diterima DUDI', {
        silentToast: true,
      });
    }

    if (updated) {
      await PerizinanService.getInstance()
        .createFromPengajuan(updated, { silentToast: true })
        .catch((err) => console.warn('Auto-create PerizinanPKL warning:', err));
    }

    return updated;
  }

  public async bulkApproveByKakomli(
    ids: string[],
    catatan?: string,
    options?: { silentToast?: boolean }
  ): Promise<number> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return 0;

    const idSet = new Set(uniqueIds);
    const [allPengajuan, dudiList, siswaList, existingPerizinan] = await Promise.all([
      this.getAll(),
      DudiService.getInstance().getAll().catch(() => []),
      SiswaService.getInstance().getAll().catch(() => []),
      PerizinanService.getInstance().getAll().catch(() => []),
    ]);

    const siswaByNis = new Map<string, (typeof siswaList)[number]>();
    for (const s of siswaList) {
      const digits = getCanonicalNisDigits(s.nis);
      if (digits) siswaByNis.set(digits, s);
    }

    const perizinanNoPengajuan = new Set(
      existingPerizinan.map((p) => String(p.noPengajuan || '').trim()).filter(Boolean)
    );
    const perizinanNisDudi = new Set(
      existingPerizinan.map(
        (p) => `${getCanonicalNisDigits(p.nis)}::${normalizeRelationText(p.dudiTujuan)}`
      )
    );

    const pengajuanPatches: Array<{ id: string; updates: Partial<Pengajuan> }> = [];
    const siswaPatchesMap = new Map<string, Partial<(typeof siswaList)[number]>>();
    const newPerizinanRows: Array<Record<string, any>> = [];
    const todayIso = getOffsetWibIsoDate(0);

    for (const item of allPengajuan) {
      if (!idSet.has(item.id)) continue;

      const nisDigits = getCanonicalNisDigits(item.nis);
      const matchedSiswa = nisDigits ? siswaByNis.get(nisDigits) : undefined;
      const targetDudiNorm = normalizeRelationText(item.dudiTujuan);
      const matchedDudi =
        (item.idDudi ? dudiList.find((d) => d.id === item.idDudi) : undefined) ||
        dudiList.find((d) => normalizeRelationText(d.namaDudi) === targetDudiNorm);

      const patch: Partial<Pengajuan> = {
        statusKakomli: 'Disetujui',
        statusHubin: 'Siap Diberangkatkan',
        catatanKakomli:
          catatan || 'Disetujui oleh Ketua Kompetensi Keahlian (Kakomli). Sesuai standar industri.',
      };
      if (matchedSiswa?.nama) {
        patch.namaSiswa = matchedSiswa.nama;
        patch.nis = stripNisSymbols(matchedSiswa.nis) || matchedSiswa.nis;
      }
      if (matchedDudi) {
        patch.idDudi = matchedDudi.id;
        if (!item.guruPendamping && matchedDudi.guruPendamping) {
          patch.guruPendamping = matchedDudi.guruPendamping;
          if (matchedDudi.idGuruPendamping) patch.idGuruPendamping = matchedDudi.idGuruPendamping;
        }
      }
      pengajuanPatches.push({ id: item.id, updates: patch });

      if (matchedSiswa && matchedSiswa.statusPKL !== 'Sedang PKL' && matchedSiswa.statusPKL !== 'Diterima DUDI') {
        siswaPatchesMap.set(matchedSiswa.id, { statusPKL: 'Diterima DUDI' });
      }

      const effectiveNoPengajuan = String(item.noPengajuan || item.id).trim();
      const effectiveNis =
        (matchedSiswa ? stripNisSymbols(matchedSiswa.nis) || matchedSiswa.nis : nisDigits) ||
        String(item.nis || '').trim();
      const nisDudiKey = `${getCanonicalNisDigits(effectiveNis)}::${targetDudiNorm}`;

      if (
        !perizinanNoPengajuan.has(effectiveNoPengajuan) &&
        !perizinanNisDudi.has(nisDudiKey)
      ) {
        perizinanNoPengajuan.add(effectiveNoPengajuan);
        perizinanNisDudi.add(nisDudiKey);
        newPerizinanRows.push({
          noPengajuan: effectiveNoPengajuan,
          nis: effectiveNis,
          namaSiswa: matchedSiswa?.nama || item.namaSiswa,
          jurusan: matchedSiswa?.jurusan || item.jurusan,
          kelas: matchedSiswa?.kelas || item.kelas,
          namaOrtuWali: matchedSiswa?.namaOrtuWali || item.namaOrtuWali || '',
          statusIzinOrtu: '',
          tanggalMulaiIzin: '',
          tanggalSelesaiIzin: '',
          rentangTanggal: '',
          idDudi: matchedDudi?.id || item.idDudi || '',
          dudiTujuan: item.dudiTujuan,
          alamatDudi: item.alamatDudi || matchedDudi?.alamat || '-',
          tanggalKirimSurat: todayIso,
          catatanPerizinan: 'Terbuat otomatis dari pengajuan ACC Kakomli.',
          linkBuktiBalasan: '',
        });
      }
    }

    const updatedCount = await this.bulkUpdateMany(pengajuanPatches, options);

    const siswaPatches = Array.from(siswaPatchesMap.entries()).map(([sId, updates]) => ({
      id: sId,
      updates,
    }));
    if (siswaPatches.length > 0) {
      await SiswaService.getInstance()
        .bulkUpdateMany(siswaPatches, { silentToast: true })
        .catch(() => 0);
    }

    if (newPerizinanRows.length > 0) {
      await PerizinanService.getInstance()
        .importRows(newPerizinanRows, { silentToast: true })
        .catch((err) => {
          console.warn('Batch auto-create PerizinanPKL warning:', err);
          return 0;
        });
    }

    await RelationSyncService.getInstance()
      .syncAfterMutation('pengajuan', 'update')
      .catch(() => {});

    return updatedCount;
  }

  public async createPerizinanFromPengajuan(
    id: string,
    options?: { silentToast?: boolean }
  ): Promise<void> {
    const item = await this.getById(id);
    if (!item) throw new Error('Data pengajuan tidak ditemukan.');
    await PerizinanService.getInstance().createFromPengajuan(item, options);
  }

  public async rejectByKakomli(
    id: string,
    reason: string,
    options?: { silentToast?: boolean }
  ): Promise<Pengajuan | null> {
    const item = await this.getById(id);
    if (!item) return null;

    const updated = await this.update(
      id,
      {
        statusKakomli: 'Ditolak',
        statusHubin: 'Batal',
        catatanKakomli: reason || 'Ditolak: DUDI tidak linier dengan kompetensi keahlian.',
      },
      options
    );

    if (item.nis) {
      await SiswaService.getInstance().updateStatusPKL(item.nis, 'Belum Daftar', {
        silentToast: true,
      });
    }

    return updated;
  }

  public async scheduleHubin(
    id: string,
    guruPendamping: string,
    tanggalBerangkat: string,
    options?: { silentToast?: boolean }
  ): Promise<Pengajuan | null> {
    const item = await this.getById(id);
    if (!item) return null;

    const [dudiList, guruList, existingPlottings, siswaMaster] = await Promise.all([
      DudiService.getInstance().getAll().catch(() => []),
      GuruService.getInstance().getAll().catch(() => []),
      SiswaPklService.getInstance().getAll().catch(() => []),
      item.nis ? SiswaService.getInstance().getByNis(item.nis).catch(() => null) : Promise.resolve(null),
    ]);

    const itemNis = getCanonicalNisDigits(siswaMaster?.nis || item.nis);
    const canonicalNama = siswaMaster?.nama || item.namaSiswa;

    const targetDudiNorm = normalizeRelationText(item.dudiTujuan);
    const matchedDudi =
      (item.idDudi ? dudiList.find((d) => d.id === item.idDudi) : undefined) ||
      dudiList.find((d) => normalizeRelationText(d.namaDudi) === targetDudiNorm);
    const effectiveDudiName = matchedDudi?.namaDudi || item.dudiTujuan;
    const effectiveDudiNorm = normalizeRelationText(effectiveDudiName);

    const effectiveGuruInput = guruPendamping || item.guruPendamping || matchedDudi?.guruPendamping || '';
    const guru = guruList.find(
      (g) => normalizeRelationText(g.nama) === normalizeRelationText(effectiveGuruInput)
    );
    const effectiveGuruName = guru?.nama || effectiveGuruInput;
    const effectiveGuruId = guru?.id || matchedDudi?.idGuruPendamping || item.idGuruPendamping || '';

    // Enforce max 1 active placement per NIS across different DUDIs
    const activePlacementsForNis = itemNis
      ? existingPlottings.filter(
          (p) =>
            getCanonicalNisDigits(p.nis) === itemNis &&
            isActivePlacementStatus(p.statusPenempatan)
        )
      : [];

    const existingSameDudi = activePlacementsForNis.find(
      (p) =>
        (matchedDudi?.id && p.idDudi === matchedDudi.id) ||
        normalizeRelationText(p.namaDudi) === effectiveDudiNorm
    );
    const existingOtherDudi = activePlacementsForNis.find(
      (p) => !existingSameDudi || p.id !== existingSameDudi.id
    );

    if (existingOtherDudi) {
      throw new Error(
        `Siswa ${canonicalNama} (${itemNis}) masih memiliki penempatan PKL aktif (${existingOtherDudi.statusPenempatan}) di ${existingOtherDudi.namaDudi}. Ubah status lama ke "Selesai PKL" / "Pindah DUDI" atau gunakan fitur Pindah DUDI terlebih dahulu.`
      );
    }

    const updated = await this.update(
      id,
      {
        nis: itemNis || item.nis,
        namaSiswa: canonicalNama,
        idDudi: matchedDudi?.id || item.idDudi || '',
        dudiTujuan: effectiveDudiName,
        idGuruPendamping: effectiveGuruId,
        statusHubin: 'Terjadwal',
        guruPendamping: effectiveGuruName,
        tanggalBerangkat,
      },
      options
    );

    if (itemNis) {
      await SiswaService.getInstance().updateStatusPKL(itemNis, 'Sedang PKL', {
        silentToast: true,
      });
    }

    const defaultTarik = tanggalBerangkat ? getOffsetWibIsoDate(120, tanggalBerangkat) : '';

    if (existingSameDudi) {
      await SiswaPklService.getInstance().update(
        existingSameDudi.id,
        {
          nis: itemNis || existingSameDudi.nis,
          namaSiswa: canonicalNama,
          idDudi: matchedDudi?.id || existingSameDudi.idDudi,
          namaDudi: effectiveDudiName,
          idGuruPendamping: effectiveGuruId || existingSameDudi.idGuruPendamping,
          guruPendamping: effectiveGuruName,
          tanggalBerangkat,
          statusPenempatan: 'Terjadwal',
        },
        { silentToast: true }
      );
    } else {
      const idPenempatan = generateNextSequentialId(
        'Plotting_Pemberangkatan',
        existingPlottings as any
      );
      await SiswaPklService.getInstance().create(
        {
          id: idPenempatan,
          idPenempatan,
          nis: itemNis || String(item.nis || '').trim(),
          namaSiswa: canonicalNama,
          idDudi: matchedDudi?.id || '',
          namaDudi: effectiveDudiName,
          idGuruPendamping: effectiveGuruId,
          guruPendamping: effectiveGuruName,
          tanggalBerangkat,
          tanggalRencanaTarik: defaultTarik,
          statusPenempatan: 'Terjadwal',
        },
        { silentToast: true }
      );
    }

    await RelationSyncService.getInstance()
      .syncAfterMutation('pengajuan', 'update')
      .catch((err) => console.warn('Relation sync warning:', err));

    return updated;
  }
}
