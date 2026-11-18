import {
  CustomerDebtSummary,
  DailyRevenueReport,
  Invoice,
  InvoiceItem,
  PaymentMethod,
  PaymentStatus,
  ProductSalesSummary,
  ShiftSalesSummary,
  UnitSalesSummary,
} from '../types/pos';

/**
 * Formats a number as Vietnamese Dong (VND), e.g., 125.000đ
 */
export function formatVND(amount: number, showSymbol = true): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  const formatted = new Intl.NumberFormat('vi-VN').format(safe);
  return showSymbol ? `${formatted}đ` : formatted;
}

/**
 * Automatically inserts Vietnamese thousand-separator dots (.) into raw numeric input as the user types.
 * E.g. "7000" -> "7.000", "45000" -> "45.000", "270000" -> "270.000", "" -> ""
 */
export function formatCurrencyInputWithDots(rawInput: string | number): string {
  const digitsOnly = String(rawInput ?? '').replace(/\D/g, '');
  if (!digitsOnly) return '';
  const strippedLeadingZeros = digitsOnly.replace(/^0+(?=\d)/, '');
  return strippedLeadingZeros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Parses a Vietnamese dot-formatted currency string ("7.000", "45.000", "270.000") back into a number.
 */
export function parseCurrencyInputWithDots(formattedInput: string | number): number {
  if (typeof formattedInput === 'number') {
    return Number.isFinite(formattedInput) ? Math.max(0, Math.round(formattedInput)) : 0;
  }
  const digitsOnly = String(formattedInput ?? '').replace(/\D/g, '');
  if (!digitsOnly) return 0;
  const parsed = parseInt(digitsOnly, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Formats compact VND for tight badges/charts, e.g., 1,25tr or 450k
 */
export function formatCompactVND(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  if (Math.abs(safe) >= 1_000_000) {
    const millions = (safe / 1_000_000).toFixed(2).replace(/\.?0+$/, '');
    return `${millions.replace('.', ',')} tr`;
  }
  if (Math.abs(safe) >= 1_000) {
    return `${Math.round(safe / 1_000)}k`;
  }
  return `${safe}đ`;
}

/**
 * Formats quantity nicely (supports decimal kg like 12,5 or integer bunches like 10)
 */
export function formatQuantity(qty: number): string {
  if (!Number.isFinite(qty)) return '0';
  const rounded = Math.round(qty * 100) / 100;
  return rounded.toString().replace('.', ',');
}

const DIGITS_VI = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readThreeDigits(num: number, readZeroHundred: boolean): string {
  const hundred = Math.floor(num / 100);
  const ten = Math.floor((num % 100) / 10);
  const unit = num % 10;
  const parts: string[] = [];

  if (hundred > 0 || readZeroHundred) {
    parts.push(`${DIGITS_VI[hundred]} trăm`);
  }

  if (ten > 1) {
    parts.push(`${DIGITS_VI[ten]} mươi`);
    if (unit === 1) parts.push('mốt');
    else if (unit === 4) parts.push('tư');
    else if (unit === 5) parts.push('lăm');
    else if (unit > 0) parts.push(DIGITS_VI[unit]);
  } else if (ten === 1) {
    parts.push('mười');
    if (unit === 5) parts.push('lăm');
    else if (unit > 0) parts.push(DIGITS_VI[unit]);
  } else if (ten === 0 && unit > 0) {
    if (hundred > 0 || readZeroHundred) {
      parts.push('lẻ');
    }
    parts.push(DIGITS_VI[unit]);
  }

  return parts.join(' ');
}

/**
 * Converts a VND amount into Vietnamese words for "Cộng thành tiền (viết bằng chữ)"
 */
export function numberToVietnameseWords(amount: number): string {
  const clean = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  if (clean === 0) return 'Không đồng';

  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const groups: number[] = [];
  let temp = clean;
  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const grp = groups[i];
    if (grp > 0) {
      const readZeroHundred = i < groups.length - 1;
      const text = readThreeDigits(grp, readZeroHundred);
      const unitName = units[i] || '';
      parts.push(unitName ? `${text} ${unitName}` : text);
    }
  }

  const full = parts.join(' ').trim();
  const capitalized = full.charAt(0).toUpperCase() + full.slice(1);
  return `${capitalized} đồng chẵn`;
}

/**
 * Calculates net quantity and total price for a single invoice line item.
 */
export function calculateLineItem(params: {
  grossQuantity: number;
  tareWeight?: number;
  unitPrice: number;
}): { netQuantity: number; lineTotal: number } {
  const gross = Number.isFinite(params.grossQuantity) ? Math.max(0, params.grossQuantity) : 0;
  const tare = Number.isFinite(params.tareWeight) ? Math.max(0, params.tareWeight ?? 0) : 0;
  const price = Number.isFinite(params.unitPrice) ? Math.max(0, params.unitPrice) : 0;

  const netQuantity = Math.max(0, Math.round((gross - tare) * 100) / 100);
  const lineTotal = Math.round(netQuantity * price);

  return { netQuantity, lineTotal };
}

/**
 * Calculates invoice subtotal, total, remaining balance, and payment status.
 */
export function calculateInvoiceTotals(params: {
  items: Pick<InvoiceItem, 'lineTotal'>[];
  discountAmount?: number;
  crateDepositAmount?: number;
  paidAmount: number;
}): {
  subtotal: number;
  discountAmount: number;
  crateDepositAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
} {
  const subtotal = params.items.reduce((acc, item) => acc + Math.max(0, Math.round(item.lineTotal)), 0);
  const discountAmount = Math.max(0, Math.round(params.discountAmount ?? 0));
  const crateDepositAmount = Math.max(0, Math.round(params.crateDepositAmount ?? 0));
  const totalAmount = Math.max(0, subtotal - discountAmount + crateDepositAmount);

  // Clamp paidAmount between 0 and totalAmount
  const rawPaid = Number.isFinite(params.paidAmount) ? Math.max(0, Math.round(params.paidAmount)) : 0;
  const paidAmount = Math.min(rawPaid, totalAmount);
  const remainingAmount = Math.max(0, totalAmount - paidAmount);

  let paymentStatus: PaymentStatus = 'unpaid';
  if (totalAmount === 0 || remainingAmount === 0) {
    paymentStatus = 'paid';
  } else if (paidAmount > 0 && remainingAmount > 0) {
    paymentStatus = 'partial';
  } else {
    paymentStatus = 'unpaid';
  }

  return {
    subtotal,
    discountAmount,
    crateDepositAmount,
    totalAmount,
    paidAmount,
    remainingAmount,
    paymentStatus,
  };
}

/**
 * Records a new payment (full or partial settlement) on an existing invoice.
 */
export function settleInvoicePayment(
  invoice: Invoice,
  paymentAmount: number,
  method: PaymentMethod,
  note?: string,
  timestampIso: string = new Date().toISOString()
): Invoice {
  const cleanAmount = Math.max(0, Math.min(invoice.remainingAmount, Math.round(paymentAmount)));
  if (cleanAmount <= 0 && invoice.remainingAmount > 0) {
    return invoice;
  }

  const newPaidAmount = Math.min(invoice.totalAmount, invoice.paidAmount + cleanAmount);
  const totals = calculateInvoiceTotals({
    items: invoice.items,
    discountAmount: invoice.discountAmount,
    crateDepositAmount: invoice.crateDepositAmount,
    paidAmount: newPaidAmount,
  });

  const paymentRecord = {
    id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    amount: cleanAmount,
    method,
    timestamp: timestampIso,
    note: note || (totals.remainingAmount === 0 ? 'Tất toán đủ hóa đơn' : 'Thanh toán một phần'),
  };

  return {
    ...invoice,
    paidAmount: totals.paidAmount,
    remainingAmount: totals.remainingAmount,
    paymentStatus: totals.paymentStatus,
    paymentMethod: method,
    payments: [...invoice.payments, paymentRecord],
  };
}

/**
 * Toggles an invoice directly between Paid (100%) and Unpaid (0%) for quick 1-tap tracking.
 */
export function toggleInvoicePaidStatus(
  invoice: Invoice,
  method: PaymentMethod = invoice.paymentMethod || 'cash',
  timestampIso: string = new Date().toISOString()
): Invoice {
  if (invoice.paymentStatus === 'paid') {
    // Revert to unpaid
    return {
      ...invoice,
      paidAmount: 0,
      remainingAmount: invoice.totalAmount,
      paymentStatus: 'unpaid',
      payments: [],
    };
  }
  return settleInvoicePayment(
    invoice,
    invoice.remainingAmount,
    method,
    'Thu đủ 100% hóa đơn',
    timestampIso
  );
}

/**
 * Checks if an ISO date string falls on the target YYYY-MM-DD local date.
 */
export function isSameLocalDay(isoString: string, targetDateYYYYMMDD: string): boolean {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` === targetDateYYYYMMDD;
}

/**
 * Returns local YYYY-MM-DD for a Date object
 */
export function toLocalYYYYMMDD(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes real-time daily revenue, payment tracking, shift breakdown,
 * multi-unit breakdown, top products, and customer debt report.
 */
export function computeDailyRevenueReport(
  allInvoices: Invoice[],
  targetDateYYYYMMDD?: string
): DailyRevenueReport {
  const dayInvoices = targetDateYYYYMMDD
    ? allInvoices.filter((inv) => isSameLocalDay(inv.createdAt, targetDateYYYYMMDD))
    : allInvoices;

  let totalRevenue = 0;
  let collectedAmount = 0;
  let cashCollected = 0;
  let transferCollected = 0;
  let unpaidAmount = 0;
  let paidInvoicesCount = 0;
  let partialInvoicesCount = 0;
  let unpaidInvoicesCount = 0;
  let totalEstimatedKg = 0;

  const unitMap = new Map<string, UnitSalesSummary>();
  const productMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      category: InvoiceItem['category'];
      totalRevenue: number;
      totalEstimatedKg: number;
      unitsMap: Map<string, number>;
      orderIds: Set<string>;
    }
  >();

  const shifts: Record<'night' | 'morning' | 'afternoon' | 'evening', ShiftSalesSummary> = {
    night: {
      shiftId: 'night',
      shiftLabel: 'Ca Chợ Đêm',
      timeRange: '00:00 – 05:59',
      revenue: 0,
      collected: 0,
      unpaid: 0,
      invoiceCount: 0,
    },
    morning: {
      shiftId: 'morning',
      shiftLabel: 'Ca Sáng Sớm',
      timeRange: '06:00 – 10:59',
      revenue: 0,
      collected: 0,
      unpaid: 0,
      invoiceCount: 0,
    },
    afternoon: {
      shiftId: 'afternoon',
      shiftLabel: 'Ca Trưa & Chiều',
      timeRange: '11:00 – 16:59',
      revenue: 0,
      collected: 0,
      unpaid: 0,
      invoiceCount: 0,
    },
    evening: {
      shiftId: 'evening',
      shiftLabel: 'Ca Tối',
      timeRange: '17:00 – 23:59',
      revenue: 0,
      collected: 0,
      unpaid: 0,
      invoiceCount: 0,
    },
  };

  for (const inv of dayInvoices) {
    totalRevenue += inv.totalAmount;
    collectedAmount += inv.paidAmount;
    unpaidAmount += inv.remainingAmount;

    if (inv.paymentStatus === 'paid') paidInvoicesCount += 1;
    else if (inv.paymentStatus === 'partial') partialInvoicesCount += 1;
    else unpaidInvoicesCount += 1;

    // Calculate cash vs transfer from payment records if available, else fallback to invoice.paymentMethod
    if (inv.payments && inv.payments.length > 0) {
      for (const p of inv.payments) {
        if (p.method === 'transfer') transferCollected += p.amount;
        else cashCollected += p.amount;
      }
    } else if (inv.paidAmount > 0) {
      if (inv.paymentMethod === 'transfer') transferCollected += inv.paidAmount;
      else cashCollected += inv.paidAmount;
    }

    // Shift classification based on hour
    const createdDate = new Date(inv.createdAt);
    const hour = Number.isNaN(createdDate.getTime()) ? 7 : createdDate.getHours();
    const shiftKey: 'night' | 'morning' | 'afternoon' | 'evening' =
      hour < 6 ? 'night' : hour < 11 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    shifts[shiftKey].revenue += inv.totalAmount;
    shifts[shiftKey].collected += inv.paidAmount;
    shifts[shiftKey].unpaid += inv.remainingAmount;
    shifts[shiftKey].invoiceCount += 1;

    // Aggregate items by unit and by product
    for (const item of inv.items) {
      const itemKg = Math.round(item.netQuantity * (item.estimatedKgPerUnit || 1) * 10) / 10;
      totalEstimatedKg += itemKg;

      const existingUnit = unitMap.get(item.unitLabel) ?? {
        unitLabel: item.unitLabel,
        totalQuantity: 0,
        totalRevenue: 0,
        lineCount: 0,
      };
      existingUnit.totalQuantity = Math.round((existingUnit.totalQuantity + item.netQuantity) * 100) / 100;
      existingUnit.totalRevenue += item.lineTotal;
      existingUnit.lineCount += 1;
      unitMap.set(item.unitLabel, existingUnit);

      const existingProd = productMap.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName,
        category: item.category,
        totalRevenue: 0,
        totalEstimatedKg: 0,
        unitsMap: new Map<string, number>(),
        orderIds: new Set<string>(),
      };
      existingProd.totalRevenue += item.lineTotal;
      existingProd.totalEstimatedKg = Math.round((existingProd.totalEstimatedKg + itemKg) * 10) / 10;
      const prevUnitQty = existingProd.unitsMap.get(item.unitLabel) ?? 0;
      existingProd.unitsMap.set(item.unitLabel, Math.round((prevUnitQty + item.netQuantity) * 100) / 100);
      existingProd.orderIds.add(inv.id);
      productMap.set(item.productId, existingProd);
    }
  }

  // Customer debt aggregation across all invoices (so wholesale owners never miss older or today's unpaid bills)
  const debtMap = new Map<string, CustomerDebtSummary>();
  for (const inv of allInvoices) {
    const isToday = targetDateYYYYMMDD ? isSameLocalDay(inv.createdAt, targetDateYYYYMMDD) : true;
    if (inv.remainingAmount > 0 || isToday) {
      const key = inv.customerId || inv.customerName;
      const existing = debtMap.get(key) ?? {
        customerId: inv.customerId,
        customerName: inv.customerName,
        customerPhone: inv.customerPhone,
        customerAddress: inv.customerAddress,
        unpaidInvoiceCount: 0,
        totalPurchasedToday: 0,
        totalDebtAmount: 0,
      };
      if (isToday) {
        existing.totalPurchasedToday += inv.totalAmount;
      }
      if (inv.remainingAmount > 0) {
        existing.unpaidInvoiceCount += 1;
        existing.totalDebtAmount += inv.remainingAmount;
      }
      debtMap.set(key, existing);
    }
  }

  const byUnitBreakdown = Array.from(unitMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const byProductBreakdown: ProductSalesSummary[] = Array.from(productMap.values())
    .map((p) => {
      const unitParts: string[] = [];
      p.unitsMap.forEach((qty, label) => {
        unitParts.push(`${formatQuantity(qty)} ${label}`);
      });
      return {
        productId: p.productId,
        productName: p.productName,
        category: p.category,
        totalRevenue: p.totalRevenue,
        totalEstimatedKg: p.totalEstimatedKg,
        unitBreakdownText: unitParts.join(' · '),
        orderCount: p.orderIds.size,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const customerDebtList = Array.from(debtMap.values())
    .filter((c) => c.totalDebtAmount > 0)
    .sort((a, b) => b.totalDebtAmount - a.totalDebtAmount);

  return {
    dateStr: targetDateYYYYMMDD || toLocalYYYYMMDD(),
    totalRevenue,
    collectedAmount,
    cashCollected,
    transferCollected,
    unpaidAmount,
    totalInvoices: dayInvoices.length,
    paidInvoicesCount,
    partialInvoicesCount,
    unpaidInvoicesCount,
    totalEstimatedKg: Math.round(totalEstimatedKg * 10) / 10,
    byUnitBreakdown,
    byProductBreakdown,
    byShiftBreakdown: [shifts.night, shifts.morning, shifts.afternoon, shifts.evening],
    customerDebtList,
  };
}
