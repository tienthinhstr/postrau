import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    let message = 'Đã xảy ra lỗi không mong muốn.';
    if (error instanceof Error) {
      try {
        const parsed = JSON.parse(error.message);
        if (parsed && typeof parsed.error === 'string') {
          message = `Lỗi kết nối dữ liệu (${parsed.operationType || 'read'}): ${parsed.error}`;
        } else {
          message = error.message;
        }
      } catch {
        message = error.message;
      }
    }
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4 text-slate-900">
          <div className="max-w-md w-full bg-white border-2 border-rose-300 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-extrabold text-slate-900">
                  Ứng dụng gặp sự cố kết nối
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed break-words">
                  {this.state.errorMessage}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] px-4 py-2.5 text-sm font-extrabold text-white bg-[#1e3a8a] hover:bg-[#172554] rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tải lại ứng dụng</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
