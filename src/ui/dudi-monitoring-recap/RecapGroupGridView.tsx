import React, { useEffect } from 'react';
import {
  Building2,
  CheckCheck,
  ChevronRight,
  Clock,
  GraduationCap,
  MapPin,
  UserCheck,
  Users,
} from 'lucide-react';
import { usePagination } from '../../hooks/usePagination';
import { PaginationBar } from '../PaginationBar';
import type { RecapGroup, RecapViewMode } from './types';

interface OverviewMetrics {
  totalGroups: number;
  totalStudents: number;
  plottedStudents: number;
  pendingKakomli: number;
  pendingHubin: number;
  verifiedHubin: number;
}

interface RecapGroupGridViewProps {
  viewMode: RecapViewMode;
  filteredGroups: RecapGroup[];
  overviewMetrics: OverviewMetrics;
  isKakomliRole: boolean;
  isStrictHubinWaitingKakomli: boolean;
  isSuperAdmin: boolean;
  filterResetKey: string;
  onSelectGroup: (group: RecapGroup) => void;
}

export const RecapGroupGridView: React.FC<RecapGroupGridViewProps> = ({
  viewMode,
  filteredGroups,
  overviewMetrics,
  isKakomliRole,
  isStrictHubinWaitingKakomli,
  isSuperAdmin,
  filterResetKey,
  onSelectGroup,
}) => {
  const {
    paginatedItems: paginatedGroups,
    page,
    pageSize,
    total,
    pageSizeOptions,
    setPage,
    setPageSize,
    resetPage,
  } = usePagination(filteredGroups, { defaultPageSize: 10 });

  useEffect(() => {
    resetPage();
  }, [filterResetKey, resetPage]);

  return (
    <div className="space-y-4">
      {/* 4 Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
            <span className="leading-snug font-medium">
              {viewMode === 'DUDI' ? 'DUDI Aktif' : 'Rombel Kelas XI'}
            </span>
            {viewMode === 'DUDI' ? (
              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
            ) : (
              <GraduationCap className="w-4 h-4 text-blue-600 shrink-0" />
            )}
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums leading-none">
            {overviewMetrics.totalGroups}
          </div>
          <div className="text-[11px] text-slate-500 leading-snug">
            {viewMode === 'DUDI' ? 'Lokasi penempatan aktif' : 'Rombongan belajar terdaftar'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
            <span className="leading-snug font-medium">
              {viewMode === 'DUDI' ? 'Siswa Dimonitoring' : 'Siswa Terdaftar'}
            </span>
            <Users className="w-4 h-4 text-indigo-600 shrink-0" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums leading-none">
            {overviewMetrics.totalStudents}
          </div>
          <div className="text-[11px] text-slate-500 leading-snug">
            {viewMode === 'DUDI'
              ? 'Siswa aktif PKL'
              : `${overviewMetrics.plottedStudents} terplot · ${overviewMetrics.totalStudents - overviewMetrics.plottedStudents} belum plot`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
            <span className="leading-snug font-medium">Menunggu Kakomli</span>
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          </div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums leading-none">
            {overviewMetrics.pendingKakomli}
          </div>
          <div className="text-[11px] text-slate-500 leading-snug">
            Tahap terlaksana belum diverifikasi
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5">
          <div className="flex items-start justify-between gap-2 text-xs text-slate-500">
            <span className="leading-snug font-medium">Terverifikasi Kakomli &amp; Hubin</span>
            <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 tabular-nums leading-none">
            {overviewMetrics.verifiedHubin}
          </div>
          <div className="text-[11px] text-slate-500 leading-snug">
            {overviewMetrics.pendingHubin} menunggu validasi Hubin/Waka
          </div>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          {viewMode === 'DUDI' ? (
            <Building2 className="w-9 h-9 text-slate-300 mx-auto" />
          ) : (
            <GraduationCap className="w-9 h-9 text-slate-300 mx-auto" />
          )}
          <div className="text-sm font-bold text-slate-800">
            Belum ada data {viewMode === 'DUDI' ? 'DUDI' : 'Kelas'} yang sesuai
          </div>
          <p className="text-xs text-slate-500">
            Sesuaikan pencarian, pilihan kompetensi keahlian, atau filter status di atas.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {paginatedGroups.map((group) => {
              const needsAttention = isKakomliRole
                ? group.pendingKakomliCount > 0
                : isStrictHubinWaitingKakomli
                ? group.pendingHubinCount > 0
                : isSuperAdmin
                ? group.pendingKakomliCount > 0 || group.pendingHubinCount > 0
                : false;

              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => onSelectGroup(group)}
                  className={`text-left p-4 rounded-xl border bg-white hover:border-blue-400 hover:shadow-sm transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                    needsAttention ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 leading-snug">
                          {group.title}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-start gap-1 leading-snug">
                          {viewMode === 'DUDI' ? (
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          ) : (
                            <UserCheck className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <span>{group.subtitle}</span>
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-bold text-slate-800 tabular-nums shrink-0">
                        {group.students.length} Siswa
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 flex items-center justify-between gap-2">
                      <span className="leading-snug truncate">{group.secondaryLabel}</span>
                      {viewMode === 'KELAS' && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums shrink-0 ${
                            group.unplottedCount > 0
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          Plot {group.plottedCount}/{group.students.length}
                        </span>
                      )}
                    </div>

                    {group.jurusanList.length > 0 && (
                      <div className="text-[11px] text-slate-500 leading-snug">
                        Jurusan: {group.jurusanList.join(' · ')}
                      </div>
                    )}
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
                      <span className="font-semibold text-blue-700">
                        Menunggu Kakomli: {group.pendingKakomliCount}
                      </span>
                      <span className="font-semibold text-indigo-700">
                        Menunggu Hubin: {group.pendingHubinCount}
                      </span>
                      <span className="font-semibold text-emerald-700">
                        Terverifikasi: {group.verifiedHubinCount}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold text-blue-700">
                      <span>Buka Tabel Siswa &amp; Verifikasi</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={pageSizeOptions}
              itemLabel={viewMode === 'DUDI' ? 'DUDI' : 'kelas'}
            />
          </div>
        </div>
      )}
    </div>
  );
};
