import React, { useState } from 'react';
import { Download, Smartphone, X, Share2, MoreVertical } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        data-testid="pwa-install-btn"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Cài Đặt App</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1e40af] flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="pwa-guide-title"
                    className="text-base font-extrabold text-slate-900"
                  >
                    Cài Đặt Ứng Dụng Vựa Rau POS
                  </h3>
                  <p className="text-xs text-slate-500">
                    Đưa ứng dụng ra màn hình chính điện thoại để mở toàn màn hình
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="bg-stone-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs sm:text-sm text-slate-700">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Share2 className="w-4 h-4 text-[#1e40af]" />
                  Hướng dẫn trên iPhone / iPad (Safari):
                </p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>
                    Bấm nút <strong>Chia sẻ (Share)</strong> ở thanh công cụ dưới cùng trình duyệt Safari.
                  </li>
                  <li>
                    Cuộn xuống và chọn <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong>.
                  </li>
                  <li>
                    Bấm <strong>Thêm (Add)</strong> ở góc phải trên cùng.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="bg-stone-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs sm:text-sm text-slate-700">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <MoreVertical className="w-4 h-4 text-[#1e40af]" />
                  Hướng dẫn trên điện thoại Android (Chrome):
                </p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>
                    Bấm biểu tượng <strong>3 chấm dọc (⋮)</strong> ở góc trên bên phải Chrome.
                  </li>
                  <li>
                    Chọn <strong>Cài đặt ứng dụng (Install app)</strong> hoặc <strong>Thêm vào màn hình chính</strong>.
                  </li>
                  <li>
                    Xác nhận <strong>Cài đặt</strong> để ứng dụng xuất hiện ngoài màn hình điện thoại như app độc lập.
                  </li>
                </ol>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[42px] rounded-xl bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-xs sm:text-sm font-bold transition-colors"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="no-print fixed bottom-16 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg">
      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
      Chế độ Ngoại tuyến (Offline) — Đang lưu hóa đơn trên máy, sẽ tự đồng bộ khi có mạng.
    </div>
  );
};
