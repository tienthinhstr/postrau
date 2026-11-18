import { Invoice, StoreSettings } from '../types/pos';
import {
  formatQuantity,
  formatVND,
  numberToVietnameseWords,
} from './calculations';

/**
 * Renders the classic blue-bordered Vietnamese "HÓA ĐƠN BÁN LẺ" onto an A5 (148mm x 210mm)
 * high-resolution HTMLCanvasElement (1480px x 2100px = 10px per mm).
 */
export function renderInvoiceToA5Canvas(
  invoice: Invoice,
  settings: StoreSettings
): HTMLCanvasElement {
  const width = 1480;
  const height = 2100;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const bluePrimary = '#1e3a8a';
  const blueBorder = '#1e40af';
  const blueHeaderBg = '#dbeafe';
  const blueRowAlt = '#f0f7ff';
  const blueTotalBg = '#bfdbfe';
  const darkText = '#0f172a';
  const fontSans = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const fontMono = "'JetBrains Mono', monospace";

  // 1. White A5 Paper Background (1480px x 2100px = exactly 148mm x 210mm at 10px/mm)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Clean A5 paper margins (no artificial outer double border around page edges)
  const innerX = 70;
  const innerRight = width - 70;
  const innerW = innerRight - innerX; // 1340px

  // Helper to draw dotted line
  const drawDottedLine = (x1: number, x2: number, y: number) => {
    ctx.save();
    ctx.strokeStyle = blueBorder;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.restore();
  };

  // 2. Top Header: ĐƠN VỊ (Left) & HÓA ĐƠN BÁN LẺ (Right)
  let curY = 88;

  ctx.fillStyle = bluePrimary;
  ctx.font = `700 24px ${fontSans}`;
  ctx.textAlign = 'left';
  ctx.fillText('ĐƠN VỊ:', innerX, curY);

  drawDottedLine(innerX + 105, innerX + 540, curY + 6);
  if (settings.storeName.trim()) {
    ctx.fillStyle = darkText;
    ctx.font = `700 24px ${fontSans}`;
    ctx.fillText(settings.storeName.trim(), innerX + 115, curY);
  }

  // Right Title: HÓA ĐƠN BÁN LẺ
  ctx.fillStyle = bluePrimary;
  ctx.font = `800 48px ${fontSans}`;
  ctx.textAlign = 'right';
  ctx.fillText('HÓA ĐƠN BÁN LẺ', innerRight, curY + 12);

  curY += 46;
  ctx.textAlign = 'left';
  ctx.fillStyle = bluePrimary;
  ctx.font = `600 20px ${fontSans}`;
  ctx.fillText('ĐT / ĐC:', innerX, curY);
  drawDottedLine(innerX + 95, innerRight - 260, curY + 6);

  const phoneAndAddr = [settings.phone.trim(), settings.address.trim()]
    .filter(Boolean)
    .join(' — ');
  if (phoneAndAddr) {
    ctx.fillStyle = bluePrimary;
    const addrFontSize = phoneAndAddr.length > 55 ? 14 : phoneAndAddr.length > 40 ? 16 : 18;
    ctx.font = `500 ${addrFontSize}px ${fontSans}`;
    ctx.fillText(phoneAndAddr.slice(0, 80), innerX + 105, curY);
  }

  // Right: Số hóa đơn
  ctx.textAlign = 'right';
  ctx.fillStyle = bluePrimary;
  ctx.font = `700 22px ${fontSans}`;
  ctx.fillText('Số:', innerRight - 240, curY + 8);
  drawDottedLine(innerRight - 230, innerRight, curY + 14);
  ctx.fillStyle = darkText;
  ctx.font = `700 22px ${fontMono}`;
  ctx.fillText(invoice.code, innerRight - 6, curY + 8);

  // 3. Customer Info Lines
  curY += 68;
  ctx.textAlign = 'left';
  ctx.fillStyle = bluePrimary;
  ctx.font = `600 24px ${fontSans}`;
  ctx.fillText('Họ tên người mua hàng:', innerX, curY);
  drawDottedLine(innerX + 295, innerRight, curY + 8);

  if (invoice.customerName) {
    ctx.fillStyle = darkText;
    ctx.font = `700 26px ${fontSans}`;
    ctx.fillText(invoice.customerName, innerX + 310, curY);
  }

  curY += 52;
  ctx.fillStyle = bluePrimary;
  ctx.font = `600 24px ${fontSans}`;
  ctx.fillText('Đơn vị, cơ quan (Địa chỉ / SĐT):', innerX, curY);
  drawDottedLine(innerX + 380, innerRight, curY + 8);

  const custSub = [invoice.customerAddress, invoice.customerPhone]
    .filter(Boolean)
    .join(' · ');
  if (custSub) {
    ctx.fillStyle = darkText;
    ctx.font = `500 23px ${fontSans}`;
    ctx.fillText(custSub, innerX + 395, curY);
  }

  // 4. The Classic 6-Column Blue-Bordered Table
  const tableTop = curY + 34;
  const headerH = 80;
  const minRows = Math.max(12, invoice.items.length);
  const rowH = Math.min(84, Math.floor(1020 / minRows));
  const totalRowH = 78;
  const tableH = headerH + minRows * rowH + totalRowH;

  // Column X coordinates
  const colWidths = [80, 520, 160, 150, 190, innerW - (80 + 520 + 160 + 150 + 190)];
  const colX: number[] = [innerX];
  for (let i = 0; i < colWidths.length; i++) {
    colX.push(colX[i] + colWidths[i]);
  }

  // Header background
  ctx.fillStyle = blueHeaderBg;
  ctx.fillRect(innerX, tableTop, innerW, headerH);

  // Alternating rows background
  for (let r = 0; r < minRows; r++) {
    const ry = tableTop + headerH + r * rowH;
    ctx.fillStyle = r % 2 === 1 ? blueRowAlt : '#ffffff';
    ctx.fillRect(innerX, ry, innerW, rowH);
    // Highlight THÀNH TIỀN column slightly
    ctx.fillStyle = 'rgba(219, 234, 254, 0.32)';
    ctx.fillRect(colX[5], ry, colWidths[5], rowH);
  }

  // Total ("Cộng") row background
  const totalRowY = tableTop + headerH + minRows * rowH;
  ctx.fillStyle = blueTotalBg;
  ctx.fillRect(innerX, totalRowY, innerW, totalRowH);

  // Outer table thick border
  ctx.strokeStyle = blueBorder;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(innerX, tableTop, innerW, tableH);

  // Header bottom border & Total top border
  ctx.beginPath();
  ctx.moveTo(innerX, tableTop + headerH);
  ctx.lineTo(innerRight, tableTop + headerH);
  ctx.moveTo(innerX, totalRowY);
  ctx.lineTo(innerRight, totalRowY);
  ctx.stroke();

  // Horizontal row dividers
  ctx.lineWidth = 1.5;
  for (let r = 1; r < minRows; r++) {
    const ry = tableTop + headerH + r * rowH;
    ctx.beginPath();
    ctx.moveTo(innerX, ry);
    ctx.lineTo(innerRight, ry);
    ctx.stroke();
  }

  // Vertical column dividers
  ctx.lineWidth = 2;
  for (let c = 1; c < colWidths.length; c++) {
    ctx.beginPath();
    // Column 1 divider stops at totalRowY because "Cộng" spans Col 1 + Col 2
    const endY = c === 1 ? totalRowY : tableTop + tableH;
    ctx.moveTo(colX[c], tableTop);
    ctx.lineTo(colX[c], endY);
    ctx.stroke();
  }

  // Column Header Labels
  ctx.fillStyle = bluePrimary;
  ctx.font = `700 21px ${fontSans}`;
  ctx.textAlign = 'center';

  const centerCol = (cIdx: number) => colX[cIdx] + colWidths[cIdx] / 2;
  ctx.fillText('SỐ', centerCol(0), tableTop + 32);
  ctx.fillText('TT', centerCol(0), tableTop + 60);

  ctx.fillText('TÊN HÀNG VÀ QUY CÁCH PHẨM CHẤT', centerCol(1), tableTop + 47);

  ctx.fillText('Đơn vị', centerCol(2), tableTop + 32);
  ctx.fillText('tính', centerCol(2), tableTop + 60);

  ctx.fillText('Số', centerCol(3), tableTop + 32);
  ctx.fillText('lượng', centerCol(3), tableTop + 60);

  ctx.fillText('Giá', centerCol(4), tableTop + 32);
  ctx.fillText('đơn vị', centerCol(4), tableTop + 60);

  ctx.fillText('THÀNH TIỀN', centerCol(5), tableTop + 47);

  // Draw Row Numbers & Item Contents
  for (let r = 0; r < minRows; r++) {
    const ry = tableTop + headerH + r * rowH;
    const textBaselineY = ry + rowH / 2 + 8;

    // Row index
    ctx.fillStyle = bluePrimary;
    ctx.font = `700 22px ${fontMono}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(r + 1), centerCol(0), textBaselineY);

    const item = invoice.items[r];
    if (item) {
      // Product Name
      ctx.fillStyle = darkText;
      ctx.font = `600 23px ${fontSans}`;
      ctx.textAlign = 'left';
      ctx.fillText(item.productName, colX[1] + 18, textBaselineY);

      // Unit Label
      ctx.font = `500 22px ${fontSans}`;
      ctx.textAlign = 'center';
      ctx.fillText(item.unitLabel, centerCol(2), textBaselineY);

      // Quantity
      ctx.font = `700 23px ${fontMono}`;
      ctx.textAlign = 'right';
      ctx.fillText(formatQuantity(item.netQuantity), colX[4] - 16, textBaselineY);

      // Unit Price
      ctx.font = `600 22px ${fontMono}`;
      ctx.fillText(formatVND(item.unitPrice, false), colX[5] - 16, textBaselineY);

      // Line Total (THÀNH TIỀN)
      ctx.fillStyle = '#172554';
      ctx.font = `800 24px ${fontMono}`;
      ctx.fillText(formatVND(item.lineTotal, false), innerRight - 18, textBaselineY);
    }
  }

  // Draw "Cộng" Summary Row
  const totalBaselineY = totalRowY + totalRowH / 2 + 10;
  ctx.fillStyle = bluePrimary;
  ctx.font = `italic 700 28px ${fontSans}`;
  ctx.textAlign = 'center';
  ctx.fillText('Cộng', colX[0] + (colWidths[0] + colWidths[1]) / 2, totalBaselineY);

  ctx.font = `700 21px ${fontMono}`;
  ctx.fillText(`${invoice.items.length} món`, centerCol(2), totalBaselineY);

  const totalQty = invoice.items.reduce((s, i) => s + i.netQuantity, 0);
  ctx.textAlign = 'right';
  ctx.fillText(formatQuantity(totalQty), colX[4] - 16, totalBaselineY);

  ctx.font = `800 30px ${fontMono}`;
  ctx.fillText(formatVND(invoice.totalAmount), innerRight - 18, totalBaselineY);

  // 5. Below Table: Cộng thành tiền (viết bằng chữ) & Date
  let footerY = tableTop + tableH + 54;
  ctx.textAlign = 'left';
  ctx.fillStyle = bluePrimary;
  ctx.font = `italic 700 23px ${fontSans}`;
  ctx.fillText('Cộng thành tiền (viết bằng chữ):', innerX, footerY);
  drawDottedLine(innerX + 375, innerRight, footerY + 8);

  const words = numberToVietnameseWords(invoice.totalAmount);
  ctx.fillStyle = darkText;
  ctx.font = `italic 600 23px ${fontSans}`;
  ctx.fillText(words, innerX + 390, footerY);

  // Dotted line & Date on the right
  footerY += 46;
  drawDottedLine(innerX, innerRight - 420, footerY + 8);

  const d = new Date(invoice.createdAt);
  const dayStr = String(d.getDate()).padStart(2, '0');
  const monthStr = String(d.getMonth() + 1).padStart(2, '0');
  const yearStr = String(d.getFullYear());

  ctx.textAlign = 'right';
  ctx.fillStyle = bluePrimary;
  ctx.font = `italic 600 22px ${fontSans}`;
  ctx.fillText(
    `Ngày ${dayStr} tháng ${monthStr} năm ${yearStr}`,
    innerRight,
    footerY
  );

  // 6. Signature Columns
  footerY += 64;
  ctx.textAlign = 'center';
  ctx.fillStyle = bluePrimary;
  ctx.font = `700 23px ${fontSans}`;

  const sig1X = innerX + innerW * 0.16;
  const sig2X = innerX + innerW * 0.5;
  const sig3X = innerX + innerW * 0.84;

  ctx.fillText('NGƯỜI NHẬN HÀNG', sig1X, footerY);
  ctx.fillText('ĐÃ NHẬN ĐỦ TIỀN', sig2X, footerY);
  ctx.fillText('NGƯỜI VIẾT HÓA ĐƠN', sig3X, footerY);

  ctx.font = `italic 400 18px ${fontSans}`;
  ctx.fillStyle = '#475569';
  ctx.fillText('(Ký, ghi rõ họ tên)', sig1X, footerY + 28);
  ctx.fillText('(Ký, ghi rõ họ tên)', sig2X, footerY + 28);
  ctx.fillText('(Ký, ghi rõ họ tên)', sig3X, footerY + 28);

  // 7. Bottom Thank-You Badge (Matches authentic A5 retail invoice like Image 2)
  const pillW = 580;
  const pillH = 46;
  const pillX = (width - pillW) / 2;
  const pillY = 1990;

  ctx.save();
  ctx.fillStyle = bluePrimary;
  ctx.beginPath();
  const radius = 23;
  ctx.moveTo(pillX + radius, pillY);
  ctx.lineTo(pillX + pillW - radius, pillY);
  ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + radius);
  ctx.lineTo(pillX + pillW, pillY + pillH - radius);
  ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - radius, pillY + pillH);
  ctx.lineTo(pillX + radius, pillY + pillH);
  ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - radius);
  ctx.lineTo(pillX, pillY + radius);
  ctx.quadraticCurveTo(pillX, pillY, pillX + radius, pillY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `600 20px ${fontSans}`;
  ctx.textAlign = 'center';
  ctx.fillText('Cảm ơn quý khách đã tin tưởng và ủng hộ!', width / 2, pillY + 30);
  ctx.restore();

  return canvas;
}

/**
 * Triggers a browser download of the A5 PNG image of the Hóa Đơn Bán Lẻ.
 */
export function downloadInvoiceA5Png(invoice: Invoice, settings: StoreSettings): void {
  const canvas = renderInvoiceToA5Canvas(invoice, settings);
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `Hoa-Don-Ban-Le-${invoice.code}-A5.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Wraps a JPEG byte array into a valid single-page A5 Portrait PDF (148mm x 210mm = 419.53pt x 595.28pt)
 * and triggers an immediate file download.
 */
export function buildA5PdfFromJpegDataUrl(
  jpegDataUrl: string,
  pixelWidth: number,
  pixelHeight: number
): Uint8Array {
  const base64 = jpegDataUrl.split(',')[1] || '';
  const binaryStr = atob(base64);
  const jpegBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    jpegBytes[i] = binaryStr.charCodeAt(i);
  }

  // A5 dimensions in PDF points (1 pt = 1/72 inch, 148mm = 419.53pt, 210mm = 595.28pt)
  const pageW = 419.53;
  const pageH = 595.28;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let currentLength = 0;

  const pushStr = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentLength += bytes.byteLength;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentLength += bytes.byteLength;
  };

  const recordObjOffset = () => {
    offsets.push(currentLength);
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  recordObjOffset();
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  recordObjOffset();
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3: Page (A5 Portrait)
  recordObjOffset();
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  );

  // 4: Image XObject (DCTDecode JPEG)
  recordObjOffset();
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr('\nendstream\nendobj\n');

  // 5: Page Content Stream drawing the image across the full A5 page
  const contentStream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  recordObjOffset();
  pushStr(
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
  );

  // Xref Table
  const xrefOffset = currentLength;
  pushStr(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const off of offsets) {
    pushStr(`${String(off).padStart(10, '0')} 00000 n \n`);
  }

  pushStr(
    `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  const totalBuffer = new Uint8Array(currentLength);
  let pos = 0;
  for (const chunk of chunks) {
    totalBuffer.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return totalBuffer;
}

/**
 * Triggers an immediate download of the A5 PDF file for the Hóa Đơn Bán Lẻ.
 */
export function downloadInvoiceA5Pdf(invoice: Invoice, settings: StoreSettings): void {
  const canvas = renderInvoiceToA5Canvas(invoice, settings);
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.96);
  const pdfBytes = buildA5PdfFromJpegDataUrl(jpegDataUrl, canvas.width, canvas.height);

  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Hoa-Don-Ban-Le-${invoice.code}-A5.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
