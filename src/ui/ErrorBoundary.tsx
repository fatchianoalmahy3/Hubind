import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  friendlyMessage: string;
}

function formatFriendlyErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'Terjadi gangguan sementara pada tampilan aplikasi. Silakan muat ulang halaman.';
  }

  if (
    trimmed.includes('Internal error encountered') ||
    trimmed.includes('"status": "INTERNAL"') ||
    trimmed.includes('"INTERNAL"')
  ) {
    return 'Layanan Cloud Server sedang mengalami gangguan sementara. Silakan muat ulang halaman dalam beberapa saat.';
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string') {
      if (
        parsed.error.includes('Missing or insufficient permissions') ||
        parsed.error.includes('permission-denied')
      ) {
        return 'Akses konfigurasi database memerlukan autentikasi admin yang valid.';
      }
      if (parsed.error.includes('Internal error encountered')) {
        return 'Layanan database cloud sedang mengalami gangguan sementara. Silakan muat ulang halaman.';
      }
      return parsed.error;
    }
  } catch {
    // not JSON, fall through
  }

  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    friendlyMessage: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      friendlyMessage: formatFriendlyErrorMessage(error),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[App ErrorBoundary]', error, errorInfo);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800 antialiased">
          <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-lg p-6 sm:p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-base sm:text-lg font-bold text-slate-900">
                Terjadi Kendala Sementara
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {this.state.friendlyMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Muat Ulang Halaman</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
