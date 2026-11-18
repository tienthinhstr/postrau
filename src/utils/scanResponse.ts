export interface ScannedReceiptItem {
  productName: string;
  unitLabel: string;
  quantity: number;
  tareWeight?: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ScannedReceiptData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  invoiceCode: string;
  invoiceDate: string;
  items: ScannedReceiptItem[];
  totalAmount: number;
  paidAmount: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  notes?: string;
}

export type ParsedScanResponse =
  | { ok: true; data: ScannedReceiptData }
  | { ok: false; errorMessage: string };

export function normalizeScannedReceipt(raw: any): ScannedReceiptData {
  const safeRaw = raw && typeof raw === 'object' ? raw : {};
  const rawItems = Array.isArray(safeRaw.items) ? safeRaw.items : [];

  const normalizedItems: ScannedReceiptItem[] = rawItems.map((item: any) => {
    const qty = Number(item?.quantity) || 1;
    const price = Number(item?.unitPrice) || 0;
    const lineTotal = Number(item?.lineTotal) || Math.round(qty * price);
    return {
      productName: String(item?.productName || 'Rau củ quả').trim() || 'Rau củ quả',
      unitLabel: String(item?.unitLabel || 'Kg').trim() || 'Kg',
      quantity: qty,
      tareWeight: Number(item?.tareWeight) || 0,
      unitPrice: price,
      lineTotal,
    };
  });

  const computedTotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = Number(safeRaw.totalAmount) || computedTotal;

  return {
    customerName: String(safeRaw.customerName || 'Khách Mua Lẻ').trim() || 'Khách Mua Lẻ',
    customerPhone: String(safeRaw.customerPhone || '').trim(),
    customerAddress: String(safeRaw.customerAddress || '').trim(),
    invoiceCode: String(safeRaw.invoiceCode || '').trim(),
    invoiceDate: String(safeRaw.invoiceDate || '').trim(),
    items:
      normalizedItems.length > 0
        ? normalizedItems
        : [
            {
              productName: 'Rau tươi các loại',
              unitLabel: 'Kg',
              quantity: 1,
              tareWeight: 0,
              unitPrice: total,
              lineTotal: total,
            },
          ],
    totalAmount: total,
    paidAmount: Number(safeRaw.paidAmount) || 0,
    paymentStatus:
      safeRaw.paymentStatus === 'paid' || safeRaw.paymentStatus === 'partial'
        ? safeRaw.paymentStatus
        : 'unpaid',
    notes: safeRaw.notes ? String(safeRaw.notes) : undefined,
  };
}

export function mapRawScanErrorMessage(rawErr: string, statusCode?: number): string {
  const msg = String(rawErr || '');
  if (
    statusCode === 503 ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand')
  ) {
    return 'Hệ thống AI đang quá tải tạm thời. Vui lòng đợi vài giây rồi bấm Quét lại.';
  }
  if (statusCode === 504 || msg.includes('TIMEOUT') || msg.toLowerCase().includes('timeout')) {
    return 'Quá thời gian xử lý ảnh hóa đơn. Vui lòng chụp lại rõ nét hơn hoặc bấm Quét lại.';
  }
  if (statusCode === 413) {
    return 'Ảnh hóa đơn có dung lượng quá lớn. Vui lòng chọn ảnh nhẹ hơn hoặc chụp lại.';
  }
  if (statusCode === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Hệ thống tạm thời chạm giới hạn lượt quét. Vui lòng thử lại sau ít phút.';
  }
  return msg || 'Quét thất bại. Vui lòng thử lại.';
}

export function parseScanApiResponse(
  status: number,
  contentType: string,
  rawBody: string
): ParsedScanResponse {
  const trimmed = (rawBody || '').trim();
  const looksLikeHtml =
    trimmed.startsWith('<') ||
    contentType.toLowerCase().includes('text/html');

  if (!trimmed || looksLikeHtml) {
    if (status === 413) {
      return {
        ok: false,
        errorMessage: 'Ảnh hóa đơn có dung lượng quá lớn. Vui lòng chọn ảnh nhẹ hơn hoặc chụp lại.',
      };
    }
    if (status === 504 || status === 502 || status === 503) {
      return {
        ok: false,
        errorMessage: 'Máy chủ xử lý AI phản hồi chậm hoặc đang bận tạm thời. Vui lòng bấm Quét lại sau vài giây.',
      };
    }
    if (status === 404) {
      return {
        ok: false,
        errorMessage: 'Không tìm thấy dịch vụ quét hóa đơn trên máy chủ. Vui lòng tải lại trang và thử lại.',
      };
    }
    return {
      ok: false,
      errorMessage: 'Máy chủ trả về phản hồi không hợp lệ (không phải dữ liệu hóa đơn). Vui lòng thử lại sau vài giây.',
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      errorMessage: mapRawScanErrorMessage('', status),
    };
  }

  if (status < 200 || status >= 300 || parsed?.error) {
    return {
      ok: false,
      errorMessage: mapRawScanErrorMessage(String(parsed?.error || ''), status),
    };
  }

  return {
    ok: true,
    data: normalizeScannedReceipt(parsed?.data),
  };
}
