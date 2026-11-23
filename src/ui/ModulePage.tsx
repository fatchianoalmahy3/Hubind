import React, { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ModuleMetadata } from '../core/types/metadata';
import { BaseRepository } from '../core/BaseRepository';
import { useDataGrid } from '../hooks/useDataGrid';
import { UserRole } from '../core/types/schema';
import { isModuleReadOnlyForRole } from '../core/moduleRegistry';
import { SertifikatService } from '../services/SertifikatService';
import { RelationSyncService } from '../services/RelationSyncService';
import { ToastManager } from '../core/ToastManager';
import { StatCards } from './StatCards';
import { Toolbar } from './Toolbar';
import { DynamicDataGrid } from './DynamicDataGrid';
import { DynamicFormModal } from './DynamicFormModal';
import { DynamicFilterModal } from './DynamicFilterModal';
import { BulkActionModal } from './BulkActionModal';
import { ImportExcelModal } from './ImportExcelModal';
import { ImageCropperModal } from './ImageCropperModal';
import { AppleConfirmModal } from './AppleConfirmModal';
import { MonitoringRecapModal } from './MonitoringRecapModal';
import { MonitoringStageControlModal } from './MonitoringStageControlModal';
import { ModuleActionModal } from './module-page/ModuleActionModal';
import { PerizinanWaModal } from './module-page/PerizinanWaModal';
import {
  deduplicateImportRows,
  exportSelectedRowsToCsv,
} from './module-page/moduleImportExport';
import {
  applyModulePreSubmitTransforms,
  extractGradeSyncScores,
  ModuleConfirmConfig,
} from './module-page/moduleWorkflowRegistry';
import { useModuleWorkflows } from './module-page/useModuleWorkflows';

interface ModulePageProps<T extends { id: string }> {
  metadata: ModuleMetadata<T>;
  repository: BaseRepository<T>;
  userRole: UserRole;
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
  onOpenDocsForStudent,
  onOpenSimulator,
  onOpenGas,
  onOpenSheetConfig,
  onOpenMonitoringBundle,
}: ModulePageProps<T>) {
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
  } = useDataGrid<T>(repository);

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

  const isSuperAdmin = userRole === 'SuperAdmin';
  const isReadOnlyModule = isModuleReadOnlyForRole(metadata.id, userRole);

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

  const handleOpenAddModal = async () => {
    try {
      const fullList = await repository.getAll();
      setAllExistingRows(fullList);
    } catch {
      setAllExistingRows(data);
    }
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = async (row: T) => {
    try {
      const fullList = await repository.getAll();
      setAllExistingRows(fullList);
    } catch {
      setAllExistingRows(data);
    }
    setEditingRow(row);
  };

  const handleCreateSubmit = (values: T) => {
    const { nextValues, shouldSyncSertifikatGrades } = applyModulePreSubmitTransforms(
      metadata.id,
      values
    );
    setConfirmModal({
      isOpen: true,
      title: 'Simpan Data Baru ke Cloud Server?',
      description: 'Data baru akan divalidasi dan tersimpan secara permanen di Database Cloud Server.',
      variant: 'primary',
      confirmText: 'Simpan ke Server',
      onConfirm: async () => {
        if (shouldSyncSertifikatGrades) {
          await SertifikatService.getInstance().syncGradesViaMonitoring(
            nextValues,
            extractGradeSyncScores(nextValues),
            { silentToast: true }
          );
        }
        await repository.create(nextValues);
        setPage(1);
        await RelationSyncService.getInstance()
          .syncAfterMutation(metadata.id, 'create')
          .catch(() => {});
        await refresh();
      },
    });
  };

  const handleEditSubmit = (values: T) => {
    if (!editingRow) return;
    const prevRow = editingRow as any;
    const { nextValues, shouldSyncSertifikatGrades } = applyModulePreSubmitTransforms(
      metadata.id,
      values,
      prevRow
    );

    setConfirmModal({
      isOpen: true,
      title: 'Perbarui Data di Cloud Server?',
      description: `Perubahan data baris ID ${editingRow.id} akan disinkronkan ke Database Cloud Server.`,
      variant: 'primary',
      confirmText: 'Perbarui di Server',
      onConfirm: async () => {
        if (shouldSyncSertifikatGrades) {
          await SertifikatService.getInstance().syncGradesViaMonitoring(
            { ...prevRow, ...nextValues },
            extractGradeSyncScores(nextValues),
            { silentToast: true }
          );
        }
        await repository.update(editingRow.id, nextValues);
        await RelationSyncService.getInstance()
          .syncAfterMutation(metadata.id, 'update')
          .catch(() => {});
        setEditingRow(null);
        await refresh();
      },
    });
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
        await RelationSyncService.getInstance()
          .syncAfterMutation(metadata.id, 'delete')
          .catch(() => {});
      },
    });
  };

  const handleExportSelected = () => {
    const selectedRows = filteredData.filter((d) => selectedIds.includes(d.id));
    exportSelectedRowsToCsv({
      selectedRows,
      fields: metadata.fields,
      moduleId: metadata.id,
      moduleTitle: metadata.title,
    });
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
                Mode Pantau
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {metadata.subtitle}
          </p>
        </div>
      </div>

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
        activeFilterCount={activeFilterCount}
        onOpenFilterModal={() => setIsFilterModalOpen(true)}
        selectedCount={selectedIds.length}
        onOpenBulkModal={() => setIsBulkModalOpen(true)}
        onSyncSpreadsheet={() => syncWithSpreadsheet(metadata.tableName)}
        syncing={syncing}
        onOpenImportModal={() => setIsImportModalOpen(true)}
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
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
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
        moduleTitle={metadata.title}
        onImport={async (newRows) => {
          const existingAll = await repository.getAll().catch(() => data);
          const { rowsToImport } = deduplicateImportRows({
            moduleId: metadata.id,
            newRows,
            existingAll,
          });
          if (rowsToImport.length === 0) return 0;
          const count = await repository.importRows(rowsToImport);
          setPage(1);
          await RelationSyncService.getInstance()
            .syncAfterMutation(metadata.id, 'import')
            .catch(() => {});
          await refresh();
          return count;
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
    </div>
  );
}
