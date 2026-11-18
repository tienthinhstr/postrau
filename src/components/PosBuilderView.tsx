import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Printer,
  Save,
  RotateCcw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import {
  Customer,
  Invoice,
  InvoiceItem,
  StoreSettings,
  UnitCode,
} from '../types/pos';
import {
  calculateInvoiceTotals,
  calculateLineItem,
  formatCurrencyInputWithDots,
  formatQuantity,
  formatVND,
  numberToVietnameseWords,
  parseCurrencyInputWithDots,
} from '../utils/calculations';
import {
  buildInvoiceCreatedAtIso,
  clampInvoiceDateParts,
  formatInvoiceDateIsoValue,
  getLocalTodayParts,
  InvoiceDateParts,
  parseDateInputString,
} from '../utils/invoiceDate';
import { ScannedReceiptData } from './ScanReceiptModal';

interface ManualInvoiceRow {
  rowIndex: number;
  productName: string;
  unitLabel: string;
  quantityStr: string;
  unitPriceStr: string;
}

interface PosBuilderViewProps {
  invoices: Invoice[];
  settings: StoreSettings;
  customers?: Customer[];
  selectedCustomerFromParent?: Customer | null;
  onClearSelectedCustomer?: () => void;
  onQuickAddCustomer?: (customerData: Omit<Customer, 'id'>) => Promise<Customer>;
  onUpdateSettings: (newSettings: StoreSettings) => void;
  onCreateInvoice: (newInvoice: Invoice, openPrintModal: boolean) => void;
  onOpenScanModal?: () => void;
  scannedDraftData?: ScannedReceiptData | null;
  onClearScannedDraft?: () => void;
}

function createEmptyRows(count = 10): ManualInvoiceRow[] {
  return Array.from({ length: count }, (_, idx) => ({
    rowIndex: idx + 1,
    productName: '',
    unitLabel: '',
    quantityStr: '',
    unitPriceStr: '',
  }));
}

function createInitialSampleRows(): ManualInvoiceRow[] {
  const rows = createEmptyRows(10);
  rows[0] = {
    rowIndex: 1,
    productName: 'Cải ngọt Đà Lạt',
    unitLabel: 'Giỏ 20kg',
    quantityStr: '2',
    unitPriceStr: '270.000',
  };
  rows[1] = {
    rowIndex: 2,
    productName: 'Cải thìa (Cải chíp)',
    unitLabel: 'Bịch 5kg',
    quantityStr: '3',
    unitPriceStr: '75.000',
  };
  rows[2] = {
    rowIndex: 3,
    productName: 'Bắp cải trắng',
    unitLabel: 'Kg',
    quantityStr: '15',
    unitPriceStr: '12.000',
  };
  return rows;
}

function inferUnitCode(unitLabel: string): UnitCode {
  const lower = unitLabel.trim().toLowerCase();
  if (lower.includes('giỏ') || lower.includes('sọt')) return 'gio_20kg';
  if (lower.includes('bịch 10') || lower.includes('túi 10')) return 'bich_10kg';
  if (lower.includes('bịch') || lower.includes('túi')) return 'bich_5kg';
  if (lower.includes('bó')) return 'bo';
  if (lower.includes('thùng')) return 'thung';
  if (lower.includes('bắp') || lower.includes('bông') || lower.includes('cây')) return 'bap';
  return 'kg';
}

function inferEstimatedKg(unitLabel: string): number {
  const match = unitLabel.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (match) {
    return parseFloat(match[1].replace(',', '.')) || 1;
  }
  const lower = unitLabel.trim().toLowerCase();
  if (lower.includes('giỏ') || lower.includes('sọt')) return 20;
  if (lower.includes('thùng')) return 15;
  if (lower.includes('bịch') || lower.includes('túi')) return 5;
  if (lower.includes('bó')) return 0.5;
  return 1;
}

const DRAFT_STORAGE_KEY = 'vua_rau_draft_sheet_v1';

interface DraftSheetState {
  customCode: string;
  invoiceDateIso?: string;
  customerName: string;
  customerAddressOrOrg: string;
  rows: ManualInvoiceRow[];
}

function loadInitialDraftSheet(): DraftSheetState {
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        return {
          customCode: String(parsed.customCode ?? ''),
          invoiceDateIso:
            typeof parsed.invoiceDateIso === 'string' ? parsed.invoiceDateIso : undefined,
          customerName: String(parsed.customerName ?? ''),
          customerAddressOrOrg: String(parsed.customerAddressOrOrg ?? ''),
          rows: parsed.rows,
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return {
    customCode: '',
    customerName: 'Chị Tư Lan — Sạp B12',
    customerAddressOrOrg: 'Sạp B12 Chợ Hòa Bình · ĐT: 0909.234.567',
    rows: createInitialSampleRows(),
  };
}

export const PosBuilderView: React.FC<PosBuilderViewProps> = ({
  invoices,
  settings,
  customers = [],
  selectedCustomerFromParent,
  onClearSelectedCustomer,
  onQuickAddCustomer,
  onUpdateSettings,
  onCreateInvoice,
  onOpenScanModal,
  scannedDraftData,
  onClearScannedDraft,
}) => {
  const initialDraft = useMemo(() => loadInitialDraftSheet(), []);
  const initialDateParts = useMemo<InvoiceDateParts>(() => {
    if (initialDraft.invoiceDateIso) {
      const parsed = parseDateInputString(initialDraft.invoiceDateIso);
      if (parsed) return parsed;
    }
    return getLocalTodayParts();
  }, [initialDraft.invoiceDateIso]);

  const [invoiceDateParts, setInvoiceDateParts] = useState<InvoiceDateParts>(initialDateParts);
  const [dayInput, setDayInput] = useState<string>(() =>
    String(initialDateParts.day).padStart(2, '0')
  );
  const [monthInput, setMonthInput] = useState<string>(() =>
    String(initialDateParts.month).padStart(2, '0')
  );
  const [yearInput, setYearInput] = useState<string>(() =>
    String(initialDateParts.year)
  );

  const applyDateParts = (next: InvoiceDateParts) => {
    const clamped = clampInvoiceDateParts(next);
    setInvoiceDateParts(clamped);
    setDayInput(String(clamped.day).padStart(2, '0'));
    setMonthInput(String(clamped.month).padStart(2, '0'));
    setYearInput(String(clamped.year));
    return clamped;
  };

  const commitDateInputs = (
    rawDay = dayInput,
    rawMonth = monthInput,
    rawYear = yearInput
  ): InvoiceDateParts => {
    const parsedYear = parseInt(rawYear, 10);
    const parsedMonth = parseInt(rawMonth, 10);
    const parsedDay = parseInt(rawDay, 10);
    return applyDateParts(
      clampInvoiceDateParts(
        {
          day: Number.isFinite(parsedDay) ? parsedDay : invoiceDateParts.day,
          month: Number.isFinite(parsedMonth) ? parsedMonth : invoiceDateParts.month,
          year: Number.isFinite(parsedYear) ? parsedYear : invoiceDateParts.year,
        },
        invoiceDateParts
      )
    );
  };

  const defaultCode = useMemo(() => {
    const d = String(invoiceDateParts.day).padStart(2, '0');
    const m = String(invoiceDateParts.month).padStart(2, '0');
    const seq = String(invoices.length + 1).padStart(3, '0');
    return `HD-${d}${m}-${seq}`;
  }, [invoices.length, invoiceDateParts.day, invoiceDateParts.month]);

  const [customCode, setCustomCode] = useState<string>(initialDraft.customCode);
  const [customerName, setCustomerName] = useState<string>(initialDraft.customerName);
  const [customerAddressOrOrg, setCustomerAddressOrOrg] = useState<string>(
    initialDraft.customerAddressOrOrg
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const addressInputRef = React.useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ManualInvoiceRow[]>(initialDraft.rows);

  const [storeNameInput, setStoreNameInput] = useState<string>(settings.storeName);
  const [contactInput, setContactInput] = useState<string>(() => {
    return [settings.phone, settings.address].filter(Boolean).join(' — ');
  });

  const isEditingStoreNameRef = useRef(false);
  const isEditingContactRef = useRef(false);

  useEffect(() => {
    if (!isEditingStoreNameRef.current) {
      setStoreNameInput(settings.storeName);
    }
  }, [settings.storeName]);

  useEffect(() => {
    if (!isEditingContactRef.current) {
      const combined = [settings.phone, settings.address].filter(Boolean).join(' — ');
      setContactInput(combined);
    }
  }, [settings.phone, settings.address]);

  const commitStoreName = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== settings.storeName) {
      onUpdateSettings({ ...settings, storeName: trimmed });
    }
  };

  const commitContactInput = (val: string) => {
    const dashIdx = val.indexOf('—') !== -1 ? val.indexOf('—') : val.indexOf(' - ');
    let newPhone = '';
    let newAddress = '';
    if (dashIdx !== -1) {
      newPhone = val.substring(0, dashIdx).trim();
      const sepLen = val.indexOf('—') !== -1 ? 1 : 3;
      newAddress = val.substring(dashIdx + sepLen).trim();
    } else {
      if (/^[0-9+\s().]+$/.test(val.trim())) {
        newPhone = val.trim();
        newAddress = '';
      } else {
        newPhone = '';
        newAddress = val.trim();
      }
    }
    if (newPhone !== settings.phone || newAddress !== settings.address) {
      onUpdateSettings({
        ...settings,
        phone: newPhone,
        address: newAddress,
      });
    }
  };

  // Filter suggestions from directory matching input
  const matchingSuggestions = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q) return [];
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.stallOrAddress && c.stallOrAddress.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
    );
  }, [customerName, customers]);

  // Sync selectedCustomerFromParent if navigated from Customers list
  useEffect(() => {
    if (selectedCustomerFromParent) {
      setSelectedCustomerId(selectedCustomerFromParent.id);
      setCustomerName(selectedCustomerFromParent.name);
      const addrParts = [];
      if (selectedCustomerFromParent.stallOrAddress) {
        addrParts.push(selectedCustomerFromParent.stallOrAddress);
      }
      if (selectedCustomerFromParent.phone) {
        addrParts.push(`ĐT: ${selectedCustomerFromParent.phone}`);
      }
      setCustomerAddressOrOrg(addrParts.join(' · '));
      if (onClearSelectedCustomer) {
        onClearSelectedCustomer();
      }
    }
  }, [selectedCustomerFromParent, onClearSelectedCustomer]);

  // Sync scannedDraftData from AI Scan Receipt modal
  useEffect(() => {
    if (scannedDraftData) {
      if (scannedDraftData.invoiceCode) {
        setCustomCode(scannedDraftData.invoiceCode);
      }
      if (scannedDraftData.invoiceDate) {
        const parsedScannedDate = parseDateInputString(scannedDraftData.invoiceDate);
        if (parsedScannedDate) {
          applyDateParts(parsedScannedDate);
        }
      }
      if (scannedDraftData.customerName) {
        setCustomerName(scannedDraftData.customerName);
      }
      const addrParts = [scannedDraftData.customerAddress, scannedDraftData.customerPhone].filter(Boolean);
      if (addrParts.length > 0) {
        setCustomerAddressOrOrg(addrParts.join(' · '));
      }

      if (scannedDraftData.items && scannedDraftData.items.length > 0) {
        const rowCount = Math.max(10, scannedDraftData.items.length + 2);
        const newRows = createEmptyRows(rowCount);
        scannedDraftData.items.forEach((it, idx) => {
          let name = it.productName;
          if (it.tareWeight && it.tareWeight > 0) {
            name += ` (Trừ bì ${it.tareWeight}kg)`;
          }
          newRows[idx] = {
            rowIndex: idx + 1,
            productName: name,
            unitLabel: it.unitLabel || 'Kg',
            quantityStr: String(it.quantity),
            unitPriceStr: formatCurrencyInputWithDots(String(it.unitPrice)),
          };
        });
        setRows(newRows);
      }

      onClearScannedDraft?.();
    }
  }, [scannedDraftData, onClearScannedDraft]);

  // Find matched customer from directory
  const matchedCustomer = useMemo(() => {
    if (selectedCustomerId) {
      const found = customers.find((c) => c.id === selectedCustomerId);
      if (found) return found;
    }
    const trimmed = customerName.trim().toLowerCase();
    if (!trimmed) return null;
    return (
      customers.find((c) => c.name.trim().toLowerCase() === trimmed) ||
      customers.find(
        (c) =>
          c.stallOrAddress &&
          trimmed.includes(c.stallOrAddress.trim().toLowerCase())
      ) ||
      null
    );
  }, [selectedCustomerId, customerName, customers]);

  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    const addrParts = [];
    if (cust.stallOrAddress) addrParts.push(cust.stallOrAddress);
    if (cust.phone) addrParts.push(`ĐT: ${cust.phone}`);
    setCustomerAddressOrOrg(addrParts.join(' · '));
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    setTimeout(() => {
      addressInputRef.current?.focus();
    }, 40);
  };

  React.useEffect(() => {
    try {
      const draft: DraftSheetState = {
        customCode,
        invoiceDateIso: formatInvoiceDateIsoValue(invoiceDateParts),
        customerName,
        customerAddressOrOrg,
        rows,
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  }, [customCode, invoiceDateParts, customerName, customerAddressOrOrg, rows]);

  const [savedBannerMsg, setSavedBannerMsg] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const effectiveInvoiceCode = customCode.trim() || defaultCode;

  // Compute each row's THÀNH TIỀN and build valid InvoiceItems automatically
  const computedRows = useMemo(() => {
    return rows.map((row) => {
      const qty = parseFloat(row.quantityStr.replace(',', '.'));
      const price = parseCurrencyInputWithDots(row.unitPriceStr);
      const validQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
      const validPrice = Number.isFinite(price) && price > 0 ? price : 0;

      const calc = calculateLineItem({
        grossQuantity: validQty,
        tareWeight: 0,
        unitPrice: validPrice,
      });

      const hasContent =
        row.productName.trim().length > 0 || validQty > 0 || validPrice > 0;

      return {
        ...row,
        validQty,
        validPrice,
        lineTotal: calc.lineTotal,
        hasContent,
      };
    });
  }, [rows]);

  // Extract valid filled items for invoice calculation
  const filledInvoiceItems: InvoiceItem[] = useMemo(() => {
    return computedRows
      .filter((r) => r.productName.trim().length > 0 && r.validQty > 0)
      .map((r) => {
        const unitLabel = r.unitLabel.trim() || 'Kg';
        return {
          id: `line-${r.rowIndex}`,
          productId: `manual-${r.rowIndex}-${r.productName.trim().toLowerCase()}`,
          productName: r.productName.trim(),
          category: 'rau_cai',
          unitCode: inferUnitCode(unitLabel),
          unitLabel,
          grossQuantity: r.validQty,
          tareWeight: 0,
          netQuantity: r.validQty,
          unitPrice: r.validPrice,
          estimatedKgPerUnit: inferEstimatedKg(unitLabel),
          lineTotal: r.lineTotal,
        };
      });
  }, [computedRows]);

  // Calculate grand total (all newly created invoices default to unpaid / chưa thu)
  const invoiceTotals = useMemo(() => {
    return calculateInvoiceTotals({
      items: computedRows.map((r) => ({ lineTotal: r.lineTotal })),
      discountAmount: 0,
      crateDepositAmount: 0,
      paidAmount: 0,
    });
  }, [computedRows]);

  const amountInWords = useMemo(
    () => numberToVietnameseWords(invoiceTotals.totalAmount),
    [invoiceTotals.totalAmount]
  );

  const handleRowChange = (
    rowIndex: number,
    field: keyof Omit<ManualInvoiceRow, 'rowIndex'>,
    value: string
  ) => {
    setValidationError(null);
    const nextValue =
      field === 'unitPriceStr' ? formatCurrencyInputWithDots(value) : value;
    setRows((prev) =>
      prev.map((r) => (r.rowIndex === rowIndex ? { ...r, [field]: nextValue } : r))
    );
  };

  const handleAddMoreRows = () => {
    setRows((prev) => [
      ...prev,
      {
        rowIndex: prev.length + 1,
        productName: '',
        unitLabel: '',
        quantityStr: '',
        unitPriceStr: '',
      },
      {
        rowIndex: prev.length + 2,
        productName: '',
        unitLabel: '',
        quantityStr: '',
        unitPriceStr: '',
      },
    ]);
  };

  const handleClearSheet = () => {
    setRows(createEmptyRows(10));
    setCustomerName('');
    setCustomerAddressOrOrg('');
    setCustomCode('');
    applyDateParts(getLocalTodayParts());
    setValidationError(null);
  };

  const handleSaveInvoice = (openPrintModal: boolean) => {
    commitStoreName(storeNameInput);
    commitContactInput(contactInput);
    const committedDate = commitDateInputs();

    if (filledInvoiceItems.length === 0) {
      setValidationError(
        'Vui lòng nhập ít nhất 1 mặt hàng kèm số lượng và đơn giá vào bảng hóa đơn.'
      );
      return;
    }

    const createdIso = buildInvoiceCreatedAtIso(committedDate);
    const cleanCustomerName = customerName.trim() || 'Khách Mua Lẻ';
    const cleanAddress = customerAddressOrOrg.trim();

    const customerId = matchedCustomer
      ? matchedCustomer.id
      : `cust-${cleanCustomerName.toLowerCase().replace(/\s+/g, '-')}`;
    const customerPhone = matchedCustomer?.phone || '';
    const customerType = matchedCustomer?.type || 'moi_si';

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      code: effectiveInvoiceCode,
      createdAt: createdIso,
      customerId,
      customerName: cleanCustomerName,
      customerPhone,
      customerAddress: cleanAddress,
      customerType,
      items: filledInvoiceItems,
      subtotal: invoiceTotals.subtotal,
      discountAmount: 0,
      crateDepositAmount: 0,
      totalAmount: invoiceTotals.totalAmount,
      paidAmount: 0,
      remainingAmount: invoiceTotals.totalAmount,
      paymentStatus: 'unpaid',
      paymentMethod: 'cash',
      payments: [],
      printedCount: openPrintModal ? 1 : 0,
    };

    onCreateInvoice(newInvoice, openPrintModal);

    // Clear rows for the next bill
    setRows(createEmptyRows(10));
    setCustomCode('');
    setValidationError(null);

    if (!openPrintModal) {
      setSavedBannerMsg(
        `Đã lưu Hóa đơn ${newInvoice.code} — Tổng tiền: ${formatVND(
          newInvoice.totalAmount
        )} (Mặc định: Chưa thu)`
      );
      setTimeout(() => setSavedBannerMsg(null), 4000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Feedback Banners */}
      {savedBannerMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 text-xs sm:text-sm font-semibold flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            {savedBannerMsg}
          </span>
        </div>
      )}

      {validationError && (
        <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs sm:text-sm font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* THE CLASSIC VIETNAMESE "HÓA ĐƠN BÁN LẺ" SHEET (Matches user reference image) */}
      <div className="bg-[#fcfdff] border-2 border-[#1e40af] rounded-md shadow-sm p-3 sm:p-6 text-[#172554]">
        {/* 1. TOP HEADER: ĐƠN VỊ (Left) & HÓA ĐƠN BÁN LẺ + Số (Right) */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start pb-3">
          {/* Left: ĐƠN VỊ (Store Name & Phone/Address) */}
          <div className="sm:col-span-7 space-y-1 text-xs sm:text-sm">
            <div className="flex items-baseline gap-1.5">
              <label
                htmlFor="hd-store-name"
                className="font-bold uppercase tracking-tight whitespace-nowrap text-[#1e3a8a]"
              >
                ĐƠN VỊ:
              </label>
              <input
                id="hd-store-name"
                type="text"
                value={storeNameInput}
                placeholder="Tên vựa / cửa hàng..."
                onFocus={() => {
                  isEditingStoreNameRef.current = true;
                }}
                onChange={(e) => {
                  setStoreNameInput(e.target.value);
                }}
                onBlur={() => {
                  isEditingStoreNameRef.current = false;
                  commitStoreName(storeNameInput);
                }}
                className="w-full font-bold text-[#172554] bg-transparent border-b border-dotted border-[#1e40af]/60 focus:border-[#1e40af] focus:outline-none px-1 py-0.5"
              />
            </div>
            <div className="flex items-center gap-1.5 pt-0.5 min-w-0">
              <label
                htmlFor="hd-store-phone"
                className="text-[10px] sm:text-xs font-semibold text-[#1e3a8a] whitespace-nowrap shrink-0"
              >
                ĐT / ĐC:
              </label>
              <input
                id="hd-store-phone"
                type="text"
                value={contactInput}
                placeholder="SĐT — Địa chỉ vựa rau (VD: 0903.111.222 — Số 122 QL1, K.V Tâm Thọ...)"
                onFocus={() => {
                  isEditingContactRef.current = true;
                }}
                onChange={(e) => {
                  setContactInput(e.target.value);
                }}
                onBlur={() => {
                  isEditingContactRef.current = false;
                  commitContactInput(contactInput);
                }}
                className={`w-full text-[#1e3a8a] bg-transparent border-b border-dotted border-[#1e40af]/60 focus:border-[#1e40af] focus:outline-none px-1 py-0.5 ${
                  contactInput.length > 48
                    ? 'text-[9.5px] sm:text-[11px] tracking-tight'
                    : contactInput.length > 32
                    ? 'text-[10.5px] sm:text-xs'
                    : 'text-xs'
                }`}
              />
            </div>
          </div>

          {/* Right: HÓA ĐƠN BÁN LẺ Title & Invoice Number */}
          <div className="sm:col-span-5 flex flex-col sm:items-end justify-between">
            <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide text-[#1e3a8a] text-center sm:text-right w-full">
              HÓA ĐƠN BÁN LẺ
            </h1>
            <div className="flex items-baseline justify-end gap-1.5 mt-1 w-full sm:w-auto">
              <label
                htmlFor="hd-invoice-code"
                className="text-xs sm:text-sm font-semibold text-[#1e3a8a] whitespace-nowrap"
              >
                Số:
              </label>
              <input
                id="hd-invoice-code"
                type="text"
                value={customCode}
                placeholder={defaultCode}
                onChange={(e) => setCustomCode(e.target.value)}
                className="w-32 font-mono text-xs sm:text-sm font-bold text-[#172554] bg-transparent border-b border-dotted border-[#1e40af]/70 focus:border-[#1e40af] focus:outline-none px-1 py-0.5 text-right"
              />
            </div>
          </div>
        </div>

        {/* 2. CUSTOMER INFO LINES: Họ tên người mua hàng & Đơn vị, cơ quan */}
        <div className="space-y-2 pb-4 text-xs sm:text-sm">
          <div className="relative flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
            <label
              htmlFor="hd-customer-name"
              className="font-semibold text-[#1e3a8a] whitespace-nowrap shrink-0"
            >
              Họ tên người mua hàng:
            </label>
            <div className="relative flex-1 w-full">
              <input
                id="hd-customer-name"
                type="text"
                value={customerName}
                autoComplete="off"
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomerName(val);
                  setShowSuggestions(val.trim().length > 0);
                  setHighlightedIndex(0);

                  const exact = customers.find(
                    (c) => c.name.trim().toLowerCase() === val.trim().toLowerCase()
                  );
                  if (exact) {
                    setSelectedCustomerId(exact.id);
                    const addrParts = [];
                    if (exact.stallOrAddress) addrParts.push(exact.stallOrAddress);
                    if (exact.phone) addrParts.push(`ĐT: ${exact.phone}`);
                    setCustomerAddressOrOrg(addrParts.join(' · '));
                  }
                }}
                onFocus={() => {
                  if (customerName.trim().length > 0 && matchingSuggestions.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                onBlur={() => {
                  // Delay so clicks on suggestion items are registered
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    if (matchingSuggestions.length > 0) {
                      e.preventDefault();
                      setShowSuggestions(true);
                      setHighlightedIndex((prev) => (prev + 1) % matchingSuggestions.length);
                    }
                  } else if (e.key === 'ArrowUp') {
                    if (matchingSuggestions.length > 0) {
                      e.preventDefault();
                      setHighlightedIndex(
                        (prev) => (prev - 1 + matchingSuggestions.length) % matchingSuggestions.length
                      );
                    }
                  } else if (e.key === 'Enter') {
                    if (matchingSuggestions.length > 0) {
                      e.preventDefault();
                      const target =
                        highlightedIndex >= 0 && highlightedIndex < matchingSuggestions.length
                          ? matchingSuggestions[highlightedIndex]
                          : matchingSuggestions[0];
                      if (target) {
                        handleSelectCustomer(target);
                      }
                    } else {
                      e.preventDefault();
                      addressInputRef.current?.focus();
                    }
                  } else if (e.key === 'Escape') {
                    setShowSuggestions(false);
                  }
                }}
                placeholder="Nhập tên khách hàng (VD: Anh Phan, Chị Tư Lan)..."
                className="w-full font-bold text-sm sm:text-base text-slate-900 bg-transparent border-b border-dotted border-[#1e40af]/70 focus:border-[#1e40af] focus:bg-blue-50/30 focus:outline-none px-1.5 py-1"
              />

              {/* Autocomplete Suggestions Popup when typing */}
              {showSuggestions && matchingSuggestions.length > 0 && (
                <div
                  data-testid="customer-suggestions-dropdown"
                  className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#1e40af]/30 rounded-xl shadow-lg overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto"
                >
                  <div className="px-3 py-1.5 bg-blue-50/90 text-[11px] font-bold text-[#1e3a8a] flex items-center justify-between">
                    <span>Gợi ý khách quen ({matchingSuggestions.length}):</span>
                    <span className="text-[10px] text-slate-500 font-normal">Bấm Enter ↵ để tự nhảy thông tin</span>
                  </div>
                  {matchingSuggestions.map((c, idx) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectCustomer(c);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${
                        idx === highlightedIndex
                          ? 'bg-blue-100/90 text-blue-950 font-bold'
                          : 'hover:bg-blue-50/60 text-slate-800'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-extrabold text-sm text-[#1e3a8a] flex items-center gap-1.5">
                          <span>{c.name}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                            {c.type === 'moi_si'
                              ? 'Mối sỉ'
                              : c.type === 'nha_hang'
                              ? 'Nhà hàng'
                              : 'Khách lẻ'}
                          </span>
                        </div>
                        {(c.stallOrAddress || c.phone) && (
                          <div className="text-[11px] text-slate-500">
                            {[c.stallOrAddress, c.phone].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                        Enter ↵
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
            <label
              htmlFor="hd-customer-org"
              className="font-semibold text-[#1e3a8a] whitespace-nowrap shrink-0"
            >
              Đơn vị, cơ quan (Địa chỉ / SĐT):
            </label>
            <input
              ref={addressInputRef}
              id="hd-customer-org"
              type="text"
              value={customerAddressOrOrg}
              onChange={(e) => setCustomerAddressOrOrg(e.target.value)}
              placeholder="Nhập sạp chợ, địa chỉ hoặc số điện thoại..."
              className="w-full text-slate-800 bg-transparent border-b border-dotted border-[#1e40af]/70 focus:border-[#1e40af] focus:bg-blue-50/30 focus:outline-none px-1.5 py-1"
            />
          </div>
        </div>

        {/* Common Units Datalist for fast mobile/desktop typing */}
        <datalist id="common-vegetable-units">
          <option value="Kg" />
          <option value="Bó" />
          <option value="Bịch 5kg" />
          <option value="Bịch 10kg" />
          <option value="Giỏ 20kg" />
          <option value="Sọt" />
          <option value="Thùng" />
          <option value="Bắp" />
          <option value="Bông" />
        </datalist>

        {/* 3. THE BLUE-BORDERED INVOICE TABLE (Exact 6 columns from reference image, fits 100% on 390px mobile) */}
        <div className="border-2 border-[#1e40af] overflow-hidden">
          <table className="w-full table-fixed border-collapse text-[11px] sm:text-sm">
            <thead>
              <tr className="bg-[#dbeafe]/70 text-[#1e3a8a] border-b-2 border-[#1e40af] text-center font-bold">
                <th className="border-r border-[#1e40af] py-1.5 px-0.5 w-[26px] sm:w-11 leading-tight">
                  SỐ
                  <br />
                  TT
                </th>
                <th className="border-r border-[#1e40af] py-1.5 px-1.5 sm:px-2 w-auto leading-tight">
                  TÊN HÀNG &amp; QUY CÁCH
                </th>
                <th className="border-r border-[#1e40af] py-1.5 px-0.5 w-[54px] sm:w-24 leading-tight">
                  Đơn vị
                  <br />
                  tính
                </th>
                <th className="border-r border-[#1e40af] py-1.5 px-0.5 w-[38px] sm:w-20 leading-tight">
                  Số
                  <br />
                  lượng
                </th>
                <th className="border-r border-[#1e40af] py-1.5 px-1 w-[62px] sm:w-28 leading-tight">
                  Giá
                  <br />
                  đơn vị
                </th>
                <th className="py-1.5 px-1 sm:px-2 w-[72px] sm:w-32 leading-tight">
                  THÀNH
                  <br className="sm:hidden" /> TIỀN
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e40af]/60">
              {computedRows.map((row, idx) => {
                const isEven = idx % 2 === 1;
                return (
                  <tr
                    key={row.rowIndex}
                    className={`${
                      isEven ? 'bg-[#eff6ff]/40' : 'bg-white'
                    } focus-within:bg-amber-50/60 transition-colors`}
                  >
                    {/* Column 1: SỐ TT */}
                    <td className="border-r border-[#1e40af] py-1 px-0.5 text-center font-mono font-bold text-[#1e3a8a] select-none">
                      {row.rowIndex}
                    </td>

                    {/* Column 2: TÊN HÀNG VÀ QUY CÁCH PHẨM CHẤT */}
                    <td className="border-r border-[#1e40af] p-0">
                      <input
                        type="text"
                        aria-label={`Tên hàng dòng ${row.rowIndex}`}
                        value={row.productName}
                        onChange={(e) =>
                          handleRowChange(row.rowIndex, 'productName', e.target.value)
                        }
                        placeholder={idx === 0 ? 'Tên rau...' : ''}
                        className="w-full min-h-[38px] sm:min-h-[40px] px-1.5 sm:px-2 py-1 bg-transparent text-slate-900 font-semibold placeholder:text-slate-300 placeholder:font-normal focus:outline-none truncate"
                      />
                    </td>

                    {/* Column 3: Đơn vị tính */}
                    <td className="border-r border-[#1e40af] p-0">
                      <input
                        type="text"
                        list="common-vegetable-units"
                        aria-label={`Đơn vị tính dòng ${row.rowIndex}`}
                        value={row.unitLabel}
                        onChange={(e) =>
                          handleRowChange(row.rowIndex, 'unitLabel', e.target.value)
                        }
                        placeholder={idx === 0 ? 'Kg...' : ''}
                        className="w-full min-h-[38px] sm:min-h-[40px] px-1 py-1 text-center bg-transparent text-slate-800 font-medium placeholder:text-slate-300 placeholder:font-normal focus:outline-none"
                      />
                    </td>

                    {/* Column 4: Số lượng */}
                    <td className="border-r border-[#1e40af] p-0">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        aria-label={`Số lượng dòng ${row.rowIndex}`}
                        value={row.quantityStr}
                        onChange={(e) =>
                          handleRowChange(row.rowIndex, 'quantityStr', e.target.value)
                        }
                        placeholder={idx === 0 ? '0' : ''}
                        className="w-full min-h-[38px] sm:min-h-[40px] px-1 py-1 text-right font-mono font-bold bg-transparent text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:outline-none tabular-nums appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </td>

                    {/* Column 5: Giá đơn vị (Auto-inserts thousand dots as user types) */}
                    <td className="border-r border-[#1e40af] p-0">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Giá đơn vị dòng ${row.rowIndex}`}
                        value={row.unitPriceStr}
                        onChange={(e) =>
                          handleRowChange(row.rowIndex, 'unitPriceStr', e.target.value)
                        }
                        placeholder={idx === 0 ? '0' : ''}
                        className="w-full min-h-[38px] sm:min-h-[40px] px-1 py-1 text-right font-mono font-semibold bg-transparent text-slate-900 placeholder:text-slate-300 placeholder:font-normal focus:outline-none tabular-nums"
                      />
                    </td>

                    {/* Column 6: THÀNH TIỀN (Auto-calculated by machine) */}
                    <td
                      data-testid={`row-total-${row.rowIndex}`}
                      className="py-1 px-1 sm:px-2 text-right font-mono font-extrabold text-[#172554] bg-[#dbeafe]/25 tabular-nums select-all"
                    >
                      {row.lineTotal > 0 ? formatVND(row.lineTotal, false) : ''}
                    </td>
                  </tr>
                );
              })}

              {/* Summary "Cộng" Row at the bottom of the table */}
              <tr className="bg-[#bfdbfe]/70 border-t-2 border-[#1e40af] font-bold text-[#1e3a8a]">
                <td
                  colSpan={2}
                  className="border-r border-[#1e40af] py-2 px-2 text-center italic text-xs sm:text-base"
                >
                  Cộng
                </td>
                <td className="border-r border-[#1e40af] py-2 px-0.5 text-center text-[10px] sm:text-xs font-mono text-[#1e3a8a]">
                  {filledInvoiceItems.length > 0 ? `${filledInvoiceItems.length} món` : ''}
                </td>
                <td className="border-r border-[#1e40af] py-2 px-1 text-right font-mono text-[10px] sm:text-xs tabular-nums">
                  {filledInvoiceItems.length > 0
                    ? formatQuantity(
                        filledInvoiceItems.reduce((s, i) => s + i.netQuantity, 0)
                      )
                    : ''}
                </td>
                <td className="border-r border-[#1e40af] py-2 px-1" />
                <td
                  data-testid="pos-grand-total"
                  className="py-2 px-1 sm:px-2 text-right font-mono text-xs sm:text-lg font-extrabold text-[#1e3a8a] tabular-nums"
                >
                  {formatVND(invoiceTotals.totalAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Add More Rows Button right underneath the table */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleAddMoreRows}
            className="min-h-[38px] px-3 py-1 text-xs font-bold text-[#1e40af] hover:bg-blue-50 rounded-lg flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm dòng ({rows.length} dòng)
          </button>

          <button
            type="button"
            onClick={handleClearSheet}
            className="min-h-[38px] px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Xóa trắng tờ hóa đơn
          </button>
        </div>

        {/* 4. AMOUNT IN WORDS & DATE LINE (Exact match to paper form) */}
        <div className="mt-3 space-y-2 text-xs sm:text-sm">
          <div className="flex flex-wrap items-baseline gap-1.5 border-b border-dotted border-[#1e40af]/70 pb-1">
            <span className="font-bold italic text-[#1e3a8a] shrink-0">
              Cộng thành tiền (viết bằng chữ):
            </span>
            <span
              data-testid="pos-amount-in-words"
              className="font-semibold text-slate-900 italic"
            >
              {amountInWords}
            </span>
          </div>

          <div className="flex justify-end pt-1">
            <div className="inline-flex flex-wrap items-center justify-end gap-1 italic text-[#1e3a8a] text-xs sm:text-sm">
              <span>Ngày</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Ngày lập hóa đơn"
                maxLength={2}
                value={dayInput}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setDayInput(digits);
                  const d = parseInt(digits, 10);
                  if (digits.length === 2 && d >= 1 && d <= 31) {
                    setInvoiceDateParts((prev) => clampInvoiceDateParts({ ...prev, day: d }));
                  }
                }}
                onBlur={() => commitDateInputs(dayInput, monthInput, yearInput)}
                className="w-8 text-center font-mono font-bold not-italic text-[#172554] bg-transparent border-b border-dotted border-[#1e40af]/70 focus:border-[#1e40af] focus:bg-blue-50/40 focus:outline-none py-0.5"
              />
              <span>tháng</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Tháng lập hóa đơn"
                maxLength={2}
                value={monthInput}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                  setMonthInput(digits);
                  const m = parseInt(digits, 10);
                  if (digits.length === 2 && m >= 1 && m <= 12) {
                    setInvoiceDateParts((prev) => clampInvoiceDateParts({ ...prev, month: m }));
                  }
                }}
                onBlur={() => commitDateInputs(dayInput, monthInput, yearInput)}
                className="w-8 text-center font-mono font-bold not-italic text-[#172554] bg-transparent border-b border-dotted border-[#1e40af]/70 focus:border-[#1e40af] focus:bg-blue-50/40 focus:outline-none py-0.5"
              />
              <span>năm</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Năm lập hóa đơn"
                maxLength={4}
                value={yearInput}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setYearInput(digits);
                  const y = parseInt(digits, 10);
                  if (digits.length === 4 && y >= 2000 && y <= 2099) {
                    setInvoiceDateParts((prev) => clampInvoiceDateParts({ ...prev, year: y }));
                  }
                }}
                onBlur={() => commitDateInputs(dayInput, monthInput, yearInput)}
                className="w-12 text-center font-mono font-bold not-italic text-[#172554] bg-transparent border-b border-dotted border-[#1e40af]/70 focus:border-[#1e40af] focus:bg-blue-50/40 focus:outline-none py-0.5"
              />
              <label
                title="Chọn ngày trên lịch"
                className="relative ml-1 inline-flex items-center justify-center p-1 rounded-md text-[#1e40af]/80 hover:text-[#1e40af] hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                <input
                  type="date"
                  aria-label="Chọn ngày từ lịch"
                  value={formatInvoiceDateIsoValue(invoiceDateParts)}
                  onChange={(e) => {
                    const parsed = parseDateInputString(e.target.value);
                    if (parsed) {
                      applyDateParts(parsed);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>

        {/* 5. THREE-COLUMN SIGNATURE FOOTER (Blank signature spaces — no names printed below) */}
        <div className="mt-4 pt-3 border-t border-[#1e40af]/30 grid grid-cols-3 gap-2 sm:gap-4 text-center">
          {/* Column 1: NGƯỜI NHẬN HÀNG */}
          <div className="py-2">
            <p className="font-bold text-[11px] sm:text-sm uppercase text-[#1e3a8a]">
              NGƯỜI NHẬN HÀNG
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
              (Ký, ghi rõ họ tên)
            </p>
            <div className="h-10 sm:h-12" />
          </div>

          {/* Column 2: ĐÃ NHẬN ĐỦ TIỀN */}
          <div className="py-2">
            <p className="font-bold text-[11px] sm:text-sm uppercase text-[#1e3a8a]">
              ĐÃ NHẬN ĐỦ TIỀN
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
              (Ký, ghi rõ họ tên)
            </p>
            <div className="h-10 sm:h-12" />
          </div>

          {/* Column 3: NGƯỜI VIẾT HÓA ĐƠN */}
          <div className="py-2">
            <p className="font-bold text-[11px] sm:text-sm uppercase text-[#1e3a8a]">
              NGƯỜI VIẾT HÓA ĐƠN
            </p>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
              (Ký, ghi rõ họ tên)
            </p>
            <div className="h-10 sm:h-12" />
          </div>
        </div>
      </div>

      {/* PRIMARY ACTION BUTTONS BELOW THE HÓA ĐƠN SHEET */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 bg-white border border-slate-200 rounded-2xl p-4">
        <button
          type="button"
          onClick={() => handleSaveInvoice(false)}
          className="min-h-[48px] px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-slate-900 font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Save className="w-4 h-4 shrink-0" />
          Lưu Hóa Đơn (Không in)
        </button>

        <button
          type="button"
          onClick={() => handleSaveInvoice(true)}
          className="min-h-[48px] px-6 py-3 bg-[#1e40af] hover:bg-[#1e3a8a] text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99]"
        >
          <Printer className="w-4 h-4 shrink-0" />
          Lưu &amp; Xuất
        </button>
      </div>
    </div>
  );
};
