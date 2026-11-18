import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  RotateCcw,
  ArrowRight,
  Printer,
  Trash2,
  Plus,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import { Invoice, InvoiceItem } from '../types/pos';
import { formatVND, parseCurrencyInputWithDots, formatCurrencyInputWithDots } from '../utils/calculations';
import { ScannedReceiptData, parseScanApiResponse } from '../utils/scanResponse';

export type { ScannedReceiptData };

interface ScanReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyToPosBuilder: (data: ScannedReceiptData) => void;
  onDirectSaveInvoice: (invoice: Invoice, openPrint: boolean) => void;
  existingInvoicesCount: number;
}

// Generate an authentic sample Vietnamese vegetable invoice canvas image for 1-click testing
function createSampleInvoiceDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 650;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer border (classic blue)
  ctx.strokeStyle = '#1e40af';
  ctx.lineWidth = 3;
  ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);

  // Header Left
  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('ĐƠN VỊ: VỰA RAU SẠP 12 - CHỢ ĐẦU MỐI', 30, 45);
  ctx.font = '12px sans-serif';
  ctx.fillText('ĐT: 0903.111.222 — Ô 14 Nhà Lồng C', 30, 68);

  // Header Right
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('HÓA ĐƠN BÁN LẺ', canvas.width - 30, 50);
  ctx.font = '13px monospace';
  ctx.fillText('Số: HD-SCAN-01', canvas.width - 30, 72);
  ctx.textAlign = 'left';

  // Divider
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, 85);
  ctx.lineTo(canvas.width - 30, 85);
  ctx.stroke();

  // Customer info
  ctx.fillStyle = '#0f172a';
  ctx.font = '13px sans-serif';
  ctx.fillText('Họ tên người mua hàng: Chị Tư Lan — Sạp B12 Chợ Hòa Bình', 30, 110);
  ctx.fillText('Địa chỉ / SĐT: 0909.234.567 — Quận 5, TP.HCM', 30, 132);

  // Table header
  const tableY = 150;
  ctx.fillStyle = '#dbeafe';
  ctx.fillRect(30, tableY, canvas.width - 60, 30);
  ctx.strokeStyle = '#1e40af';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(30, tableY, canvas.width - 60, 30);

  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('TT', 40, tableY + 20);
  ctx.fillText('TÊN HÀNG & QUY CÁCH', 80, tableY + 20);
  ctx.fillText('ĐVT', 290, tableY + 20);
  ctx.fillText('SL', 350, tableY + 20);
  ctx.fillText('ĐƠN GIÁ', 415, tableY + 20);
  ctx.fillText('THÀNH TIỀN', 510, tableY + 20);

  // Table items
  const items = [
    { name: 'Cải thìa (Đà Lạt)', unit: 'Kg', qty: '50', price: '18.000', total: '900.000' },
    { name: 'Thơm (Khóm ngọt)', unit: 'Kg', qty: '10', price: '45.000', total: '450.000' },
    { name: 'Ngò gai tươi', unit: 'Bó', qty: '1', price: '30.000', total: '30.000' },
    { name: 'Cà chua Củ Chi (Trừ bì 2kg)', unit: 'Kg', qty: '35', price: '22.000', total: '770.000' },
    { name: 'Hành lá gốc trắng', unit: 'Kg', qty: '8', price: '35.000', total: '280.000' },
  ];

  let currY = tableY + 30;
  ctx.font = '13px sans-serif';

  items.forEach((item, index) => {
    ctx.fillStyle = index % 2 === 1 ? '#f8fafc' : '#ffffff';
    ctx.fillRect(30, currY, canvas.width - 60, 32);
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(30, currY, canvas.width - 60, 32);

    ctx.fillStyle = '#0f172a';
    ctx.fillText(String(index + 1), 42, currY + 21);
    ctx.fillText(item.name, 80, currY + 21);
    ctx.fillText(item.unit, 292, currY + 21);
    ctx.fillText(item.qty, 352, currY + 21);
    ctx.fillText(item.price, 415, currY + 21);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(item.total, 510, currY + 21);
    ctx.font = '13px sans-serif';
    currY += 32;
  });

  // Total summary row
  ctx.fillStyle = '#bfdbfe';
  ctx.fillRect(30, currY, canvas.width - 60, 34);
  ctx.strokeStyle = '#1e40af';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(30, currY, canvas.width - 60, 34);

  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('CỘNG THÀNH TIỀN (5 món)', 80, currY + 22);
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('2.430.000 đ', 490, currY + 22);

  // Words & date
  currY += 55;
  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'italic 12px sans-serif';
  ctx.fillText('Cộng thành tiền (viết bằng chữ): Hai triệu bốn trăm ba mươi nghìn đồng.', 30, currY);

  currY += 30;
  ctx.textAlign = 'right';
  ctx.fillText('Ngày 12 tháng 11 năm 2026', canvas.width - 40, currY);
  ctx.textAlign = 'left';

  // Signatures
  currY += 30;
  ctx.strokeStyle = '#93c5fd';
  ctx.beginPath();
  ctx.moveTo(30, currY);
  ctx.lineTo(canvas.width - 30, currY);
  ctx.stroke();

  currY += 25;
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#1e3a8a';
  ctx.fillText('NGƯỜI NHẬN HÀNG', 50, currY);
  ctx.fillText('ĐÃ NHẬN ĐỦ TIỀN', 270, currY);
  ctx.fillText('NGƯỜI VIẾT HÓA ĐƠN', 480, currY);

  return canvas.toDataURL('image/jpeg', 0.9);
}

export const ScanReceiptModal: React.FC<ScanReceiptModalProps> = ({
  isOpen,
  onClose,
  onApplyToPosBuilder,
  onDirectSaveInvoice,
  existingInvoicesCount,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedMimeType, setSelectedMimeType] = useState<string>('image/jpeg');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStepMessage, setScanStepMessage] = useState<string>('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedResult, setScannedResult] = useState<ScannedReceiptData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const compressImageDataUrl = (dataUrl: string, fallbackMime: string): Promise<{ dataUrl: string; mimeType: string }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim && dataUrl.length < 300_000) {
          resolve({ dataUrl, mimeType: fallbackMime });
          return;
        }
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl, mimeType: fallbackMime });
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.82),
          mimeType: 'image/jpeg',
        });
      };
      img.onerror = () => resolve({ dataUrl, mimeType: fallbackMime });
      img.src = dataUrl;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setScanError('Vui lòng chọn file hình ảnh (PNG, JPG, JPEG, WEBP).');
      return;
    }

    setScanError(null);
    const mime = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawDataUrl = event.target?.result as string;
      const compressed = await compressImageDataUrl(rawDataUrl, mime);
      setSelectedImage(compressed.dataUrl);
      setSelectedMimeType(compressed.mimeType);
      setScannedResult(null);
    };
    reader.readAsDataURL(file);
  };

  const handleUseSample = () => {
    setScanError(null);
    const sampleDataUrl = createSampleInvoiceDataUrl();
    setSelectedImage(sampleDataUrl);
    setSelectedMimeType('image/jpeg');
    setScannedResult(null);
  };

  const handleStartScan = async () => {
    if (!selectedImage) return;

    setIsScanning(true);
    setScanError(null);
    setScanStepMessage('Đang truyền ảnh chụp lên AI...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);
    const stepTimer1 = setTimeout(() => {
      setScanStepMessage('AI đang nhận diện chữ viết & mặt hàng...');
    }, 1000);
    const stepTimer2 = setTimeout(() => {
      setScanStepMessage('Đang bóc tách số lượng, đơn giá và tính thành tiền...');
    }, 2500);

    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          imageBase64: selectedImage,
          mimeType: selectedMimeType,
        }),
        signal: controller.signal,
      });

      const rawBody = await res.text();
      const parsed = parseScanApiResponse(
        res.status,
        res.headers.get('content-type') || '',
        rawBody
      );

      if (parsed.ok === false) {
        setScanError(parsed.errorMessage);
        return;
      }

      setScannedResult(parsed.data);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setScanError('Quá thời gian kết nối tới AI. Vui lòng thử bấm Quét lại.');
      } else {
        setScanError('Không thể kết nối máy chủ quét hóa đơn. Vui lòng kiểm tra mạng và thử lại.');
      }
    } finally {
      clearTimeout(timeoutId);
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setIsScanning(false);
      setScanStepMessage('');
    }
  };

  const handleApplyToPos = () => {
    if (!scannedResult) return;
    onApplyToPosBuilder(scannedResult);
    onClose();
  };

  const handleDirectSave = (openPrint: boolean) => {
    if (!scannedResult) return;

    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const seq = String(existingInvoicesCount + 1).padStart(3, '0');
    const invoiceCode = scannedResult.invoiceCode.trim() || `HD-${d}${m}-${seq}`;

    const items: InvoiceItem[] = scannedResult.items.map((it, idx) => ({
      id: `scan-item-${Date.now()}-${idx}`,
      productId: `scan-prod-${idx}`,
      productName: it.productName,
      category: 'rau_cai',
      unitCode: 'kg',
      unitLabel: it.unitLabel || 'Kg',
      grossQuantity: it.quantity + (it.tareWeight || 0),
      tareWeight: it.tareWeight || 0,
      netQuantity: it.quantity,
      unitPrice: it.unitPrice,
      estimatedKgPerUnit: 1,
      lineTotal: it.lineTotal,
    }));

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      code: invoiceCode,
      createdAt: new Date().toISOString(),
      customerId: '',
      customerName: scannedResult.customerName || 'Khách Mua Lẻ',
      customerPhone: scannedResult.customerPhone || '',
      customerAddress: scannedResult.customerAddress || '',
      customerType: 'khach_le',
      items,
      subtotal: scannedResult.totalAmount,
      discountAmount: 0,
      crateDepositAmount: 0,
      totalAmount: scannedResult.totalAmount,
      paidAmount: scannedResult.paidAmount || 0,
      remainingAmount: Math.max(0, scannedResult.totalAmount - (scannedResult.paidAmount || 0)),
      paymentStatus: scannedResult.paymentStatus || 'unpaid',
      paymentMethod: 'cash',
      payments: scannedResult.paidAmount > 0 ? [
        {
          id: `pay-${Date.now()}`,
          amount: scannedResult.paidAmount,
          method: 'cash',
          timestamp: new Date().toISOString(),
          note: 'Thu khi quét hóa đơn giấy',
        }
      ] : [],
      printedCount: openPrint ? 1 : 0,
    };

    onDirectSaveInvoice(newInvoice, openPrint);
    onClose();
  };

  const handleUpdateItem = (index: number, field: string, val: any) => {
    if (!scannedResult) return;
    const nextItems = [...scannedResult.items];
    nextItems[index] = { ...nextItems[index], [field]: val };

    if (field === 'quantity' || field === 'unitPrice') {
      const q = field === 'quantity' ? Number(val) : nextItems[index].quantity;
      const p = field === 'unitPrice' ? Number(val) : nextItems[index].unitPrice;
      nextItems[index].lineTotal = Math.round(q * p);
    }

    const nextTotal = nextItems.reduce((s, it) => s + it.lineTotal, 0);

    setScannedResult({
      ...scannedResult,
      items: nextItems,
      totalAmount: nextTotal,
    });
  };

  const handleRemoveItem = (index: number) => {
    if (!scannedResult) return;
    const nextItems = scannedResult.items.filter((_, idx) => idx !== index);
    const nextTotal = nextItems.reduce((s, it) => s + it.lineTotal, 0);
    setScannedResult({
      ...scannedResult,
      items: nextItems,
      totalAmount: nextTotal,
    });
  };

  const handleAddItem = () => {
    if (!scannedResult) return;
    setScannedResult({
      ...scannedResult,
      items: [
        ...scannedResult.items,
        {
          productName: '',
          unitLabel: 'Kg',
          quantity: 1,
          tareWeight: 0,
          unitPrice: 0,
          lineTotal: 0,
        },
      ],
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-4 py-3.5 sm:px-6 bg-[#1e40af] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Camera className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                Quét Hóa Đơn Giấy (AI OCR)
              </h3>
              <p className="text-[11px] text-blue-100">
                Chụp hoặc tải ảnh phiếu bán lẻ, viết tay để bóc tách tự động
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-xl text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Error Banner */}
          {scanError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs sm:text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{scanError}</p>
                <p className="text-[11px] text-rose-600 mt-0.5">
                  Mẹo: Hãy chụp trong điều kiện đủ sáng, thẳng góc với tờ hóa đơn.
                </p>
              </div>
            </div>
          )}

          {/* Hidden inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {!selectedImage ? (
            /* Upload / Capture Picker Area */
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50/80 rounded-2xl p-6 text-center cursor-pointer transition-all group"
              >
                <div className="w-14 h-14 bg-white shadow-xs rounded-2xl flex items-center justify-center mx-auto mb-3 text-blue-600 group-hover:scale-105 transition-transform">
                  <Upload className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm sm:text-base">
                  Chọn ảnh hóa đơn từ máy hoặc điện thoại
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Hỗ trợ ảnh chụp tờ hóa đơn viết tay, in kim, hoặc phiếu giao hàng
                </p>
              </div>

              {/* Action Buttons for Mobile / Samples */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="min-h-[44px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 shadow-2xs transition-colors"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>Mở Camera chụp trực tiếp</span>
                </button>

                <button
                  type="button"
                  onClick={handleUseSample}
                  className="min-h-[44px] py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-slate-800 font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 border border-slate-200 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Thử mẫu hóa đơn vựa rau</span>
                </button>
              </div>
            </div>
          ) : (
            /* Image Preview & Scan / Result Section */
            <div className="space-y-4">
              {/* Image Preview Thumbnail Bar */}
              <div className="relative rounded-xl border border-slate-200 bg-slate-900 overflow-hidden max-h-48 flex items-center justify-center">
                <img
                  src={selectedImage}
                  alt="Ảnh hóa đơn được chọn"
                  className="max-h-48 w-auto object-contain"
                />

                {/* Laser scan line animation overlay while scanning */}
                {isScanning && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="w-full h-1 bg-gradient-to-r from-emerald-400 via-amber-300 to-emerald-400 shadow-[0_0_15px_#10b981] animate-pulse" />
                    <div className="absolute inset-0 bg-emerald-950/20 backdrop-blur-[1px] flex items-center justify-center">
                      <div className="bg-slate-950/85 text-white px-4 py-2 rounded-xl border border-emerald-400/40 flex items-center gap-2 text-xs font-bold shadow-lg">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>{scanStepMessage || 'Đang quét dữ liệu...'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Retake / Change Button */}
                {!isScanning && (
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedImage(null);
                        setScannedResult(null);
                        setScanError(null);
                      }}
                      className="px-2.5 py-1 bg-black/70 hover:bg-black/90 text-white text-xs font-semibold rounded-lg flex items-center gap-1 backdrop-blur-xs transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Chọn ảnh khác</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Scan Trigger Button if not yet scanned */}
              {!scannedResult && !isScanning && (
                <button
                  type="button"
                  onClick={handleStartScan}
                  className="w-full min-h-[48px] py-3 bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-extrabold text-sm sm:text-base rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Sparkles className="w-5 h-5 text-amber-300 shrink-0" />
                  <span>Bắt đầu Quét &amp; Bóc Tách Bằng AI</span>
                </button>
              )}

              {/* Scanned Result Review Box */}
              {scannedResult && (
                <div className="space-y-3.5 animate-in fade-in duration-300">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs text-emerald-950">
                    <span className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      Bóc tách thành công {scannedResult.items.length} mặt hàng!
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      Bạn có thể chỉnh sửa trước khi lưu
                    </span>
                  </div>

                  {/* Customer info fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-0.5">
                        Tên khách mua:
                      </label>
                      <input
                        type="text"
                        value={scannedResult.customerName}
                        onChange={(e) =>
                          setScannedResult({ ...scannedResult, customerName: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-0.5">
                        Địa chỉ / Sạp / SĐT:
                      </label>
                      <input
                        type="text"
                        value={scannedResult.customerAddress}
                        onChange={(e) =>
                          setScannedResult({ ...scannedResult, customerAddress: e.target.value })
                        }
                        placeholder="Sạp, chợ hoặc SĐT"
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Scanned Items Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <table className="w-full table-fixed text-[11px] sm:text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-center">
                          <th className="py-1.5 px-1 w-7">TT</th>
                          <th className="py-1.5 px-2 text-left w-auto">Mặt hàng</th>
                          <th className="py-1.5 px-1 w-12">ĐVT</th>
                          <th className="py-1.5 px-1 w-14">SL</th>
                          <th className="py-1.5 px-1 w-20">Đơn giá</th>
                          <th className="py-1.5 px-1.5 w-24 text-right">Thành tiền</th>
                          <th className="py-1.5 px-1 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 tabular-nums">
                        {scannedResult.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-1 px-1 text-center font-bold text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="text"
                                value={it.productName}
                                onChange={(e) => handleUpdateItem(idx, 'productName', e.target.value)}
                                className="w-full px-1 py-0.5 border border-slate-200 rounded font-semibold text-slate-900 focus:border-blue-500"
                              />
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="text"
                                value={it.unitLabel}
                                onChange={(e) => handleUpdateItem(idx, 'unitLabel', e.target.value)}
                                className="w-full px-1 py-0.5 border border-slate-200 rounded text-center text-slate-800 focus:border-blue-500"
                              />
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="number"
                                step="any"
                                value={it.quantity}
                                onChange={(e) =>
                                  handleUpdateItem(idx, 'quantity', parseFloat(e.target.value) || 0)
                                }
                                className="w-full px-1 py-0.5 border border-slate-200 rounded text-right font-bold text-slate-900 focus:border-blue-500"
                              />
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="text"
                                value={formatCurrencyInputWithDots(String(it.unitPrice))}
                                onChange={(e) =>
                                  handleUpdateItem(
                                    idx,
                                    'unitPrice',
                                    parseCurrencyInputWithDots(e.target.value)
                                  )
                                }
                                className="w-full px-1 py-0.5 border border-slate-200 rounded text-right text-slate-900 focus:border-blue-500"
                              />
                            </td>
                            <td className="py-1 px-1.5 text-right font-bold text-blue-900">
                              {formatVND(it.lineTotal, false)}
                            </td>
                            <td className="py-1 px-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="p-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm dòng hàng</span>
                      </button>

                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-slate-600">Tổng cộng:</span>
                        <span className="font-extrabold text-sm sm:text-base text-blue-900 font-mono">
                          {formatVND(scannedResult.totalAmount)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons for Scanned Result */}
                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={handleApplyToPos}
                      className="min-h-[46px] px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-[#1e3a8a] font-bold text-xs sm:text-sm rounded-xl border border-blue-200 flex items-center justify-center gap-2 transition-colors"
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span>Nhập vào Lập Hóa Đơn (POS)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDirectSave(true)}
                      className="min-h-[46px] px-4 py-2.5 bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
                    >
                      <Printer className="w-4 h-4 shrink-0" />
                      <span>Lưu &amp; In Ngay</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
