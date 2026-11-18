import { Invoice, StoreSettings } from '../types/pos';
import { formatQuantity, formatVND } from './calculations';

/**
 * Removes Vietnamese diacritics for legacy ASCII-only ESC/POS thermal printers
 */
export function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Formats a two-column line for monospace thermal printers (32 chars for 58mm, 46 chars for 80mm)
 */
function padTwoColumns(left: string, right: string, width: number): string {
  const spaceCount = Math.max(1, width - left.length - right.length);
  return `${left}${' '.repeat(spaceCount)}${right}`;
}

/**
 * Generates plain monospace receipt lines for 58mm (32 cols) or 80mm (46 cols) thermal printers
 */
export function formatThermalReceiptText(
  invoice: Invoice,
  settings: StoreSettings,
  paperWidth: '58mm' | '80mm' = '58mm',
  asciiOnly = false
): string {
  const width = paperWidth === '58mm' ? 32 : 46;
  const divider = '-'.repeat(width);
  const doubleDivider = '='.repeat(width);

  const tr = (text: string) => (asciiOnly ? removeVietnameseTones(text) : text);

  const lines: string[] = [];
  const d = new Date(invoice.createdAt);
  const timeStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
    2,
    '0'
  )}`;

  lines.push(tr(settings.storeName.toUpperCase()));
  lines.push(tr(settings.address));
  lines.push(tr(`DT: ${settings.phone}`));
  lines.push(doubleDivider);
  lines.push(tr(`PHIEU BAN HANG: ${invoice.code}`));
  lines.push(tr(`Ngay: ${timeStr}`));
  lines.push(tr(`Khach: ${invoice.customerName}`));
  if (invoice.customerPhone) {
    lines.push(tr(`SDT: ${invoice.customerPhone}`));
  }
  if (invoice.customerAddress) {
    lines.push(tr(`DC: ${invoice.customerAddress}`));
  }
  lines.push(divider);
  lines.push(padTwoColumns(tr('MAT HANG (SL x DVT)'), tr('THANH TIEN'), width));
  lines.push(divider);

  for (const item of invoice.items) {
    const itemName = tr(item.productName);
    lines.push(itemName);
    const tareInfo = item.tareWeight > 0 ? ` (Tru bi ${formatQuantity(item.tareWeight)}kg)` : '';
    const qtyDetail = tr(
      `  ${formatQuantity(item.netQuantity)} ${item.unitLabel}${tareInfo} x ${formatVND(
        item.unitPrice,
        false
      )}`
    );
    const linePrice = formatVND(item.lineTotal, false);
    lines.push(padTwoColumns(qtyDetail, linePrice, width));
  }

  lines.push(divider);
  if (invoice.discountAmount > 0 || invoice.crateDepositAmount > 0) {
    lines.push(
      padTwoColumns(tr('Tien hang:'), tr(`${formatVND(invoice.subtotal, false)}d`), width)
    );
    if (invoice.discountAmount > 0) {
      lines.push(
        padTwoColumns(tr('Giam gia/Bot le:'), tr(`-${formatVND(invoice.discountAmount, false)}d`), width)
      );
    }
    if (invoice.crateDepositAmount > 0) {
      lines.push(
        padTwoColumns(
          tr('Coc gio/sot nhua:'),
          tr(`+${formatVND(invoice.crateDepositAmount, false)}d`),
          width
        )
      );
    }
  }

  lines.push(
    padTwoColumns(tr('TONG CONG:'), tr(`${formatVND(invoice.totalAmount, false)}d`), width)
  );
  lines.push(
    padTwoColumns(tr('Da thanh toan:'), tr(`${formatVND(invoice.paidAmount, false)}d`), width)
  );
  lines.push(
    padTwoColumns(tr('CON NO LAI:'), tr(`${formatVND(invoice.remainingAmount, false)}d`), width)
  );
  lines.push(doubleDivider);

  const statusText =
    invoice.paymentStatus === 'paid'
      ? 'TRANG THAI: DA THANH TOAN DU'
      : invoice.paymentStatus === 'partial'
      ? 'TRANG THAI: THANH TOAN 1 PHAN'
      : 'TRANG THAI: CHUA THANH TOAN (GHI NO)';
  lines.push(tr(statusText));

  if (settings.bankAccountNo) {
    lines.push(divider);
    lines.push(tr(`CK: ${settings.bankName} - ${settings.bankAccountNo}`));
    lines.push(tr(`Chu TK: ${settings.bankAccountHolder}`));
  }

  lines.push(divider);
  lines.push(tr(settings.footerMessage));
  lines.push('\n\n');

  return lines.join('\n');
}

/**
 * Encodes receipt into standard ESC/POS binary byte buffer for Bluetooth/USB handheld thermal printers
 */
export function buildEscPosBuffer(
  invoice: Invoice,
  settings: StoreSettings,
  paperWidth: '58mm' | '80mm' = '58mm'
): Uint8Array {
  const text = formatThermalReceiptText(invoice, settings, paperWidth, true);
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);

  // ESC @ (Initialize printer) + text + GS V 66 0 (Feed and partial cut)
  const initCmd = new Uint8Array([0x1b, 0x40]);
  const cutCmd = new Uint8Array([0x1d, 0x56, 0x42, 0x00]);

  const buffer = new Uint8Array(initCmd.length + textBytes.length + cutCmd.length);
  buffer.set(initCmd, 0);
  buffer.set(textBytes, initCmd.length);
  buffer.set(cutCmd, initCmd.length + textBytes.length);
  return buffer;
}

/**
 * Generates an Android RawBT intent URI for 1-tap handheld Bluetooth printing on mobile browsers
 */
export function buildRawBtUri(
  invoice: Invoice,
  settings: StoreSettings,
  paperWidth: '58mm' | '80mm' = '58mm'
): string {
  const bytes = buildEscPosBuffer(invoice, settings, paperWidth);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : '';
  return `rawbt:base64,${base64}`;
}
