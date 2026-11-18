import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileEdit,
  FileSpreadsheet,
  ShieldCheck,
  Users,
  Camera,
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  Customer,
  Invoice,
  PaymentMethod,
  StaffUserProfile,
  StoreSettings,
  UserRole,
} from './types/pos';
import {
  buildInitialInvoices,
  INITIAL_CUSTOMERS,
  INITIAL_STORE_SETTINGS,
} from './data/seedData';
import {
  computeDailyRevenueReport,
  formatCompactVND,
  settleInvoicePayment,
  toggleInvoicePaidStatus,
  toLocalYYYYMMDD,
} from './utils/calculations';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  evaluateSavedSession,
  getPermissionsForRole,
  PersistedAuthSession,
  WORKSPACE_ID,
} from './utils/rbac';
import {
  ACTIVE_FIREBASE_PROJECT_ID,
  auth,
  db,
  DEFAULT_STAFF_ACTOR,
  changeStaffPasswordInFirestore,
  createCustomerInFirestore,
  createInvoiceInFirestore,
  deleteCustomerInFirestore,
  deleteInvoiceInFirestore,
  deleteMultipleInvoicesInFirestore,
  deleteStaffAccountInFirestore,
  ensureDefaultAdminInFirestore,
  ensureUserProfileInFirestore,
  getLocalStaffProfiles,
  handleFirestoreError,
  incrementInvoicePrintedCountInFirestore,
  loginStaffAccountInFirestore,
  mapFirestoreDocToCustomer,
  mapFirestoreDocToInvoice,
  OperationType,
  registerStaffAccountInFirestore,
  saveStoreSettingsToFirestore,
  signInWithGooglePopup,
  signOutUser,
  updateCustomerInFirestore,
  updateInvoicePaymentInFirestore,
  updateOwnDisplayNameInFirestore,
  updateStaffRoleInFirestore,
} from './lib/firebase';
import { PosBuilderView } from './components/PosBuilderView';
import { InvoiceTrackingView } from './components/InvoiceTrackingView';
import { CustomerManagementView } from './components/CustomerManagementView';
import { AccountPermissionsView } from './components/AccountPermissionsView';
import { ThermalReceiptModal } from './components/ThermalReceiptModal';
import { ScanReceiptModal, ScannedReceiptData } from './components/ScanReceiptModal';
import { OfflineIndicator } from './components/PWAInstallBanner';
import { AuthGateView } from './components/AuthGateView';
import {
  countPendingSyncItems,
  formatFirebaseAuthErrorVi,
  mergeCustomersOnCloudConnect,
  mergeInvoicesOnCloudConnect,
} from './utils/cloudSync';

type ActiveTab = 'pos' | 'invoices' | 'customers' | 'account';

const STORAGE_KEYS = {
  invoices: 'vua_rau_invoices_v1',
  deletedIds: 'vua_rau_deleted_ids_v1',
  deletedCustomerIds: 'vua_rau_deleted_customer_ids_v1',
  localSeeded: 'vua_rau_local_seeded_v1',
  cloudSeeded: `vua_rau_cloud_seeded_${ACTIVE_FIREBASE_PROJECT_ID}`,
  customersCloudSeeded: `vua_rau_cust_cloud_seeded_${ACTIVE_FIREBASE_PROJECT_ID}`,
  unsyncedCreateInvoices: 'vua_rau_unsynced_create_inv_v1',
  unsyncedUpdateInvoices: 'vua_rau_unsynced_update_inv_v1',
  unsyncedCustomers: 'vua_rau_unsynced_cust_v1',
  unsyncedSettings: 'vua_rau_unsynced_settings_v1',
  customers: 'vua_rau_customers_v1',
  settings: 'vua_rau_settings_v1',
  activeSession: 'vua_rau_active_session_v1',
};

function readStringArrayFromStorage(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.map(String)));
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function writeStringArrayToStorage(key: string, values: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(new Set(values))));
  } catch {
    // ignore storage errors
  }
}

function readSavedSessionFromStorage(): {
  profile: StaffUserProfile | null;
  expired: boolean;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.activeSession);
    const result = evaluateSavedSession(raw, Date.now());
    if (result.expired) {
      localStorage.removeItem(STORAGE_KEYS.activeSession);
      return { profile: null, expired: true };
    }
    if (result.profile) {
      // Refresh rolling 3-day timestamp on visit
      const updatedPayload: PersistedAuthSession = {
        profile: result.profile,
        lastActiveAt: Date.now(),
      };
      localStorage.setItem(
        STORAGE_KEYS.activeSession,
        JSON.stringify(updatedPayload)
      );
      return { profile: result.profile, expired: false };
    }
  } catch {
    // ignore storage errors
  }
  return { profile: null, expired: false };
}

function writeSavedSessionToStorage(profile: StaffUserProfile | null): void {
  try {
    if (!profile) {
      localStorage.setItem(STORAGE_KEYS.activeSession, 'logged_out');
    } else {
      const payload: PersistedAuthSession = {
        profile,
        lastActiveAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEYS.activeSession, JSON.stringify(payload));
    }
  } catch {
    // ignore storage errors
  }
}

function readDeletedIdsFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.deletedIds);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function writeDeletedIdsToStorage(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.deletedIds, JSON.stringify(ids));
  } catch {
    // ignore storage errors
  }
}

function readDeletedCustomerIdsFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.deletedCustomerIds);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function writeDeletedCustomerIdsToStorage(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.deletedCustomerIds, JSON.stringify(ids));
  } catch {
    // ignore storage errors
  }
}

function writeInvoicesToStorage(list: Invoice[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(list));
    localStorage.setItem(STORAGE_KEYS.localSeeded, 'true');
  } catch {
    // ignore storage errors
  }
}

function writeCustomersToStorage(list: Customer[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');

  // Firebase Auth & RBAC State with 3-day inactivity expiry
  const initialSessionState = useMemo(() => readSavedSessionFromStorage(), []);
  const [currentUser, setCurrentUser] = useState<StaffUserProfile | null>(
    initialSessionState.profile
  );
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<boolean>(
    initialSessionState.expired
  );
  const currentUserRef = useRef<StaffUserProfile | null>(currentUser);
  currentUserRef.current = currentUser;

  const [authReady, setAuthReady] = useState<boolean>(false);
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffUserProfile[]>([DEFAULT_STAFF_ACTOR]);
  const [roleOverride, setRoleOverride] = useState<UserRole | null>(null);
  const [syncingInvoices, setSyncingInvoices] = useState<boolean>(false);

  const [unsyncedCreateIds, setUnsyncedCreateIds] = useState<string[]>(() =>
    readStringArrayFromStorage(STORAGE_KEYS.unsyncedCreateInvoices)
  );
  const unsyncedCreateIdsRef = useRef<string[]>(unsyncedCreateIds);
  unsyncedCreateIdsRef.current = unsyncedCreateIds;

  const [unsyncedUpdateIds, setUnsyncedUpdateIds] = useState<string[]>(() =>
    readStringArrayFromStorage(STORAGE_KEYS.unsyncedUpdateInvoices)
  );
  const unsyncedUpdateIdsRef = useRef<string[]>(unsyncedUpdateIds);
  unsyncedUpdateIdsRef.current = unsyncedUpdateIds;

  const [unsyncedCustomerIds, setUnsyncedCustomerIds] = useState<string[]>(() =>
    readStringArrayFromStorage(STORAGE_KEYS.unsyncedCustomers)
  );
  const unsyncedCustomerIdsRef = useRef<string[]>(unsyncedCustomerIds);
  unsyncedCustomerIdsRef.current = unsyncedCustomerIds;

  const [hasPendingSettings, setHasPendingSettings] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.unsyncedSettings) === 'true';
    } catch {
      return false;
    }
  });
  const hasPendingSettingsRef = useRef<boolean>(hasPendingSettings);
  hasPendingSettingsRef.current = hasPendingSettings;

  const pendingSyncSummary = useMemo(
    () =>
      countPendingSyncItems({
        unsyncedCreateInvoiceIds: unsyncedCreateIds,
        unsyncedUpdateInvoiceIds: unsyncedUpdateIds,
        unsyncedCustomerIds,
        hasPendingSettings,
      }),
    [unsyncedCreateIds, unsyncedUpdateIds, unsyncedCustomerIds, hasPendingSettings]
  );

  const addUnsyncedCreateIds = (ids: string[]) => {
    if (ids.length === 0) return;
    setUnsyncedCreateIds((prev) => {
      const merged = Array.from(new Set([...prev, ...ids]));
      unsyncedCreateIdsRef.current = merged;
      writeStringArrayToStorage(STORAGE_KEYS.unsyncedCreateInvoices, merged);
      return merged;
    });
  };

  const removeUnsyncedCreateIds = (ids: string[]) => {
    if (ids.length === 0) return;
    const removeSet = new Set(ids);
    setUnsyncedCreateIds((prev) => {
      const next = prev.filter((id) => !removeSet.has(id));
      unsyncedCreateIdsRef.current = next;
      writeStringArrayToStorage(STORAGE_KEYS.unsyncedCreateInvoices, next);
      return next;
    });
  };

  const addUnsyncedUpdateIds = (ids: string[]) => {
    if (ids.length === 0) return;
    setUnsyncedUpdateIds((prev) => {
      const merged = Array.from(new Set([...prev, ...ids]));
      unsyncedUpdateIdsRef.current = merged;
      writeStringArrayToStorage(STORAGE_KEYS.unsyncedUpdateInvoices, merged);
      return merged;
    });
  };

  const removeUnsyncedUpdateIds = (ids: string[]) => {
    if (ids.length === 0) return;
    const removeSet = new Set(ids);
    setUnsyncedUpdateIds((prev) => {
      const next = prev.filter((id) => !removeSet.has(id));
      unsyncedUpdateIdsRef.current = next;
      writeStringArrayToStorage(STORAGE_KEYS.unsyncedUpdateInvoices, next);
      return next;
    });
  };

  const addUnsyncedCustomerIds = (ids: string[]) => {
    if (ids.length === 0) return;
    setUnsyncedCustomerIds((prev) => {
      const merged = Array.from(new Set([...prev, ...ids]));
      unsyncedCustomerIdsRef.current = merged;
      writeStringArrayToStorage(STORAGE_KEYS.unsyncedCustomers, merged);
      return merged;
    });
  };

  const removeUnsyncedCustomerIds = (ids: string[]) => {
    if (ids.length === 0) return;
    const removeSet = new Set(ids);
    setUnsyncedCustomerIds((prev) => {
      const next = prev.filter((id) => !removeSet.has(id));
      unsyncedCustomerIdsRef.current = next;
      writeStringArrayToStorage(STORAGE_KEYS.unsyncedCustomers, next);
      return next;
    });
  };

  const markPendingSettings = (pending: boolean) => {
    hasPendingSettingsRef.current = pending;
    setHasPendingSettings(pending);
    try {
      if (pending) {
        localStorage.setItem(STORAGE_KEYS.unsyncedSettings, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEYS.unsyncedSettings);
      }
    } catch {
      // ignore storage errors
    }
  };

  const isRealAdmin = currentUser?.role === 'admin';
  const effectiveRole: UserRole =
    isRealAdmin && roleOverride ? roleOverride : currentUser?.role || 'sales';
  const permissions = useMemo(
    () => getPermissionsForRole(effectiveRole),
    [effectiveRole]
  );

  const [deletedIds, setDeletedIds] = useState<string[]>(() =>
    readDeletedIdsFromStorage()
  );
  const deletedIdsRef = useRef<string[]>(deletedIds);
  deletedIdsRef.current = deletedIds;

  const [deletedCustomerIds, setDeletedCustomerIds] = useState<string[]>(() =>
    readDeletedCustomerIdsFromStorage()
  );
  const deletedCustomerIdsRef = useRef<string[]>(deletedCustomerIds);
  deletedCustomerIdsRef.current = deletedCustomerIds;

  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const delSet = new Set(readDeletedCustomerIdsFromStorage());
      const saved = localStorage.getItem(STORAGE_KEYS.customers);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((c: Customer) => !delSet.has(c.id));
        }
      }
      return INITIAL_CUSTOMERS.filter((c) => !delSet.has(c.id));
    } catch {
      return INITIAL_CUSTOMERS;
    }
  });
  const customersRef = useRef<Customer[]>(customers);
  customersRef.current = customers;

  const [selectedCustomerForPos, setSelectedCustomerForPos] = useState<Customer | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    try {
      const delSet = new Set(readDeletedIdsFromStorage());
      const saved = localStorage.getItem(STORAGE_KEYS.invoices);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          localStorage.setItem(STORAGE_KEYS.localSeeded, 'true');
          return parsed.filter((inv: Invoice) => !delSet.has(inv.id));
        }
      }
      if (localStorage.getItem(STORAGE_KEYS.localSeeded) === 'true') {
        return [];
      }
      const initial = buildInitialInvoices().filter((inv) => !delSet.has(inv.id));
      writeInvoicesToStorage(initial);
      return initial;
    } catch {
      return buildInitialInvoices();
    }
  });

  const invoicesRef = useRef<Invoice[]>(invoices);
  invoicesRef.current = invoices;

  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.settings);
      return saved ? JSON.parse(saved) : INITIAL_STORE_SETTINGS;
    } catch {
      return INITIAL_STORE_SETTINGS;
    }
  });
  const settingsRef = useRef<StoreSettings>(settings);
  settingsRef.current = settings;

  // Active invoice currently open in the A5 Invoice Preview & Export Modal
  const [printingInvoiceId, setPrintingInvoiceId] = useState<string | null>(null);

  // AI Scan Receipt Modal State
  const [isScanModalOpen, setIsScanModalOpen] = useState<boolean>(false);
  const [scannedDraftData, setScannedDraftData] = useState<ScannedReceiptData | null>(null);

  const handleApplyScannedReceipt = (data: ScannedReceiptData) => {
    setScannedDraftData(data);
    setActiveTab('pos');
  };

  const activePrintInvoice = useMemo(
    () => invoices.find((inv) => inv.id === printingInvoiceId) || null,
    [invoices, printingInvoiceId]
  );

  const recordDeletedIds = (idsToAdd: string[]) => {
    if (idsToAdd.length === 0) return;
    setDeletedIds((prev) => {
      const merged = Array.from(new Set([...prev, ...idsToAdd]));
      deletedIdsRef.current = merged;
      writeDeletedIdsToStorage(merged);
      return merged;
    });
  };

  // 1. Load local staff directory & listen to Firebase Auth state changes
  useEffect(() => {
    getLocalStaffProfiles()
      .then((list) => {
        if (list.length > 0 && !auth.currentUser) {
          setStaffList(list);
        }
      })
      .catch(() => {
        // ignore storage errors
      });

    const unsubscribe = onAuthStateChanged(auth, async (nextFbUser) => {
      setFbUser(nextFbUser);
      setAuthReady(true);

      if (!nextFbUser) {
        if (!currentUserRef.current) {
          setIsCloudSynced(false);
        }
        return;
      }

      try {
        const profile = await ensureUserProfileInFirestore(nextFbUser);
        setCurrentUser(profile);
        writeSavedSessionToStorage(profile);
        setIsCloudSynced(true);
      } catch (err) {
        console.error('Auth profile init error:', err);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Attach real-time Firestore onSnapshot listeners whenever Firebase Auth is ready and a user session is active
  useEffect(() => {
    const activeSessionUser = currentUserRef.current || currentUser;
    if (!authReady || (!fbUser && !activeSessionUser)) {
      return;
    }

    const activeActor: StaffUserProfile =
      activeSessionUser && (!fbUser || activeSessionUser.uid === fbUser.uid)
        ? activeSessionUser
        : fbUser
        ? {
            uid: fbUser.uid,
            email: fbUser.email || BOOTSTRAPPED_ADMIN_EMAIL,
            displayName: fbUser.displayName || fbUser.email || 'Nhân viên',
            role:
              fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
                ? 'admin'
                : 'sales',
            workspaceId: WORKSPACE_ID,
          }
        : DEFAULT_STAFF_ACTOR;

    if (!fbUser && activeActor.role === 'admin') {
      ensureDefaultAdminInFirestore().catch((err) =>
        console.warn('Default admin sync notice:', err)
      );
    }

    const invoicesPath = 'invoices';
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('workspaceId', '==', WORKSPACE_ID)
    );

    const unsubInvoices = onSnapshot(
      invoicesQuery,
      async (snapshot) => {
        setIsCloudSynced(true);
        setLastSyncedAt(new Date().toISOString());
        const delSet = new Set(deletedIdsRef.current);

        // Clean up any cloud document that was explicitly deleted by the user
        const staleDocsToDelete: string[] = [];
        const validDocs = snapshot.docs.filter((d) => {
          const data = d.data() as Record<string, unknown>;
          const invId = String(data.id || d.id);
          if (delSet.has(invId) || delSet.has(d.id)) {
            staleDocsToDelete.push(d.id);
            return false;
          }
          return true;
        });

        if (staleDocsToDelete.length > 0) {
          deleteMultipleInvoicesInFirestore(staleDocsToDelete).catch((err) =>
            console.error('Failed to purge deleted invoices from Firestore:', err)
          );
        }

        const cloudInvoices = validDocs
          .map((d) =>
            mapFirestoreDocToInvoice(d.id, d.data() as Record<string, unknown>)
          )
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

        const cloudSeeded =
          localStorage.getItem(STORAGE_KEYS.cloudSeeded) === 'true';

        const mergeResult = mergeInvoicesOnCloudConnect({
          localInvoices: invoicesRef.current,
          cloudInvoices,
          unsyncedCreateIds: unsyncedCreateIdsRef.current,
          unsyncedUpdateIds: unsyncedUpdateIdsRef.current,
          deletedIds: deletedIdsRef.current,
          allowInitialSeed: !cloudSeeded && cloudInvoices.length === 0,
        });

        localStorage.setItem(STORAGE_KEYS.cloudSeeded, 'true');

        setInvoices(mergeResult.mergedInvoices);
        writeInvoicesToStorage(mergeResult.mergedInvoices);

        if (
          mergeResult.toCreateOnCloud.length > 0 ||
          mergeResult.toUpdateOnCloud.length > 0
        ) {
          try {
            if (fbUser) {
              await ensureUserProfileInFirestore(fbUser);
            }
            await Promise.all([
              ...mergeResult.toCreateOnCloud.map((inv) =>
                createInvoiceInFirestore(inv, activeActor)
              ),
              ...mergeResult.toUpdateOnCloud.map((inv) =>
                updateInvoicePaymentInFirestore(inv, activeActor)
              ),
            ]);
            removeUnsyncedCreateIds(mergeResult.syncedCreateIdsToClear);
            removeUnsyncedUpdateIds(mergeResult.syncedUpdateIdsToClear);
          } catch (err) {
            console.error('Failed to push offline invoices to Firestore:', err);
          }
        }
      },
      (error) => {
        if (auth.currentUser || currentUserRef.current) {
          handleFirestoreError(error, OperationType.LIST, invoicesPath);
        }
      }
    );

    const settingsPath = 'settings/main';
    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'main'),
      async (snap) => {
        setIsCloudSynced(true);
        if (hasPendingSettingsRef.current) {
          try {
            if (fbUser) {
              await ensureUserProfileInFirestore(fbUser);
            }
            await saveStoreSettingsToFirestore(settingsRef.current, activeActor.uid);
            markPendingSettings(false);
          } catch (err) {
            console.error('Failed to flush pending local settings:', err);
          }
          return;
        }
        if (snap.exists()) {
          const data = snap.data();
          setSettings((prev) => ({
            ...prev,
            storeName: String(data.storeName || prev.storeName),
            phone: String(data.phone ?? prev.phone),
            address: String(data.address ?? prev.address),
            bankName: String(data.bankName ?? prev.bankName),
            bankAccountNo: String(data.bankAccountNo ?? prev.bankAccountNo),
            bankAccountHolder: String(data.bankAccountName ?? prev.bankAccountHolder),
          }));
        }
      },
      (error) => {
        if (auth.currentUser || currentUserRef.current) {
          handleFirestoreError(error, OperationType.GET, settingsPath);
        }
      }
    );

    const activeEmail = fbUser?.email || activeActor.email || '';
    const isBootstrappedOwner =
      activeEmail.trim().toLowerCase() ===
        BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() ||
      activeActor.role === 'admin';

    const mapUserSnapshotDoc = (
      docId: string,
      data: Record<string, unknown>
    ): StaffUserProfile => {
      const emailStr = String(data.email || '');
      const isOwner =
        emailStr.trim().toLowerCase() ===
        BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
      const r: UserRole =
        data.role === 'admin' || data.role === 'cashier' || data.role === 'sales'
          ? data.role
          : isOwner
          ? 'admin'
          : 'sales';
      return {
        uid: String(data.uid || docId),
        email: emailStr,
        displayName: String(data.displayName || 'Nhân viên'),
        role: r,
        workspaceId: String(data.workspaceId || WORKSPACE_ID),
        plainPassword: data.plainPassword ? String(data.plainPassword) : undefined,
      };
    };

    const syncMatchedCurrentUser = (list: StaffUserProfile[]) => {
      const activeMe = currentUserRef.current;
      if (!activeMe) return;
      const matchedInCloud = list.find(
        (u) =>
          (fbUser && u.uid === fbUser.uid) ||
          u.uid === activeMe.uid ||
          u.email.toLowerCase() === activeMe.email.toLowerCase()
      );
      if (
        matchedInCloud &&
        (matchedInCloud.role !== activeMe.role ||
          matchedInCloud.displayName !== activeMe.displayName ||
          matchedInCloud.uid !== activeMe.uid)
      ) {
        setCurrentUser(matchedInCloud);
        writeSavedSessionToStorage(matchedInCloud);
      }
    };

    let unsubUsers: () => void;
    if (isBootstrappedOwner) {
      const usersQuery = query(
        collection(db, 'users'),
        where('workspaceId', '==', WORKSPACE_ID)
      );
      unsubUsers = onSnapshot(
        usersQuery,
        (snap) => {
          const list = snap.docs.map((d) =>
            mapUserSnapshotDoc(d.id, d.data() as Record<string, unknown>)
          );
          list.sort((a, b) => {
            if (a.role === 'admin' && b.role !== 'admin') return -1;
            if (a.role !== 'admin' && b.role === 'admin') return 1;
            return a.displayName.localeCompare(b.displayName, 'vi');
          });
          if (list.length > 0) {
            setStaffList(list);
          }
          syncMatchedCurrentUser(list);
        },
        (error) => {
          if (auth.currentUser || currentUserRef.current) {
            handleFirestoreError(error, OperationType.LIST, 'users');
          }
        }
      );
    } else {
      const targetUserUid = fbUser?.uid || activeActor.uid;
      const ownUserPath = `users/${targetUserUid}`;
      unsubUsers = onSnapshot(
        doc(db, 'users', targetUserUid),
        (snap) => {
          if (!snap.exists()) return;
          const ownProfile = mapUserSnapshotDoc(
            snap.id,
            snap.data() as Record<string, unknown>
          );
          setStaffList([ownProfile]);
          syncMatchedCurrentUser([ownProfile]);
        },
        (error) => {
          if (auth.currentUser || currentUserRef.current) {
            handleFirestoreError(error, OperationType.GET, ownUserPath);
          }
        }
      );
    }

    const customersQuery = query(
      collection(db, 'customers'),
      where('workspaceId', '==', WORKSPACE_ID)
    );
    const unsubCustomers = onSnapshot(
      customersQuery,
      async (snap) => {
        const delSet = new Set(deletedCustomerIdsRef.current);
        const cloudCustomers: Customer[] = snap.docs
          .map((d) => mapFirestoreDocToCustomer(d.id, d.data() as Record<string, unknown>))
          .filter((c) => !delSet.has(c.id));

        const custCloudSeeded =
          localStorage.getItem(STORAGE_KEYS.customersCloudSeeded) === 'true';

        const mergeResult = mergeCustomersOnCloudConnect({
          localCustomers: customersRef.current,
          cloudCustomers,
          unsyncedCustomerIds: unsyncedCustomerIdsRef.current,
          deletedCustomerIds: deletedCustomerIdsRef.current,
          allowInitialSeed: !custCloudSeeded && cloudCustomers.length === 0,
        });

        localStorage.setItem(STORAGE_KEYS.customersCloudSeeded, 'true');

        if (mergeResult.mergedCustomers.length > 0 || !snap.empty) {
          setCustomers(mergeResult.mergedCustomers);
          writeCustomersToStorage(mergeResult.mergedCustomers);
        }

        if (mergeResult.toUpsertOnCloud.length > 0) {
          try {
            if (fbUser) {
              await ensureUserProfileInFirestore(fbUser);
            }
            await Promise.all(
              mergeResult.toUpsertOnCloud.map((c) =>
                updateCustomerInFirestore(c, activeActor)
              )
            );
            removeUnsyncedCustomerIds(mergeResult.toUpsertOnCloud.map((c) => c.id));
          } catch (err) {
            console.warn('Failed to sync offline customers to Firestore:', err);
          }
        }
      },
      (error) => {
        if (auth.currentUser || currentUserRef.current) {
          handleFirestoreError(error, OperationType.LIST, 'customers');
        }
      }
    );

    return () => {
      unsubInvoices();
      unsubSettings();
      unsubUsers();
      unsubCustomers();
    };
  }, [
    authReady,
    fbUser?.uid,
    fbUser?.email,
    currentUser?.uid,
    currentUser?.email,
    currentUser?.role,
  ]);

  // Save state changes to localStorage & broadcast for real-time multi-tab sync
  useEffect(() => {
    writeInvoicesToStorage(invoices);
  }, [invoices]);

  useEffect(() => {
    writeCustomersToStorage(customers);
  }, [customers]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Listen to storage events from other tabs for real-time updates
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.deletedIds && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            deletedIdsRef.current = parsed;
            setDeletedIds(parsed);
          }
        } catch {
          // ignore
        }
      }
      if (e.key === STORAGE_KEYS.invoices && e.newValue !== null) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setInvoices(parsed);
          }
        } catch {
          // ignore
        }
      }
      if (e.key === STORAGE_KEYS.settings && e.newValue) {
        try {
          setSettings(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Compute live real-time daily summary for the top workspace strip
  const liveTodayReport = useMemo(() => {
    return computeDailyRevenueReport(invoices, toLocalYYYYMMDD());
  }, [invoices]);

  const settingsSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleUpdateSettings = (newSettings: StoreSettings) => {
    if (!permissions.canEditStoreSettings) return;
    setSettings(newSettings);
    const actor = currentUser || DEFAULT_STAFF_ACTOR;

    if (settingsSyncTimerRef.current) {
      clearTimeout(settingsSyncTimerRef.current);
    }
    settingsSyncTimerRef.current = setTimeout(() => {
      saveStoreSettingsToFirestore(newSettings, actor.uid)
        .then(() => {
          markPendingSettings(false);
          setIsCloudSynced(true);
          setLastSyncedAt(new Date().toISOString());
        })
        .catch((err) => {
          markPendingSettings(true);
          console.error('Failed to sync store settings:', err);
        });
    }, 600);
  };

  const handleCreateInvoice = (newInvoice: Invoice, openPrintModal: boolean) => {
    const actor = currentUser || DEFAULT_STAFF_ACTOR;
    const enrichedInvoice: Invoice = {
      ...newInvoice,
      createdByUid: actor.uid,
      createdByName: currentUser?.displayName || settings.storeName,
    };
    setInvoices((prev) => {
      const next = [enrichedInvoice, ...prev];
      writeInvoicesToStorage(next);
      return next;
    });
    if (openPrintModal) {
      setPrintingInvoiceId(enrichedInvoice.id);
    }
    localStorage.setItem(STORAGE_KEYS.cloudSeeded, 'true');
    createInvoiceInFirestore(enrichedInvoice, actor)
      .then(() => {
        setIsCloudSynced(true);
        setLastSyncedAt(new Date().toISOString());
      })
      .catch((err) => {
        addUnsyncedCreateIds([enrichedInvoice.id]);
        console.error('Failed to create invoice in Firestore:', err);
      });
  };

  const handleSettlePayment = (
    invoiceId: string,
    amount: number,
    method: PaymentMethod,
    note?: string
  ) => {
    if (!permissions.canSettlePayment) return;
    const actor = currentUser || DEFAULT_STAFF_ACTOR;
    setInvoices((prev) => {
      const next = prev.map((inv) => {
        if (inv.id === invoiceId) {
          const updated = settleInvoicePayment(inv, amount, method, note);
          updateInvoicePaymentInFirestore(updated, actor)
            .then(() => {
              setIsCloudSynced(true);
              setLastSyncedAt(new Date().toISOString());
            })
            .catch((err) => {
              addUnsyncedUpdateIds([updated.id]);
              console.error('Failed to update payment in Firestore:', err);
            });
          return updated;
        }
        return inv;
      });
      writeInvoicesToStorage(next);
      return next;
    });
  };

  const handleToggleFullPaid = (invoiceId: string, method?: PaymentMethod) => {
    if (!permissions.canSettlePayment) return;
    const actor = currentUser || DEFAULT_STAFF_ACTOR;
    setInvoices((prev) => {
      const next = prev.map((inv) => {
        if (inv.id === invoiceId) {
          const updated = toggleInvoicePaidStatus(inv, method);
          updateInvoicePaymentInFirestore(updated, actor)
            .then(() => {
              setIsCloudSynced(true);
              setLastSyncedAt(new Date().toISOString());
            })
            .catch((err) => {
              addUnsyncedUpdateIds([updated.id]);
              console.error('Failed to toggle payment in Firestore:', err);
            });
          return updated;
        }
        return inv;
      });
      writeInvoicesToStorage(next);
      return next;
    });
  };

  const handleSettleCustomerAllDebt = (customerId: string) => {
    if (!permissions.canSettlePayment) return;
    const actor = currentUser || DEFAULT_STAFF_ACTOR;
    setInvoices((prev) => {
      const next = prev.map((inv) => {
        if (inv.customerId === customerId && inv.remainingAmount > 0) {
          const updated = settleInvoicePayment(
            inv,
            inv.remainingAmount,
            'transfer',
            'Tất toán công nợ khách hàng'
          );
          updateInvoicePaymentInFirestore(updated, actor)
            .then(() => setLastSyncedAt(new Date().toISOString()))
            .catch((err) => {
              addUnsyncedUpdateIds([updated.id]);
              console.error('Failed to settle customer debt in Firestore:', err);
            });
          return updated;
        }
        return inv;
      });
      writeInvoicesToStorage(next);
      return next;
    });
  };

  const handleDeleteInvoice = (invoiceId: string) => {
    if (!permissions.canDeleteInvoice) return;
    recordDeletedIds([invoiceId]);
    removeUnsyncedCreateIds([invoiceId]);
    removeUnsyncedUpdateIds([invoiceId]);
    setInvoices((prev) => {
      const next = prev.filter((inv) => inv.id !== invoiceId);
      writeInvoicesToStorage(next);
      return next;
    });
    localStorage.setItem(STORAGE_KEYS.cloudSeeded, 'true');
    deleteInvoiceInFirestore(invoiceId).catch((err) =>
      console.error('Failed to delete invoice in Firestore:', err)
    );
  };

  const handleDeleteMultipleInvoices = (invoiceIds: string[]) => {
    if (!permissions.canDeleteInvoice || invoiceIds.length === 0) return;
    const idSet = new Set(invoiceIds);
    recordDeletedIds(invoiceIds);
    removeUnsyncedCreateIds(invoiceIds);
    removeUnsyncedUpdateIds(invoiceIds);
    setInvoices((prev) => {
      const next = prev.filter((inv) => !idSet.has(inv.id));
      writeInvoicesToStorage(next);
      return next;
    });
    localStorage.setItem(STORAGE_KEYS.cloudSeeded, 'true');
    deleteMultipleInvoicesInFirestore(invoiceIds).catch((err) =>
      console.error('Failed to delete multiple invoices in Firestore:', err)
    );
  };

  const handleDeleteCustomerDebt = (customerId: string) => {
    if (!permissions.canDeleteInvoice) return;
    const debtInvoiceIds = invoices
      .filter((inv) => inv.customerId === customerId && inv.remainingAmount > 0)
      .map((inv) => inv.id);
    handleDeleteMultipleInvoices(debtInvoiceIds);
  };

  const handleDeleteAllDebtInvoices = () => {
    if (!permissions.canDeleteInvoice) return;
    const allDebtIds = invoices
      .filter((inv) => inv.remainingAmount > 0)
      .map((inv) => inv.id);
    handleDeleteMultipleInvoices(allDebtIds);
  };

  const handleAddCustomer = async (data: Omit<Customer, 'id'>): Promise<Customer> => {
    const actor = currentUser || DEFAULT_STAFF_ACTOR;
    const newCust: Customer = {
      ...data,
      id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      workspaceId: WORKSPACE_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      debtPayments: data.debtPayments || [],
    };

    setCustomers((prev) => {
      const next = [newCust, ...prev];
      writeCustomersToStorage(next);
      return next;
    });

    createCustomerInFirestore(newCust, actor)
      .then(() => {
        setIsCloudSynced(true);
        setLastSyncedAt(new Date().toISOString());
      })
      .catch((err) => {
        addUnsyncedCustomerIds([newCust.id]);
        console.warn('Failed to save customer to Firestore:', err);
      });

    return newCust;
  };

  const handleUpdateCustomer = async (updated: Customer): Promise<void> => {
    const actor = currentUser || DEFAULT_STAFF_ACTOR;
    setCustomers((prev) => {
      const next = prev.map((c) => (c.id === updated.id ? updated : c));
      writeCustomersToStorage(next);
      return next;
    });

    updateCustomerInFirestore(updated, actor)
      .then(() => {
        setIsCloudSynced(true);
        setLastSyncedAt(new Date().toISOString());
      })
      .catch((err) => {
        addUnsyncedCustomerIds([updated.id]);
        console.warn('Failed to update customer in Firestore:', err);
      });
  };

  const handleDeleteCustomer = async (customerId: string): Promise<void> => {
    setDeletedCustomerIds((prev) => {
      const merged = Array.from(new Set([...prev, customerId]));
      deletedCustomerIdsRef.current = merged;
      writeDeletedCustomerIdsToStorage(merged);
      return merged;
    });
    removeUnsyncedCustomerIds([customerId]);

    setCustomers((prev) => {
      const next = prev.filter((c) => c.id !== customerId);
      writeCustomersToStorage(next);
      return next;
    });

    deleteCustomerInFirestore(customerId).catch((err) =>
      console.warn('Failed to delete customer in Firestore:', err)
    );
  };

  const handleSettleCustomerDebt = async (params: {
    customer: Customer;
    amountToPay: number;
    paymentMethod: 'cash' | 'transfer';
    note?: string;
  }): Promise<{ settledInvoicesCount: number; newRemainingDebt: number }> => {
    const actor = currentUser || DEFAULT_STAFF_ACTOR;
    const { customer, amountToPay, paymentMethod, note } = params;

    let remainingPayment = amountToPay;
    const settledCodes: string[] = [];
    let settledInvoicesCount = 0;

    const custInvoices = invoices.filter(
      (inv) =>
        inv.customerId === customer.id ||
        inv.customerName.trim().toLowerCase() === customer.name.trim().toLowerCase()
    );

    const unpaidInvoices = custInvoices
      .filter((inv) => (inv.remainingAmount || 0) > 0)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const updatedInvoicesMap = new Map<string, Invoice>();

    for (const inv of unpaidInvoices) {
      if (remainingPayment <= 0) break;

      const amountForThisInv = Math.min(remainingPayment, inv.remainingAmount);
      const newPaidAmount = (inv.paidAmount || 0) + amountForThisInv;
      const newRemaining = Math.max(0, inv.totalAmount - newPaidAmount);
      const newStatus = newRemaining === 0 ? 'paid' : 'partial';

      const newPaymentRecord = {
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        amount: amountForThisInv,
        method: paymentMethod,
        timestamp: new Date().toISOString(),
        note: note ? `Thu nợ: ${note}` : 'Khách trả nợ',
      };

      const updatedInv: Invoice = {
        ...inv,
        paidAmount: newPaidAmount,
        remainingAmount: newRemaining,
        paymentStatus: newStatus,
        paymentMethod,
        payments: [...(inv.payments || []), newPaymentRecord],
      };

      updatedInvoicesMap.set(updatedInv.id, updatedInv);
      settledCodes.push(inv.code);
      settledInvoicesCount++;
      remainingPayment -= amountForThisInv;

      updateInvoicePaymentInFirestore(updatedInv, actor).catch((err) => {
        addUnsyncedUpdateIds([updatedInv.id]);
        console.warn('Failed to update settled invoice in Firestore:', err);
      });
    }

    if (updatedInvoicesMap.size > 0) {
      setInvoices((prev) => {
        const next = prev.map((inv) => updatedInvoicesMap.get(inv.id) || inv);
        writeInvoicesToStorage(next);
        return next;
      });
    }

    let currentInitialDebt = Math.max(0, customer.initialDebt || 0);
    if (remainingPayment > 0 && currentInitialDebt > 0) {
      const deductInitial = Math.min(remainingPayment, currentInitialDebt);
      currentInitialDebt -= deductInitial;
      remainingPayment -= deductInitial;
    }

    const newDebtPaymentRecord = {
      id: `dp-${Date.now()}`,
      amount: amountToPay,
      method: paymentMethod,
      timestamp: new Date().toISOString(),
      note,
      settledInvoiceCodes: settledCodes,
      actorName: actor.displayName,
    };

    const updatedCustomer: Customer = {
      ...customer,
      initialDebt: currentInitialDebt,
      debtPayments: [newDebtPaymentRecord, ...(customer.debtPayments || [])],
      updatedAt: new Date().toISOString(),
    };

    setCustomers((prev) => {
      const next = prev.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c));
      writeCustomersToStorage(next);
      return next;
    });

    updateCustomerInFirestore(updatedCustomer, actor).catch((err) => {
      addUnsyncedCustomerIds([updatedCustomer.id]);
      console.warn('Failed to update customer debt in Firestore:', err);
    });

    const currentUnpaidTotal = invoices
      .map((inv) => (updatedInvoicesMap.has(inv.id) ? updatedInvoicesMap.get(inv.id)! : inv))
      .filter(
        (inv) =>
          (inv.customerId === customer.id ||
            inv.customerName.trim().toLowerCase() === customer.name.trim().toLowerCase()) &&
          (inv.remainingAmount || 0) > 0
      )
      .reduce((sum, inv) => sum + inv.remainingAmount, 0);

    const newRemainingDebt = currentUnpaidTotal + currentInitialDebt;

    return {
      settledInvoicesCount,
      newRemainingDebt,
    };
  };

  const handleSelectCustomerForNewInvoice = (customer: Customer) => {
    setSelectedCustomerForPos(customer);
    setActiveTab('pos');
  };

  const handleMarkPrinted = (invoiceId: string) => {
    const actor = currentUser || DEFAULT_STAFF_ACTOR;
    setInvoices((prev) => {
      const next = prev.map((inv) => {
        if (inv.id === invoiceId) {
          const nextCount = (inv.printedCount || 0) + 1;
          const updated: Invoice = { ...inv, printedCount: nextCount };
          incrementInvoicePrintedCountInFirestore(updated, actor).catch((err) => {
            addUnsyncedUpdateIds([updated.id]);
            console.error('Failed to increment printed count:', err);
          });
          return updated;
        }
        return inv;
      });
      writeInvoicesToStorage(next);
      return next;
    });
  };

  const handleLoginWithCredentials = async (
    identifier: string,
    password: string
  ) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const profile = await loginStaffAccountInFirestore({
        identifier,
        password,
      });
      setCurrentUser(profile);
      writeSavedSessionToStorage(profile);
      setRoleOverride(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.';
      setAuthError(message);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterAccount = async (params: {
    displayName: string;
    identifier: string;
    password: string;
    switchToNewAccount: boolean;
  }) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const newProfile = await registerStaffAccountInFirestore({
        displayName: params.displayName,
        identifier: params.identifier,
        password: params.password,
      });

      setStaffList((prev) => {
        const exists = prev.some((u) => u.uid === newProfile.uid);
        if (exists) {
          return prev.map((u) => (u.uid === newProfile.uid ? newProfile : u));
        }
        return [...prev, newProfile];
      });

      if (params.switchToNewAccount || !currentUser) {
        setCurrentUser(newProfile);
        writeSavedSessionToStorage(newProfile);
        setSessionExpiredNotice(false);
        setRoleOverride(null);
      }
      return newProfile;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Không thể đăng ký tài khoản. Vui lòng thử lại.';
      setAuthError(message);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignInGoogle = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const nextFbUser = await signInWithGooglePopup();
      setFbUser(nextFbUser);
      setAuthReady(true);
      const profile = await ensureUserProfileInFirestore(nextFbUser);
      setCurrentUser(profile);
      writeSavedSessionToStorage(profile);
      setSessionExpiredNotice(false);
      setRoleOverride(null);
      setIsCloudSynced(true);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      console.warn('Google Sign-in notice:', err);
      setAuthError(formatFirebaseAuthErrorVi(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setFbUser(null);
    setIsCloudSynced(false);
    setLastSyncedAt(null);
    setCurrentUser(null);
    writeSavedSessionToStorage(null);
    setRoleOverride(null);
  };

  const handleUpdateOwnName = async (newName: string) => {
    if (!currentUser) return;
    await updateOwnDisplayNameInFirestore(currentUser.uid, newName);
    const updated = { ...currentUser, displayName: newName };
    setCurrentUser(updated);
    writeSavedSessionToStorage(updated);
  };

  const handleChangeStaffRole = async (
    targetUser: StaffUserProfile,
    newRole: UserRole
  ) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    setStaffList((prev) =>
      prev.map((u) => (u.uid === targetUser.uid ? { ...u, role: newRole } : u))
    );
    if (targetUser.uid === currentUser.uid) {
      const updatedMe = { ...currentUser, role: newRole };
      setCurrentUser(updatedMe);
      writeSavedSessionToStorage(updatedMe);
    }
    await updateStaffRoleInFirestore(targetUser, newRole, currentUser.uid);
  };

  const handleDeleteStaffAccount = async (targetUser: StaffUserProfile) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    if (targetUser.uid === currentUser.uid) return;
    setStaffList((prev) => prev.filter((u) => u.uid !== targetUser.uid));
    await deleteStaffAccountInFirestore(targetUser.uid);
  };

  const handleChangePassword = async (params: {
    uid?: string;
    identifier?: string;
    currentPassword?: string;
    newPassword: string;
    skipCurrentCheck?: boolean;
  }) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await changeStaffPasswordInFirestore(params);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại.';
      setAuthError(message);
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSyncLocalInvoicesToCloud = async () => {
    const actor = currentUser || DEFAULT_STAFF_ACTOR;
    setSyncingInvoices(true);
    try {
      if (auth.currentUser) {
        await ensureUserProfileInFirestore(auth.currentUser);
      } else if (actor.role === 'admin') {
        await ensureDefaultAdminInFirestore();
      }
      localStorage.setItem(STORAGE_KEYS.cloudSeeded, 'true');
      localStorage.setItem(STORAGE_KEYS.customersCloudSeeded, 'true');

      const updateSet = new Set(unsyncedUpdateIdsRef.current);
      for (const inv of invoicesRef.current) {
        if (updateSet.has(inv.id)) {
          await updateInvoicePaymentInFirestore(inv, actor);
        } else {
          await createInvoiceInFirestore(inv, actor);
        }
      }
      for (const cust of customersRef.current) {
        await updateCustomerInFirestore(cust, actor);
      }
      await saveStoreSettingsToFirestore(settingsRef.current, actor.uid);

      removeUnsyncedCreateIds(unsyncedCreateIdsRef.current);
      removeUnsyncedUpdateIds(unsyncedUpdateIdsRef.current);
      removeUnsyncedCustomerIds(unsyncedCustomerIdsRef.current);
      markPendingSettings(false);
      setIsCloudSynced(true);
      setLastSyncedAt(new Date().toISOString());
    } finally {
      setSyncingInvoices(false);
    }
  };

  if (!currentUser) {
    return (
      <>
        <AuthGateView
          storeName={settings.storeName}
          authLoading={authLoading}
          authError={authError}
          sessionExpiredNotice={sessionExpiredNotice}
          onLoginWithCredentials={handleLoginWithCredentials}
          onRegisterAccount={handleRegisterAccount}
          onChangePassword={handleChangePassword}
          onSignInGoogle={handleSignInGoogle}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-100 text-slate-900 pb-24 md:pb-10">
      {/* Top Header: Hidden on mobile as tools are in the bottom navigation bar; visible on desktop (md+) */}
      <header className="hidden md:block no-print md:sticky md:top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="hidden md:flex max-w-5xl mx-auto items-center justify-between gap-3 sm:gap-6 px-4 sm:px-6 h-14">
          {/* Zone 1: Single text element wordmark + Quick Scan button */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('pos');
              }}
              className="text-base sm:text-lg font-extrabold tracking-tight text-[#1e3a8a] whitespace-nowrap shrink-0"
            >
              {settings.storeName}
            </a>

            <button
              type="button"
              onClick={() => setIsScanModalOpen(true)}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-bold text-xs rounded-xl shadow-2xs transition-all whitespace-nowrap shrink-0"
            >
              <Camera className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>Quét HĐ Giấy (AI)</span>
            </button>
          </div>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav
            aria-label="Điều hướng chính"
            className="hidden md:flex items-center gap-4 text-sm font-semibold text-slate-600"
          >
            <button
              type="button"
              onClick={() => setActiveTab('pos')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'pos'
                  ? 'text-[#1e40af] underline decoration-2 underline-offset-8'
                  : 'hover:text-slate-900 hover:underline underline-offset-8'
              }`}
            >
              Viết Hóa Đơn Bán Lẻ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('invoices')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'invoices'
                  ? 'text-[#1e40af] underline decoration-2 underline-offset-8'
                  : 'hover:text-slate-900 hover:underline underline-offset-8'
              }`}
            >
              Theo Dõi Thanh Toán ({liveTodayReport.unpaidInvoicesCount + liveTodayReport.partialInvoicesCount} nợ)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('customers')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'customers'
                  ? 'text-[#1e40af] underline decoration-2 underline-offset-8'
                  : 'hover:text-slate-900 hover:underline underline-offset-8'
              }`}
            >
              Khách Hàng ({customers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'account'
                  ? 'text-[#1e40af] underline decoration-2 underline-offset-8'
                  : 'hover:text-slate-900 hover:underline underline-offset-8'
              }`}
            >
              Tài Khoản &amp; Quyền ({permissions.shortBadgeVi})
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="no-print flex-1 max-w-5xl w-full mx-auto px-2 sm:px-6 py-4 sm:py-6 space-y-3 sm:space-y-4">
        {activeTab === 'pos' && (
          <PosBuilderView
            invoices={invoices}
            settings={settings}
            customers={customers}
            selectedCustomerFromParent={selectedCustomerForPos}
            onClearSelectedCustomer={() => setSelectedCustomerForPos(null)}
            onQuickAddCustomer={handleAddCustomer}
            onUpdateSettings={handleUpdateSettings}
            onCreateInvoice={handleCreateInvoice}
            onOpenScanModal={() => setIsScanModalOpen(true)}
            scannedDraftData={scannedDraftData}
            onClearScannedDraft={() => setScannedDraftData(null)}
          />
        )}

        {activeTab === 'invoices' && (
          <InvoiceTrackingView
            invoices={invoices}
            customers={customers}
            settings={settings}
            onSettlePayment={handleSettlePayment}
            onToggleFullPaid={handleToggleFullPaid}
            onOpenPrintModal={(inv) => setPrintingInvoiceId(inv.id)}
            canSettlePayment={permissions.canSettlePayment}
            canDeleteInvoice={permissions.canDeleteInvoice}
            onDeleteInvoice={handleDeleteInvoice}
            onDeleteMultipleInvoices={handleDeleteMultipleInvoices}
            onOpenScanModal={() => setIsScanModalOpen(true)}
          />
        )}

        {activeTab === 'customers' && (
          <CustomerManagementView
            customers={customers}
            invoices={invoices}
            currentUserName={currentUser?.displayName}
            onAddCustomer={handleAddCustomer}
            onUpdateCustomer={handleUpdateCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            onSettleCustomerDebt={handleSettleCustomerDebt}
            onSelectCustomerForNewInvoice={handleSelectCustomerForNewInvoice}
          />
        )}

        {activeTab === 'account' && (
          <AccountPermissionsView
            currentUser={currentUser}
            authLoading={authLoading}
            isCloudSynced={isCloudSynced}
            cloudEmail={fbUser?.email || currentUser.email || null}
            pendingSyncCount={pendingSyncSummary.totalPendingCount}
            staffList={staffList}
            roleOverride={roleOverride}
            onSetRoleOverride={setRoleOverride}
            onLoginWithCredentials={handleLoginWithCredentials}
            onRegisterAccount={handleRegisterAccount}
            onSignInGoogle={handleSignInGoogle}
            onSignOut={handleSignOut}
            onUpdateOwnName={handleUpdateOwnName}
            onChangeStaffRole={handleChangeStaffRole}
            onChangePassword={handleChangePassword}
            onDeleteStaffAccount={handleDeleteStaffAccount}
            onSyncLocalInvoicesToCloud={handleSyncLocalInvoicesToCloud}
            syncingInvoices={syncingInvoices}
            authError={authError}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (5 Tabs including Quét HĐ, >= 48px Hitboxes) */}
      <nav
        aria-label="Điều hướng điện thoại"
        className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center h-15 px-0.5 shadow-lg"
      >
        <button
          type="button"
          onClick={() => setActiveTab('pos')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            activeTab === 'pos' ? 'text-[#1e40af] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <FileEdit className="w-5 h-5 shrink-0" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap">Viết Đơn</span>
        </button>

        {/* The Requested Mobile Scan Button */}
        <button
          type="button"
          data-testid="bottom-nav-scan-button"
          onClick={() => setIsScanModalOpen(true)}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-all relative ${
            isScanModalOpen
              ? 'text-[#1e40af] font-bold'
              : 'text-slate-600 hover:text-[#1e40af] font-semibold'
          }`}
        >
          <div className="relative">
            <Camera className="w-5 h-5 text-[#1e40af] shrink-0" />
            <span className="absolute -top-1 -right-2.5 text-[8px] font-black bg-amber-400 text-slate-950 px-1 py-0.2 rounded-full leading-tight shadow-xs">
              AI
            </span>
          </div>
          <span className="text-[10px] mt-0.5 whitespace-nowrap text-[#1e40af] font-bold">
            Quét HĐ
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors relative ${
            activeTab === 'invoices' ? 'text-[#1e40af] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5 shrink-0" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap truncate max-w-[66px]">
            Thu Nợ ({liveTodayReport.unpaidInvoicesCount + liveTodayReport.partialInvoicesCount})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            activeTab === 'customers' ? 'text-[#1e40af] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <Users className="w-5 h-5 shrink-0" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap truncate max-w-[66px]">
            Khách ({customers.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('account')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
            activeTab === 'account' ? 'text-[#1e40af] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <ShieldCheck className="w-5 h-5 shrink-0" />
          <span className="text-[10px] mt-0.5 whitespace-nowrap truncate max-w-[66px]">
            Phân Quyền
          </span>
        </button>
      </nav>

      {/* A5 Invoice Preview & PDF / PNG Export Modal */}
      {activePrintInvoice && (
        <ThermalReceiptModal
          invoice={activePrintInvoice}
          settings={settings}
          onClose={() => setPrintingInvoiceId(null)}
          onMarkPrinted={handleMarkPrinted}
          onTogglePaid={(invId) => handleToggleFullPaid(invId, 'cash')}
        />
      )}

      {/* AI Scan Paper Receipt Modal */}
      <ScanReceiptModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        onApplyToPosBuilder={handleApplyScannedReceipt}
        onDirectSaveInvoice={handleCreateInvoice}
        existingInvoicesCount={invoices.length}
      />

      {/* Offline Status Banner */}
      <OfflineIndicator />
    </div>
  );
}
