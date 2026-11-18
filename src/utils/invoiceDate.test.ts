import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInvoiceCreatedAtIso,
  clampInvoiceDateParts,
  formatInvoiceDateIsoValue,
  parseDateInputString,
} from './invoiceDate';

test('parseDateInputString parses YYYY-MM-DD, DD/MM/YYYY, and Vietnamese date formats', () => {
  assert.deepEqual(parseDateInputString('2026-11-05'), { day: 5, month: 11, year: 2026 });
  assert.deepEqual(parseDateInputString('12/11/2026'), { day: 12, month: 11, year: 2026 });
  assert.deepEqual(parseDateInputString('Ngày 09 tháng 02 năm 2026'), { day: 9, month: 2, year: 2026 });
  assert.equal(parseDateInputString('invalid'), null);
});

test('clampInvoiceDateParts clamps invalid calendar days like Feb 30 or month 15', () => {
  assert.deepEqual(clampInvoiceDateParts({ day: 30, month: 2, year: 2026 }), {
    day: 28,
    month: 2,
    year: 2026,
  });
  assert.deepEqual(clampInvoiceDateParts({ day: 29, month: 2, year: 2024 }), {
    day: 29,
    month: 2,
    year: 2024,
  });
  assert.deepEqual(clampInvoiceDateParts({ day: 35, month: 15, year: 2026 }), {
    day: 31,
    month: 12,
    year: 2026,
  });
});

test('buildInvoiceCreatedAtIso produces ISO date preserving exact local calendar day/month/year', () => {
  const ref = new Date(2026, 10, 17, 14, 30, 0, 0);
  const iso = buildInvoiceCreatedAtIso({ day: 5, month: 10, year: 2026 }, ref);
  const parsedBack = new Date(iso);
  assert.equal(parsedBack.getFullYear(), 2026);
  assert.equal(parsedBack.getMonth(), 9);
  assert.equal(parsedBack.getDate(), 5);
  assert.equal(formatInvoiceDateIsoValue({ day: 5, month: 10, year: 2026 }), '2026-10-05');
});
