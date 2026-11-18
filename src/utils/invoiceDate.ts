export interface InvoiceDateParts {
  day: number;
  month: number;
  year: number;
}

export function getLocalTodayParts(now: Date = new Date()): InvoiceDateParts {
  return {
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function clampInvoiceDateParts(parts: Partial<InvoiceDateParts>, fallback: InvoiceDateParts = getLocalTodayParts()): InvoiceDateParts {
  const rawYear = Number(parts.year);
  const year =
    Number.isFinite(rawYear) && rawYear >= 2000 && rawYear <= 2099
      ? Math.trunc(rawYear)
      : rawYear >= 0 && rawYear < 100
      ? 2000 + Math.trunc(rawYear)
      : fallback.year;

  const rawMonth = Number(parts.month);
  const month =
    Number.isFinite(rawMonth) && rawMonth >= 1
      ? Math.min(12, Math.max(1, Math.trunc(rawMonth)))
      : fallback.month;

  const maxDay = getDaysInMonth(year, month);
  const rawDay = Number(parts.day);
  const day =
    Number.isFinite(rawDay) && rawDay >= 1
      ? Math.min(maxDay, Math.max(1, Math.trunc(rawDay)))
      : Math.min(maxDay, fallback.day);

  return { day, month, year };
}

export function formatInvoiceDateIsoValue(parts: InvoiceDateParts): string {
  const clamped = clampInvoiceDateParts(parts);
  const y = String(clamped.year).padStart(4, '0');
  const m = String(clamped.month).padStart(2, '0');
  const d = String(clamped.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateInputString(raw: string): InvoiceDateParts | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  // 1. YYYY-MM-DD (from <input type="date"> or ISO prefix)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return clampInvoiceDateParts({
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    });
  }

  // 2. Vietnamese format: "Ngày 12 tháng 11 năm 2026"
  const vnMatch = trimmed.match(/ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{2,4})/i);
  if (vnMatch) {
    return clampInvoiceDateParts({
      day: Number(vnMatch[1]),
      month: Number(vnMatch[2]),
      year: Number(vnMatch[3]),
    });
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (dmyMatch) {
    return clampInvoiceDateParts({
      day: Number(dmyMatch[1]),
      month: Number(dmyMatch[2]),
      year: Number(dmyMatch[3]),
    });
  }

  return null;
}

export function buildInvoiceCreatedAtIso(
  parts: InvoiceDateParts,
  referenceNow: Date = new Date()
): string {
  const clamped = clampInvoiceDateParts(parts, getLocalTodayParts(referenceNow));
  const localDate = new Date(
    clamped.year,
    clamped.month - 1,
    clamped.day,
    referenceNow.getHours(),
    referenceNow.getMinutes(),
    referenceNow.getSeconds(),
    referenceNow.getMilliseconds()
  );
  return localDate.toISOString();
}
