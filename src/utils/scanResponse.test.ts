import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScanApiResponse, normalizeScannedReceipt } from './scanResponse';

test('parseScanApiResponse parses valid JSON receipt cleanly', () => {
  const result = parseScanApiResponse(
    200,
    'application/json; charset=utf-8',
    JSON.stringify({
      success: true,
      data: {
        customerName: 'Anh Phan',
        items: [{ productName: 'Thơm', unitLabel: 'Kg', quantity: 100, unitPrice: 40000, lineTotal: 4000000 }],
        totalAmount: 4000000,
        paymentStatus: 'unpaid',
      },
    })
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.customerName, 'Anh Phan');
    assert.equal(result.data.items.length, 1);
    assert.equal(result.data.totalAmount, 4000000);
  }
});

test('parseScanApiResponse handles HTML <!doctype html> gateway timeout without throwing SyntaxError', () => {
  const result = parseScanApiResponse(
    504,
    'text/html; charset=utf-8',
    '<!doctype html><html><head><title>504 Gateway Timeout</title></head><body>Timeout</body></html>'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errorMessage, /Máy chủ xử lý AI phản hồi chậm/);
  }
});

test('parseScanApiResponse handles HTML 413 payload too large cleanly', () => {
  const result = parseScanApiResponse(
    413,
    'text/html',
    '<!DOCTYPE html><html><body>PayloadTooLargeError</body></html>'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errorMessage, /dung lượng quá lớn/);
  }
});

test('parseScanApiResponse handles 200 SPA fallback HTML safely without crashing', () => {
  const result = parseScanApiResponse(
    200,
    'text/html',
    '<!doctype html><html lang="vi"><body><div id="root"></div></body></html>'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errorMessage, /phản hồi không hợp lệ/);
  }
});

test('parseScanApiResponse maps JSON 503 overload errors cleanly', () => {
  const result = parseScanApiResponse(
    503,
    'application/json',
    JSON.stringify({ error: '{"code":503,"status":"UNAVAILABLE","message":"high demand"}' })
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errorMessage, /quá tải tạm thời/);
  }
});

test('normalizeScannedReceipt provides default fallback item when items array is empty', () => {
  const normalized = normalizeScannedReceipt({ totalAmount: 250000, items: [] });
  assert.equal(normalized.customerName, 'Khách Mua Lẻ');
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.items[0].lineTotal, 250000);
});
