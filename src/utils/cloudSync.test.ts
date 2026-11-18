import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countPendingSyncItems,
  formatFirebaseAuthErrorVi,
  mergeCustomersOnCloudConnect,
  mergeInvoicesOnCloudConnect,
} from './cloudSync';
import { Customer, Invoice } from '../types/pos';

function makeInvoice(id: string, overrides: Partial<Invoice> = {}): Invoice {
  return {
    id,
    code: `HD-${id}`,
    createdAt: '2026-11-18T08:00:00.000Z',
    customerId: 'cust-1',
    customerName: 'Khách Test',
    customerPhone: '',
    customerAddress: '',
    customerType: 'moi_si',
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        productName: 'Cải ngọt',
        category: 'rau_cai',
        unitCode: 'kg',
        unitLabel: 'Kg',
        grossQuantity: 10,
        tareWeight: 0,
        netQuantity: 10,
        unitPrice: 15000,
        estimatedKgPerUnit: 1,
        lineTotal: 150000,
      },
    ],
    subtotal: 150000,
    discountAmount: 0,
    crateDepositAmount: 0,
    totalAmount: 150000,
    paidAmount: 0,
    remainingAmount: 150000,
    paymentStatus: 'unpaid',
    paymentMethod: 'cash',
    payments: [],
    printedCount: 0,
    ...overrides,
  };
}

function makeCustomer(id: string, name: string): Customer {
  return {
    id,
    name,
    phone: '0909000111',
    stallOrAddress: 'Chợ đầu mối',
    type: 'moi_si',
    initialDebt: 0,
    debtPayments: [],
  };
}

test('mergeInvoicesOnCloudConnect preserves offline-created invoices even when allowInitialSeed is false', () => {
  const cloudInv = makeInvoice('inv-cloud-1', { createdAt: '2026-11-18T07:00:00.000Z' });
  const offlineInv = makeInvoice('inv-offline-2', { createdAt: '2026-11-18T09:00:00.000Z' });

  const result = mergeInvoicesOnCloudConnect({
    localInvoices: [offlineInv, cloudInv],
    cloudInvoices: [cloudInv],
    unsyncedCreateIds: ['inv-offline-2'],
    unsyncedUpdateIds: [],
    deletedIds: [],
    allowInitialSeed: false,
  });

  assert.deepEqual(
    result.mergedInvoices.map((i) => i.id),
    ['inv-offline-2', 'inv-cloud-1']
  );
  assert.deepEqual(
    result.toCreateOnCloud.map((i) => i.id),
    ['inv-offline-2']
  );
  assert.deepEqual(result.toUpdateOnCloud, []);
});

test('mergeInvoicesOnCloudConnect pushes offline payment updates to cloud instead of reverting them', () => {
  const cloudVersion = makeInvoice('inv-1', {
    paidAmount: 0,
    remainingAmount: 150000,
    paymentStatus: 'unpaid',
  });
  const localPaidVersion = makeInvoice('inv-1', {
    paidAmount: 150000,
    remainingAmount: 0,
    paymentStatus: 'paid',
  });

  const result = mergeInvoicesOnCloudConnect({
    localInvoices: [localPaidVersion],
    cloudInvoices: [cloudVersion],
    unsyncedCreateIds: [],
    unsyncedUpdateIds: ['inv-1'],
    deletedIds: [],
    allowInitialSeed: false,
  });

  assert.equal(result.mergedInvoices[0].paymentStatus, 'paid');
  assert.deepEqual(
    result.toUpdateOnCloud.map((i) => i.id),
    ['inv-1']
  );
});

test('mergeInvoicesOnCloudConnect respects remote cloud deletion when invoice is not unsynced locally', () => {
  const deletedRemotely = makeInvoice('inv-deleted-elsewhere');
  const activeCloud = makeInvoice('inv-active');

  const result = mergeInvoicesOnCloudConnect({
    localInvoices: [deletedRemotely, activeCloud],
    cloudInvoices: [activeCloud],
    unsyncedCreateIds: [],
    unsyncedUpdateIds: [],
    deletedIds: [],
    allowInitialSeed: false,
  });

  assert.deepEqual(
    result.mergedInvoices.map((i) => i.id),
    ['inv-active']
  );
  assert.deepEqual(result.toCreateOnCloud, []);
});

test('mergeCustomersOnCloudConnect preserves unsynced offline customers and schedules cloud upsert', () => {
  const cloudCust = makeCustomer('cust-1', 'Chị Lan');
  const offlineNewCust = makeCustomer('cust-offline-9', 'Anh Ba Mới');

  const result = mergeCustomersOnCloudConnect({
    localCustomers: [offlineNewCust, cloudCust],
    cloudCustomers: [cloudCust],
    unsyncedCustomerIds: ['cust-offline-9'],
    deletedCustomerIds: [],
    allowInitialSeed: false,
  });

  assert.equal(result.mergedCustomers.length, 2);
  assert.deepEqual(
    result.toUpsertOnCloud.map((c) => c.id),
    ['cust-offline-9']
  );
});

test('formatFirebaseAuthErrorVi translates popup and unauthorized domain errors clearly', () => {
  assert.match(
    formatFirebaseAuthErrorVi({ code: 'auth/popup-blocked' }),
    /chặn cửa sổ đăng nhập Google/i
  );
  assert.match(
    formatFirebaseAuthErrorVi({ code: 'auth/unauthorized-domain' }),
    /Authorized domains/i
  );
  assert.match(
    formatFirebaseAuthErrorVi({ code: 'auth/popup-closed-by-user' }),
    /đóng cửa sổ đăng nhập Google/i
  );
});

test('countPendingSyncItems deduplicates invoice create/update ids cleanly', () => {
  const summary = countPendingSyncItems({
    unsyncedCreateInvoiceIds: ['inv-1', 'inv-2'],
    unsyncedUpdateInvoiceIds: ['inv-2', 'inv-3'],
    unsyncedCustomerIds: ['cust-1'],
    hasPendingSettings: true,
  });

  assert.equal(summary.pendingInvoicesCount, 3);
  assert.equal(summary.pendingCustomersCount, 1);
  assert.equal(summary.totalPendingCount, 5);
});
