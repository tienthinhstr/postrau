import http from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable large base64 uploads for receipt camera photos
app.use(express.json({ limit: '25mb' }));

// Shared server-side Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const RECEIPT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    customerName: {
      type: Type.STRING,
      description: "Tên người mua / tên sạp / tên khách hàng (nếu không tìm thấy ghi 'Khách Mua Lẻ')",
    },
    customerPhone: {
      type: Type.STRING,
      description: 'Số điện thoại khách hàng nếu có, không có thì chuỗi rỗng',
    },
    customerAddress: {
      type: Type.STRING,
      description: 'Địa chỉ / Sạp chợ nếu có, không có thì chuỗi rỗng',
    },
    invoiceCode: {
      type: Type.STRING,
      description: 'Mã số hóa đơn ghi trên giấy nếu có, không có thì chuỗi rỗng',
    },
    invoiceDate: {
      type: Type.STRING,
      description: 'Ngày lập trên giấy nếu có, không có thì chuỗi rỗng',
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          productName: { type: Type.STRING },
          unitLabel: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          tareWeight: { type: Type.NUMBER },
          unitPrice: { type: Type.NUMBER },
          lineTotal: { type: Type.NUMBER },
        },
        required: ['productName', 'unitLabel', 'quantity', 'unitPrice', 'lineTotal'],
      },
    },
    totalAmount: { type: Type.NUMBER },
    paidAmount: { type: Type.NUMBER },
    paymentStatus: { type: Type.STRING },
    notes: { type: Type.STRING },
  },
  required: ['customerName', 'items', 'totalAmount', 'paymentStatus'],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatusCode(err: any): number {
  if (
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    String(err?.message || '').toLowerCase().includes('timeout')
  ) {
    return 504;
  }
  const directStatus = Number(err?.status || err?.code || err?.error?.code);
  if (!Number.isNaN(directStatus) && directStatus >= 400) return directStatus;
  const msg = String(err?.message || '');
  if (msg.includes('"code":503') || msg.includes('UNAVAILABLE')) return 503;
  if (msg.includes('"code":429') || msg.includes('RESOURCE_EXHAUSTED')) return 429;
  if (msg.includes('"code":403') || msg.includes('PERMISSION_DENIED')) return 403;
  if (msg.includes('"code":400') || msg.includes('API_KEY_INVALID')) return 400;
  if (msg.includes('"code":404') || msg.includes('NOT_FOUND')) return 404;
  return 500;
}

function formatFriendlyScanError(err: any, statusCode: number): string {
  const msg = String(err?.message || '');
  if (statusCode === 504) {
    return 'Hệ thống AI phản hồi chậm do quá tải tạm thời. Vui lòng bấm Quét lại sau vài giây.';
  }
  if (statusCode === 503 || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
    return 'Hệ thống AI đang có lượng truy cập cao tạm thời. Vui lòng đợi vài giây rồi bấm Quét lại.';
  }
  if (statusCode === 429 || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Hệ thống tạm thời chạm giới hạn lượt quét miễn phí. Vui lòng thử lại sau ít phút hoặc kiểm tra khóa API trong Settings > Secrets.';
  }
  if (statusCode === 403 || (statusCode === 400 && msg.includes('API_KEY'))) {
    return 'Khóa API AI chưa được cấu hình hợp lệ. Vui lòng kiểm tra GEMINI_API_KEY trong Settings > Secrets.';
  }
  return 'Không thể bóc tách hóa đơn từ ảnh này. Vui lòng chụp rõ nét hơn và thử lại.';
}

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

app.post('/api/scan-receipt', async (req, res) => {
  const requestStartedAt = Date.now();
  const TOTAL_SCAN_BUDGET_MS = 24000;

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra trong Settings > Secrets.',
      });
    }

    const { imageBase64, mimeType = 'image/jpeg' } = req.body ?? {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Thiếu dữ liệu ảnh hóa đơn' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
    if (!cleanBase64) {
      return res.status(400).json({ error: 'Dữ liệu ảnh hóa đơn không hợp lệ' });
    }
    const safeMimeType = ALLOWED_IMAGE_MIMES.has(mimeType) ? mimeType : 'image/jpeg';

    const prompt = `Bạn là trợ lý quét hóa đơn chuyên nghiệp cho vựa rau củ quả, nông sản tại Việt Nam.
Nhiệm vụ của bạn là nhận diện và bóc tách dữ liệu chi tiết từ ảnh chụp tờ hóa đơn giấy (hóa đơn bán lẻ viết tay, hóa đơn in kim, in nhiệt A5/80mm, phiếu xuất kho giao hàng).

Hãy phân tích kỹ chữ viết tay, con số, tên hàng rau cải củ quả và trả về kết quả JSON theo đúng schema:
- customerName: Tên người mua / tên sạp / tên khách hàng (nếu không tìm thấy ghi 'Khách Mua Lẻ')
- customerPhone: Số điện thoại (nếu có, không có thì '')
- customerAddress: Địa chỉ / Sạp chợ (nếu có, không có thì '')
- invoiceCode: Mã số hóa đơn ghi trên giấy (nếu có, không có thì '')
- invoiceDate: Ngày lập (nếu có, không có thì '')
- items: Danh sách mặt hàng (productName, unitLabel mặc định 'Kg', quantity > 0, tareWeight mặc định 0, unitPrice số nguyên VNĐ, lineTotal số nguyên VNĐ)
- totalAmount: Tổng thành tiền (số nguyên VNĐ)
- paidAmount: Số tiền đã trả nếu có ghi 'đã nhận/đã cọc' (mặc định 0)
- paymentStatus: 'paid' (đã trả đủ), 'partial' (trả một phần), hoặc 'unpaid' (chưa trả/ghi nợ)
- notes: Ghi chú phụ nếu có

Lưu ý:
- Tự động chuẩn hóa các từ viết tắt ngành rau (VD: 'thơm' -> 'Thơm', 'c.ngọt' -> 'Cải ngọt', 'ngò' -> 'Ngò rí', 'hành' -> 'Hành lá').
- Loại bỏ dấu phân cách hàng nghìn (dấu chấm, dấu phẩy) và chữ đ trong giá trị số.`;

    const modelAttempts: Array<{ model: string; thinkingLevel?: ThinkingLevel; maxTimeoutMs: number; delayMs: number }> = [
      { model: 'gemini-3.1-flash-lite', maxTimeoutMs: 12000, delayMs: 0 },
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, maxTimeoutMs: 11000, delayMs: 200 },
    ];

    let responseText: string | undefined;
    let lastError: any = null;

    for (const attempt of modelAttempts) {
      const remainingBeforeDelay = TOTAL_SCAN_BUDGET_MS - (Date.now() - requestStartedAt);
      if (remainingBeforeDelay < 3000) {
        break;
      }

      if (attempt.delayMs > 0) {
        await sleep(Math.min(attempt.delayMs, remainingBeforeDelay - 2500));
      }

      const remainingBudget = TOTAL_SCAN_BUDGET_MS - (Date.now() - requestStartedAt);
      if (remainingBudget < 2500) {
        break;
      }

      const attemptTimeoutMs = Math.min(attempt.maxTimeoutMs, remainingBudget);

      try {
        const response = await ai.models.generateContent({
          model: attempt.model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: safeMimeType,
                  data: cleanBase64,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            abortSignal: AbortSignal.timeout(attemptTimeoutMs),
            responseMimeType: 'application/json',
            responseSchema: RECEIPT_RESPONSE_SCHEMA,
            ...(attempt.thinkingLevel
              ? { thinkingConfig: { thinkingLevel: attempt.thinkingLevel } }
              : {}),
          },
        });
        responseText = response.text;
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        const code = getErrorStatusCode(err);
        const isTimeout = code === 504;
        // Retry/fallback silently on transient availability, rate limit, timeout, or unsupported model errors
        if (!isTimeout && code !== 503 && code !== 429 && code !== 404 && code !== 500) {
          break;
        }
      }
    }

    if (lastError && !responseText) {
      throw lastError;
    }

    const rawText = responseText || '{}';
    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch {
      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
    }

    return res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error('Scan receipt error:', error);
    const statusCode = getErrorStatusCode(error);
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      error: formatFriendlyScanError(error, statusCode),
    });
  }
});

// Ensure unknown /api/* routes always return JSON instead of falling through to SPA HTML
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Không tìm thấy đường dẫn API yêu cầu.' });
});

// Ensure Express middleware errors (e.g. PayloadTooLargeError, malformed JSON) return JSON, never HTML
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      error: 'Ảnh hóa đơn có dung lượng quá lớn. Vui lòng chọn ảnh nhẹ hơn hoặc chụp lại.',
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: 'Dữ liệu gửi lên không hợp lệ.',
    });
  }
  if (req.path.startsWith('/api')) {
    const status = Number(err?.status || err?.statusCode) || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'Lỗi máy chủ khi xử lý yêu cầu. Vui lòng thử lại.',
    });
  }
  return next(err);
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';
  const httpServer = http.createServer(app);

  if (isDev) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });

    // When HMR is disabled in middleware mode, use a no-op connected transport in @vite/client
    // so neither WebSocket connection errors nor SendBeforeConnectError (e.g. from PWA dev SW) occur.
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const patchedCode = result.code.replace(
            /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
            'const transport = normalizeModuleRunnerTransport({ async connect() {}, async disconnect() {}, send() {} });'
          );
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(patchedCode);
          return;
        }
      } catch {
        // Fall through to default Vite middleware on error
      }
      next();
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`POS Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
