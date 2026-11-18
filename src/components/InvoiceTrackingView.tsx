import React, { useMemo, useState } from 'react';
import {
  Search,
  Printer,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wallet,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Lock,
  Trash2,
  Camera,
} from 'lucide-react';
import { Customer, Invoice, PaymentMethod, PaymentStatus, StoreSettings } from '../types/pos';
import {
  formatCurrencyInputWithDots,
  formatQuantity,
  formatVND,
  parseCurrencyInputWithDots,
  numberToVietnameseWords,
} from '../utils/calculations';

interface InvoiceTrackingViewProps {
  invoices: Invoice[];
  customers: Customer[];
  settings?: StoreSettings;
  onSettlePayment: (
    invoiceId: string,
    amount: number,
    method: PaymentMethod,
    note?: string
  ) => void;
  onToggleFullPaid: (invoiceId: string, method?: PaymentMethod) => void;
  onOpenPrintModal: (invoice: Invoice) => void;
  canSettlePayment?: boolean;
  canDeleteInvoice?: boolean;
  onDeleteInvoice?: (invoiceId: string) => void;
  onDeleteMultipleInvoices?: (invoiceIds: string[]) => void;
  onOpenScanModal?: () => void;
}

export const InvoiceTrackingView: React.FC<InvoiceTrackingViewProps> = ({
  invoices,
  customers,
  settings,
  onSettlePayment,
  onToggleFullPaid,
  onOpenPrintModal,
  canSettlePayment = true,
  canDeleteInvoice = true,
  onDeleteInvoice,
  onDeleteMultipleInvoices,
  onOpenScanModal,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  // Inline Partial/Custom Payment collector state per invoice
  const [collectingInvoiceId, setCollectingInvoiceId] = useState<string | null>(null);
  const [collectAmount, setCollectAmount] = useState<number>(0);
  const [collectMethod, setCollectMethod] = useState<PaymentMethod>('cash');
  const [collectNote, setCollectNote] = useState<string>('');

  const summaryStats = useMemo(() => {
    let totalAmount = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;
    let unpaidCount = 0;
    let partialCount = 0;
    let paidCount = 0;

    for (const inv of invoices) {
      totalAmount += inv.totalAmount;
      totalPaid += inv.paidAmount;
      totalUnpaid += inv.remainingAmount;
      if (inv.paymentStatus === 'paid') paidCount += 1;
      else if (inv.paymentStatus === 'partial') partialCount += 1;
      else unpaidCount += 1;
    }

    return {
      totalAmount,
      totalPaid,
      totalUnpaid,
      unpaidCount,
      partialCount,
      paidCount,
      allCount: invoices.length,
    };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.paymentStatus !== statusFilter) {
        return false;
      }
      if (customerFilter !== 'all' && inv.customerId !== customerFilter) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const matchCode = inv.code.toLowerCase().includes(q);
        const matchCust = inv.customerName.toLowerCase().includes(q);
        const matchPhone = inv.customerPhone.toLowerCase().includes(q);
        const matchItem = inv.items.some((i) => i.productName.toLowerCase().includes(q));
        return matchCode || matchCust || matchPhone || matchItem;
      }
      return true;
    });
  }, [invoices, statusFilter, customerFilter, searchQuery]);

  const handleOpenCustomCollect = (inv: Invoice) => {
    setCollectingInvoiceId(inv.id);
    setCollectAmount(inv.remainingAmount);
    setCollectMethod(inv.paymentMethod || 'cash');
    setCollectNote('');
  };

  const handleConfirmCustomCollect = (e: React.FormEvent, inv: Invoice) => {
    e.preventDefault();
    if (collectAmount <= 0) return;
    onSettlePayment(inv.id, collectAmount, collectMethod, collectNote.trim() || undefined);
    setCollectingInvoiceId(null);
  };

  return (
    <div className="space-y-5">

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
        {/* Interactive Status Filter Tabs - Responsive Segmented Control */}
        <div
          className="grid grid-cols-4 gap-1 p-1 bg-slate-100/90 rounded-xl"
          role="tablist"
          aria-label="Lọc hóa đơn theo trạng thái thanh toán"
        >
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            className={`min-h-[38px] px-1 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-all text-center flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>Tất cả</span>
            <span className="text-[11px] opacity-80 font-mono">({summaryStats.allCount})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'unpaid'}
            onClick={() => setStatusFilter('unpaid')}
            className={`min-h-[38px] px-1 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-all text-center flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 ${
              statusFilter === 'unpaid'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-700 hover:bg-rose-50'
            }`}
          >
            <span className="hidden sm:inline">Chưa thanh toán</span>
            <span className="sm:hidden">Chưa trả</span>
            <span className="text-[11px] opacity-80 font-mono">({summaryStats.unpaidCount})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'partial'}
            onClick={() => setStatusFilter('partial')}
            className={`min-h-[38px] px-1 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-all text-center flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 ${
              statusFilter === 'partial'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-800 hover:bg-amber-50'
            }`}
          >
            <span className="hidden sm:inline">Trả một phần</span>
            <span className="sm:hidden">1 phần</span>
            <span className="text-[11px] opacity-80 font-mono">({summaryStats.partialCount})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'paid'}
            onClick={() => setStatusFilter('paid')}
            className={`min-h-[38px] px-1 sm:px-3 py-1.5 text-xs font-bold rounded-lg transition-all text-center flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 ${
              statusFilter === 'paid'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-emerald-800 hover:bg-emerald-50'
            }`}
          >
            <span className="hidden sm:inline">Đã thanh toán</span>
            <span className="sm:hidden">Đã trả</span>
            <span className="text-[11px] opacity-80 font-mono">({summaryStats.paidCount})</span>
          </button>
        </div>

        {/* Search, Customer Select & Batch Delete */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã HD, tên khách, SĐT..."
              aria-label="Tìm kiếm hóa đơn"
              className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#1e3a8a] transition-colors"
            />
          </div>

          <select
            aria-label="Lọc theo mối sỉ hoặc khách hàng"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:border-[#1e3a8a] transition-colors"
          >
            <option value="all">Tất cả mối sỉ / khách hàng</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {onOpenScanModal && (
            <button
              type="button"
              onClick={onOpenScanModal}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
            >
              <Camera className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>Quét HĐ giấy (AI)</span>
            </button>
          )}

          {canDeleteInvoice &&
            onDeleteMultipleInvoices &&
            filteredInvoices.length > 0 && (
              <button
                type="button"
                data-testid="btn-delete-filtered-invoices"
                onClick={() =>
                  onDeleteMultipleInvoices(filteredInvoices.map((i) => i.id))
                }
                className="min-h-[38px] px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Xóa {filteredInvoices.length} đơn</span>
              </button>
            )}
        </div>
      </div>

      {/* Invoices List */}
      {filteredInvoices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <p className="text-base font-bold text-slate-800">
            Không có hóa đơn nào trong bộ lọc hiện tại
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Thử chọn "Tất cả" hoặc xóa từ khóa tìm kiếm để xem toàn bộ hóa đơn.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setCustomerFilter('all');
              setSearchQuery('');
            }}
            className="mt-4 min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800"
          >
            Hiển thị tất cả hóa đơn
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredInvoices.map((inv) => {
            const d = new Date(inv.createdAt);
            const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(
              d.getMinutes()
            ).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')}/${String(
              d.getMonth() + 1
            ).padStart(2, '0')}`;

            const isExpanded = expandedInvoiceId === inv.id;
            const isCollecting = collectingInvoiceId === inv.id;

            const itemPreviewText = inv.items
              .map((i) => `${formatQuantity(i.netQuantity)} ${i.unitLabel} ${i.productName}`)
              .join(' · ');

            return (
              <div
                key={inv.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 transition-colors hover:border-slate-300"
              >
                {/* Top Row: Metadata + Status + Totals */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    {/* Clean unboxed metadata separator line */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-bold text-slate-800">{inv.code}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{timeStr}</span>
                      <span aria-hidden="true">·</span>
                      {inv.paymentStatus === 'paid' ? (
                        <span className="font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Đã thanh toán đủ ({inv.paymentMethod === 'transfer' ? 'CK' : 'Tiền mặt'})
                        </span>
                      ) : inv.paymentStatus === 'partial' ? (
                        <span className="font-semibold text-amber-700 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Thanh toán 1 phần — Còn nợ {formatVND(inv.remainingAmount)}
                        </span>
                      ) : (
                        <span className="font-semibold text-rose-600 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Chưa thanh toán (Ghi nợ)
                        </span>
                      )}
                    </div>

                    {/* Customer Name & Phone */}
                    <h3 className="text-base font-bold text-slate-900">
                      {inv.customerName}
                      {inv.customerPhone && (
                        <span className="text-xs font-normal text-slate-500 ml-2">
                          ({inv.customerPhone} · {inv.customerAddress})
                        </span>
                      )}
                    </h3>

                    {/* Multi-Unit Items Preview */}
                    <p className="text-xs text-slate-600 line-clamp-2">{itemPreviewText}</p>
                    {inv.note && (
                      <p className="text-xs text-slate-500 italic">Ghi chú: {inv.note}</p>
                    )}
                  </div>

                  {/* Financial Numbers & Action Buttons */}
                  <div className="flex flex-col sm:flex-row lg:items-center justify-between gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 shrink-0">
                    <div className="sm:text-right tabular-nums">
                      <div className="text-xs text-slate-500">
                        Tổng đơn:{' '}
                        <strong className="font-mono text-base text-slate-900">
                          {formatVND(inv.totalAmount)}
                        </strong>
                      </div>
                      <div className="text-xs mt-0.5">
                        <span className="text-emerald-700 font-medium">
                          Đã thu: {formatVND(inv.paidAmount)}
                        </span>
                        {inv.remainingAmount > 0 && (
                          <span className="text-rose-600 font-bold ml-2">
                            · Nợ: {formatVND(inv.remainingAmount)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Interactive Actions - Structured & Optimized for Mobile */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                      {!canSettlePayment ? (
                        <span className="min-h-[38px] px-3 py-2 bg-slate-100 text-slate-500 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                          Chỉ Thu ngân / Chủ vựa gạch nợ
                        </span>
                      ) : inv.paymentStatus !== 'paid' ? (
                        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => onToggleFullPaid(inv.id, 'cash')}
                            aria-label={`Thu đủ hóa đơn ${inv.code}`}
                            className="min-h-[38px] px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>Thu đủ {formatVND(inv.remainingAmount)}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              isCollecting
                                ? setCollectingInvoiceId(null)
                                : handleOpenCustomCollect(inv)
                            }
                            className="min-h-[38px] px-3 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                          >
                            <Wallet className="w-4 h-4 shrink-0 text-amber-700" />
                            <span>Thu 1 phần</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onToggleFullPaid(inv.id)}
                          title="Đặt lại trạng thái chưa thanh toán nếu bấm nhầm"
                          className="min-h-[38px] px-3 py-2 bg-stone-100 hover:bg-stone-200 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap w-full sm:w-auto"
                        >
                          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                          <span>Hoàn tác thu</span>
                        </button>
                      )}

                      {/* Secondary Utility Controls */}
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => onOpenPrintModal(inv)}
                          aria-label={`In hóa đơn ${inv.code}`}
                          className="min-h-[38px] flex-1 sm:flex-initial px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap"
                        >
                          <Printer className="w-3.5 h-3.5 shrink-0" />
                          <span>Xuất A5</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                          aria-label={`Xem chi tiết hóa đơn ${inv.code}`}
                          className="min-h-[38px] flex-1 sm:flex-initial px-3 py-2 bg-stone-100 hover:bg-stone-200 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                        >
                          <span>Chi tiết</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                          )}
                        </button>

                        {canDeleteInvoice && onDeleteInvoice && (
                          <button
                            type="button"
                            onClick={() => onDeleteInvoice(inv.id)}
                            aria-label={`Xóa hóa đơn ${inv.code}`}
                            title="Xóa hóa đơn này"
                            className="min-h-[38px] px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Xóa</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inline Partial / Custom Payment Form */}
                {isCollecting && (
                  <form
                    onSubmit={(e) => handleConfirmCustomCollect(e, inv)}
                    className="mt-3 pt-3 border-t border-slate-200 bg-amber-50/60 p-3 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
                  >
                    <div className="flex-1">
                      <label
                        htmlFor={`collect-amt-${inv.id}`}
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Số tiền khách thanh toán thêm (Tối đa {formatVND(inv.remainingAmount)}):
                      </label>
                      <input
                        id={`collect-amt-${inv.id}`}
                        type="text"
                        inputMode="numeric"
                        value={formatCurrencyInputWithDots(collectAmount)}
                        onChange={(e) =>
                          setCollectAmount(
                            Math.min(
                              inv.remainingAmount,
                              parseCurrencyInputWithDots(e.target.value)
                            )
                          )
                        }
                        className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-xl tabular-nums"
                      />
                    </div>

                    <div>
                      <span className="block text-xs font-bold text-slate-700 mb-1">
                        Hình thức:
                      </span>
                      <div className="inline-flex p-1 bg-white border border-slate-300 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setCollectMethod('cash')}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                            collectMethod === 'cash'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          Tiền mặt
                        </button>
                        <button
                          type="button"
                          onClick={() => setCollectMethod('transfer')}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                            collectMethod === 'transfer'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          Chuyển khoản
                        </button>
                      </div>
                    </div>

                    <div className="flex-1">
                      <label
                        htmlFor={`collect-note-${inv.id}`}
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        Ghi chú thu nợ:
                      </label>
                      <input
                        id={`collect-note-${inv.id}`}
                        type="text"
                        value={collectNote}
                        onChange={(e) => setCollectNote(e.target.value)}
                        placeholder="VD: Chị Lan CK Vietcombank..."
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCollectingInvoiceId(null)}
                        className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-xl"
                      >
                        Đóng
                      </button>
                      <button
                        type="submit"
                        className="min-h-[40px] px-4 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl whitespace-nowrap"
                      >
                        Xác nhận thu
                      </button>
                    </div>
                  </form>
                )}

                {/* Expanded Authentic Blue-Bordered "HÓA ĐƠN BÁN LẺ" Sheet */}
                {isExpanded && (
                  <div className="mt-4 pt-3 border-t border-slate-200 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700 truncate">
                        Tờ hóa đơn bán lẻ #{inv.code}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenPrintModal(inv)}
                        className="min-h-[36px] px-3 py-1.5 text-xs font-bold text-[#1e3a8a] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Xuất A5 / In máy</span>
                      </button>
                    </div>

                    {/* Responsive Blue-Bordered Vietnamese Retail Sheet (fits 100% on mobile & desktop) */}
                    <div className="w-full bg-white border-2 border-[#1e40af] rounded-xl shadow-xs p-2.5 sm:p-5 text-[#172554] space-y-2.5 sm:space-y-3.5">
                      {/* 1. Header: ĐƠN VỊ (Left) & HÓA ĐƠN BÁN LẺ + Số (Right) */}
                      <div className="flex flex-row justify-between items-start gap-1.5 pb-2 border-b border-blue-100 text-[10px] sm:text-xs">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-baseline gap-1">
                            <span className="font-bold uppercase text-[#1e3a8a] text-[10px] sm:text-xs shrink-0">
                              ĐƠN VỊ:
                            </span>
                            <span className="font-bold text-slate-900 border-b border-dotted border-[#1e40af]/70 pb-0.5 break-words text-[10px] sm:text-xs">
                              {settings?.storeName || inv.createdByName || 'Vựa Rau Củ Quả'}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1 min-w-0">
                            <span className="text-[9px] sm:text-[11px] font-semibold text-[#1e3a8a] shrink-0">
                              ĐT / ĐC:
                            </span>
                            <span className="text-[9px] sm:text-[10.5px] text-[#1e3a8a] border-b border-dotted border-[#1e40af]/70 pb-0.5 truncate tracking-tight">
                              {[settings?.phone, settings?.address].filter(Boolean).join(' — ') || '—'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end shrink-0 pl-1">
                          <h4 className="text-xs sm:text-xl font-black uppercase tracking-wide text-[#1e3a8a] text-right whitespace-nowrap">
                            HÓA ĐƠN BÁN LẺ
                          </h4>
                          <div className="flex items-baseline justify-end gap-1 mt-0.5">
                            <span className="text-[10px] sm:text-xs font-semibold text-[#1e3a8a]">Số:</span>
                            <span className="font-mono text-[10px] sm:text-xs font-bold text-slate-900 border-b border-dotted border-[#1e40af]/70 pb-0.5 text-right whitespace-nowrap">
                              {inv.code}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Customer Info Lines */}
                      <div className="space-y-1 text-[10px] sm:text-xs">
                        <div className="flex items-baseline gap-1">
                          <span className="font-semibold text-[#1e3a8a] whitespace-nowrap shrink-0">
                            Khách hàng:
                          </span>
                          <span className="flex-1 font-bold text-slate-900 border-b border-dotted border-[#1e40af]/70 pb-0.5 truncate">
                            {inv.customerName}
                          </span>
                        </div>

                        <div className="flex items-baseline gap-1">
                          <span className="font-semibold text-[#1e3a8a] whitespace-nowrap shrink-0">
                            Địa chỉ / SĐT:
                          </span>
                          <span className="flex-1 text-slate-800 border-b border-dotted border-[#1e40af]/70 pb-0.5 truncate">
                            {[inv.customerAddress, inv.customerPhone].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </div>
                      </div>

                      {/* 3. Classic 6-Column Blue-Bordered Table - full width, responsive column widths */}
                      <div className="border border-[#1e40af] overflow-hidden rounded-xs">
                        <table className="w-full table-fixed border-collapse text-[10px] sm:text-xs">
                          <thead>
                            <tr className="bg-[#dbeafe]/80 text-[#1e3a8a] border-b border-[#1e40af] text-center font-bold">
                              <th className="border-r border-[#1e40af] py-1 px-0.5 w-[24px] sm:w-10">
                                TT
                              </th>
                              <th className="border-r border-[#1e40af] py-1 px-1 sm:px-2 w-auto text-left sm:text-center">
                                TÊN HÀNG &amp; QUY CÁCH
                              </th>
                              <th className="border-r border-[#1e40af] py-1 px-0.5 w-[32px] sm:w-16">
                                ĐVT
                              </th>
                              <th className="border-r border-[#1e40af] py-1 px-0.5 w-[34px] sm:w-14">
                                SL
                              </th>
                              <th className="border-r border-[#1e40af] py-1 px-0.5 w-[52px] sm:w-20">
                                ĐƠN GIÁ
                              </th>
                              <th className="py-1 px-0.5 sm:px-1 w-[58px] sm:w-24">
                                THÀNH TIỀN
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1e40af]/60 tabular-nums">
                            {inv.items.map((item, idx) => (
                              <tr key={item.id} className={idx % 2 === 1 ? 'bg-[#eff6ff]/40' : 'bg-white'}>
                                <td className="border-r border-[#1e40af] py-1 px-0.5 text-center font-mono font-bold text-[#1e3a8a]">
                                  {idx + 1}
                                </td>
                                <td className="border-r border-[#1e40af] py-1 px-1 sm:px-2 font-semibold text-slate-900 truncate">
                                  {item.productName}
                                  {item.tareWeight > 0 && (
                                    <span className="text-[9px] sm:text-[10px] text-slate-500 font-normal ml-0.5">
                                      (-{formatQuantity(item.tareWeight)})
                                    </span>
                                  )}
                                </td>
                                <td className="border-r border-[#1e40af] py-1 px-0.5 text-center text-slate-800 truncate">
                                  {item.unitLabel}
                                </td>
                                <td className="border-r border-[#1e40af] py-1 px-0.5 text-right font-mono font-bold text-slate-900">
                                  {formatQuantity(item.netQuantity)}
                                </td>
                                <td className="border-r border-[#1e40af] py-1 px-0.5 text-right font-mono text-slate-900 truncate">
                                  {formatVND(item.unitPrice, false)}
                                </td>
                                <td className="py-1 px-0.5 sm:px-1 text-right font-mono font-extrabold text-[#172554] bg-[#dbeafe]/25 truncate">
                                  {formatVND(item.lineTotal, false)}
                                </td>
                              </tr>
                            ))}

                            {/* Summary "Cộng" Row */}
                            <tr className="bg-[#bfdbfe]/75 border-t border-[#1e40af] font-bold text-[#1e3a8a]">
                              <td colSpan={2} className="border-r border-[#1e40af] py-1 px-1 text-center italic text-[10px] sm:text-xs">
                                Cộng
                              </td>
                              <td className="border-r border-[#1e40af] py-1 px-0.5 text-center font-mono text-[9px] sm:text-[10px] truncate">
                                {inv.items.length} món
                              </td>
                              <td className="border-r border-[#1e40af] py-1 px-0.5 text-right font-mono text-[10px] sm:text-xs">
                                {formatQuantity(inv.items.reduce((s, i) => s + i.netQuantity, 0))}
                              </td>
                              <td className="border-r border-[#1e40af] py-1 px-0.5" />
                              <td className="py-1 px-0.5 sm:px-1 text-right font-mono text-[10px] sm:text-xs font-black text-[#1e3a8a] truncate">
                                {formatVND(inv.totalAmount, false)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* 4. Words & Date */}
                      <div className="space-y-0.5 text-[10px] sm:text-xs">
                        <div className="flex flex-wrap items-baseline gap-1 border-b border-dotted border-[#1e40af]/70 pb-0.5 leading-snug">
                          <span className="font-bold italic text-[#1e3a8a] shrink-0">
                            Cộng thành tiền (bằng chữ):
                          </span>
                          <span className="font-semibold italic text-slate-900 break-words">
                            {numberToVietnameseWords(inv.totalAmount)} đồng
                          </span>
                        </div>

                        <div className="flex justify-end pt-0.5">
                          <p className="italic text-[#1e3a8a] text-[10px] sm:text-xs">
                            {(() => {
                              const dt = new Date(inv.createdAt);
                              return `Ngày ${dt.getDate()} tháng ${dt.getMonth() + 1} năm ${dt.getFullYear()}`;
                            })()}
                          </p>
                        </div>
                      </div>

                      {/* 5. Signatures (Blank signing space, no printed names) */}
                      <div className="pt-1.5 border-t border-[#1e40af]/30 grid grid-cols-3 gap-1 text-center text-[10px] sm:text-xs">
                        <div>
                          <p className="font-bold text-[9px] sm:text-xs uppercase text-[#1e3a8a] leading-tight">
                            NGƯỜI NHẬN
                          </p>
                          <p className="text-[8px] sm:text-[9px] text-slate-500">(Ký tên)</p>
                          <div className="h-6 sm:h-7" />
                        </div>

                        <div>
                          <p className="font-bold text-[9px] sm:text-xs uppercase text-[#1e3a8a] leading-tight">
                            ĐÃ NHẬN TIỀN
                          </p>
                          <p className="text-[8px] sm:text-[9px] text-slate-500">(Ký tên)</p>
                          <div className="h-6 sm:h-7" />
                        </div>

                        <div>
                          <p className="font-bold text-[9px] sm:text-xs uppercase text-[#1e3a8a] leading-tight">
                            NGƯỜI VIẾT HĐ
                          </p>
                          <p className="text-[8px] sm:text-[9px] text-slate-500">(Ký tên)</p>
                          <div className="h-6 sm:h-7" />
                        </div>
                      </div>
                    </div>

                    {/* Payment History Log */}
                    <div className="bg-stone-50 p-3.5 rounded-xl border border-slate-200/80 text-xs space-y-2">
                      <span className="font-bold text-slate-800 block">
                        Lịch sử thu tiền &amp; thanh toán hóa đơn #{inv.code}:
                      </span>
                      {inv.payments.length === 0 ? (
                        <p className="text-rose-600 font-medium">
                          Chưa có giao dịch thanh toán nào (Đang ghi nợ {formatVND(inv.remainingAmount)}).
                        </p>
                      ) : (
                        <ul className="space-y-1.5 divide-y divide-slate-200/60">
                          {inv.payments.map((p) => {
                            const pt = new Date(p.timestamp);
                            return (
                              <li
                                key={p.id}
                                className="pt-1.5 flex flex-wrap items-center justify-between text-slate-700"
                              >
                                <span>
                                  Thu{' '}
                                  <strong className="text-emerald-700 font-mono font-bold">
                                    {formatVND(p.amount)}
                                  </strong>{' '}
                                  ({p.method === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'})
                                  {p.note && <span className="text-slate-500 italic ml-1">· "{p.note}"</span>}
                                </span>
                                <span className="text-slate-500 font-mono text-[11px]">
                                  {pt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} -{' '}
                                  {pt.toLocaleDateString('vi-VN')}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
