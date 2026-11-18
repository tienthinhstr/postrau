import React, { useMemo, useState } from 'react';
import {
  Download,
  CheckCircle2,
  ArrowRight,
  Calendar,
  Scale,
  Banknote,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { Invoice } from '../types/pos';
import {
  computeDailyRevenueReport,
  formatQuantity,
  formatVND,
  toLocalYYYYMMDD,
} from '../utils/calculations';
import { CATEGORY_LABELS } from '../data/seedData';

interface RevenueReportViewProps {
  invoices: Invoice[];
  onSettleCustomerDebt: (customerId: string) => void;
  onDeleteCustomerDebt?: (customerId: string) => void;
  onDeleteAllDebtInvoices?: () => void;
  onNavigateToUnpaidInvoices: () => void;
}

export const RevenueReportView: React.FC<RevenueReportViewProps> = ({
  invoices,
  onSettleCustomerDebt,
  onDeleteCustomerDebt,
  onDeleteAllDebtInvoices,
  onNavigateToUnpaidInvoices,
}) => {
  const todayStr = toLocalYYYYMMDD();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [scopeMode, setScopeMode] = useState<'today' | 'all'>('today');

  const report = useMemo(() => {
    return computeDailyRevenueReport(
      invoices,
      scopeMode === 'today' ? selectedDate : undefined
    );
  }, [invoices, selectedDate, scopeMode]);

  const collectionRate =
    report.totalRevenue > 0
      ? Math.round((report.collectedAmount / report.totalRevenue) * 100)
      : 100;

  const maxShiftRevenue = useMemo(() => {
    const m = Math.max(...report.byShiftBreakdown.map((s) => s.revenue), 1);
    return m;
  }, [report.byShiftBreakdown]);

  const handleExportCsv = () => {
    const headers = [
      'Mã Hóa Đơn',
      'Thời Gian',
      'Khách Hàng',
      'Số Điện Thoại',
      'Chi Tiết Rau & Đơn Vị',
      'Tổng Tiền (VND)',
      'Đã Thu (VND)',
      'Còn Nợ (VND)',
      'Trạng Thái',
      'Hình Thức',
    ];
    const rows = invoices.map((inv) => {
      const itemsStr = inv.items
        .map((i) => `${i.productName} (${i.netQuantity} ${i.unitLabel})`)
        .join('; ');
      const statusVi =
        inv.paymentStatus === 'paid'
          ? 'Đã thanh toán'
          : inv.paymentStatus === 'partial'
          ? 'Trả 1 phần'
          : 'Chưa thanh toán';
      return [
        inv.code,
        inv.createdAt,
        `"${inv.customerName}"`,
        inv.customerPhone,
        `"${itemsStr}"`,
        inv.totalAmount,
        inv.paidAmount,
        inv.remainingAmount,
        statusVi,
        inv.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt',
      ].join(',');
    });

    const csvContent = `\uFEFF${headers.join(',')}\n${rows.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-doanh-thu-vua-rau-${selectedDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar: Date Filter & Export CSV */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Báo Cáo Doanh Thu Hàng Ngày (Thời Gian Thực)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tự động tổng hợp doanh thu, tiền mặt, chuyển khoản, công nợ và sản lượng theo từng đơn vị
            tính
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 bg-stone-100 border border-slate-200 rounded-xl">
            <button
              type="button"
              onClick={() => setScopeMode('today')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                scopeMode === 'today'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Theo ngày
            </button>
            <button
              type="button"
              onClick={() => setScopeMode('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                scopeMode === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Toàn bộ kỳ
            </button>
          </div>

          {scopeMode === 'today' && (
            <div className="relative flex items-center">
              <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
              <input
                type="date"
                aria-label="Chọn ngày xem báo cáo doanh thu"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="min-h-[40px] pl-8 pr-3 py-1.5 text-xs font-mono font-semibold bg-stone-50 border border-slate-200 rounded-xl text-slate-900"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[40px] px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất Excel / CSV
          </button>
        </div>
      </div>

      {/* 4 Primary Real-Time KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">Tổng Doanh Thu Phát Sinh</span>
            <p
              data-testid="report-total-revenue"
              className="font-mono text-2xl font-extrabold text-slate-900 mt-1.5 tabular-nums"
            >
              {formatVND(report.totalRevenue)}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 tabular-nums">
            <span>Tổng số đơn: {report.totalInvoices} phiếu</span>
            <span className="font-semibold text-emerald-700">
              {report.paidInvoicesCount} đơn thu đủ
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Thực Thu Đã Nhận Về</span>
              <span className="font-mono text-xs font-bold text-emerald-700 tabular-nums">
                Đạt {collectionRate}%
              </span>
            </div>
            <p
              data-testid="report-collected-amount"
              className="font-mono text-2xl font-extrabold text-emerald-700 mt-1.5 tabular-nums"
            >
              {formatVND(report.collectedAmount)}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 tabular-nums">
            <span className="flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5 text-slate-400" />
              TM: {formatVND(report.cashCollected)}
            </span>
            <span>CK: {formatVND(report.transferCollected)}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">
              Còn Nợ Chưa Thanh Toán
            </span>
            <p
              data-testid="report-unpaid-amount"
              className="font-mono text-2xl font-extrabold text-rose-600 mt-1.5 tabular-nums"
            >
              {formatVND(report.unpaidAmount)}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-600 tabular-nums">
              {report.unpaidInvoicesCount + report.partialInvoicesCount} phiếu còn nợ
            </span>
            {report.unpaidAmount > 0 && (
              <button
                type="button"
                onClick={onNavigateToUnpaidInvoices}
                className="font-bold text-rose-700 hover:underline flex items-center gap-0.5"
              >
                Thu nợ <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">
              Tổng Sản Lượng Rau Xuất Bán
            </span>
            <p className="font-mono text-2xl font-extrabold text-slate-900 mt-1.5 tabular-nums">
              ~{formatQuantity(report.totalEstimatedKg)} kg
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 tabular-nums">
            <span className="flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-slate-400" />
              Quy đổi từ {report.byUnitBreakdown.length} loại ĐVT
            </span>
          </div>
        </div>
      </div>

      {/* Middle Split: Doanh Thu Theo Ca Chợ & Thống Kê Đa Đơn Vị Tính (Kg, Giỏ, Bịch, Bó) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 cols: Market Shift Revenue Breakdown */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                01. Biểu Đồ Doanh Thu Theo Ca Chợ Trong Ngày
              </h3>
              <p className="text-xs text-slate-500">
                Phân bổ doanh thu và thực thu theo 4 khung giờ hoạt động của vựa rau
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {report.byShiftBreakdown.map((shift) => {
              const barPct = Math.round((shift.revenue / maxShiftRevenue) * 100);
              const collectedPct =
                shift.revenue > 0 ? Math.round((shift.collected / shift.revenue) * 100) : 0;

              return (
                <div key={shift.shiftId} className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{shift.shiftLabel}</span>
                      <span className="text-slate-500 ml-1.5 font-mono">({shift.timeRange})</span>
                      <span className="text-slate-500 ml-1.5">· {shift.invoiceCount} đơn</span>
                    </div>
                    <div className="font-mono tabular-nums">
                      <strong className="text-slate-900">{formatVND(shift.revenue)}</strong>
                      {shift.unpaid > 0 && (
                        <span className="text-rose-600 ml-2">
                          (Nợ: {formatVND(shift.unpaid)})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bar visualization */}
                  <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-600 transition-all duration-300"
                      style={{ width: `${(barPct * collectedPct) / 100}%` }}
                      title={`Đã thu: ${formatVND(shift.collected)}`}
                    />
                    <div
                      className="h-full bg-rose-400 transition-all duration-300"
                      style={{ width: `${(barPct * (100 - collectedPct)) / 100}%` }}
                      title={`Còn nợ: ${formatVND(shift.unpaid)}`}
                    />
                  </div>
                </div>
              );
            })}

            <div className="flex items-center gap-6 pt-2 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block" />
                Đã thanh toán (Thực thu)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-rose-400 inline-block" />
                Chưa thanh toán (Ghi nợ)
              </span>
            </div>
          </div>
        </div>

        {/* Right 5 cols: Multi-Unit Sales Breakdown (Kg, Giỏ 20kg, Bịch 5kg, Bó...) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              02. Doanh Thu Theo Đơn Vị Tính (ĐVT)
            </h3>
            <p className="text-xs text-slate-500">
              Thống kê số lượng Giỏ, Bịch, Thùng, Bó và Kg đã xuất bán
            </p>
          </div>

          {report.byUnitBreakdown.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Chưa có dữ liệu đơn vị tính trong ngày này.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-2 font-semibold">Đơn vị tính</th>
                    <th className="py-2 px-2 font-semibold text-right">Tổng SL xuất</th>
                    <th className="py-2 pl-2 font-semibold text-right">Doanh thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {report.byUnitBreakdown.map((u) => (
                    <tr key={u.unitLabel} className="hover:bg-stone-50">
                      <td className="py-2.5 pr-2 font-bold text-slate-900">{u.unitLabel}</td>
                      <td className="py-2.5 px-2 text-right text-slate-700 tabular-nums">
                        <strong className="font-mono">{formatQuantity(u.totalQuantity)}</strong> ({u.lineCount} lượt)
                      </td>
                      <td className="py-2.5 pl-2 text-right font-mono font-bold text-emerald-800">
                        {formatVND(u.totalRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Split: Top Vegetables Sold & Customer Receivables (Công Nợ Mối Sỉ) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top Products Sold Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              03. Chi Tiết Doanh Thu Theo Mặt Hàng Rau Cải
            </h3>
            <p className="text-xs text-slate-500">
              Xếp hạng các loại rau cải bán chạy nhất cùng chi tiết đa đơn vị
            </p>
          </div>

          {report.byProductBreakdown.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              Chưa có mặt hàng nào xuất bán trong ngày đã chọn.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-2 font-semibold">Mặt hàng rau</th>
                    <th className="py-2 px-2 font-semibold">Chi tiết ĐVT đã bán</th>
                    <th className="py-2 px-2 font-semibold text-right">Quy đổi Kg</th>
                    <th className="py-2 pl-2 font-semibold text-right">Doanh thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {report.byProductBreakdown.map((prod, idx) => (
                    <tr key={prod.productId} className="hover:bg-stone-50">
                      <td className="py-2.5 pr-2">
                        <span className="font-bold text-slate-900 block">
                          {idx + 1}. {prod.productName}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {CATEGORY_LABELS[prod.category]} · {prod.orderCount} đơn
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-medium text-slate-700">
                        {prod.unitBreakdownText}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                        ~{formatQuantity(prod.totalEstimatedKg)} kg
                      </td>
                      <td className="py-2.5 pl-2 text-right font-mono font-bold text-slate-900">
                        {formatVND(prod.totalRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Customer Debt List with 1-Tap Settlement & Debt Deletion */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                04. Sổ Công Nợ Mối Sỉ Cần Thu
              </h3>
              <p className="text-xs text-slate-500">
                Danh sách khách hàng còn hóa đơn chưa thanh toán đủ
              </p>
            </div>

            {report.customerDebtList.length > 0 && onDeleteAllDebtInvoices && (
              <button
                type="button"
                data-testid="btn-delete-all-debt"
                onClick={onDeleteAllDebtInvoices}
                className="min-h-[36px] px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                Xóa hết dư nợ
              </button>
            )}
          </div>

          {report.customerDebtList.length === 0 ? (
            <div className="py-8 text-center bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-emerald-950">
                Tuyệt vời! Tất cả hóa đơn đã được thanh toán đủ 100%
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Không có mối sỉ hay khách hàng nào còn tồn nợ.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {report.customerDebtList.map((debt) => (
                <div
                  key={debt.customerId}
                  className="p-3.5 bg-stone-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <h4 className="text-sm font-bold text-slate-900">{debt.customerName}</h4>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {debt.customerPhone ? `${debt.customerPhone} · ` : ''}
                      {debt.customerAddress}
                    </p>
                    <p className="text-xs text-rose-700 font-mono font-bold mt-1 tabular-nums">
                      Còn nợ: {formatVND(debt.totalDebtAmount)} ({debt.unpaidInvoiceCount} đơn)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSettleCustomerDebt(debt.customerId)}
                      className="min-h-[40px] px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                    >
                      Tất toán hết nợ
                    </button>

                    {onDeleteCustomerDebt && (
                      <button
                        type="button"
                        onClick={() => onDeleteCustomerDebt(debt.customerId)}
                        title={`Xóa các hóa đơn nợ của ${debt.customerName}`}
                        className="min-h-[40px] px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        Xóa nợ
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
