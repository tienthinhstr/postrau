import { StaffUserProfile, UserRole } from '../types/pos';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'tienthinhstr@gmail.com';
export const WORKSPACE_ID = 'vua-rau-thanh-dat';
export const SESSION_MAX_INACTIVE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

export interface PersistedAuthSession {
  profile: StaffUserProfile;
  lastActiveAt: number;
}

export function evaluateSavedSession(
  rawStorageValue: string | null,
  nowMs: number = Date.now()
): {
  profile: StaffUserProfile | null;
  expired: boolean;
} {
  if (!rawStorageValue || rawStorageValue === 'logged_out') {
    return { profile: null, expired: false };
  }
  try {
    const parsed = JSON.parse(rawStorageValue);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.profile &&
      typeof parsed.profile.uid === 'string' &&
      typeof parsed.lastActiveAt === 'number'
    ) {
      const elapsed = nowMs - parsed.lastActiveAt;
      if (elapsed > SESSION_MAX_INACTIVE_MS) {
        return { profile: null, expired: true };
      }
      return { profile: parsed.profile as StaffUserProfile, expired: false };
    }
    // Legacy format where profile was stored directly without lastActiveAt: require fresh login with timestamp
    return { profile: null, expired: false };
  } catch {
    return { profile: null, expired: false };
  }
}

export interface RolePermissions {
  role: UserRole;
  labelVi: string;
  shortBadgeVi: string;
  descriptionVi: string;
  canCreateInvoice: boolean;
  canPrintAndExportA5: boolean;
  canSettlePayment: boolean;
  canRevertPaidStatus: boolean;
  canViewRevenueReport: boolean;
  canEditStoreSettings: boolean;
  canDeleteInvoice: boolean;
  canManageRoles: boolean;
}

export const ROLE_DEFINITIONS: Record<UserRole, RolePermissions> = {
  admin: {
    role: 'admin',
    labelVi: 'Chủ Vựa / Quản Trị Viên',
    shortBadgeVi: 'Chủ vựa (Admin)',
    descriptionVi:
      'Toàn quyền quản lý: Lập hóa đơn, thu tiền & hoàn tác công nợ, xem báo cáo doanh thu, chỉnh thông tin vựa và phân quyền nhân viên.',
    canCreateInvoice: true,
    canPrintAndExportA5: true,
    canSettlePayment: true,
    canRevertPaidStatus: true,
    canViewRevenueReport: true,
    canEditStoreSettings: true,
    canDeleteInvoice: true,
    canManageRoles: true,
  },
  cashier: {
    role: 'cashier',
    labelVi: 'Thu Ngân / Kế Toán',
    shortBadgeVi: 'Thu ngân',
    descriptionVi:
      'Được lập & xuất hóa đơn A5, xác nhận thu tiền / gạch nợ, xóa hóa đơn / dư nợ khách hàng và xem báo cáo doanh thu hàng ngày.',
    canCreateInvoice: true,
    canPrintAndExportA5: true,
    canSettlePayment: true,
    canRevertPaidStatus: true,
    canViewRevenueReport: true,
    canEditStoreSettings: true,
    canDeleteInvoice: true,
    canManageRoles: false,
  },
  sales: {
    role: 'sales',
    labelVi: 'Nhân Viên Ghi Đơn / Cân Hàng',
    shortBadgeVi: 'Ghi đơn',
    descriptionVi:
      'Chỉ được lập tờ Hóa Đơn Bán Lẻ mới, xuất/in phiếu A5 và tra cứu danh sách đơn hàng. Không được gạch nợ hoặc sửa quyền.',
    canCreateInvoice: true,
    canPrintAndExportA5: true,
    canSettlePayment: false,
    canRevertPaidStatus: false,
    canViewRevenueReport: false,
    canEditStoreSettings: false,
    canDeleteInvoice: false,
    canManageRoles: false,
  },
};

export function getPermissionsForRole(role?: UserRole | null): RolePermissions {
  if (!role || !ROLE_DEFINITIONS[role]) {
    return ROLE_DEFINITIONS.cashier;
  }
  return ROLE_DEFINITIONS[role];
}

export function determineInitialRoleForEmail(email?: string | null): UserRole {
  const cleaned = String(email || '').trim().toLowerCase();
  if (
    cleaned === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() ||
    cleaned === 'admin' ||
    cleaned === 'admin@vuarau.vn'
  ) {
    return 'admin';
  }
  return 'sales';
}

export function normalizeAccountIdentifier(raw: string): {
  email: string;
  username: string;
  docId: string;
} {
  const trimmed = String(raw || '').trim().toLowerCase();
  const isEmail = trimmed.includes('@');
  const email = isEmail ? trimmed : `${trimmed}@vuarau.vn`;
  const username = isEmail ? trimmed.split('@')[0] : trimmed;
  const safeSlug = email
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);
  return {
    email,
    username,
    docId: `acct-${safeSlug || 'user'}`,
  };
}
