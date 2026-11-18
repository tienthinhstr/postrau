import React, { useState } from 'react';
import {
  Printer,
  Download,
  Image as ImageIcon,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Check,
} from 'lucide-react';
import { Invoice, StoreSettings } from '../types/pos';
import {
  formatQuantity,
  formatVND,
  numberToVietnameseWords,
} from '../utils/calculations';
import {
  downloadInvoiceA5Pdf,
  downloadInvoiceA5Png,
} from '../utils/a5Export';

interface ThermalReceiptModalProps {
  invoice: Invoice | null;
  settings: StoreSettings;
  onClose: () => void;
  onMarkPrinted: (invoiceId: string) => void;
  onTogglePaid?: (invoiceId: string) => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  invoice,
  settings,
  onClose,
  onMarkPrinted,
  onTogglePaid,
}) => {
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  if (!invoice) return null;

  const createdDate = new Date(invoice.createdAt);
  const dayStr = String(createdDate.getDate()).padStart(2, '0');
  const monthStr = String(createdDate.getMonth() + 1).padStart(2, '0');
  const yearStr = String(createdDate.getFullYear());

  // Always display at least 10 rows just like the classic Hóa Đơn Bán Lẻ form
  const totalDisplayRows = Math.max(10, invoice.items.length);
  const displayRows = Array.from({ length: totalDisplayRows }, (_, idx) => {
    const item = invoice.items[idx];
    return {
      rowIndex: idx + 1,
      item: item || null,
    };
  });

  const totalQty = invoice.items.reduce((sum, i) => sum + i.netQuantity, 0);
  const amountInWords = numberToVietnameseWords(invoice.totalAmount);

  const handleDownloadPdf = () => {
    downloadInvoiceA5Pdf(invoice, settings);
    onMarkPrinted(invoice.id);
    setExportFeedback(`Đã xuất file PDF khổ A5 (Hoa-Don-Ban-Le-${invoice.code}-A5.pdf)!`);
    setTimeout(() => setExportFeedback(null), 3500);
  };

  const handleDownloadPng = () => {
    downloadInvoiceA5Png(invoice, settings);
    onMarkPrinted(invoice.id);
    setExportFeedback(`Đã xuất ảnh PNG khổ A5 (Hoa-Don-Ban-Le-${invoice.code}-A5.png)!`);
    setTimeout(() => setExportFeedback(null), 3500);
  };

  const handlePrintA5 = () => {
    onMarkPrinted(invoice.id);
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden my-auto flex flex-col max-h-[95vh]">
        {/* Top Modal Header (Hidden when printing) */}
        <div className="no-print flex items-center justify-between px-4 sm:px-5 py-3.5 bg-[#1e3a8a] text-white border-b border-[#172554] shrink-0">
          <div className="flex items-center gap-2.5">
            <Printer className="w-5 h-5 text-blue-200 shrink-0" />
            <div>
              <h2 id="receipt-modal-title" className="text-sm sm:text-base font-bold">
                Xem Trước &amp; Xuất Tờ Hóa Đơn Bán Lẻ (Khổ A5) — {invoice.code}
              </h2>
              <p className="text-xs text-blue-100">
                Định dạng chuẩn tờ Hóa Đơn Bán Lẻ khổ A5 (148 × 210 mm) · Hỗ trợ xuất PDF, ảnh PNG &amp; In trực tiếp
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ in hóa đơn"
            className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl text-blue-100 hover:text-white hover:bg-[#172554] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Export Feedback Banner */}
        {exportFeedback && (
          <div className="no-print px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-950 text-xs font-bold flex items-center gap-2 shrink-0">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{exportFeedback}</span>
          </div>
        )}

        {/* Main Scrollable Preview Area: Exact Blue-Bordered A5 "HÓA ĐƠN BÁN LẺ" Sheet */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-stone-200/80 flex flex-col items-center">
          <div
            data-testid="a5-invoice-preview-sheet"
            className="print-only-a5-sheet w-full max-w-[680px] bg-white border-2 border-[#1e40af] shadow-md p-4 sm:p-7 text-[#172554]"
          >
            {/* 1. Header: ĐƠN VỊ (Left) & HÓA ĐƠN BÁN LẺ + Số (Right) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start pb-3">
              <div className="sm:col-span-7 space-y-1 text-xs sm:text-sm">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-bold uppercase text-[#1e3a8a] whitespace-nowrap">
                    ĐƠN VỊ:
                  </span>
                  <span className="flex-1 font-bold text-slate-900 border-b border-dotted border-[#1e40af]/70 pb-0.5 min-h-[20px] break-words">
                    {settings.storeName}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-[10px] sm:text-xs font-semibold text-[#1e3a8a] whitespace-nowrap shrink-0">
                    ĐT / ĐC:
                  </span>
                  <span
                    className={`flex-1 text-[#1e3a8a] border-b border-dotted border-[#1e40af]/70 pb-0.5 min-h-[18px] whitespace-nowrap overflow-hidden text-ellipsis ${
                      [settings.phone, settings.address].filter(Boolean).join(' — ').length > 48
                        ? 'text-[9.5px] sm:text-[11px] tracking-tight'
                        : [settings.phone, settings.address].filter(Boolean).join(' — ').length > 32
                        ? 'text-[10.5px] sm:text-xs'
                        : 'text-xs'
                    }`}
                  >
                    {[settings.phone, settings.address].filter(Boolean).join(' — ')}
                  </span>
                </div>
              </div>

              <div className="sm:col-span-5 flex flex-col sm:items-end justify-between">
                <h3 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-[#1e3a8a] text-center sm:text-right w-full">
                  HÓA ĐƠN BÁN LẺ
                </h3>
                <div className="flex items-baseline justify-end gap-1.5 mt-1 w-full sm:w-auto">
                  <span className="text-xs sm:text-sm font-semibold text-[#1e3a8a]">Số:</span>
                  <span className="w-32 sm:w-36 font-mono text-xs sm:text-sm font-bold text-slate-900 border-b border-dotted border-[#1e40af]/70 pb-0.5 text-right">
                    {invoice.code}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Customer Info Lines */}
            <div className="space-y-2 pb-3.5 text-xs sm:text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-[#1e3a8a] whitespace-nowrap shrink-0">
                  Họ tên người mua hàng:
                </span>
                <span className="flex-1 font-bold text-sm sm:text-base text-slate-900 border-b border-dotted border-[#1e40af]/70 pb-0.5 min-h-[22px]">
                  {invoice.customerName}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-[#1e3a8a] whitespace-nowrap shrink-0">
                  Đơn vị, cơ quan (Địa chỉ / SĐT):
                </span>
                <span className="flex-1 text-slate-800 border-b border-dotted border-[#1e40af]/70 pb-0.5 min-h-[20px]">
                  {[invoice.customerAddress, invoice.customerPhone].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>

            {/* 3. Classic 6-Column Blue-Bordered Table */}
            <div className="border-2 border-[#1e40af]">
              <table className="w-full table-fixed border-collapse text-[11px] sm:text-sm">
                <thead>
                  <tr className="bg-[#dbeafe]/80 text-[#1e3a8a] border-b-2 border-[#1e40af] text-center font-bold">
                    <th className="border-r border-[#1e40af] py-1.5 px-0.5 w-[28px] sm:w-11 leading-tight">
                      SỐ
                      <br />
                      TT
                    </th>
                    <th className="border-r border-[#1e40af] py-1.5 px-2 w-auto leading-tight">
                      TÊN HÀNG &amp; QUY CÁCH
                    </th>
                    <th className="border-r border-[#1e40af] py-1.5 px-1 w-[56px] sm:w-24 leading-tight">
                      Đơn vị
                      <br />
                      tính
                    </th>
                    <th className="border-r border-[#1e40af] py-1.5 px-1 w-[42px] sm:w-20 leading-tight">
                      Số
                      <br />
                      lượng
                    </th>
                    <th className="border-r border-[#1e40af] py-1.5 px-1 w-[64px] sm:w-28 leading-tight">
                      Giá
                      <br />
                      đơn vị
                    </th>
                    <th className="py-1.5 px-1.5 sm:px-2 w-[76px] sm:w-32 leading-tight">
                      THÀNH TIỀN
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e40af]/60 tabular-nums">
                  {displayRows.map(({ rowIndex, item }, idx) => (
                    <tr
                      key={rowIndex}
                      className={idx % 2 === 1 ? 'bg-[#eff6ff]/40' : 'bg-white'}
                    >
                      <td className="border-r border-[#1e40af] py-1.5 px-0.5 text-center font-mono font-bold text-[#1e3a8a]">
                        {rowIndex}
                      </td>
                      <td className="border-r border-[#1e40af] py-1.5 px-2 font-semibold text-slate-900 truncate">
                        {item ? item.productName : ''}
                      </td>
                      <td className="border-r border-[#1e40af] py-1.5 px-1 text-center text-slate-800">
                        {item ? item.unitLabel : ''}
                      </td>
                      <td className="border-r border-[#1e40af] py-1.5 px-1.5 text-right font-mono font-bold text-slate-900">
                        {item ? formatQuantity(item.netQuantity) : ''}
                      </td>
                      <td className="border-r border-[#1e40af] py-1.5 px-1.5 text-right font-mono text-slate-900">
                        {item ? formatVND(item.unitPrice, false) : ''}
                      </td>
                      <td className="py-1.5 px-1.5 sm:px-2 text-right font-mono font-extrabold text-[#172554] bg-[#dbeafe]/25">
                        {item ? formatVND(item.lineTotal, false) : ''}
                      </td>
                    </tr>
                  ))}

                  {/* Summary "Cộng" Row */}
                  <tr className="bg-[#bfdbfe]/75 border-t-2 border-[#1e40af] font-bold text-[#1e3a8a]">
                    <td
                      colSpan={2}
                      className="border-r border-[#1e40af] py-2 px-3 text-center italic text-xs sm:text-base"
                    >
                      Cộng
                    </td>
                    <td className="border-r border-[#1e40af] py-2 px-1 text-center font-mono text-[10px] sm:text-xs">
                      {invoice.items.length} món
                    </td>
                    <td className="border-r border-[#1e40af] py-2 px-1.5 text-right font-mono text-[10px] sm:text-xs">
                      {formatQuantity(totalQty)}
                    </td>
                    <td className="border-r border-[#1e40af] py-2 px-1" />
                    <td className="py-2 px-1.5 sm:px-2 text-right font-mono text-xs sm:text-lg font-extrabold text-[#1e3a8a]">
                      {formatVND(invoice.totalAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 4. Amount in words & Date */}
            <div className="mt-3 space-y-1.5 text-xs sm:text-sm">
              <div className="flex flex-wrap items-baseline gap-1.5 border-b border-dotted border-[#1e40af]/70 pb-1">
                <span className="font-bold italic text-[#1e3a8a] shrink-0">
                  Cộng thành tiền (viết bằng chữ):
                </span>
                <span className="font-semibold italic text-slate-900">{amountInWords}</span>
              </div>

              <div className="flex justify-end pt-1">
                <p className="italic text-[#1e3a8a] text-xs sm:text-sm">
                  Ngày <strong className="font-mono not-italic">{dayStr}</strong> tháng{' '}
                  <strong className="font-mono not-italic">{monthStr}</strong> năm{' '}
                  <strong className="font-mono not-italic">{yearStr}</strong>
                </p>
              </div>
            </div>

            {/* 5. Three Signature Columns (Blank signing space, no printed names) */}
            <div className="mt-4 pt-3 border-t border-[#1e40af]/30 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="font-bold text-[11px] sm:text-xs uppercase text-[#1e3a8a]">
                  NGƯỜI NHẬN HÀNG
                </p>
                <p className="text-[10px] text-slate-500">(Ký, ghi rõ họ tên)</p>
                <div className="h-10 sm:h-12" />
              </div>

              <div>
                <p className="font-bold text-[11px] sm:text-xs uppercase text-[#1e3a8a]">
                  ĐÃ NHẬN ĐỦ TIỀN
                </p>
                <p className="text-[10px] text-slate-500">(Ký, ghi rõ họ tên)</p>
                <div className="h-10 sm:h-12" />
              </div>

              <div>
                <p className="font-bold text-[11px] sm:text-xs uppercase text-[#1e3a8a]">
                  NGƯỜI VIẾT HÓA ĐƠN
                </p>
                <p className="text-[10px] text-slate-500">(Ký, ghi rõ họ tên)</p>
                <div className="h-10 sm:h-12" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Action Bar: Export PDF (A5), Export PNG (A5), Print A5 */}
        <div className="no-print p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <span className="text-xs text-slate-600 flex items-center gap-1.5">
              {invoice.paymentStatus === 'paid' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : invoice.paymentStatus === 'partial' ? (
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <strong className="text-slate-900">
                {invoice.paymentStatus === 'paid'
                  ? 'Đã thanh toán'
                  : `Còn nợ ${formatVND(invoice.remainingAmount)}`}
              </strong>
            </span>
            {onTogglePaid && invoice.paymentStatus !== 'paid' && (
              <button
                type="button"
                onClick={() => onTogglePaid(invoice.id)}
                className="px-3 py-1.5 min-h-[38px] text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap"
              >
                Xác nhận đã thu đủ
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold text-[#1e3a8a] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap flex-1 sm:flex-initial"
            >
              <ImageIcon className="w-4 h-4 shrink-0" />
              Xuất Ảnh PNG (Khổ A5)
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-colors whitespace-nowrap flex-1 sm:flex-initial"
            >
              <Download className="w-4 h-4 shrink-0" />
              Xuất File PDF (Khổ A5)
            </button>

            <button
              type="button"
              onClick={handlePrintA5}
              className="min-h-[44px] px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-[#1e40af] hover:bg-[#1e3a8a] rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors whitespace-nowrap flex-1 sm:flex-initial"
            >
              <Printer className="w-4 h-4 shrink-0" />
              In Tờ Hóa Đơn (A5)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
