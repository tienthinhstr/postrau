import { Customer, Invoice } from '../types/pos';

export interface MergeInvoicesParams {
  localInvoices: Invoice[];
  cloudInvoices: Invoice[];
  unsyncedCreateIds: string[];
  unsyncedUpdateIds: string[];
  deletedIds: string[];
  allowInitialSeed: boolean;
}

export interface MergeInvoicesResult {
  mergedInvoices: Invoice[];
  toCreateOnCloud: Invoice[];
  toUpdateOnCloud: Invoice[];
  syncedCreateIdsToClear: string[];
  syncedUpdateIdsToClear: string[];
}

export function mergeInvoicesOnCloudConnect(
  params: MergeInvoicesParams
): MergeInvoicesResult {
  const delSet = new Set(params.deletedIds);
  const unsyncedCreateSet = new Set(params.unsyncedCreateIds);
  const unsyncedUpdateSet = new Set(params.unsyncedUpdateIds);

  const cloudById = new Map<string, Invoice>();
  for (const inv of params.cloudInvoices) {
    if (!delSet.has(inv.id)) {
      cloudById.set(inv.id, inv);
    }
  }

  const toCreateOnCloud: Invoice[] = [];
  const toUpdateOnCloud: Invoice[] = [];
  const mergedById = new Map<string, Invoice>(cloudById);

  for (const localInv of params.localInvoices) {
    if (delSet.has(localInv.id)) {
      continue;
    }

    const existsOnCloud = cloudById.has(localInv.id);
    if (!existsOnCloud) {
      if (params.allowInitialSeed || unsyncedCreateSet.has(localInv.id)) {
        toCreateOnCloud.push(localInv);
        mergedById.set(localInv.id, localInv);
      }
    } else if (unsyncedUpdateSet.has(localInv.id)) {
      toUpdateOnCloud.push(localInv);
      mergedById.set(localInv.id, localInv);
    }
  }

  const mergedInvoices = Array.from(mergedById.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    mergedInvoices,
    toCreateOnCloud,
    toUpdateOnCloud,
    syncedCreateIdsToClear: toCreateOnCloud.map((i) => i.id),
    syncedUpdateIdsToClear: toUpdateOnCloud.map((i) => i.id),
  };
}

export interface MergeCustomersParams {
  localCustomers: Customer[];
  cloudCustomers: Customer[];
  unsyncedCustomerIds: string[];
  deletedCustomerIds: string[];
  allowInitialSeed: boolean;
}

export interface MergeCustomersResult {
  mergedCustomers: Customer[];
  toUpsertOnCloud: Customer[];
}

export function mergeCustomersOnCloudConnect(
  params: MergeCustomersParams
): MergeCustomersResult {
  const delSet = new Set(params.deletedCustomerIds);
  const unsyncedSet = new Set(params.unsyncedCustomerIds);

  const mergedById = new Map<string, Customer>();
  const cloudIds = new Set<string>();

  for (const c of params.cloudCustomers) {
    if (!delSet.has(c.id)) {
      cloudIds.add(c.id);
      mergedById.set(c.id, c);
    }
  }

  const toUpsertOnCloud: Customer[] = [];

  for (const localCust of params.localCustomers) {
    if (delSet.has(localCust.id)) continue;
    const existsOnCloud = cloudIds.has(localCust.id);
    if (
      (!existsOnCloud && (params.allowInitialSeed || unsyncedSet.has(localCust.id))) ||
      (existsOnCloud && unsyncedSet.has(localCust.id))
    ) {
      toUpsertOnCloud.push(localCust);
      mergedById.set(localCust.id, localCust);
    }
  }

  return {
    mergedCustomers: Array.from(mergedById.values()),
    toUpsertOnCloud,
  };
}

export function formatFirebaseAuthErrorVi(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const msg = err instanceof Error ? err.message : String(err || '');

  if (code === 'auth/popup-blocked') {
    return 'Trình duyệt hoặc khung xem trước đang chặn cửa sổ đăng nhập Google. Vui lòng bấm cho phép Popup hoặc mở ứng dụng ở tab trình duyệt mới rồi bấm Kết nối Google.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất. Bấm "Kết nối Google" để thử lại.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Tên miền hiện tại chưa được cấp quyền Google Sign-In trong Firebase Authentication (Authorized domains).';
  }
  if (code === 'auth/network-request-failed') {
    return 'Không có kết nối mạng để xác thực Google. Vui lòng kiểm tra Wi-Fi / 4G rồi thử lại.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Nhà cung cấp Google Sign-In chưa được bật trong Firebase Authentication.';
  }
  if (msg) {
    return `Không thể kết nối Google Cloud (${code || 'lỗi xác thực'}). Bạn có thể mở app ở tab mới và thử lại.`;
  }
  return 'Đăng nhập Google chưa hoàn tất. Bạn có thể thử lại hoặc tiếp tục lưu tạm trên máy này.';
}

export function countPendingSyncItems(params: {
  unsyncedCreateInvoiceIds: string[];
  unsyncedUpdateInvoiceIds: string[];
  unsyncedCustomerIds: string[];
  hasPendingSettings: boolean;
}): {
  pendingInvoicesCount: number;
  pendingCustomersCount: number;
  totalPendingCount: number;
} {
  const uniqueInvoiceIds = new Set([
    ...params.unsyncedCreateInvoiceIds,
    ...params.unsyncedUpdateInvoiceIds,
  ]);
  const pendingInvoicesCount = uniqueInvoiceIds.size;
  const pendingCustomersCount = new Set(params.unsyncedCustomerIds).size;
  const totalPendingCount =
    pendingInvoicesCount + pendingCustomersCount + (params.hasPendingSettings ? 1 : 0);

  return {
    pendingInvoicesCount,
    pendingCustomersCount,
    totalPendingCount,
  };
}
