import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AdminSessionUser } from '../core/auth/LocalAccountAuthService';
import { ModuleMetadata } from '../core/types/metadata';
import { BaseRepository } from '../core/BaseRepository';
import { useDataGrid } from '../hooks/useDataGrid';
import { Guru, Jurusan, Siswa, UserRole } from '../core/types/schema';
import {
  getModuleEntry,
  getRepositoryForModule,
  isModuleReadOnlyForRole,
} from '../core/moduleRegistry';
import {
  matchAnyJurusanItem,
  matchJurusanItem,
  resolveKakomliJurusans,
} from '../core/utils/jurusanHelpers';
import { stripNisSymbols } from '../core/utils/nisHelpers';
import { DudiService } from '../services/DudiService';
import { GuruService } from '../services/GuruService';
import { JurusanService } from '../services/JurusanService';
import { KelasService } from '../services/KelasService';
import { SertifikatService } from '../services/SertifikatService';
import { RelationSyncService } from '../services/RelationSyncService';
import { SiswaPklService } from '../services/SiswaPklService';
import { SiswaService } from '../services/SiswaService';
import { ToastManager } from '../core/ToastManager';
import { generateJurusanCode, resolveJurusanDisplayName } from '../core/utils/autoIdHelpers';
import { normalizeRelationText } from '../core/utils/relationHelpers';
import { StatCards } from './StatCards';
import { Toolbar } from './Toolbar';
import { DynamicDataGrid } from './DynamicDataGrid';
import { DynamicFormModal } from './DynamicFormModal';
import { DynamicFilterModal } from './DynamicFilterModal';
import { BulkActionModal } from './BulkActionModal';
import {
  BatchWorkbookSheetPayload,
  ImportCommitOptions,
  ImportCommitResult,
  ImportExcelModal,
} from './ImportExcelModal';
import { ImageCropperModal } from './ImageCropperModal';
import { AppleConfirmModal } from './AppleConfirmModal';
import { MonitoringRecapModal } from './MonitoringRecapModal';
import { MonitoringStageControlModal } from './MonitoringStageControlModal';
import { BulkPlottingModal } from './module-page/BulkPlottingModal';
import { ModuleActionModal } from './module-page/ModuleActionModal';
import { PerizinanWaModal } from './module-page/PerizinanWaModal';
import {
  deduplicateImportRows,
  exportRowsToXlsx,
  partitionImportRowsForUpsert,
  resolveImportRowRelations,
} from './module-page/moduleImportExport';
import {
  applyModulePreSubmitTransforms,
  extractGradeSyncScores,
  ModuleConfirmConfig,
} from './module-page/moduleWorkflowRegistry';
import { useModuleWorkflows } from './module-page/useModuleWorkflows';

const KAKOMLI_JURUSAN_SCOPED_MODULES = new Set([
  'pengajuan',
  'perizinan',
  'siswa_pkl',
  'monitoring',
  'sertifikat',
  'siswa',
  'kelas',
  'jurusan',
]);

interface ModulePageProps<T extends { id: string }> {
  metadata: ModuleMetadata<T>;
  repository: BaseRepository<T>;
  userRole: UserRole;
  currentUser?: AdminSessionUser | null;
  onOpenDocsForStudent?: (
    studentData: any,
    selectedStudents?: any[],
    allStudents?: any[],
    sourceModuleId?: string
  ) => void;
  onOpenSimulator?: () => void;
  onOpenGas?: () => void;
  onOpenSheetConfig?: () => void;
  onOpenMonitoringBundle?: () => void;
}

export function ModulePage<T extends { id: string }>({
  metadata,
  repository,
  userRole,
  currentUser = null,
  onOpenDocsForStudent,
  onOpenSimulator,
  onOpenGas,
  onOpenSheetConfig,
  onOpenMonitoringBundle,
}: ModulePageProps<T>) {
  const isKakomliScopedModule =
    userRole === 'Kakomli' && KAKOMLI_JURUSAN_SCOPED_MODULES.has(metadata.id);

  const [scopeJurusanList, setScopeJurusanList] = useState<Jurusan[]>(() => {
    if (!isKakomliScopedModule) return [];
    const svc = JurusanService.getInstance();
    svc.tryHydrateSync();
    return svc.querySync({}, { column: null, direction: 'asc' }, 1, 1000, '').filteredData || [];
  });
  const [scopeGuruList, setScopeGuruList] = useState<Guru[]>(() => {
    if (!isKakomliScopedModule) return [];
    const svc = GuruService.getInstance();
    svc.tryHydrateSync();
    return svc.querySync({}, { column: null, direction: 'asc' }, 1, 1000, '').filteredData || [];
  });
  const [scopeSiswaList, setScopeSiswaList] = useState<Siswa[]>(() => {
    if (!isKakomliScopedModule) return [];
    const svc = SiswaService.getInstance();
    svc.tryHydrateSync();
    return svc.querySync({}, { column: null, direction: 'asc' }, 1, 5000, '').filteredData || [];
  });

  useEffect(() => {
    if (!isKakomliScopedModule) return;
    let active = true;
    const jurSvc = JurusanService.getInstance();
    const guruSvc = GuruService.getInstance();
    const siswaSvc = SiswaService.getInstance();

    const syncLocalFromRepos = () => {
      if (!active) return;
      jurSvc.tryHydrateSync();
      guruSvc.tryHydrateSync();
      siswaSvc.tryHydrateSync();
      setScopeJurusanList(
        jurSvc.querySync({}, { column: null, direction: 'asc' }, 1, 1000, '').filteredData || []
      );
      setScopeGuruList(
        guruSvc.querySync({}, { column: null, direction: 'asc' }, 1, 1000, '').filteredData || []
      );
      setScopeSiswaList(
        siswaSvc.querySync({}, { column: null, direction: 'asc' }, 1, 5000, '').filteredData || []
      );
    };

    Promise.all([
      jurSvc.getAll().catch(() => [] as Jurusan[]),
      guruSvc.getAll().catch(() => [] as Guru[]),
      siswaSvc.getAll().catch(() => [] as Siswa[]),
    ]).then(([jRows, gRows, sRows]) => {
      if (!active) return;
      setScopeJurusanList(jRows);
      setScopeGuruList(gRows);
      setScopeSiswaList(sRows);
    });

    const unsubJ = jurSvc.onDataUpdated(syncLocalFromRepos);
    const unsubG = guruSvc.onDataUpdated(syncLocalFromRepos);
    const unsubS = siswaSvc.onDataUpdated(syncLocalFromRepos);

    return () => {
      active = false;
      unsubJ();
      unsubG();
      unsubS();
    };
  }, [isKakomliScopedModule]);

  const matchedKakomliJurusans = useMemo(() => {
    if (!isKakomliScopedModule) return [];
    return resolveKakomliJurusans(currentUser, scopeJurusanList, scopeGuruList);
  }, [isKakomliScopedModule, currentUser, scopeJurusanList, scopeGuruList]);

  const siswaJurusanByNis = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of scopeSiswaList) {
      const jurVal = String(s.jurusan || s.idJurusan || '').trim();
      if (!jurVal) continue;
      const digits = stripNisSymbols(s.nis);
      if (digits && !map.has(digits)) map.set(digits, jurVal);
      const raw = String(s.nis || '').trim();
      if (raw && !map.has(raw)) map.set(raw, jurVal);
    }
    return map;
  }, [scopeSiswaList]);

  const kakomliRowPredicate = useMemo<((row: T) => boolean) | undefined>(() => {
    if (!isKakomliScopedModule || matchedKakomliJurusans.length === 0) return undefined;
    return (row: T) => {
      const item = row as Record<string, any>;
      if (metadata.id === 'jurusan') {
        return matchedKakomliJurusans.some(
          (jur) =>
            (jur.id && item.id === jur.id) ||
            matchJurusanItem(item.kode || item.nama || item.id, jur)
        );
      }
      const nisDigits = stripNisSymbols(item.nis);
      const nisRaw = String(item.nis || '').trim();
      const rawJurusan =
        item.jurusan ||
        item.idJurusan ||
        (nisDigits ? siswaJurusanByNis.get(nisDigits) : undefined) ||
        (nisRaw ? siswaJurusanByNis.get(nisRaw) : undefined);
      return matchAnyJurusanItem(rawJurusan, matchedKakomliJurusans);
    };
  }, [isKakomliScopedModule, matchedKakomliJurusans, metadata.id, siswaJurusanByNis]);

  const {
    data,
    filteredData,
    total,
    loading,
    revalidating,
    loadError,
    page,
    pageSize,
    setPage,
    setPageSize,
    sort,
    handleSort,
    filter,
    handleFilterChange,
    resetFilter,
    search,
    handleSearch,
    selectedIds,
    toggleSelectRow,
    toggleSelectAll,
    deleteRow,
    bulkDeleteRows,
    syncWithSpreadsheet,
    syncing,
    refresh,
  } = useDataGrid<T>(repository, { rowPredicate: kakomliRowPredicate });

  // Modal & View states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<T | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'card'>('card');

  const [confirmModal, setConfirmModal] = useState<ModuleConfirmConfig>({
    isOpen: false,
    title: '',
    description: '',
    variant: 'primary',
    confirmText: 'Konfirmasi',
    onConfirm: async () => {},
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [cropperState, setCropperState] = useState<{
    isOpen: boolean;
    currentImage: string;
    onDone: (url: string) => void;
  }>({
    isOpen: false,
    currentImage: '',
    onDone: () => {},
  });

  const [allExistingRows, setAllExistingRows] = useState<T[]>([]);
  const [isMonitoringRecapOpen, setIsMonitoringRecapOpen] = useState(false);
  const [isStageControlOpen, setIsStageControlOpen] = useState(false);
  const [isBulkPlottingOpen, setIsBulkPlottingOpen] = useState(false);

  const isSuperAdmin = userRole === 'SuperAdmin';
  const isReadOnlyModule = isModuleReadOnlyForRole(metadata.id, userRole);
  const supportsBulkPlotting =
    metadata.id === 'siswa_pkl' &&
    (userRole === 'SuperAdmin' || userRole === 'Hubin' || userRole === 'Pokja');

  const {
    guruList,
    dudiList,
    syncingRelations,
    actionModal,
    setActionModal,
    waModal,
    setWaModal,
    customRowActions,
    supportsRelationSync,
    supportsMonitoringRecap,
    handleSyncRelations,
    handleCustomAction,
    handleActionModalSubmit,
    handleBulkApprove,
  } = useModuleWorkflows<T>({
    moduleId: metadata.id,
    userRole,
    filteredData,
    selectedIds,
    refresh,
    setConfirmModal,
    onOpenDocsForStudent,
  });

  const hydrateExistingRowsInstant = () => {
    repository.tryHydrateSync();
    const syncRows =
      repository.querySync({}, { column: null, direction: 'asc' }, 1, 5000, '').filteredData || [];
    setAllExistingRows(syncRows.length > 0 ? syncRows : data);
    if (syncRows.length === 0) {
      void repository
        .getAll()
        .then((fullList) => {
          setAllExistingRows(fullList);
        })
        .catch(() => {});
    }
  };

  const handleOpenAddModal = () => {
    hydrateExistingRowsInstant();
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (row: T) => {
    hydrateExistingRowsInstant();
    setEditingRow(row);
  };

  const handleCreateSubmit = async (values: T) => {
    const { nextValues, shouldSyncSertifikatGrades } = applyModulePreSubmitTransforms(
      metadata.id,
      values
    );
    if (shouldSyncSertifikatGrades) {
      try {
        await SertifikatService.getInstance().syncGradesViaMonitoring(
          nextValues,
          extractGradeSyncScores(nextValues),
          { silentToast: true }
        );
      } catch (err: any) {
        ToastManager.getInstance().show(
          'Gagal Menyinkronkan Nilai ke Cloud Server',
          'error',
          err?.message || 'Terjadi kendala saat menyimpan komponen nilai.'
        );
        throw err;
      }
    }
    const created = await repository.create(nextValues);
    setPage(1);
    void RelationSyncService.getInstance()
      .syncAfterMutation(metadata.id, 'create', {
        mutatedId: created?.id,
        nextName: String((created as any)?.nama || (created as any)?.namaDudi || '').trim() || undefined,
      })
      .catch(() => {});
  };

  const handleEditSubmit = async (values: T) => {
    if (!editingRow) return;
    const prevRow = editingRow as any;
    const targetId = editingRow.id;
    const previousName = String(prevRow?.nama || prevRow?.namaDudi || '').trim();
    const { nextValues, shouldSyncSertifikatGrades } = applyModulePreSubmitTransforms(
      metadata.id,
      values,
      prevRow
    );

    if (shouldSyncSertifikatGrades) {
      try {
        await SertifikatService.getInstance().syncGradesViaMonitoring(
          { ...prevRow, ...nextValues },
          extractGradeSyncScores(nextValues),
          { silentToast: true }
        );
      } catch (err: any) {
        ToastManager.getInstance().show(
          'Gagal Menyinkronkan Nilai ke Cloud Server',
          'error',
          err?.message || 'Terjadi kendala saat memperbarui komponen nilai.'
        );
        throw err;
      }
    }
    const updated = await repository.update(targetId, nextValues);
    setEditingRow(null);
    const nextName = String(
      (updated as any)?.nama ||
        (updated as any)?.namaDudi ||
        (nextValues as any)?.nama ||
        (nextValues as any)?.namaDudi ||
        ''
    ).trim();
    void RelationSyncService.getInstance()
      .syncAfterMutation(metadata.id, 'update', {
        mutatedId: targetId,
        previousName: previousName || undefined,
        nextName: nextName || undefined,
      })
      .catch(() => {});
  };

  const handleDeleteRow = (row: T) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Baris dari Cloud Server?',
      description:
        'Apakah Anda yakin ingin menghapus data baris ini? Perubahan akan langsung disinkronkan ke Database Cloud Server.',
      variant: 'danger',
      confirmText: 'Ya, Hapus Data',
      onConfirm: async () => {
        await deleteRow(row.id);
        void RelationSyncService.getInstance()
          .syncAfterMutation(metadata.id, 'delete', { mutatedId: row.id })
          .catch(() => {});
      },
    });
  };

  const handleExportSelected = () => {
    const selectedRows = filteredData.filter((d) => selectedIds.includes(d.id));
    void exportRowsToXlsx({
      rows: selectedRows,
      fields: metadata.fields,
      moduleId: metadata.id,
      moduleTitle: metadata.title,
      tableName: metadata.tableName,
    });
  };

  const handleExportAllXlsx = () => {
    if (filteredData.length === 0) return;
    void exportRowsToXlsx({
      rows: filteredData,
      fields: metadata.fields,
      moduleId: metadata.id,
      moduleTitle: metadata.title,
      tableName: metadata.tableName,
    });
  };

  const executeSmartModuleImport = async (
    targetModuleId: string,
    targetTableName: string,
    targetRepo: BaseRepository<any>,
    rawRows: Array<Record<string, any>>,
    opts: ImportCommitOptions,
    onProgress?: (done: number, total: number) => void
  ): Promise<ImportCommitResult> => {
    const guruSvc = GuruService.getInstance();
    const jurSvc = JurusanService.getInstance();
    const dudiSvc = DudiService.getInstance();

    let [jurList, currentGuruList, currentDudiList, existingTargetRows, penempatanList] =
      await Promise.all([
        jurSvc.getAll().catch(() => []),
        guruSvc.getAll().catch(() => []),
        dudiSvc.getAll().catch(() => []),
        targetRepo.getAll().catch(() => []),
        targetModuleId === 'perizinan'
          ? SiswaPklService.getInstance().getAll().catch(() => [])
          : Promise.resolve([]),
      ]);

    let rel = resolveImportRowRelations({
      moduleId: targetModuleId,
      rows: rawRows,
      jurusanList: jurList,
      guruList: currentGuruList,
      dudiList: currentDudiList,
      penempatanList,
    });

    let createdGuru = 0;
    if (opts.autoCreateMissingGuru && rel.missingGuruNames.length > 0) {
      const newGuruPayloads = rel.missingGuruNames.map((nama) => ({
        nama,
        peranUtama: targetModuleId === 'jurusan' ? ('Kakomli' as const) : ('Guru Pendamping' as const),
      }));
      createdGuru = await guruSvc.importRows(newGuruPayloads);
      currentGuruList = await guruSvc.getAll().catch(() => currentGuruList);
      rel = resolveImportRowRelations({
        moduleId: targetModuleId,
        rows: rawRows,
        jurusanList: jurList,
        guruList: currentGuruList,
        dudiList: currentDudiList,
        penempatanList,
      });
    }

    const { rowsToCreate, patchesToUpdate, skipped } = partitionImportRowsForUpsert({
      moduleId: targetModuleId,
      tableName: targetTableName,
      newRows: rel.resolvedRows,
      existingAll: existingTargetRows,
      upsertExisting: opts.upsertExisting,
    });

    const totalWork = rowsToCreate.length + patchesToUpdate.length;
    let doneCount = 0;
    let created = 0;
    let updated = 0;

    if (rowsToCreate.length > 0) {
      created = await targetRepo.importRows(rowsToCreate, {
        onProgress: (done) => {
          doneCount = done;
          onProgress?.(doneCount, totalWork || rowsToCreate.length);
        },
      });
      doneCount = created;
    }

    if (patchesToUpdate.length > 0) {
      updated = await targetRepo.bulkUpdateMany(patchesToUpdate);
      doneCount += updated;
      onProgress?.(doneCount, totalWork || patchesToUpdate.length);
    }

    let createdKelas = 0;
    if (targetModuleId === 'siswa' && (created > 0 || updated > 0)) {
      try {
        const kelasSvc = KelasService.getInstance();
        const existingKelasList = await kelasSvc.getAll().catch(() => []);
        const existingKelasNames = new Set(
          existingKelasList.map((k) => normalizeRelationText(k.namaKelas)).filter(Boolean)
        );
        const missingKelasMap = new Map<
          string,
          { namaKelas: string; tingkat: string; idJurusan: string; jurusan: string; jumlahSiswa: number }
        >();

        for (const r of rel.resolvedRows) {
          const rawKelas = String(r.kelas || '').trim();
          if (!rawKelas || rawKelas === '-') continue;
          const normKelas = normalizeRelationText(rawKelas);
          if (!normKelas || existingKelasNames.has(normKelas) || missingKelasMap.has(normKelas)) {
            continue;
          }
          const tingkatMatch = rawKelas.match(/^(XII|XI|X)\b/i);
          const tingkat = tingkatMatch ? tingkatMatch[1].toUpperCase() : 'XI';
          const code =
            String(r.idJurusan || '').trim() ||
            generateJurusanCode(String(r.jurusan || rawKelas));
          const jurusanName =
            String(r.jurusan || '').trim() || resolveJurusanDisplayName(code || rawKelas);

          missingKelasMap.set(normKelas, {
            namaKelas: rawKelas,
            tingkat,
            idJurusan: code,
            jurusan: jurusanName,
            jumlahSiswa: 0,
          });
        }

        const missingPayloads = Array.from(missingKelasMap.values());
        if (missingPayloads.length > 0) {
          createdKelas = await kelasSvc.importRows(missingPayloads, { silentToast: true });
        }
      } catch {
        // Ignore auto-sync Master_Kelas_Walas non-fatal warning
      }
    }

    return { created, updated, skipped, createdGuru, createdKelas };
  };

  const activeFilterCount = Object.keys(filter).length;

  return (
    <div className="space-y-4">
      {/* Clean Editorial Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-slate-200">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight leading-snug">
              {metadata.title}
            </h1>
            {isReadOnlyModule && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600">
                Mode Baca-Saja
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {metadata.subtitle}
          </p>
        </div>
      </div>

      {/* Kakomli Multi-Jurusan Scope Banner */}
      {isKakomliScopedModule && matchedKakomliJurusans.length > 0 && (
        <div className="px-3.5 py-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200 flex flex-wrap items-center gap-2 text-xs text-indigo-950">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="font-semibold">
            Lingkup Jurusan Ampuan ({matchedKakomliJurusans.length}):
          </span>
          <span className="text-indigo-800">
            {matchedKakomliJurusans.map((j) => `${j.kode || '-'} (${j.nama})`).join(', ')}
          </span>
        </div>
      )}

      {/* Server Error Banner */}
      {loadError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-900">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Gagal Memuat Data {metadata.title}</div>
              <div className="text-rose-700 mt-0.5">{loadError}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => syncWithSpreadsheet(metadata.tableName)}
              disabled={syncing}
              className="h-9 px-3.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
            {isSuperAdmin && onOpenSheetConfig && (
              <button
                type="button"
                onClick={onOpenSheetConfig}
                className="h-9 px-3.5 rounded-lg bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 font-semibold cursor-pointer whitespace-nowrap"
              >
                Konfigurasi Server
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1. Top 4 Statistic Cards (full filtered dataset) */}
      <StatCards
        configs={metadata.statCards}
        data={filteredData}
        loading={loading && filteredData.length === 0}
      />

      {/* 2. Middle Toolbar */}
      <Toolbar
        search={search}
        onSearchChange={handleSearch}
        searchPlaceholder={(() => {
          const hints = metadata.fields
            .filter((f) => f.isSearchable !== false && f.key !== 'id')
            .slice(0, 3)
            .map((f) => f.label.toLowerCase());
          return hints.length > 0
            ? `Cari ${metadata.title} (${hints.join(', ')})...`
            : `Cari ${metadata.title}...`;
        })()}
        activeFilterCount={activeFilterCount}
        onOpenFilterModal={() => setIsFilterModalOpen(true)}
        selectedCount={selectedIds.length}
        onOpenBulkModal={() => setIsBulkModalOpen(true)}
        onSyncSpreadsheet={() => syncWithSpreadsheet(metadata.tableName)}
        syncing={syncing}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onExportAllXlsx={filteredData.length > 0 ? handleExportAllXlsx : undefined}
        onOpenAddModal={handleOpenAddModal}
        onOpenDocsModal={
          onOpenDocsForStudent
            ? () => {
                const selected = filteredData.filter((d) => selectedIds.includes(d.id));
                const active = selected.length > 0 ? selected[0] : filteredData[0] || null;
                onOpenDocsForStudent(active, selected, filteredData, metadata.id);
              }
            : undefined
        }
        onOpenSimulatorModal={isSuperAdmin ? onOpenSimulator : undefined}
        onOpenGasModal={isSuperAdmin ? onOpenGas : undefined}
        onSyncRelations={supportsRelationSync ? handleSyncRelations : undefined}
        onOpenMonitoringRecap={
          supportsMonitoringRecap ? () => setIsMonitoringRecapOpen(true) : undefined
        }
        onOpenMonitoringBundle={onOpenMonitoringBundle}
        onOpenStageControl={
          metadata.id === 'monitoring' && isSuperAdmin
            ? () => setIsStageControlOpen(true)
            : undefined
        }
        onOpenBulkPlotting={
          supportsBulkPlotting ? () => setIsBulkPlottingOpen(true) : undefined
        }
        syncingRelations={syncingRelations}
        canAdd={!isReadOnlyModule}
        readOnly={isReadOnlyModule}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* 3. Dynamic Data Grid */}
      <DynamicDataGrid
        fields={metadata.fields}
        data={data}
        total={total}
        loading={loading}
        revalidating={revalidating || syncing || syncingRelations}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sort={sort}
        onSort={handleSort}
        selectedIds={selectedIds}
        onToggleSelectRow={toggleSelectRow}
        onToggleSelectAll={toggleSelectAll}
        onEdit={handleOpenEditModal}
        onDelete={handleDeleteRow}
        onCustomAction={handleCustomAction}
        customRowActions={customRowActions}
        readOnly={isReadOnlyModule}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Confirmation Modal */}
      <AppleConfirmModal
        isOpen={confirmModal.isOpen}
        loading={confirmLoading}
        onClose={() => !confirmLoading && setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          if (confirmLoading) return;
          setConfirmLoading(true);
          try {
            await confirmModal.onConfirm();
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          } catch (err: any) {
            ToastManager.getInstance().show(
              'Gagal Menyimpan ke Cloud Server',
              'error',
              err?.message || 'Periksa koneksi Cloud Server dan coba beberapa saat lagi.'
            );
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          } finally {
            setConfirmLoading(false);
          }
        }}
        title={confirmModal.title}
        description={confirmModal.description}
        sheetName={isSuperAdmin ? metadata.tableName : ''}
        variant={confirmModal.variant}
        confirmText={confirmModal.confirmText}
      />

      {/* Create Modal */}
      <DynamicFormModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={`Tambah Data ${metadata.title}`}
        fields={metadata.fields}
        existingRows={allExistingRows.length > 0 ? allExistingRows : data}
        moduleId={metadata.id}
        tableName={metadata.tableName}
        onSubmit={handleCreateSubmit}
        onOpenImageCropper={(current, onDone) =>
          setCropperState({ isOpen: true, currentImage: current, onDone })
        }
      />

      {/* Edit Modal */}
      {editingRow && (
        <DynamicFormModal
          isOpen={true}
          onClose={() => setEditingRow(null)}
          title={`Edit Data ${metadata.title}`}
          fields={metadata.fields}
          initialData={editingRow}
          existingRows={allExistingRows.length > 0 ? allExistingRows : data}
          moduleId={metadata.id}
          tableName={metadata.tableName}
          onSubmit={handleEditSubmit}
          onOpenImageCropper={(current, onDone) =>
            setCropperState({ isOpen: true, currentImage: current, onDone })
          }
        />
      )}

      {/* Filter Modal */}
      <DynamicFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        fields={metadata.fields}
        currentFilter={filter}
        onApplyFilter={handleFilterChange}
        onResetFilter={resetFilter}
      />

      {/* Bulk Action Modal */}
      <BulkActionModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        selectedCount={selectedIds.length}
        onBulkDelete={
          isReadOnlyModule
            ? undefined
            : async () => {
                setConfirmModal({
                  isOpen: true,
                  title: `Hapus ${selectedIds.length} Baris Data Terpilih?`,
                  description:
                    'Tindakan ini akan menghapus data terpilih secara permanen dari Database Cloud Server.',
                  variant: 'danger',
                  confirmText: 'Ya, Hapus Terpilih',
                  onConfirm: async () => {
                    await bulkDeleteRows();
                  },
                });
              }
        }
        onBulkApprove={handleBulkApprove}
        onBulkPrint={
          onOpenDocsForStudent && selectedIds.length > 0
            ? () => {
                const selected = filteredData.filter((d) => selectedIds.includes(d.id));
                onOpenDocsForStudent(selected[0], selected, filteredData, metadata.id);
              }
            : undefined
        }
        onExportSelected={handleExportSelected}
        moduleTitle={metadata.title}
      />

      {/* Import Excel Modal */}
      <ImportExcelModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        fields={metadata.fields}
        moduleId={metadata.id}
        tableName={metadata.tableName}
        moduleTitle={metadata.title}
        onImport={async (newRows, onProgress) => {
          const existingAll = await repository.getAll().catch(() => data);
          const { rowsToImport } = deduplicateImportRows({
            moduleId: metadata.id,
            newRows,
            existingAll,
          });
          if (rowsToImport.length === 0) return 0;
          const count = await repository.importRows(rowsToImport, { onProgress });
          setPage(1);
          void RelationSyncService.getInstance()
            .syncAfterMutation(metadata.id, 'import')
            .catch(() => {});
          return count;
        }}
        onImportWithOptions={async (newRows, options, onProgress) => {
          const res = await executeSmartModuleImport(
            metadata.id,
            metadata.tableName,
            repository,
            newRows,
            options,
            onProgress
          );
          if (res.created > 0 || res.updated > 0) {
            setPage(1);
            const parts: string[] = [];
            if (res.created > 0) parts.push(`${res.created} baru`);
            if (res.updated > 0) parts.push(`${res.updated} diperbarui`);
            if (res.createdGuru && res.createdGuru > 0) {
              parts.push(`${res.createdGuru} guru baru didaftarkan`);
            }
            if (res.createdKelas && res.createdKelas > 0) {
              parts.push(`${res.createdKelas} kelas baru disinkronkan ke Master Kelas`);
            }
            if (res.skipped > 0) parts.push(`${res.skipped} dilewati`);
            ToastManager.getInstance().show(
              `Import ${metadata.title} Berhasil`,
              'success',
              parts.join(' · ')
            );
            void RelationSyncService.getInstance()
              .syncAfterMutation(metadata.id, 'import')
              .catch(() => {});
            refresh();
          }
          return res;
        }}
        onBatchImportWorkbook={async (
          sheets: BatchWorkbookSheetPayload[],
          options: ImportCommitOptions,
          onProgress
        ) => {
          let totalCreated = 0;
          let totalUpdated = 0;
          let totalSkipped = 0;
          let createdGuru = 0;
          const processedSheets: string[] = [];
          const totalRowsAll = sheets.reduce((sum, s) => sum + s.rows.length, 0);
          let processedSoFar = 0;

          for (const sheetPayload of sheets) {
            const targetRepo = getRepositoryForModule(sheetPayload.moduleId);
            const modTableName = getModuleEntry(sheetPayload.moduleId).metadata.tableName;
            const res = await executeSmartModuleImport(
              sheetPayload.moduleId,
              modTableName,
              targetRepo,
              sheetPayload.rows,
              options,
              (done) => {
                onProgress?.(
                  `Mengimpor ${sheetPayload.sheetName}`,
                  Math.min(processedSoFar + done, totalRowsAll),
                  totalRowsAll
                );
              }
            );
            processedSoFar += sheetPayload.rows.length;
            totalCreated += res.created;
            totalUpdated += res.updated;
            totalSkipped += res.skipped;
            createdGuru += res.createdGuru || 0;
            processedSheets.push(`${sheetPayload.sheetName} (${res.created + res.updated})`);
          }

          if (totalCreated > 0 || totalUpdated > 0) {
            setPage(1);
            ToastManager.getInstance().show(
              `Batch Workbook (${sheets.length} Sheet) Selesai`,
              'success',
              `${totalCreated} baris baru, ${totalUpdated} diperbarui${
                createdGuru > 0 ? `, ${createdGuru} guru baru` : ''
              }${totalSkipped > 0 ? `, ${totalSkipped} dilewati` : ''}.`
            );
            void RelationSyncService.getInstance()
              .syncAfterMutation('all', 'import')
              .catch(() => {});
            refresh();
          }

          return {
            totalCreated,
            totalUpdated,
            totalSkipped,
            createdGuru,
            processedSheets,
          };
        }}
      />

      {/* Image Cropper Modal */}
      <ImageCropperModal
        isOpen={cropperState.isOpen}
        onClose={() => setCropperState((prev) => ({ ...prev, isOpen: false }))}
        currentImage={cropperState.currentImage}
        onSave={(dataUrl) => cropperState.onDone(dataUrl)}
      />

      <ModuleActionModal
        state={actionModal}
        setState={setActionModal}
        dudiList={dudiList}
        guruList={guruList}
        onSubmit={handleActionModalSubmit}
      />

      <PerizinanWaModal state={waModal} setState={setWaModal} onRefresh={refresh} />

      {isMonitoringRecapOpen && (
        <MonitoringRecapModal
          isOpen={isMonitoringRecapOpen}
          onClose={() => setIsMonitoringRecapOpen(false)}
        />
      )}

      {isSuperAdmin && isStageControlOpen && (
        <MonitoringStageControlModal
          isOpen={isStageControlOpen}
          onClose={() => setIsStageControlOpen(false)}
        />
      )}

      {supportsBulkPlotting && (
        <BulkPlottingModal
          isOpen={isBulkPlottingOpen}
          onClose={() => setIsBulkPlottingOpen(false)}
          onSuccess={async () => {
            setPage(1);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
