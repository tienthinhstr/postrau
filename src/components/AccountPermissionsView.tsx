import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  LogOut,
  KeyRound,
  Trash2,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  User,
  Copy,
  Edit2,
  Check,
  X,
  Search,
  Shield,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { StaffUserProfile, UserRole } from '../types/pos';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  ROLE_DEFINITIONS,
  getPermissionsForRole,
} from '../utils/rbac';

interface AccountPermissionsViewProps {
  currentUser: StaffUserProfile | null;
  authLoading: boolean;
  isCloudSynced?: boolean;
  cloudEmail?: string | null;
  pendingSyncCount?: number;
  staffList: StaffUserProfile[];
  roleOverride?: UserRole | null;
  onSetRoleOverride?: (role: UserRole | null) => void;
  onLoginWithCredentials?: (identifier: string, password: string) => Promise<void>;
  onRegisterAccount: (params: {
    displayName: string;
    identifier: string;
    password: string;
    switchToNewAccount: boolean;
  }) => Promise<StaffUserProfile | void>;
  onSignInGoogle?: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onUpdateOwnName: (newName: string) => Promise<void>;
  onChangeStaffRole: (targetUser: StaffUserProfile, newRole: UserRole) => Promise<void>;
  onChangePassword?: (params: {
    uid?: string;
    identifier?: string;
    currentPassword?: string;
    newPassword: string;
    skipCurrentCheck?: boolean;
  }) => Promise<void>;
  onDeleteStaffAccount: (targetUser: StaffUserProfile) => Promise<void>;
  onSyncLocalInvoicesToCloud?: () => Promise<void>;
  syncingInvoices?: boolean;
  authError?: string | null;
}

export const AccountPermissionsView: React.FC<AccountPermissionsViewProps> = ({
  currentUser,
  authLoading,
  isCloudSynced,
  cloudEmail,
  pendingSyncCount = 0,
  staffList,
  roleOverride,
  onSetRoleOverride,
  onRegisterAccount,
  onSignInGoogle,
  onSignOut,
  onUpdateOwnName,
  onChangeStaffRole,
  onChangePassword,
  onDeleteStaffAccount,
  onSyncLocalInvoicesToCloud,
  syncingInvoices,
  authError,
}) => {
  // Inline editing state for staff display name
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [savingName, setSavingName] = useState(false);

  // Search filter for staff list
  const [searchQuery, setSearchQuery] = useState('');

  // Toast feedback
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  // Modal 1: Create New Staff
  const [showCreateStaffModal, setShowCreateStaffModal] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffIdentifier, setNewStaffIdentifier] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('123456');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('sales');
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [createStaffError, setCreateStaffError] = useState<string | null>(null);

  // Modal 2: Own Password Change
  const [showOwnPassModal, setShowOwnPassModal] = useState(false);
  const [ownCurrentPass, setOwnCurrentPass] = useState('');
  const [ownNewPass, setOwnNewPass] = useState('');
  const [ownConfirmPass, setOwnConfirmPass] = useState('');
  const [savingOwnPass, setSavingOwnPass] = useState(false);
  const [ownPassError, setOwnPassError] = useState<string | null>(null);

  // Modal 3: Admin Resetting Staff Password
  const [resetTargetStaff, setResetTargetStaff] = useState<StaffUserProfile | null>(null);
  const [adminNewPass, setAdminNewPass] = useState('');
  const [adminConfirmPass, setAdminConfirmPass] = useState('');
  const [savingAdminReset, setSavingAdminReset] = useState(false);
  const [adminResetError, setAdminResetError] = useState<string | null>(null);

  // Modal 4: Delete Staff Account Confirmation (in-UI modal for iframe safety)
  const [staffToDelete, setStaffToDelete] = useState<StaffUserProfile | null>(null);
  const [deletingStaff, setDeletingStaff] = useState(false);

  const isRealAdmin = currentUser?.role === 'admin';
  const effectiveRole: UserRole =
    isRealAdmin && roleOverride ? roleOverride : currentUser?.role || 'sales';
  const activePerms = getPermissionsForRole(effectiveRole);

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleCopyPassword = (pass: string, uid: string, name: string) => {
    navigator.clipboard.writeText(pass);
    setCopiedUid(uid);
    showToast(`Đã sao chép mật khẩu (${pass}) của ${name}`);
    setTimeout(() => setCopiedUid(null), 2000);
  };

  const handleSaveName = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingName.trim()) return;
    setSavingName(true);
    try {
      await onUpdateOwnName(editingName.trim());
      setEditingUid(null);
      showToast('Đã lưu tên hiển thị nhân viên thành công.');
    } finally {
      setSavingName(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateStaffError(null);

    const name = newStaffName.trim();
    const id = newStaffIdentifier.trim();
    const pass = newStaffPassword.trim();

    if (!name) {
      setCreateStaffError('Vui lòng nhập Họ và tên nhân viên.');
      return;
    }
    if (!id || id.length < 3) {
      setCreateStaffError('Vui lòng nhập Tên đăng nhập hoặc Email (tối thiểu 3 ký tự).');
      return;
    }
    if (pass.length < 4) {
      setCreateStaffError('Mật khẩu khởi tạo phải có ít nhất 4 ký tự.');
      return;
    }

    setCreatingStaff(true);
    try {
      const createdStaff = await onRegisterAccount({
        displayName: name,
        identifier: id,
        password: pass,
        switchToNewAccount: false,
      });

      if (createdStaff && newStaffRole !== 'sales') {
        await onChangeStaffRole(createdStaff, newStaffRole);
      }

      setShowCreateStaffModal(false);
      setNewStaffName('');
      setNewStaffIdentifier('');
      setNewStaffPassword('123456');
      setNewStaffRole('sales');
      showToast(`Đã thêm nhân viên "${name}" thành công!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo tài khoản nhân viên.';
      setCreateStaffError(msg);
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleRoleSelect = async (staff: StaffUserProfile, newRole: UserRole) => {
    if (!isRealAdmin) return;
    setUpdatingUid(staff.uid);
    try {
      await onChangeStaffRole(staff, newRole);
      showToast(`Đã chuyển quyền ${staff.displayName} thành "${ROLE_DEFINITIONS[newRole].labelVi}".`);
    } catch {
      setLocalError('Không thể thay đổi quyền. Vui lòng thử lại.');
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleDeleteStaff = (staff: StaffUserProfile) => {
    if (!isRealAdmin) return;
    setStaffToDelete(staff);
  };

  const handleSaveOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setOwnPassError(null);

    if (!ownCurrentPass.trim()) {
      setOwnPassError('Vui lòng nhập mật khẩu hiện tại (mặc định: 123456).');
      return;
    }
    if (ownNewPass.length < 4) {
      setOwnPassError('Mật khẩu mới phải có ít nhất 4 ký tự.');
      return;
    }
    if (ownNewPass !== ownConfirmPass) {
      setOwnPassError('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (ownNewPass === ownCurrentPass) {
      setOwnPassError('Mật khẩu mới không được trùng mật khẩu cũ.');
      return;
    }

    setSavingOwnPass(true);
    try {
      if (onChangePassword) {
        await onChangePassword({
          uid: currentUser.uid,
          identifier: currentUser.email,
          currentPassword: ownCurrentPass,
          newPassword: ownNewPass,
        });
      }
      setShowOwnPassModal(false);
      setOwnCurrentPass('');
      setOwnNewPass('');
      setOwnConfirmPass('');
      showToast('Đổi mật khẩu tài khoản thành công!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đổi mật khẩu thất bại.';
      setOwnPassError(msg);
    } finally {
      setSavingOwnPass(false);
    }
  };

  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetStaff) return;
    setAdminResetError(null);

    if (adminNewPass.length < 4) {
      setAdminResetError('Mật khẩu mới phải có ít nhất 4 ký tự.');
      return;
    }
    if (adminNewPass !== adminConfirmPass) {
      setAdminResetError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setSavingAdminReset(true);
    try {
      if (onChangePassword) {
        await onChangePassword({
          uid: resetTargetStaff.uid,
          identifier: resetTargetStaff.email,
          newPassword: adminNewPass,
          skipCurrentCheck: true,
        });
      }
      const staffName = resetTargetStaff.displayName;
      setResetTargetStaff(null);
      setAdminNewPass('');
      setAdminConfirmPass('');
      showToast(`Đã đặt lại mật khẩu cho "${staffName}" thành công!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu.';
      setAdminResetError(msg);
    } finally {
      setSavingAdminReset(false);
    }
  };

  // Filtered staff list
  const filteredStaffList = useMemo(() => {
    if (!searchQuery.trim()) return staffList;
    const q = searchQuery.toLowerCase().trim();
    return staffList.filter(
      (staff) =>
        staff.displayName.toLowerCase().includes(q) ||
        staff.email.toLowerCase().includes(q)
    );
  }, [staffList, searchQuery]);

  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-12">
      {/* Toast Notification */}
      {statusMessage && (
        <div
          data-testid="auth-status-banner"
          className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {(localError || authError) && (
        <div
          data-testid="auth-error-banner"
          className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 shadow-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{localError || authError}</span>
          </div>
          <button
            type="button"
            onClick={() => setLocalError(null)}
            className="text-rose-500 hover:text-rose-700 text-xs px-2 py-0.5"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1e3a8a] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                Quản Lý Tài Khoản &amp; Phân Quyền
              </h2>
              <p className="text-xs text-slate-500">
                Quản lý danh sách nhân viên, mật khẩu và quyền hạn sử dụng trong vựa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {!isCloudSynced && onSignInGoogle && (
              <button
                type="button"
                disabled={authLoading}
                data-testid="connect-google-cloud-btn"
                onClick={onSignInGoogle}
                className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-400 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>
                  {authLoading
                    ? 'Đang kết nối...'
                    : pendingSyncCount > 0
                    ? `Kết nối Google & Đẩy ${pendingSyncCount} mục`
                    : 'Kết nối Google Cloud'}
                </span>
              </button>
            )}

            {isCloudSynced && onSyncLocalInvoicesToCloud && (
              <button
                type="button"
                disabled={syncingInvoices}
                data-testid="sync-cloud-now-btn"
                onClick={async () => {
                  await onSyncLocalInvoicesToCloud();
                  showToast('Đã đồng bộ toàn bộ hóa đơn, khách hàng và cài đặt lên Firebase!');
                }}
                className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 text-xs font-bold text-[#1e40af] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingInvoices ? 'animate-spin' : ''}`} />
                <span>{syncingInvoices ? 'Đang đồng bộ...' : 'Đồng bộ Cloud ngay'}</span>
              </button>
            )}

            {isRealAdmin && (
              <button
                type="button"
                data-testid="open-add-staff-modal-btn"
                onClick={() => {
                  setCreateStaffError(null);
                  setNewStaffName('');
                  setNewStaffIdentifier('');
                  setNewStaffPassword('123456');
                  setNewStaffRole('sales');
                  setShowCreateStaffModal(true);
                }}
                className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 text-xs font-bold text-white bg-[#1e3a8a] hover:bg-[#172554] rounded-xl flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Thêm nhân viên</span>
              </button>
            )}

            <button
              type="button"
              data-testid="logout-btn"
              onClick={onSignOut}
              className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3 sm:p-4 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên nhân viên hoặc email..."
              className="w-full min-h-[38px] pl-9 pr-3 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
            />
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg">
              Tất cả ({staffList.length})
            </span>

            {isRealAdmin && roleOverride && onSetRoleOverride && (
              <button
                type="button"
                onClick={() => onSetRoleOverride(null)}
                className="text-xs font-bold text-[#1e40af] hover:underline ml-2"
              >
                Khôi phục góc nhìn Admin gốc
              </button>
            )}
          </div>
        </div>

        {/* Desktop Table & Mobile Cards */}
        {filteredStaffList.length === 0 ? (
          <div className="p-10 text-center text-slate-500 space-y-2 text-xs sm:text-sm">
            <p>Không tìm thấy nhân viên nào phù hợp.</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-3.5 py-1.5 font-bold text-[#1e3a8a] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                Xóa bộ lọc tìm kiếm
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-3 px-4">Nhân viên</th>
                    <th className="py-3 px-3">Tài khoản / Email</th>
                    <th className="py-3 px-3">Mật khẩu</th>
                    <th className="py-3 px-3">Phân quyền</th>
                    <th className="py-3 px-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStaffList.map((staff) => {
                    const isOwnerEmail =
                      staff.email.trim().toLowerCase() ===
                      BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
                    const isCurrentUser =
                      currentUser?.uid === staff.uid ||
                      currentUser?.email.trim().toLowerCase() === staff.email.trim().toLowerCase();
                    const staffPassword =
                      staff.plainPassword || (isOwnerEmail ? '123456' : '123456');

                    return (
                      <tr
                        key={staff.uid}
                        data-testid={`staff-row-${staff.uid}`}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isCurrentUser ? 'bg-blue-50/20' : ''
                        }`}
                      >
                        {/* 1. Name & Badges */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                staff.role === 'admin'
                                  ? 'bg-blue-50 text-[#1e3a8a]'
                                  : staff.role === 'cashier'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {staff.role === 'admin' ? (
                                <Shield className="w-4 h-4" />
                              ) : staff.role === 'cashier' ? (
                                <UserCheck className="w-4 h-4" />
                              ) : (
                                <User className="w-4 h-4" />
                              )}
                            </div>

                            <div className="min-w-0">
                              {editingUid === staff.uid ? (
                                <form onSubmit={handleSaveName} className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    autoFocus
                                    placeholder="Tên nhân viên..."
                                    className="min-h-[32px] px-2.5 py-1 text-xs font-bold bg-white border-2 border-[#1e3a8a] rounded-lg text-slate-900 focus:outline-none"
                                  />
                                  <button
                                    type="submit"
                                    disabled={savingName}
                                    className="min-h-[32px] px-2.5 py-1 text-xs font-bold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 flex items-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Lưu</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingUid(null)}
                                    className="min-h-[32px] px-2 py-1 text-xs font-medium bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </form>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-slate-900 text-sm whitespace-nowrap">
                                    {staff.displayName}
                                  </span>
                                  {isCurrentUser && (
                                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                                      Bạn
                                    </span>
                                  )}
                                  {isOwnerEmail && !isCurrentUser && (
                                    <span className="text-[10px] font-bold text-[#1e3a8a] bg-blue-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                                      Chủ vựa gốc
                                    </span>
                                  )}
                                  {isCurrentUser && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingUid(staff.uid);
                                        setEditingName(staff.displayName);
                                      }}
                                      title="Sửa tên hiển thị"
                                      className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200/60 transition-colors"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 2. Account / Email */}
                        <td className="py-3.5 px-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {staff.email}
                        </td>

                        {/* 3. Password Box */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-800 whitespace-nowrap shadow-2xs">
                            <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono font-bold text-xs select-all text-[#1e3a8a] tracking-wide">
                              {staffPassword}
                            </span>
                            <button
                              type="button"
                              title="Sao chép mật khẩu"
                              onClick={() => handleCopyPassword(staffPassword, staff.uid, staff.displayName)}
                              className="ml-1 p-1 text-slate-400 hover:text-slate-800 rounded-md hover:bg-slate-200/70 transition-colors inline-flex items-center gap-1"
                            >
                              {copiedUid === staff.uid ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                              <span className="text-[11px] font-medium text-slate-500">
                                {copiedUid === staff.uid ? 'Đã chép' : 'Chép'}
                              </span>
                            </button>
                          </div>
                        </td>

                        {/* 4. Role Selection */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {isRealAdmin ? (
                            <select
                              aria-label={`Chọn quyền cho ${staff.displayName}`}
                              data-testid={`role-select-${staff.uid}`}
                              disabled={updatingUid === staff.uid}
                              value={staff.role}
                              onChange={(e) => handleRoleSelect(staff, e.target.value as UserRole)}
                              className="min-h-[36px] px-2.5 py-1 text-xs font-bold bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#1e3a8a] shadow-2xs"
                            >
                              <option value="admin">Chủ vựa (Admin) — Toàn quyền</option>
                              <option value="cashier">Thu ngân — Thu tiền &amp; Báo cáo</option>
                              <option value="sales">Ghi đơn — Chỉ lập &amp; in đơn</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                                staff.role === 'admin'
                                  ? 'bg-blue-100 text-[#1e3a8a]'
                                  : staff.role === 'cashier'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {ROLE_DEFINITIONS[staff.role]?.labelVi || staff.role}
                            </span>
                          )}
                        </td>

                        {/* 5. Actions */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              title="Đổi mật khẩu tài khoản"
                              data-testid={isCurrentUser ? 'open-own-password-modal-btn' : `reset-staff-pass-btn-${staff.uid}`}
                              onClick={() => {
                                if (isCurrentUser) {
                                  setShowOwnPassModal(true);
                                  setOwnCurrentPass('');
                                  setOwnNewPass('');
                                  setOwnConfirmPass('');
                                  setOwnPassError(null);
                                } else {
                                  setResetTargetStaff(staff);
                                  setAdminNewPass('');
                                  setAdminConfirmPass('');
                                  setAdminResetError(null);
                                }
                              }}
                              className="min-h-[36px] px-3 py-1.5 text-xs font-bold text-[#1e3a8a] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>Đổi MK</span>
                            </button>

                            {isRealAdmin && !isOwnerEmail && !isCurrentUser && (
                              <button
                                type="button"
                                title="Xóa tài khoản nhân viên"
                                disabled={updatingUid === staff.uid}
                                onClick={() => handleDeleteStaff(staff)}
                                className="min-h-[36px] px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center gap-1 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Xóa</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View - Redesigned for Mobile UX */}
            <div className="md:hidden p-3.5 space-y-3 bg-slate-50/50">
              {filteredStaffList.map((staff) => {
                const isOwnerEmail =
                  staff.email.trim().toLowerCase() ===
                  BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
                const isCurrentUser =
                  currentUser?.uid === staff.uid ||
                  currentUser?.email.trim().toLowerCase() === staff.email.trim().toLowerCase();
                const staffPassword =
                  staff.plainPassword || (isOwnerEmail ? '123456' : '123456');

                return (
                  <div
                    key={staff.uid}
                    data-testid={`staff-row-${staff.uid}`}
                    className={`p-4 rounded-2xl border transition-all space-y-3.5 shadow-xs ${
                      isCurrentUser
                        ? 'bg-white border-blue-300 ring-2 ring-blue-100/80'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Top Row: Avatar + Name + Badges + Email */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${
                          staff.role === 'admin'
                            ? 'bg-blue-600 text-white'
                            : staff.role === 'cashier'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-amber-500 text-white'
                        }`}
                      >
                        {staff.role === 'admin' ? (
                          <Shield className="w-5 h-5" />
                        ) : staff.role === 'cashier' ? (
                          <UserCheck className="w-5 h-5" />
                        ) : (
                          <User className="w-5 h-5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {editingUid === staff.uid ? (
                          <form onSubmit={handleSaveName} className="flex items-center gap-1.5 my-0.5">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              autoFocus
                              placeholder="Tên nhân viên..."
                              className="w-full min-h-[34px] px-2.5 py-1 text-xs font-bold bg-white border-2 border-[#1e3a8a] rounded-lg text-slate-900 focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={savingName}
                              className="min-h-[34px] px-2.5 py-1 text-xs font-bold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 flex items-center gap-1 shrink-0"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Lưu</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingUid(null)}
                              className="min-h-[34px] px-2 py-1 text-xs font-medium bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-slate-900 text-base leading-tight">
                              {staff.displayName}
                            </span>
                            {isCurrentUser && (
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                                Bạn
                              </span>
                            )}
                            {isOwnerEmail && !isCurrentUser && (
                              <span className="text-[10px] font-bold text-[#1e3a8a] bg-blue-100 px-1.5 py-0.5 rounded-md">
                                Chủ vựa gốc
                              </span>
                            )}
                            {isCurrentUser && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUid(staff.uid);
                                  setEditingName(staff.displayName);
                                }}
                                title="Sửa tên ký hóa đơn"
                                className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
                          {staff.email}
                        </p>
                      </div>
                    </div>

                    {/* Dedicated Full-Width Password Box */}
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl">
                      <div className="flex items-center gap-2 min-w-0">
                        <KeyRound className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-500 font-medium">Mật khẩu:</span>
                        <strong className="font-mono text-sm font-extrabold text-[#1e3a8a] select-all tracking-wide truncate">
                          {staffPassword}
                        </strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyPassword(staffPassword, staff.uid, staff.displayName)}
                        className="min-h-[32px] px-3 py-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors shrink-0"
                      >
                        {copiedUid === staff.uid ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700 font-semibold">Đã chép</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                            <span>Sao chép</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Role Dropdown & Action Buttons */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="w-full">
                        {isRealAdmin ? (
                          <select
                            data-testid={`role-select-${staff.uid}`}
                            disabled={updatingUid === staff.uid}
                            value={staff.role}
                            onChange={(e) => handleRoleSelect(staff, e.target.value as UserRole)}
                            className="w-full min-h-[40px] px-3 py-2 text-xs font-bold bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-[#1e3a8a] shadow-2xs"
                          >
                            <option value="admin">Chủ vựa (Admin) — Toàn quyền</option>
                            <option value="cashier">Thu ngân — Thu tiền &amp; Báo cáo</option>
                            <option value="sales">Ghi đơn — Chỉ lập &amp; in hóa đơn</option>
                          </select>
                        ) : (
                          <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                            Quyền: {ROLE_DEFINITIONS[staff.role]?.labelVi || staff.role}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          data-testid={isCurrentUser ? 'open-own-password-modal-btn' : `reset-staff-pass-btn-${staff.uid}`}
                          onClick={() => {
                            if (isCurrentUser) {
                              setShowOwnPassModal(true);
                              setOwnCurrentPass('');
                              setOwnNewPass('');
                              setOwnConfirmPass('');
                              setOwnPassError(null);
                            } else {
                              setResetTargetStaff(staff);
                              setAdminNewPass('');
                              setAdminConfirmPass('');
                              setAdminResetError(null);
                            }
                          }}
                          className="flex-1 min-h-[40px] px-3 py-2 text-xs font-bold text-[#1e3a8a] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Đổi mật khẩu</span>
                        </button>

                        {isRealAdmin && !isOwnerEmail && !isCurrentUser && (
                          <button
                            type="button"
                            disabled={updatingUid === staff.uid}
                            onClick={() => handleDeleteStaff(staff)}
                            className="min-h-[40px] px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* MODAL 1: Create New Staff */}
      {showCreateStaffModal && (
        <div
          data-testid="create-staff-modal"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="bg-[#1e3a8a] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Thêm Tài Khoản Nhân Viên Mới
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateStaffModal(false)}
                className="text-white/80 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="p-5 space-y-4">
              {createStaffError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{createStaffError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Họ và tên nhân viên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  data-testid="new-staff-name-input"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="VD: Nguyễn Văn Bình"
                  className="w-full min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên đăng nhập hoặc Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  data-testid="new-staff-id-input"
                  value={newStaffIdentifier}
                  onChange={(e) => setNewStaffIdentifier(e.target.value)}
                  placeholder="VD: binh1 hoặc binh@gmail.com"
                  className="w-full min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mật khẩu khởi tạo (mặc định: 123456)
                </label>
                <input
                  type="text"
                  data-testid="new-staff-pass-input"
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  placeholder="Mật khẩu ban đầu..."
                  className="w-full min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phân quyền vai trò
                </label>
                <select
                  value={newStaffRole}
                  onChange={(e) => setNewStaffRole(e.target.value as UserRole)}
                  className="w-full min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                >
                  <option value="sales">Nhân viên ghi đơn — Chỉ lập &amp; in đơn A5</option>
                  <option value="cashier">Thu ngân / Kế toán — Thu nợ &amp; Doanh thu</option>
                  <option value="admin">Chủ vựa (Admin) — Toàn quyền</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateStaffModal(false)}
                  className="min-h-[38px] px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={creatingStaff}
                  data-testid="submit-create-staff-btn"
                  className="min-h-[38px] px-5 py-2 text-xs font-bold text-white bg-[#1e3a8a] hover:bg-[#172554] rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{creatingStaff ? 'Đang tạo...' : 'Tạo Tài Khoản'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: User Changing Their Own Password */}
      {showOwnPassModal && (
        <div
          data-testid="own-password-modal"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="bg-[#1e3a8a] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Đổi Mật Khẩu Tài Khoản Của Bạn
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOwnPassModal(false)}
                className="text-white/80 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOwnPassword} className="p-5 space-y-3.5">
              {ownPassError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{ownPassError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mật khẩu hiện tại
                </label>
                <input
                  type="password"
                  data-testid="own-current-pass-input"
                  value={ownCurrentPass}
                  onChange={(e) => setOwnCurrentPass(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại..."
                  className="w-full min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mật khẩu mới (tối thiểu 4 ký tự)
                </label>
                <input
                  type="password"
                  data-testid="own-new-pass-input"
                  value={ownNewPass}
                  onChange={(e) => setOwnNewPass(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  className="w-full min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Xác nhận mật khẩu mới
                </label>
                <input
                  type="password"
                  data-testid="own-confirm-pass-input"
                  value={ownConfirmPass}
                  onChange={(e) => setOwnConfirmPass(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới..."
                  className="w-full min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowOwnPassModal(false)}
                  className="min-h-[38px] px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingOwnPass}
                  data-testid="submit-own-pass-btn"
                  className="min-h-[38px] px-5 py-2 text-xs font-bold text-white bg-[#1e3a8a] hover:bg-[#172554] rounded-xl flex items-center gap-1.5 shadow-2xs"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{savingOwnPass ? 'Đang lưu...' : 'Lưu Mật Khẩu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Admin Resetting a Staff Member's Password */}
      {resetTargetStaff && (
        <div
          data-testid="admin-reset-password-modal"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="bg-[#1e3a8a] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Đặt Lại Mật Khẩu Cho Nhân Viên
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResetTargetStaff(null)}
                className="text-white/80 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdminResetPassword} className="p-5 space-y-3.5">
              <div className="p-3 bg-blue-50 border border-blue-200 text-[#1e3a8a] rounded-xl text-xs font-semibold">
                Tài khoản: <strong>{resetTargetStaff.displayName}</strong> ({resetTargetStaff.email})
              </div>

              {adminResetError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{adminResetError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mật khẩu mới cho nhân viên (tối thiểu 4 ký tự)
                </label>
                <input
                  type="password"
                  data-testid="admin-new-pass-input"
                  value={adminNewPass}
                  onChange={(e) => setAdminNewPass(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  className="w-full min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nhập lại mật khẩu mới
                </label>
                <input
                  type="password"
                  data-testid="admin-confirm-pass-input"
                  value={adminConfirmPass}
                  onChange={(e) => setAdminConfirmPass(e.target.value)}
                  placeholder="Xác nhận mật khẩu..."
                  className="w-full min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResetTargetStaff(null)}
                  className="min-h-[38px] px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingAdminReset}
                  data-testid="submit-admin-reset-btn"
                  className="min-h-[38px] px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl flex items-center gap-1.5 shadow-2xs"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{savingAdminReset ? 'Đang lưu...' : 'Xác Nhận Đặt Lại'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Delete Staff Confirmation */}
      {staffToDelete && (
        <div
          data-testid="delete-staff-modal"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="bg-rose-600 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-white" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Xác Nhận Xóa Tài Khoản Nhân Viên
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStaffToDelete(null)}
                className="text-white/80 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                Bạn có chắc chắn muốn xóa tài khoản nhân viên{' '}
                <strong className="text-slate-900 font-extrabold">
                  "{staffToDelete.displayName}" ({staffToDelete.email})
                </strong>{' '}
                khỏi hệ thống vựa không?
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStaffToDelete(null)}
                  className="min-h-[38px] px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={deletingStaff}
                  onClick={async () => {
                    setDeletingStaff(true);
                    setUpdatingUid(staffToDelete.uid);
                    try {
                      await onDeleteStaffAccount(staffToDelete);
                      showToast(`Đã xóa tài khoản "${staffToDelete.displayName}".`);
                      setStaffToDelete(null);
                    } catch {
                      setLocalError('Không thể xóa tài khoản. Vui lòng thử lại.');
                    } finally {
                      setDeletingStaff(false);
                      setUpdatingUid(null);
                    }
                  }}
                  className="min-h-[38px] px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{deletingStaff ? 'Đang xóa...' : 'Xóa Tài Khoản'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
