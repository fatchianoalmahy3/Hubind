import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  LogIn,
  KeyRound,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import {
  LocalAccountAuthService,
  AdminSessionUser,
  DEFAULT_ADMIN_ACCOUNTS,
} from '../core/auth/LocalAccountAuthService';
import { ToastManager } from '../core/ToastManager';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: AdminSessionUser) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErrorMsg('');

    const toastId = ToastManager.getInstance().show(
      'Memverifikasi Akun...',
      'pending',
      `Mencocokkan username "${username.trim().toLowerCase()}"`
    );

    try {
      const session = await LocalAccountAuthService.loginWithUsernamePassword(
        username,
        password
      );
      setPassword('');
      ToastManager.getInstance().update(
        toastId,
        `Selamat Datang, ${session.user.name}`,
        'success',
        `Login berhasil sebagai ${session.user.title} (${session.user.username})`
      );
      onLoginSuccess(session.user);
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Username atau Password tidak sesuai.';
      setErrorMsg(msg);
      ToastManager.getInstance().update(toastId, 'Login Gagal', 'error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-md max-h-[92vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Masuk Portal Pengelola
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                SMK PGRI 2 Ponorogo · Autentikasi Cloud Server
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            aria-label="Tutup modal login"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="admin-login-username"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="admin-login-username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Masukkan username (contoh: hubin)"
                className="w-full h-11 pl-10 pr-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="admin-login-password"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="admin-login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Masukkan password"
                className="w-full h-11 pl-10 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="w-full h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'Memverifikasi Akun...' : 'Masuk ke Dashboard'}</span>
          </button>

          {/* Collapsible Default Accounts Helper */}
          <details className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
            <summary className="flex items-center justify-between font-semibold text-slate-700 cursor-pointer select-none list-none">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Lihat Akun Default (6 Role)</span>
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>

            <div className="mt-3 space-y-1.5 pt-2.5 border-t border-slate-200/80">
              <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
                Klik salah satu peran untuk mengisi otomatis. Seluruh username &amp; password dapat diubah di menu <b>Kelola Akun &amp; Password</b> setelah login.
              </p>
              {DEFAULT_ADMIN_ACCOUNTS.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setUsername(acc.username);
                    setPassword(acc.defaultPassword);
                    setErrorMsg('');
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 flex items-center justify-between text-left transition-colors cursor-pointer"
                >
                  <div>
                    <span className="font-bold text-slate-900">{acc.role}</span>
                    <span className="text-slate-400 mx-1.5">&middot;</span>
                    <span className="font-mono text-blue-700 font-semibold">{acc.username}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    {acc.defaultPassword}
                  </span>
                </button>
              ))}
            </div>
          </details>
        </form>

        {/* Modal Footer Info */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-500">
            Siswa dan Guru Monitoring tidak perlu login di sini — gunakan Portal Siswa atau Portal Monitoring Guru pada halaman utama.
          </p>
        </div>
      </div>
    </div>
  );
};
