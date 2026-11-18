export type UnitCode = 'kg' | 'bo' | 'bich_5kg' | 'bich_10kg' | 'gio_20kg' | 'thung' | 'bap';

export interface UnitOption {
  unitCode: UnitCode;
  unitLabel: string;
  price: number; // VND per unit
  estimatedKg: number; // Estimated weight in kg per 1 unit for volume reporting
  allowTare?: boolean; // Whether tare weight (trừ bì) is commonly used
}

export type VegetableCategory = 'rau_cai' | 'rau_la' | 'cu_qua' | 'gia_vi';

export interface Product {
  id: string;
  code: string;
  name: string;
  category: VegetableCategory;
  origin: string; // e.g., "Đà Lạt", "Củ Chi", "Đơn Dương", "Lâm Đồng"
  freshnessNote: string;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  units: UnitOption[];
}

export interface CustomerDebtPayment {
  id: string;
  amount: number;
  method: 'cash' | 'transfer';
  timestamp: string; // ISO string
  note?: string;
  settledInvoiceCodes?: string[];
  actorName?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  type: 'moi_si' | 'nha_hang' | 'khach_le';
  stallOrAddress: string; // e.g., "Sạp B12 - Chợ Bình Điền", "Quán Cơm Tấm Q.5"
  note?: string;
  initialDebt?: number; // Dư nợ ban đầu nếu có trước khi dùng hệ thống
  debtPayments?: CustomerDebtPayment[]; // Lịch sử các lần thu nợ / khách trả tiền nợ
  workspaceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceItem {
  id: string;
  productId: string;
  productName: string;
  category: VegetableCategory;
  unitCode: UnitCode;
  unitLabel: string;
  grossQuantity: number; // Cân nặng tổng hoặc số lượng
  tareWeight: number; // Trừ bì (kg) - mặc định 0
  netQuantity: number; // Số lượng thực tính tiền
  unitPrice: number; // Đơn giá (VND)
  estimatedKgPerUnit: number;
  lineTotal: number; // Thành tiền = round(netQuantity * unitPrice)
  note?: string;
}

export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
export type PaymentMethod = 'cash' | 'transfer';

export interface PaymentRecord {
  id: string;
  amount: number;
  method: PaymentMethod;
  timestamp: string; // ISO string
  note?: string;
}

export type UserRole = 'admin' | 'cashier' | 'sales';

export interface StaffUserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  workspaceId: string;
  createdAtIso?: string;
  updatedAtIso?: string;
  plainPassword?: string;
}

export interface Invoice {
  id: string;
  code: string; // e.g., "HD-1111-001"
  createdAt: string; // ISO string
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerType: Customer['type'];
  items: InvoiceItem[];
  subtotal: number; // Tổng tiền hàng
  discountAmount: number; // Giảm giá / Bớt lẻ
  crateDepositAmount: number; // Tiền cọc giỏ / sọt nhựa
  totalAmount: number; // Tổng cộng hóa đơn này = subtotal - discount + crateDeposit
  paidAmount: number; // Số tiền đã thanh toán
  remainingAmount: number; // Số tiền còn nợ = max(0, totalAmount - paidAmount)
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  payments: PaymentRecord[];
  note?: string;
  printedCount: number;
  createdByUid?: string;
  createdByName?: string;
}

export interface UnitSalesSummary {
  unitLabel: string;
  totalQuantity: number;
  totalRevenue: number;
  lineCount: number;
}

export interface ProductSalesSummary {
  productId: string;
  productName: string;
  category: VegetableCategory;
  totalRevenue: number;
  totalEstimatedKg: number;
  unitBreakdownText: string;
  orderCount: number;
}

export interface ShiftSalesSummary {
  shiftId: 'night' | 'morning' | 'afternoon' | 'evening';
  shiftLabel: string;
  timeRange: string;
  revenue: number;
  collected: number;
  unpaid: number;
  invoiceCount: number;
}

export interface CustomerDebtSummary {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  unpaidInvoiceCount: number;
  totalPurchasedToday: number;
  totalDebtAmount: number;
}

export interface DailyRevenueReport {
  dateStr: string;
  totalRevenue: number;
  collectedAmount: number;
  cashCollected: number;
  transferCollected: number;
  unpaidAmount: number;
  totalInvoices: number;
  paidInvoicesCount: number;
  partialInvoicesCount: number;
  unpaidInvoicesCount: number;
  totalEstimatedKg: number;
  byUnitBreakdown: UnitSalesSummary[];
  byProductBreakdown: ProductSalesSummary[];
  byShiftBreakdown: ShiftSalesSummary[];
  customerDebtList: CustomerDebtSummary[];
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  address: string;
  phone: string;
  bankName: string;
  bankAccountNo: string;
  bankAccountHolder: string;
  defaultPaperWidth: '58mm' | '80mm';
  autoOpenPrintAfterCreate: boolean;
  footerMessage: string;
}
