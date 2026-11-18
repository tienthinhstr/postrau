import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateInvoiceTotals,
  calculateLineItem,
  computeDailyRevenueReport,
  formatCurrencyInputWithDots,
  numberToVietnameseWords,
  parseCurrencyInputWithDots,
  settleInvoicePayment,
  toggleInvoicePaidStatus,
} from './calculations';
import { Invoice } from '../types/pos';
import { formatThermalReceiptText } from './escpos';
import { buildA5PdfFromJpegDataUrl } from './a5Export';
import {
  determineInitialRoleForEmail,
  evaluateSavedSession,
  getPermissionsForRole,
  normalizeAccountIdentifier,
  SESSION_MAX_INACTIVE_MS,
} from './rbac';

test('RBAC role permissions and 3-day session expiration work accurately', () => {
  assert.equal(determineInitialRoleForEmail('tienthinhstr@gmail.com'), 'admin');
  assert.equal(determineInitialRoleForEmail('admin'), 'admin');
  assert.equal(determineInitialRoleForEmail('staff@vuarau.vn'), 'sales');

  const normUser = normalizeAccountIdentifier('nhanvien1');
  assert.equal(normUser.email, 'nhanvien1@vuarau.vn');
  assert.equal(normUser.username, 'nhanvien1');
  assert.equal(normUser.docId, 'acct-nhanvien1-vuarau-vn');

  // 1. First visit (no saved session) -> must require login
  const firstVisit = evaluateSavedSession(null, 1000000);
  assert.equal(firstVisit.profile, null);
  assert.equal(firstVisit.expired, false);

  // 2. Within 3 days -> automatically keeps user logged in
  const now = 1_700_000_000_000;
  const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
  const validRaw = JSON.stringify({
    profile: {
      uid: 'acct-admin',
      email: 'tienthinhstr@gmail.com',
      displayName: 'Chủ Vựa Rau (Admin)',
      role: 'admin',
      workspaceId: 'vua-rau-thanh-dat',
    },
    lastActiveAt: twoDaysAgo,
  });
  const activeSession = evaluateSavedSession(validRaw, now);
  assert.equal(activeSession.expired, false);
  assert.equal(activeSession.profile?.uid, 'acct-admin');

  // 3. Over 3 days inactive -> expires session and requires re-login
  const fourDaysAgo = now - (SESSION_MAX_INACTIVE_MS + 1000);
  const expiredRaw = JSON.stringify({
    profile: {
      uid: 'acct-admin',
      email: 'tienthinhstr@gmail.com',
      displayName: 'Chủ Vựa Rau (Admin)',
      role: 'admin',
      workspaceId: 'vua-rau-thanh-dat',
    },
    lastActiveAt: fourDaysAgo,
  });
  const expiredSession = evaluateSavedSession(expiredRaw, now);
  assert.equal(expiredSession.profile, null);
  assert.equal(expiredSession.expired, true);

  const adminPerms = getPermissionsForRole('admin');
  assert.equal(adminPerms.canManageRoles, true);
  assert.equal(adminPerms.canSettlePayment, true);
  assert.equal(adminPerms.canViewRevenueReport, true);
  assert.equal(adminPerms.canDeleteInvoice, true);

  const cashierPerms = getPermissionsForRole('cashier');
  assert.equal(cashierPerms.canManageRoles, false);
  assert.equal(cashierPerms.canSettlePayment, true);
  assert.equal(cashierPerms.canViewRevenueReport, true);
  assert.equal(cashierPerms.canDeleteInvoice, true);

  const salesPerms = getPermissionsForRole('sales');
  assert.equal(salesPerms.canCreateInvoice, true);
  assert.equal(salesPerms.canSettlePayment, false);
  assert.equal(salesPerms.canViewRevenueReport, false);
  assert.equal(salesPerms.canDeleteInvoice, false);
  assert.equal(salesPerms.canManageRoles, false);
});

test('formatCurrencyInputWithDots and parseCurrencyInputWithDots handle Vietnamese dot separators', () => {
  assert.equal(formatCurrencyInputWithDots('7000'), '7.000');
  assert.equal(formatCurrencyInputWithDots('45000'), '45.000');
  assert.equal(formatCurrencyInputWithDots('270000'), '270.000');
  assert.equal(formatCurrencyInputWithDots('1.450.000'), '1.450.000');
  assert.equal(formatCurrencyInputWithDots(''), '');

  assert.equal(parseCurrencyInputWithDots('7.000'), 7000);
  assert.equal(parseCurrencyInputWithDots('45.000'), 45000);
  assert.equal(parseCurrencyInputWithDots('270.000'), 270000);
  assert.equal(parseCurrencyInputWithDots(''), 0);
});

test('buildA5PdfFromJpegDataUrl creates a valid PDF-1.4 binary with A5 portrait MediaBox', () => {
  const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const pdfBytes = buildA5PdfFromJpegDataUrl(sampleDataUrl, 1480, 2100);
  const text = new TextDecoder().decode(pdfBytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes('/MediaBox [0 0 419.53 595.28]'));
  assert.ok(text.endsWith('%%EOF'));
});

test('numberToVietnameseWords converts invoice totals accurately into Vietnamese text', () => {
  assert.equal(numberToVietnameseWords(0), 'Không đồng');
  assert.equal(
    numberToVietnameseWords(765000),
    'Bảy trăm sáu mươi lăm nghìn đồng chẵn'
  );
  assert.equal(
    numberToVietnameseWords(1400000),
    'Một triệu bốn trăm nghìn đồng chẵn'
  );
});

test('calculateLineItem handles multi-unit quantities and tare weight (trừ bì) accurately', () => {
  // 1. Selling by Kg with tare weight (e.g., 21.5 kg gross - 1.5 kg basket tare = 20 kg net)
  const kgWithTare = calculateLineItem({
    grossQuantity: 21.5,
    tareWeight: 1.5,
    unitPrice: 15000,
  });
  assert.equal(kgWithTare.netQuantity, 20);
  assert.equal(kgWithTare.lineTotal, 300000);

  // 2. Selling by Giỏ 20kg without tare
  const crateItem = calculateLineItem({
    grossQuantity: 3,
    tareWeight: 0,
    unitPrice: 280000,
  });
  assert.equal(crateItem.netQuantity, 3);
  assert.equal(crateItem.lineTotal, 840000);

  // 3. Selling decimal kg (12.5 kg * 18,000đ = 225,000đ)
  const decimalKg = calculateLineItem({
    grossQuantity: 12.5,
    unitPrice: 18000,
  });
  assert.equal(decimalKg.netQuantity, 12.5);
  assert.equal(decimalKg.lineTotal, 225000);
});

test('calculateInvoiceTotals determines paid, partial, and unpaid statuses correctly', () => {
  const items = [{ lineTotal: 300000 }, { lineTotal: 250000 }];

  // Unpaid (Ghi nợ)
  const unpaid = calculateInvoiceTotals({
    items,
    discountAmount: 10000,
    crateDepositAmount: 40000,
    paidAmount: 0,
  });
  assert.equal(unpaid.subtotal, 550000);
  assert.equal(unpaid.totalAmount, 580000);
  assert.equal(unpaid.remainingAmount, 580000);
  assert.equal(unpaid.paymentStatus, 'unpaid');

  // Partial payment (Khách trả trước 200k, còn nợ 380k)
  const partial = calculateInvoiceTotals({
    items,
    discountAmount: 10000,
    crateDepositAmount: 40000,
    paidAmount: 200000,
  });
  assert.equal(partial.paidAmount, 200000);
  assert.equal(partial.remainingAmount, 380000);
  assert.equal(partial.paymentStatus, 'partial');

  // Fully paid
  const paid = calculateInvoiceTotals({
    items,
    discountAmount: 10000,
    crateDepositAmount: 40000,
    paidAmount: 580000,
  });
  assert.equal(paid.paidAmount, 580000);
  assert.equal(paid.remainingAmount, 0);
  assert.equal(paid.paymentStatus, 'paid');
});

test('settleInvoicePayment and toggleInvoicePaidStatus update debt and payment history', () => {
  const sampleInvoice: Invoice = {
    id: 'inv-1',
    code: 'HD-1111-001',
    createdAt: '2026-11-11T06:30:00.000Z',
    customerId: 'cust-1',
    customerName: 'Chị Tư - Sạp Rau B12',
    customerPhone: '0909123456',
    customerAddress: 'Chợ Bình Điền',
    customerType: 'moi_si',
    items: [
      {
        id: 'line-1',
        productId: 'prod-1',
        productName: 'Cải ngọt Đà Lạt',
        category: 'rau_cai',
        unitCode: 'gio_20kg',
        unitLabel: 'Giỏ 20kg',
        grossQuantity: 2,
        tareWeight: 0,
        netQuantity: 2,
        unitPrice: 280000,
        estimatedKgPerUnit: 20,
        lineTotal: 560000,
      },
    ],
    subtotal: 560000,
    discountAmount: 0,
    crateDepositAmount: 0,
    totalAmount: 560000,
    paidAmount: 0,
    remainingAmount: 560000,
    paymentStatus: 'unpaid',
    paymentMethod: 'cash',
    payments: [],
    printedCount: 1,
  };

  // Partial payment of 260,000đ via transfer
  const afterPartial = settleInvoicePayment(
    sampleInvoice,
    260000,
    'transfer',
    'Chuyển khoản cọc trước',
    '2026-11-11T07:00:00.000Z'
  );
  assert.equal(afterPartial.paymentStatus, 'partial');
  assert.equal(afterPartial.paidAmount, 260000);
  assert.equal(afterPartial.remainingAmount, 300000);
  assert.equal(afterPartial.payments.length, 1);

  // Full settlement via toggleInvoicePaidStatus
  const afterFull = toggleInvoicePaidStatus(afterPartial, 'cash', '2026-11-11T08:00:00.000Z');
  assert.equal(afterFull.paymentStatus, 'paid');
  assert.equal(afterFull.paidAmount, 560000);
  assert.equal(afterFull.remainingAmount, 0);
  assert.equal(afterFull.payments.length, 2);
});

test('computeDailyRevenueReport aggregates multi-unit sales, shifts, and debt accurately', () => {
  const dateStr = '2026-11-11';
  const invoices: Invoice[] = [
    {
      id: 'inv-1',
      code: 'HD-001',
      createdAt: `${dateStr}T04:15:00`,
      customerId: 'c1',
      customerName: 'Chị Lan Sạp A4',
      customerPhone: '0901112222',
      customerAddress: 'Chợ Đầu Mối',
      customerType: 'moi_si',
      items: [
        {
          id: 'i1',
          productId: 'p1',
          productName: 'Cải thìa Đà Lạt',
          category: 'rau_cai',
          unitCode: 'gio_20kg',
          unitLabel: 'Giỏ 20kg',
          grossQuantity: 2,
          tareWeight: 0,
          netQuantity: 2,
          unitPrice: 300000,
          estimatedKgPerUnit: 20,
          lineTotal: 600000,
        },
        {
          id: 'i2',
          productId: 'p2',
          productName: 'Cải bẹ xanh',
          category: 'rau_cai',
          unitCode: 'bich_5kg',
          unitLabel: 'Bịch 5kg',
          grossQuantity: 4,
          tareWeight: 0,
          netQuantity: 4,
          unitPrice: 70000,
          estimatedKgPerUnit: 5,
          lineTotal: 280000,
        },
      ],
      subtotal: 880000,
      discountAmount: 0,
      crateDepositAmount: 0,
      totalAmount: 880000,
      paidAmount: 880000,
      remainingAmount: 0,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
      payments: [{ id: 'p-1', amount: 880000, method: 'cash', timestamp: `${dateStr}T04:16:00` }],
      printedCount: 1,
    },
    {
      id: 'inv-2',
      code: 'HD-002',
      createdAt: `${dateStr}T08:30:00`,
      customerId: 'c2',
      customerName: 'Quán Lẩu Nấm Xanh',
      customerPhone: '0903334444',
      customerAddress: 'Quận 5',
      customerType: 'nha_hang',
      items: [
        {
          id: 'i3',
          productId: 'p1',
          productName: 'Cải thìa Đà Lạt',
          category: 'rau_cai',
          unitCode: 'kg',
          unitLabel: 'Kg',
          grossQuantity: 10,
          tareWeight: 0,
          netQuantity: 10,
          unitPrice: 17000,
          estimatedKgPerUnit: 1,
          lineTotal: 170000,
        },
      ],
      subtotal: 170000,
      discountAmount: 0,
      crateDepositAmount: 0,
      totalAmount: 170000,
      paidAmount: 0,
      remainingAmount: 170000,
      paymentStatus: 'unpaid',
      paymentMethod: 'transfer',
      payments: [],
      printedCount: 0,
    },
  ];

  const report = computeDailyRevenueReport(invoices, dateStr);
  assert.equal(report.totalRevenue, 1050000);
  assert.equal(report.collectedAmount, 880000);
  assert.equal(report.unpaidAmount, 170000);
  assert.equal(report.totalInvoices, 2);
  assert.equal(report.paidInvoicesCount, 1);
  assert.equal(report.unpaidInvoicesCount, 1);
  // Total estimated kg: 2*20 + 4*5 + 10*1 = 70 kg
  assert.equal(report.totalEstimatedKg, 70);
  assert.equal(report.byUnitBreakdown.length, 3);
  assert.equal(report.customerDebtList.length, 1);
  assert.equal(report.customerDebtList[0].customerName, 'Quán Lẩu Nấm Xanh');
  assert.equal(report.customerDebtList[0].totalDebtAmount, 170000);

  // Verify thermal receipt text formatter works cleanly for 58mm
  const receiptText = formatThermalReceiptText(
    invoices[0],
    {
      storeName: 'Vựa Rau Cải Thành Đạt',
      tagline: 'Chuyên sỉ lẻ rau củ Đà Lạt',
      address: 'Ô B18 Chợ Đầu Mối Bình Điền',
      phone: '0908.777.888',
      bankName: 'Vietcombank',
      bankAccountNo: '0071001234567',
      bankAccountHolder: 'NGUYEN THANH DAT',
      defaultPaperWidth: '58mm',
      autoOpenPrintAfterCreate: true,
      footerMessage: 'Cảm ơn quý khách!',
    },
    '58mm',
    false
  );
  assert.ok(receiptText.includes('HD-001'));
  assert.ok(receiptText.includes('880.000d'));
});
