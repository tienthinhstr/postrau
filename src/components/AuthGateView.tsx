import React, { useState } from 'react';
import {
  LogIn,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  Clock,
  Lock,
  User,
  KeyRound,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../utils/rbac';
import { StaffUserProfile } from '../types/pos';

interface AuthGateViewProps {
  storeName: string;
  authLoading: boolean;
  authError: string | null;
  sessionExpiredNotice: boolean;
  onLoginWithCredentials: (identifier: string, password: string) => Promise<void>;
  onRegisterAccount: (params: {
    displayName: string;
    identifier: string;
    password: string;
    switchToNewAccount: boolean;
  }) => Promise<StaffUserProfile | void>;
  onChangePassword?: (params: {
    identifier?: string;
    currentPassword?: string;
    newPassword: string;
    skipCurrentCheck?: boolean;
  }) => Promise<void>;
  onSignInGoogle: () => Promise<void>;
}

export const AuthGateView: React.FC<AuthGateViewProps> = ({
  storeName,
  authLoading,
  authError,
  sessionExpiredNotice,
  onLoginWithCredentials,
  onRegisterAccount,
  onChangePassword,
  onSignInGoogle,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'change_password'>('login');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');

  // Register form state
  const [registerName, setRegisterName] = useState<string>('');
  const [registerIdentifier, setRegisterIdentifier] = useState<string>('');
  const [registerPassword, setRegisterPassword] = useState<string>('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState<string>('');

  // Change password form state
  const [changeIdentifier, setChangeIdentifier] = useState<string>('');
  const [changeCurrentPassword, setChangeCurrentPassword] = useState<string>('');
  const [changeNewPassword, setChangeNewPassword] = useState<string>('');
  const [changeConfirmPassword, setChangeConfirmPassword] = useState<string>('');
  const [changeSuccessMessage, setChangeSuccessMessage] = useState<string | null>(null);

  const [localError, setLocalError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setChangeSuccessMessage(null);
    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      setLocalError('Vui lòng nhập đầy đủ Tên đăng nhập / Email và Mật khẩu.');
      return;
    }
    try {
      await onLoginWithCredentials(loginIdentifier.trim(), loginPassword.trim());
    } catch {
      // Handled via authError prop
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setChangeSuccessMessage(null);
    if (!registerName.trim()) {
      setLocalError('Vui lòng nhập Họ và tên nhân viên.');
      return;
    }
    if (!registerIdentifier.trim() || registerIdentifier.trim().length < 3) {
      setLocalError('Vui lòng nhập Tên đăng nhập hoặc Email (tối thiểu 3 ký tự).');
      return;
    }
    if (registerPassword.trim().length < 4) {
      setLocalError('Mật khẩu phải có ít nhất 4 ký tự.');
      return;
    }
    if (registerPassword.trim() !== registerConfirmPassword.trim()) {
      setLocalError('Mật khẩu nhập lại không khớp.');
      return;
    }
    try {
      await onRegisterAccount({
        displayName: registerName.trim(),
        identifier: registerIdentifier.trim(),
        password: registerPassword.trim(),
        switchToNewAccount: true,
      });
    } catch {
      // Handled via authError prop
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setChangeSuccessMessage(null);

    const targetId = changeIdentifier.trim();
    const currPass = changeCurrentPassword.trim();
    const newPass = changeNewPassword.trim();
    const confirmPass = changeConfirmPassword.trim();

    if (!targetId) {
      setLocalError('Vui lòng nhập Tên đăng nhập hoặc Email của bạn.');
      return;
    }
    if (!currPass) {
      setLocalError('Vui lòng nhập Mật khẩu hiện tại (nếu chưa đổi bao giờ thì mặc định là 123456).');
      return;
    }
    if (newPass.length < 4) {
      setLocalError('Mật khẩu mới phải có ít nhất 4 ký tự.');
      return;
    }
    if (newPass !== confirmPass) {
      setLocalError('Mật khẩu mới nhập lại không khớp.');
      return;
    }

    if (!onChangePassword) {
      setLocalError('Chức năng đổi mật khẩu đang được kết nối.');
      return;
    }

    try {
      await onChangePassword({
        identifier: targetId,
        currentPassword: currPass,
        newPassword: newPass,
      });
      setChangeSuccessMessage('Đã đổi mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.');
      setLoginIdentifier(targetId);
      setLoginPassword(newPass);
      setChangeCurrentPassword('');
      setChangeNewPassword('');
      setChangeConfirmPassword('');
      setMode('login');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại.';
      setLocalError(msg);
    }
  };

  return (
    <div
      data-testid="auth-gate-screen"
      className="min-h-screen bg-stone-100 flex flex-col justify-center items-center px-4 py-8 text-slate-900"
    >
      <div className="w-full max-w-md bg-white border-2 border-[#1e3a8a] rounded-2xl shadow-sm overflow-hidden">
        {/* Top Brand Banner styled like the Vietnamese Blue Invoice Header */}
        <div className="bg-[#1e3a8a] text-white px-6 py-5 space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-200">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Hệ Thống Quản Lý &amp; Hóa Đơn Bán Lẻ A5
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            {storeName}
          </h1>
        </div>

        {/* Mode Switcher Tabs: Đăng Nhập vs Đăng Ký vs Đổi Mật Khẩu */}
        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs sm:text-sm font-extrabold">
          <button
            type="button"
            data-testid="gate-tab-login"
            onClick={() => {
              setMode('login');
              setLocalError(null);
            }}
            className={`min-h-[46px] py-2 px-1 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              mode === 'login'
                ? 'border-[#1e3a8a] text-[#1e3a8a] bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <LogIn className="w-3.5 h-3.5 shrink-0" />
            <span>Đăng Nhập</span>
          </button>
          <button
            type="button"
            data-testid="gate-tab-register"
            onClick={() => {
              setMode('register');
              setLocalError(null);
            }}
            className={`min-h-[46px] py-2 px-1 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              mode === 'register'
                ? 'border-[#1e3a8a] text-[#1e3a8a] bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5 shrink-0" />
            <span>Đăng Ký</span>
          </button>
          <button
            type="button"
            data-testid="gate-tab-change-password"
            onClick={() => {
              setMode('change_password');
              setLocalError(null);
            }}
            className={`min-h-[46px] py-2 px-1 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              mode === 'change_password'
                ? 'border-[#1e3a8a] text-[#1e3a8a] bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span>Đổi Mật Khẩu</span>
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {/* Success Banner */}
          {changeSuccessMessage && (
            <div
              data-testid="gate-success-banner"
              className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-semibold text-emerald-950 flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>{changeSuccessMessage}</span>
            </div>
          )}

          {/* 3-Day Session Expired Banner */}
          {sessionExpiredNotice && (
            <div
              data-testid="session-expired-banner"
              className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs font-semibold text-amber-950 flex items-start gap-2"
            >
              <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                Phiên đăng nhập đã hết hạn do quá <strong>3 ngày</strong> không truy cập. Vui lòng đăng nhập lại.
              </span>
            </div>
          )}

          {/* Error Banner */}
          {(localError || authError) && (
            <div
              data-testid="gate-error-banner"
              className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-semibold text-rose-900 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{localError || authError}</span>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Primary Firebase Google Sign-In for Cloud Sync */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-emerald-950">
                    Đồng bộ Firebase thời gian thực (Khuyên dùng)
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                    Đa thiết bị
                  </span>
                </div>
                <p className="text-[11px] text-emerald-900/90 leading-relaxed">
                  Đăng nhập bằng Gmail để tự động tải lại và đồng bộ hóa đơn, khách hàng, công nợ theo thời gian thực giữa điện thoại và máy tính.
                </p>
                <button
                  type="button"
                  disabled={authLoading}
                  data-testid="gate-google-signin-btn"
                  onClick={onSignInGoogle}
                  className="w-full min-h-[46px] px-4 py-2.5 text-sm font-extrabold text-slate-900 bg-white hover:bg-emerald-50 border-2 border-emerald-500 rounded-xl flex items-center justify-center gap-2.5 shadow-2xs transition-colors"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>Đăng Nhập Google (Đồng bộ Cloud)</span>
                </button>
              </div>

              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-slate-200" />
                <span className="shrink mx-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Hoặc đăng nhập bằng tài khoản vựa (Đồng bộ Firebase)
                </span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              {/* Quick Admin Hint */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                <div className="text-slate-700 leading-relaxed">
                  <strong className="text-[#1e3a8a] block">
                    Tài khoản Chủ Vựa (Đồng bộ trực tiếp Firebase):
                  </strong>
                  Tài khoản: <code className="font-mono font-bold text-slate-900">admin</code> · Mật khẩu:{' '}
                  <code className="font-mono font-bold text-slate-900">123456</code>
                  <span className="block text-[10px] text-slate-500 mt-0.5">
                    Tự động đồng bộ hóa đơn, khách hàng và cài đặt thời gian thực trên dự án rau-cai.
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="gate-quick-fill-admin"
                  onClick={() => {
                    setLoginIdentifier(BOOTSTRAPPED_ADMIN_EMAIL);
                    setLoginPassword('123456');
                    setLocalError(null);
                  }}
                  className="shrink-0 min-h-[34px] px-3 py-1.5 text-xs font-bold text-[#1e40af] bg-white hover:bg-blue-50 border border-blue-300 rounded-lg shadow-2xs"
                >
                  Điền Admin
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên đăng nhập hoặc Email
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      data-testid="gate-login-identifier"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="VD: admin, nhanvien1..."
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Mật khẩu
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setChangeIdentifier(loginIdentifier);
                        setMode('change_password');
                        setLocalError(null);
                      }}
                      className="text-[11px] font-bold text-[#1e40af] hover:underline"
                    >
                      Đổi mật khẩu?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      data-testid="gate-login-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                data-testid="gate-submit-login"
                className="w-full min-h-[46px] px-5 py-2.5 text-sm font-extrabold text-white bg-[#1e3a8a] hover:bg-[#172554] rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <LogIn className="w-4 h-4" />
                {authLoading ? 'Đang đăng nhập...' : 'Đăng Nhập Vào Hệ Thống'}
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 leading-relaxed">
                <strong>Cơ chế phân quyền:</strong> Tài khoản đăng ký mới sẽ mặc định là <strong>Nhân Viên Ghi Đơn</strong>. Sau khi bạn đăng ký, <strong>Chủ Vựa (Admin)</strong> sẽ thấy tài khoản của bạn để cấp quyền <strong>Thu Ngân</strong> hoặc <strong>Admin</strong>.
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Họ và tên nhân viên
                  </label>
                  <input
                    type="text"
                    data-testid="gate-register-name"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="VD: Nguyễn Văn Bình"
                    className="w-full min-h-[42px] px-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên đăng nhập hoặc Email
                  </label>
                  <input
                    type="text"
                    data-testid="gate-register-identifier"
                    value={registerIdentifier}
                    onChange={(e) => setRegisterIdentifier(e.target.value)}
                    placeholder="VD: nhanvien1 hoặc binh@gmail.com"
                    className="w-full min-h-[42px] px-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mật khẩu (tối thiểu 4 ký tự)
                    </label>
                    <input
                      type="password"
                      data-testid="gate-register-password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="w-full min-h-[42px] px-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nhập lại mật khẩu
                    </label>
                    <input
                      type="password"
                      data-testid="gate-register-confirm"
                      value={registerConfirmPassword}
                      onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                      placeholder="Xác nhận mật khẩu..."
                      className="w-full min-h-[42px] px-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                data-testid="gate-submit-register"
                className="w-full min-h-[46px] px-5 py-2.5 text-sm font-extrabold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                {authLoading ? 'Đang đăng ký...' : 'Đăng Ký & Vào Hệ Thống'}
              </button>
            </form>
          )}

          {mode === 'change_password' && (
            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-slate-700 leading-relaxed">
                <strong>Đổi Mật Khẩu Tài Khoản:</strong> Nhập tên đăng nhập hoặc email, mật khẩu hiện tại (mặc định là <code className="font-mono font-bold text-slate-900">123456</code>) và mật khẩu mới bạn muốn đổi.
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên đăng nhập hoặc Email cần đổi mật khẩu
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      data-testid="gate-change-identifier"
                      value={changeIdentifier}
                      onChange={(e) => setChangeIdentifier(e.target.value)}
                      placeholder="VD: admin, nhanvien1..."
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mật khẩu hiện tại
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      data-testid="gate-change-current-password"
                      value={changeCurrentPassword}
                      onChange={(e) => setChangeCurrentPassword(e.target.value)}
                      placeholder="Mật khẩu hiện tại (VD: 123456)..."
                      className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Mật khẩu mới (tối thiểu 4 ký tự)
                    </label>
                    <input
                      type="password"
                      data-testid="gate-change-new-password"
                      value={changeNewPassword}
                      onChange={(e) => setChangeNewPassword(e.target.value)}
                      placeholder="Mật khẩu mới..."
                      className="w-full min-h-[42px] px-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nhập lại mật khẩu mới
                    </label>
                    <input
                      type="password"
                      data-testid="gate-change-confirm-password"
                      value={changeConfirmPassword}
                      onChange={(e) => setChangeConfirmPassword(e.target.value)}
                      placeholder="Xác nhận mật khẩu mới..."
                      className="w-full min-h-[42px] px-3.5 py-2 text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={authLoading}
                  data-testid="gate-submit-change-password"
                  className="flex-1 min-h-[46px] px-5 py-2.5 text-sm font-extrabold text-white bg-[#1e3a8a] hover:bg-[#172554] rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  {authLoading ? 'Đang cập nhật...' : 'Lưu Mật Khẩu Mới'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setLocalError(null);
                  }}
                  className="min-h-[46px] px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Quay lại đăng nhập
                </button>
              </div>
            </form>
          )}

          {/* 3-Day Auto-Remember Footer Note */}
          <div className="pt-3 border-t border-slate-200/80 flex items-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Tự động ghi nhớ phiên:</strong> Bạn chỉ cần đăng nhập lần đầu tiên. Hệ thống chỉ yêu cầu đăng nhập lại nếu quá <strong>3 ngày</strong> không mở ứng dụng.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
