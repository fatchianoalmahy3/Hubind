import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  KeyRound,
  UserPlus,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Save,
} from 'lucide-react';
import {
  LocalAccountAuthService,
  AdminAccountRecord,
  AdminSessionUser,
  ROLE_TITLE_MAP,
  getStoredAdminSession,
} from '../core/auth/LocalAccountAuthService';
import { ToastManager } from '../core/ToastManager';

interface AccountManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AdminSessionUser | null;
  onCurrentUserUpdated?: (updatedUser: AdminSessionUser) => void;
}

const ROLE_OPTIONS: AdminAccountRecord['role'][] = [
  'Hubin',
  'Kepsek',
  'Waka',
  'Pokja',
  'Kakomli',
];

export const AccountManagementModal: React.FC<AccountManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onCurrentUserUpdated,
}) => {
  const isHubin = currentUser?.role === 'Hubin';
  const [accounts, setAccounts] = useState<AdminAccountRecord[]>([]);
  const [syncedToSheet, setSyncedToSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form state for editing / creating
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<AdminAccountRecord['role']>('Pokja');
  const [namaLengkap, setNamaLengkap] = useState('');
  const [jabatan, setJabatan] = useState('');
  const [status, setStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    if (!isOpen || !currentUser) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await LocalAccountAuthService.fetchAccounts();
      setAccounts(res.accounts);
      setSyncedToSheet(res.syncedToSheet);

      if (!isHubin) {
        const self =
          res.accounts.find(
            (a) => a.id === currentUser.id || a.username === currentUser.username
          ) || {
            id: currentUser.id,
            username: currentUser.username,
            passwordHash: '',
            role: (currentUser.role as AdminAccountRecord['role']) || 'Pokja',
            namaLengkap: currentUser.name,
            jabatan: currentUser.title,
            status: 'Aktif' as const,
            updatedAt: '',
          };
        setEditingId(self.id);
        setUsername(self.username);
        setNewPassword('');
        setRole(self.role);
        setNamaLengkap(self.namaLengkap);
        setJabatan(self.jabatan);
        setStatus(self.status);
        setFormOpen(true);
      } else {
        setFormOpen(false);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memuat daftar akun dari Google Spreadsheet.');
    } finally {
      setLoading(false);
    }
  }, [isOpen, currentUser, isHubin]);

  useEffect(() => {
    if (isOpen) {
      setConfirmDeleteId(null);
      loadAccounts();
    }
  }, [isOpen, loadAccounts]);

  if (!isOpen || !currentUser) return null;

  const openCreateForm = () => {
    setEditingId(undefined);
    setUsername('');
    setNewPassword('');
    setShowPassword(false);
    setRole('Pokja');
    setNamaLengkap('');
    setJabatan(ROLE_TITLE_MAP.Pokja);
    setStatus('Aktif');
    setErrorMsg('');
    setFormOpen(true);
  };

  const openEditForm = (acc: AdminAccountRecord) => {
    setEditingId(acc.id);
    setUsername(acc.username);
    setNewPassword('');
    setShowPassword(false);
    setRole(acc.role);
    setNamaLengkap(acc.namaLengkap);
    setJabatan(acc.jabatan || ROLE_TITLE_MAP[acc.role]);
    setStatus(acc.status);
    setErrorMsg('');
    setFormOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrorMsg('');

    try {
      const res = await LocalAccountAuthService.saveAccount({
        id: editingId,
        username,
        newPassword: newPassword.trim() || undefined,
        role,
        namaLengkap,
        jabatan,
        status,
      });

      setAccounts(res.accounts);
      setSyncedToSheet(res.syncedToSheet);
      if (isHubin) {
        setFormOpen(false);
      } else {
        setNewPassword('');
      }

      const refreshedSession = getStoredAdminSession();
      if (refreshedSession?.user && onCurrentUserUpdated) {
        onCurrentUserUpdated(refreshedSession.user);
      }

      ToastManager.getInstance().show(
        editingId ? 'Akun Berhasil Diperbarui' : 'Akun Baru Ditambahkan',
        'success',
        `Perubahan untuk username "${username.trim().toLowerCase()}" tersimpan di sheet Master_Akun.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan perubahan akun.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setErrorMsg('');
    try {
      const updated = await LocalAccountAuthService.deleteAccount(id);
      setAccounts(updated);
      setConfirmDeleteId(null);
      if (editingId === id) {
        setFormOpen(false);
      }
      ToastManager.getInstance().show(
        'Akun Dihapus',
        'info',
        'Daftar akun di Google Spreadsheet telah diperbarui.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menghapus akun.');
    } finally {
      setSaving(false);
    }
  };

  const handleBootstrap = async () => {
    if (bootstrapping) return;
    setBootstrapping(true);
    setErrorMsg('');
    try {
      const saved = await LocalAccountAuthService.bootstrapDefaultAccountsToSheet();
      setAccounts(saved);
      setSyncedToSheet(true);
      ToastManager.getInstance().show(
        '5 Akun Default Tersimpan ke Sheet',
        'success',
        'Tab Master_Akun di Google Spreadsheet sekarang menyimpan akun pengelola.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan akun default ke Spreadsheet.');
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                {isHubin ? 'Kelola Akun & Password Pengelola' : 'Ubah Username & Password Saya'}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Tersimpan di Google Spreadsheet (tab <span className="font-mono font-semibold">Master_Akun</span>) dengan enkripsi SHA-256
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Tutup modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Sync status banner */}
          <div
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              syncedToSheet
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {syncedToSheet ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">
                  {syncedToSheet
                    ? 'Tersinkron ke Google Spreadsheet (Master_Akun)'
                    : 'Menggunakan 5 Akun Default Bawaan'}
                </div>
                <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                  {syncedToSheet
                    ? 'Setiap perubahan username atau password langsung berlaku di semua perangkat saat login berikutnya.'
                    : 'Tab Master_Akun belum berisi data di Spreadsheet. Klik tombol di samping atau simpan perubahan akun apa saja untuk menyinkronkannya.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!syncedToSheet && isHubin && (
                <button
                  type="button"
                  onClick={handleBootstrap}
                  disabled={bootstrapping}
                  className="h-8 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{bootstrapping ? 'Menyimpan...' : 'Simpan 5 Akun Default ke Sheet'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={loadAccounts}
                disabled={loading}
                className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Muat Ulang</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Hubin Accounts Table */}
          {isHubin && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Daftar Akun Pengelola ({accounts.length})
                </h3>
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Tambah Akun</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 px-3.5">Username</th>
                        <th className="py-2.5 px-3.5">Nama &amp; Jabatan</th>
                        <th className="py-2.5 px-3.5">Peran</th>
                        <th className="py-2.5 px-3.5">Status</th>
                        <th className="py-2.5 px-3.5 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading && accounts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400">
                            Memuat daftar akun...
                          </td>
                        </tr>
                      ) : (
                        accounts.map((acc) => (
                          <tr key={acc.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                              {acc.username}
                              {acc.id === currentUser.id && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-sans text-[10px]">
                                  Anda
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <div className="font-semibold text-slate-800">{acc.namaLengkap}</div>
                              <div className="text-[11px] text-slate-500">{acc.jabatan}</div>
                            </td>
                            <td className="py-2.5 px-3.5">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold">
                                {acc.role}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5">
                              <span
                                className={`px-2 py-0.5 rounded-md font-semibold ${
                                  acc.status === 'Aktif'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {acc.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              {confirmDeleteId === acc.id ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={saving}
                                    onClick={() => handleDelete(acc.id)}
                                    className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                                  >
                                    Ya, Hapus
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEditForm(acc)}
                                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                                    title="Edit username / password / peran"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Edit</span>
                                  </button>
                                  {acc.id !== currentUser.id && (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(acc.id)}
                                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-rose-600 cursor-pointer"
                                      title="Hapus akun"
                                      aria-label={`Hapus akun ${acc.username}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Create / Edit Form */}
          {formOpen && (
            <form
              onSubmit={handleSubmitForm}
              className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  {!isHubin
                    ? 'Perbarui Kredensial Akun Anda'
                    : editingId
                    ? `Edit Akun: ${username}`
                    : 'Tambah Akun Pengelola Baru'}
                </h4>
                {isHubin && (
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                  >
                    Tutup Form
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Username <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="contoh: hubin_pgri2"
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    3–32 karakter (huruf kecil, angka, titik, underscore, strip).
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {editingId ? 'Password Baru (Kosongkan jika tetap)' : 'Password *'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={!editingId}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={editingId ? 'Minimal 6 karakter bila diubah' : 'Minimal 6 karakter'}
                      className="w-full h-9 pl-3 pr-9 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Lengkap <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={namaLengkap}
                    onChange={(e) => setNamaLengkap(e.target.value)}
                    placeholder="Nama Pejabat / Pengelola"
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jabatan Tampilan
                  </label>
                  <input
                    type="text"
                    value={jabatan}
                    onChange={(e) => setJabatan(e.target.value)}
                    placeholder="Contoh: Koordinator Pokja Hubin"
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>

                {isHubin && (
                  <>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Peran (Role RBAC)
                      </label>
                      <select
                        value={role}
                        onChange={(e) => {
                          const nextRole = e.target.value as AdminAccountRecord['role'];
                          setRole(nextRole);
                          if (!jabatan || Object.values(ROLE_TITLE_MAP).includes(jabatan)) {
                            setJabatan(ROLE_TITLE_MAP[nextRole]);
                          }
                        }}
                        className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Status Akun
                      </label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                        className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      >
                        <option value="Aktif">Aktif</option>
                        <option value="Nonaktif">Nonaktif</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                {isHubin && (
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="h-9 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan Akun'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Role Aktif: <strong className="text-slate-800">{currentUser.role}</strong> ({currentUser.username})</span>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
