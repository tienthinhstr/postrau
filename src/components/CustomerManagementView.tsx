import React, { useMemo, useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  DollarSign,
  Phone,
  MapPin,
  FileText,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Edit2,
  Trash2,
  History,
  ArrowRight,
  CreditCard,
  Banknote,
  Copy,
} from 'lucide-react';
import { Customer, CustomerDebtPayment, Invoice } from '../types/pos';
import { formatCurrencyInputWithDots, formatVND, parseCurrencyInputWithDots } from '../utils/calculations';

interface CustomerManagementViewProps {
  customers: Customer[];
  invoices: Invoice[];
  currentUserName?: string;
  onAddCustomer: (customerData: Omit<Customer, 'id'>) => Promise<Customer>;
  onUpdateCustomer: (customer: Customer) => Promise<void>;
  onDeleteCustomer: (customerId: string) => Promise<void>;
  onSettleCustomerDebt: (params: {
    customer: Customer;
    amountToPay: number;
    paymentMethod: 'cash' | 'transfer';
    note?: string;
  }) => Promise<{ settledInvoicesCount: number; newRemainingDebt: number }>;
  onSelectCustomerForNewInvoice: (customer: Customer) => void;
}

export const CustomerManagementView: React.FC<CustomerManagementViewProps> = ({
  customers,
  invoices,
  currentUserName,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onSettleCustomerDebt,
  onSelectCustomerForNewInvoice,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'debt_only' | 'moi_si' | 'nha_hang' | 'khach_le'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal 1: Register / Edit Customer
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formType, setFormType] = useState<Customer['type']>('moi_si');
  const [formInitialDebt, setFormInitialDebt] = useState('0');
  const [formNote, setFormNote] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Modal 2: Pay Debt / Thu Nợ
  const [debtTargetCustomer, setDebtTargetCustomer] = useState<Customer | null>(null);
  const [debtAmountInput, setDebtAmountInput] = useState('');
  const [debtMethod, setDebtMethod] = useState<'cash' | 'transfer'>('cash');
  const [debtNote, setDebtNote] = useState('');
  const [processingDebt, setProcessingDebt] = useState(false);

  // Modal 3: View Customer History
  const [historyTargetCustomer, setHistoryTargetCustomer] = useState<Customer | null>(null);

  // Modal 4: Delete Customer Confirmation (replaces window.confirm for iframe safety)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Helper to calculate total debt, invoices, and totals for each customer
  const customerStatsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        totalPurchased: number;
        invoiceDebt: number;
        initialDebt: number;
        totalDebt: number;
        invoicesCount: number;
        unpaidInvoices: Invoice[];
        paidInvoices: Invoice[];
      }
    >();

    for (const cust of customers) {
      const custInvoices = invoices.filter(
        (inv) =>
          inv.customerId === cust.id ||
          inv.customerName.trim().toLowerCase() === cust.name.trim().toLowerCase()
      );

      const totalPurchased = custInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      const invoiceDebt = custInvoices.reduce((sum, inv) => sum + (inv.remainingAmount || 0), 0);
      const initialDebt = Math.max(0, cust.initialDebt || 0);
      const totalDebt = invoiceDebt + initialDebt;

      const unpaidInvoices = custInvoices
        .filter((inv) => (inv.remainingAmount || 0) > 0)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const paidInvoices = custInvoices
        .filter((inv) => (inv.remainingAmount || 0) === 0)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      map.set(cust.id, {
        totalPurchased,
        invoiceDebt,
        initialDebt,
        totalDebt,
        invoicesCount: custInvoices.length,
        unpaidInvoices,
        paidInvoices,
      });
    }

    return map;
  }, [customers, invoices]);

  // Overall aggregate stats
  const overallStats = useMemo(() => {
    let totalAllDebt = 0;
    let debtCustomersCount = 0;
    let totalAllPurchased = 0;

    for (const [, stats] of customerStatsMap) {
      totalAllDebt += stats.totalDebt;
      totalAllPurchased += stats.totalPurchased;
      if (stats.totalDebt > 0) {
        debtCustomersCount += 1;
      }
    }

    return {
      totalAllDebt,
      debtCustomersCount,
      totalAllPurchased,
    };
  }, [customerStatsMap]);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      const stats = customerStatsMap.get(cust.id);
      const debt = stats?.totalDebt || 0;

      // Filter by type
      if (typeFilter === 'debt_only' && debt <= 0) return false;
      if (typeFilter === 'moi_si' && cust.type !== 'moi_si') return false;
      if (typeFilter === 'nha_hang' && cust.type !== 'nha_hang') return false;
      if (typeFilter === 'khach_le' && cust.type !== 'khach_le') return false;

      // Filter by search
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchName = cust.name.toLowerCase().includes(term);
        const matchPhone = cust.phone.toLowerCase().includes(term);
        const matchAddress = cust.stallOrAddress.toLowerCase().includes(term);
        return matchName || matchPhone || matchAddress;
      }

      return true;
    });
  }, [customers, customerStatsMap, typeFilter, searchTerm]);

  // Open modal to add or edit
  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormAddress('');
    setFormType('moi_si');
    setFormInitialDebt('0');
    setFormNote('');
    setErrorMessage(null);
    setShowCustomerModal(true);
  };

  const handleOpenEditModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setFormName(cust.name);
    setFormPhone(cust.phone);
    setFormAddress(cust.stallOrAddress);
    setFormType(cust.type);
    setFormInitialDebt(formatCurrencyInputWithDots(cust.initialDebt || 0));
    setFormNote(cust.note || '');
    setErrorMessage(null);
    setShowCustomerModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setErrorMessage('Vui lòng nhập tên khách hàng / tên sạp.');
      return;
    }

    setSavingCustomer(true);
    setErrorMessage(null);
    try {
      const parsedInitialDebt = parseCurrencyInputWithDots(formInitialDebt);

      if (editingCustomer) {
        await onUpdateCustomer({
          ...editingCustomer,
          name: formName.trim(),
          phone: formPhone.trim(),
          stallOrAddress: formAddress.trim(),
          type: formType,
          initialDebt: parsedInitialDebt,
          note: formNote.trim() || undefined,
        });
        showToast(`Đã cập nhật thông tin khách hàng "${formName.trim()}".`);
      } else {
        await onAddCustomer({
          name: formName.trim(),
          phone: formPhone.trim(),
          stallOrAddress: formAddress.trim(),
          type: formType,
          initialDebt: parsedInitialDebt,
          note: formNote.trim() || undefined,
          debtPayments: [],
        });
        showToast(`Đã đăng ký khách hàng mới "${formName.trim()}".`);
      }
      setShowCustomerModal(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể lưu thông tin khách hàng.');
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleDeleteCust = (cust: Customer) => {
    setCustomerToDelete(cust);
  };

  // Open modal to pay debt
  const handleOpenPayDebtModal = (cust: Customer) => {
    const stats = customerStatsMap.get(cust.id);
    const debt = stats?.totalDebt || 0;

    setDebtTargetCustomer(cust);
    setDebtAmountInput(formatCurrencyInputWithDots(debt));
    setDebtMethod('cash');
    setDebtNote('');
    setErrorMessage(null);
  };

  // Execute paying debt and deduct automatically
  const handleConfirmPayDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtTargetCustomer) return;

    const amount = parseCurrencyInputWithDots(debtAmountInput);
    if (amount <= 0) {
      setErrorMessage('Vui lòng nhập số tiền khách trả lớn hơn 0.');
      return;
    }

    setProcessingDebt(true);
    setErrorMessage(null);
    try {
      const res = await onSettleCustomerDebt({
        customer: debtTargetCustomer,
        amountToPay: amount,
        paymentMethod: debtMethod,
        note: debtNote.trim() || undefined,
      });

      showToast(
        `Đã thu ${formatVND(amount)} từ "${debtTargetCustomer.name}". Dư nợ còn lại: ${formatVND(
          res.newRemainingDebt
        )}.`
      );
      setDebtTargetCustomer(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể thực hiện thu nợ.');
    } finally {
      setProcessingDebt(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          data-testid="customer-toast-banner"
          className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          data-testid="customer-error-banner"
          className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng Khách Hàng
            </span>
            <div className="text-xl sm:text-2xl font-extrabold text-slate-900">
              {customers.length} <span className="text-xs font-bold text-slate-500">khách</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1e3a8a] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tổng Dư Nợ Hiện Tại
            </span>
            <div className="text-xl sm:text-2xl font-extrabold text-rose-600">
              {formatVND(overallStats.totalAllDebt)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Khách Đang Có Dư Nợ
            </span>
            <div className="text-xl sm:text-2xl font-extrabold text-amber-700">
              {overallStats.debtCustomersCount}{' '}
              <span className="text-xs font-bold text-slate-500">mối nợ</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Customers List Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Header Action Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                Danh Sách Khách Hàng &amp; Công Nợ
              </h2>
              <p className="text-xs text-slate-500">
                Đăng ký khách hàng, theo dõi dư nợ và nhập số tiền khách trả để tự động trừ nợ
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="open-add-customer-modal-btn"
            onClick={handleOpenAddModal}
            className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-bold text-white bg-[#1e3a8a] hover:bg-[#172554] rounded-xl flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Đăng Ký Khách Hàng Mới</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              data-testid="search-customer-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên khách, sạp hàng, địa chỉ hoặc số điện thoại..."
              className="w-full min-h-[38px] pl-9 pr-3 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#1e3a8a]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                typeFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Tất cả ({customers.length})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('debt_only')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                typeFilter === 'debt_only'
                  ? 'bg-rose-700 text-white'
                  : 'bg-white border border-rose-200 text-rose-800 hover:bg-rose-50'
              }`}
            >
              Có dư nợ ({overallStats.debtCustomersCount})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('moi_si')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                typeFilter === 'moi_si'
                  ? 'bg-[#1e3a8a] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Mối sỉ
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('nha_hang')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                typeFilter === 'nha_hang'
                  ? 'bg-[#1e3a8a] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Nhà hàng
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('khach_le')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                typeFilter === 'khach_le'
                  ? 'bg-[#1e3a8a] text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Khách lẻ
            </button>
          </div>
        </div>

        {/* Customer Table */}
        {filteredCustomers.length === 0 ? (
          <div className="p-10 text-center text-slate-500 space-y-2 text-xs sm:text-sm">
            <p>Không tìm thấy khách hàng nào phù hợp với bộ lọc.</p>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-3.5 py-1.5 font-bold text-[#1e3a8a] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
            >
              + Đăng ký khách hàng ngay
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-2.5 px-3.5">Khách hàng</th>
                  <th className="py-2.5 px-3">Liên hệ</th>
                  <th className="py-2.5 px-3">Tổng mua</th>
                  <th className="py-2.5 px-3">Tổng dư nợ</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => {
                  const stats = customerStatsMap.get(cust.id) || {
                    totalPurchased: 0,
                    invoiceDebt: 0,
                    initialDebt: 0,
                    totalDebt: 0,
                    invoicesCount: 0,
                    unpaidInvoices: [],
                    paidInvoices: [],
                  };

                  return (
                    <tr
                      key={cust.id}
                      data-testid={`customer-row-${cust.id}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Customer Name & Info */}
                      <td className="py-3 px-3.5">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-extrabold text-slate-900 text-sm">
                              {cust.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                cust.type === 'moi_si'
                                  ? 'bg-blue-100 text-[#1e3a8a]'
                                  : cust.type === 'nha_hang'
                                  ? 'bg-purple-100 text-purple-900'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {cust.type === 'moi_si'
                                ? 'Mối sỉ'
                                : cust.type === 'nha_hang'
                                ? 'Nhà hàng'
                                : 'Khách lẻ'}
                            </span>
                          </div>
                          {cust.stallOrAddress && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                              <span>{cust.stallOrAddress}</span>
                            </div>
                          )}
                          {cust.note && (
                            <div className="text-[11px] text-slate-400 italic">
                              "{cust.note}"
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-3">
                        {cust.phone ? (
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{cust.phone}</span>
                            <button
                              type="button"
                              title="Sao chép số điện thoại"
                              onClick={() => {
                                navigator.clipboard.writeText(cust.phone);
                                showToast(`Đã sao chép SĐT: ${cust.phone}`);
                              }}
                              className="text-slate-400 hover:text-slate-800 p-0.5"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Chưa có SĐT</span>
                        )}
                      </td>

                      {/* Total Purchased */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800">
                          {formatVND(stats.totalPurchased)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {stats.invoicesCount} đơn mua
                        </div>
                      </td>

                      {/* Total Outstanding Debt */}
                      <td className="py-3 px-3">
                        {stats.totalDebt > 0 ? (
                          <div className="space-y-1">
                            <div className="font-extrabold text-sm text-rose-600 flex items-center gap-1">
                              <span>{formatVND(stats.totalDebt)}</span>
                            </div>
                            <div className="text-[11px] text-rose-700/80 font-medium">
                              {stats.unpaidInvoices.length > 0
                                ? `${stats.unpaidInvoices.length} đơn chưa thu`
                                : 'Dư nợ ban đầu'}
                            </div>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Không nợ</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {stats.totalDebt > 0 && (
                            <button
                              type="button"
                              title="Khách trả nợ / Thu tiền nợ"
                              data-testid={`pay-debt-btn-${cust.id}`}
                              onClick={() => handleOpenPayDebtModal(cust)}
                              className="min-h-[32px] px-2.5 py-1 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center gap-1 shadow-2xs transition-colors"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Thu Nợ</span>
                            </button>
                          )}

                          <button
                            type="button"
                            title="Tạo hóa đơn mới cho khách hàng này"
                            data-testid={`create-invoice-for-${cust.id}`}
                            onClick={() => onSelectCustomerForNewInvoice(cust)}
                            className="min-h-[32px] px-2.5 py-1 text-xs font-bold text-[#1e40af] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg inline-flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Lập đơn</span>
                          </button>

                          <button
                            type="button"
                            title="Xem chi tiết & lịch sử mua / trả nợ"
                            onClick={() => setHistoryTargetCustomer(cust)}
                            className="min-h-[32px] p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            title="Sửa thông tin khách hàng"
                            onClick={() => handleOpenEditModal(cust)}
                            className="min-h-[32px] p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            title="Xóa khách hàng"
                            onClick={() => handleDeleteCust(cust)}
                            className="min-h-[32px] p-1.5 text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-lg inline-flex items-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Register / Edit Customer */}
      {showCustomerModal && (
        <div
          data-testid="customer-modal"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="bg-[#1e3a8a] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  {editingCustomer ? 'Chỉnh Sửa Thông Tin Khách Hàng' : 'Đăng Ký Khách Hàng Mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerModal(false)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Họ tên khách hàng / Tên sạp chợ <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  data-testid="customer-name-input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="VD: Chị Tư Lan — Sạp B12 hoặc Anh Phan..."
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="text"
                    data-testid="customer-phone-input"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="VD: 0909 234 567"
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#1e3a8a]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Loại khách hàng
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as Customer['type'])}
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#1e3a8a]"
                  >
                    <option value="moi_si">Mối sỉ (Lấy sạp chợ / đại lý)</option>
                    <option value="nha_hang">Nhà hàng / Bếp ăn / Quán cơm</option>
                    <option value="khach_le">Khách mua lẻ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Đơn vị, cơ quan (Địa chỉ sạp chợ / quán)
                </label>
                <input
                  type="text"
                  data-testid="customer-address-input"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="VD: Sạp B12 Chợ Hòa Bình, Q.5..."
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Dư nợ ban đầu (nếu khách đã nợ từ trước)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    data-testid="customer-initial-debt-input"
                    value={formInitialDebt}
                    onChange={(e) => setFormInitialDebt(formatCurrencyInputWithDots(e.target.value))}
                    placeholder="0"
                    className="w-full min-h-[40px] pl-3 pr-10 py-1.5 text-xs sm:text-sm font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#1e3a8a]"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    đ
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Nhập số tiền nếu khách hàng này đã có công nợ cũ trước khi sử dụng phần mềm.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ghi chú thói quen lấy hàng
                </label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="VD: Hay lấy rau lúc 4h sáng, hay lấy giỏ 20kg..."
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="min-h-[38px] px-4 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="min-h-[38px] px-4 py-1.5 text-xs font-bold text-white bg-[#1e3a8a] hover:bg-[#172554] rounded-lg shadow-2xs"
                >
                  {savingCustomer ? 'Đang lưu...' : editingCustomer ? 'Lưu Thay Đổi' : 'Đăng Ký Khách Hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Thu Nợ / Khách Trả Tiền (Core feature) */}
      {debtTargetCustomer && (
        <div
          data-testid="pay-debt-modal"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden">
            <div className="bg-emerald-800 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Thu Tiền Nợ Của Khách Hàng
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDebtTargetCustomer(null)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {(() => {
              const stats = customerStatsMap.get(debtTargetCustomer.id);
              const currentTotalDebt = stats?.totalDebt || 0;
              const enteredVal = parseCurrencyInputWithDots(debtAmountInput);
              const remainingAfterPay = Math.max(0, currentTotalDebt - enteredVal);

              return (
                <form onSubmit={handleConfirmPayDebt} className="p-5 space-y-4">
                  {/* Current Debt Card */}
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                    <div className="text-xs text-rose-900 font-semibold">
                      Khách hàng: <strong>{debtTargetCustomer.name}</strong>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-rose-800 font-bold">Tổng dư nợ hiện tại:</span>
                      <span className="text-lg font-extrabold text-rose-700">
                        {formatVND(currentTotalDebt)}
                      </span>
                    </div>
                    {stats && stats.unpaidInvoices.length > 0 && (
                      <div className="text-[11px] text-rose-700 pt-1 border-t border-rose-200/80">
                        Gồm {stats.unpaidInvoices.length} hóa đơn chưa thanh toán đủ:
                        <div className="font-mono text-[10px] text-slate-700 mt-0.5">
                          {stats.unpaidInvoices.map((inv) => `${inv.code} (${formatVND(inv.remainingAmount)})`).join(', ')}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payment Amount Input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số tiền khách vừa trả (VNĐ) <span className="text-rose-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        data-testid="debt-pay-amount-input"
                        value={debtAmountInput}
                        onChange={(e) => setDebtAmountInput(formatCurrencyInputWithDots(e.target.value))}
                        placeholder="Nhập số tiền..."
                        className="w-full min-h-[44px] pl-3 pr-10 text-base font-extrabold text-emerald-900 bg-white border-2 border-emerald-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">
                        đ
                      </span>
                    </div>

                    {/* Quick Pill Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setDebtAmountInput(formatCurrencyInputWithDots(currentTotalDebt))}
                        className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-md"
                      >
                        Trả hết ({formatVND(currentTotalDebt)})
                      </button>
                      {currentTotalDebt > 500000 && (
                        <button
                          type="button"
                          onClick={() => setDebtAmountInput(formatCurrencyInputWithDots(500000))}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
                        >
                          500.000đ
                        </button>
                      )}
                      {currentTotalDebt > 1000000 && (
                        <button
                          type="button"
                          onClick={() => setDebtAmountInput(formatCurrencyInputWithDots(1000000))}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
                        >
                          1.000.000đ
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Hình thức thanh toán
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDebtMethod('cash')}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl border-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                          debtMethod === 'cash'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-extrabold'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Banknote className="w-4 h-4 text-emerald-700" />
                        <span>Tiền mặt</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDebtMethod('transfer')}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl border-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                          debtMethod === 'transfer'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-extrabold'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <CreditCard className="w-4 h-4 text-blue-700" />
                        <span>Chuyển khoản</span>
                      </button>
                    </div>
                  </div>

                  {/* Note */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ghi chú thanh toán
                    </label>
                    <input
                      type="text"
                      value={debtNote}
                      onChange={(e) => setDebtNote(e.target.value)}
                      placeholder="VD: Khách ghé sạp trả tiền mặt chuyến rau sáng..."
                      className="w-full min-h-[38px] px-3 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  {/* Remaining Live Preview */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">Dư nợ còn lại sau khi trừ:</span>
                    <strong
                      className={`text-sm font-extrabold ${
                        remainingAfterPay === 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {remainingAfterPay === 0 ? '0đ (Đã thanh toán đủ)' : formatVND(remainingAfterPay)}
                    </strong>
                  </div>

                  {/* Submit Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setDebtTargetCustomer(null)}
                      className="min-h-[40px] px-4 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      disabled={processingDebt}
                      data-testid="confirm-settle-debt-btn"
                      className="min-h-[40px] px-5 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-2xs flex items-center gap-1.5"
                    >
                      <DollarSign className="w-4 h-4" />
                      <span>{processingDebt ? 'Đang cập nhật...' : 'Xác Nhận & Tự Động Trừ Nợ'}</span>
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL 3: View Customer History & Details */}
      {historyTargetCustomer && (
        <div
          data-testid="customer-history-modal"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-[#1e3a8a] text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Lịch Sử Mua Hàng &amp; Thanh Toán: {historyTargetCustomer.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTargetCustomer(null)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {(() => {
                const stats = customerStatsMap.get(historyTargetCustomer.id);
                const custInvoices = invoices.filter(
                  (inv) =>
                    inv.customerId === historyTargetCustomer.id ||
                    inv.customerName.trim().toLowerCase() === historyTargetCustomer.name.trim().toLowerCase()
                );

                return (
                  <div className="space-y-4">
                    {/* Header Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-slate-500">Tổng hóa đơn:</span>
                        <div className="font-bold text-slate-900 text-sm">{custInvoices.length} đơn</div>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-slate-500">Tổng tiền hàng:</span>
                        <div className="font-bold text-slate-900 text-sm">{formatVND(stats?.totalPurchased || 0)}</div>
                      </div>
                      <div className="p-2.5 bg-rose-50 rounded-lg border border-rose-200 col-span-2">
                        <span className="text-rose-800 font-semibold">Tổng dư nợ còn lại:</span>
                        <div className="font-extrabold text-rose-700 text-base">{formatVND(stats?.totalDebt || 0)}</div>
                      </div>
                    </div>

                    {/* Debt Payment History */}
                    {historyTargetCustomer.debtPayments && historyTargetCustomer.debtPayments.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <DollarSign className="w-4 h-4 text-emerald-700" />
                          <span>Lịch Sử Các Lần Khách Trả Tiền Nợ</span>
                        </h4>
                        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                          {historyTargetCustomer.debtPayments.map((p, idx) => (
                            <div key={p.id || idx} className="p-2.5 flex items-center justify-between bg-emerald-50/40">
                              <div>
                                <span className="font-bold text-emerald-900">
                                  +{formatVND(p.amount)} ({p.method === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'})
                                </span>
                                {p.note && <div className="text-[11px] text-slate-600 italic">"{p.note}"</div>}
                                {p.settledInvoiceCodes && p.settledInvoiceCodes.length > 0 && (
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    Cấn trừ vào: {p.settledInvoiceCodes.join(', ')}
                                  </div>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500">
                                {new Date(p.timestamp).toLocaleString('vi-VN')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Invoices List */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Receipt className="w-4 h-4 text-[#1e40af]" />
                        <span>Danh Sách Hóa Đơn ({custInvoices.length})</span>
                      </h4>

                      {custInvoices.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-xs bg-slate-50 rounded-xl">
                          Chưa có hóa đơn nào cho khách hàng này.
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                          {custInvoices.map((inv) => (
                            <div key={inv.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-900">{inv.code}</span>
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                      inv.paymentStatus === 'paid'
                                        ? 'bg-emerald-100 text-emerald-900'
                                        : inv.paymentStatus === 'partial'
                                        ? 'bg-amber-100 text-amber-900'
                                        : 'bg-rose-100 text-rose-900'
                                    }`}
                                  >
                                    {inv.paymentStatus === 'paid'
                                      ? 'Đã trả đủ'
                                      : inv.paymentStatus === 'partial'
                                      ? 'Còn nợ 1 phần'
                                      : 'Chưa thanh toán'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {new Date(inv.createdAt).toLocaleString('vi-VN')} · {inv.items.length} mặt hàng
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="font-bold text-slate-900">{formatVND(inv.totalAmount)}</div>
                                {inv.remainingAmount > 0 ? (
                                  <div className="text-[11px] font-bold text-rose-600">
                                    Còn nợ: {formatVND(inv.remainingAmount)}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-emerald-700 font-medium">Đã thanh toán đủ</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  onSelectCustomerForNewInvoice(historyTargetCustomer);
                  setHistoryTargetCustomer(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1e40af] hover:bg-[#172554] rounded-lg inline-flex items-center gap-1.5 shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Lập Hóa Đơn Mới Cho Khách Này</span>
              </button>
              <button
                type="button"
                onClick={() => setHistoryTargetCustomer(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Delete Customer Confirmation (100% In-UI modal, safe for iframes) */}
      {customerToDelete && (
        <div
          data-testid="delete-customer-modal"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-600 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-white" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Xác Nhận Xóa Khách Hàng
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                Bạn có chắc chắn muốn xóa khách hàng{' '}
                <strong className="text-slate-900 font-extrabold">
                  "{customerToDelete.name}"
                </strong>{' '}
                khỏi danh bạ khách hàng của vựa không?
              </p>

              {(() => {
                const stats = customerStatsMap.get(customerToDelete.id);
                if (stats && stats.totalDebt > 0) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-800">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Lưu ý quan trọng về công nợ:</span>
                      </div>
                      <p>
                        Khách hàng này hiện còn dư nợ <strong>{formatVND(stats.totalDebt)}</strong> ({stats.unpaidInvoices.length} hóa đơn chưa thu đủ). Các hóa đơn bán lẻ đã tạo trước đây vẫn sẽ được giữ lại trong hệ thống.
                      </p>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCustomerToDelete(null)}
                  className="min-h-[40px] px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  data-testid="confirm-delete-customer-btn"
                  disabled={deletingCustomer}
                  onClick={async () => {
                    setDeletingCustomer(true);
                    setErrorMessage(null);
                    try {
                      await onDeleteCustomer(customerToDelete.id);
                      showToast(`Đã xóa khách hàng "${customerToDelete.name}".`);
                      setCustomerToDelete(null);
                    } catch (err) {
                      setErrorMessage(
                        err instanceof Error
                          ? err.message
                          : 'Không thể xóa khách hàng. Vui lòng thử lại.'
                      );
                    } finally {
                      setDeletingCustomer(false);
                    }
                  }}
                  className="min-h-[40px] px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{deletingCustomer ? 'Đang xóa...' : 'Xóa Khách Hàng'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
