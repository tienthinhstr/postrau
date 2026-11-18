import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromServer,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import firebaseConfigFallback from '../../firebase-applet-config.json';
import { Customer, CustomerDebtPayment, Invoice, StaffUserProfile, StoreSettings, UserRole } from '../types/pos';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  determineInitialRoleForEmail,
  normalizeAccountIdentifier,
  WORKSPACE_ID,
} from '../utils/rbac';

const firebaseConfig = {
  apiKey: firebaseConfigFallback.apiKey || 'AIzaSyBxVfyIvR-mfa8CJn4ldjDQ5Pec3yW1a18',
  authDomain: firebaseConfigFallback.authDomain || 'rau-cai.firebaseapp.com',
  projectId: firebaseConfigFallback.projectId || 'rau-cai',
  storageBucket: firebaseConfigFallback.storageBucket || 'rau-cai.firebasestorage.app',
  messagingSenderId: firebaseConfigFallback.messagingSenderId || '512277363425',
  appId: firebaseConfigFallback.appId || '1:512277363425:web:47d0292ebc4e0f22e255a0',
  measurementId: firebaseConfigFallback.measurementId || 'G-X2ED9CNDZ9',
};

// Initialize Firebase using the project's default Firestore database on rau-cai
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const ACTIVE_FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const ACTIVE_FIRESTORE_DATABASE_ID = '(default)';

export const DEFAULT_STAFF_ACTOR: StaffUserProfile = {
  uid: 'acct-tienthinhstr-gmail-com',
  email: BOOTSTRAPPED_ADMIN_EMAIL,
  displayName: 'Chủ Vựa Rau (Admin)',
  role: 'admin',
  workspaceId: WORKSPACE_ID,
};

export let analytics: ReturnType<typeof getAnalytics> | null = null;
if (typeof window !== 'undefined') {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      // Ignore analytics errors in restricted iframe/test environments
    });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}-${Date.now()}`;
}

function clampString(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const str = String(val ?? fallback);
  return str.slice(0, maxLen);
}

export async function signInWithGooglePopup(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch {
    // ignore signout error if using Firestore-direct session
  }
}

export async function hashPassword(rawPassword: string): Promise<string> {
  const clean = String(rawPassword || '').trim();
  const salted = `vuarau_salt_v1:${clean}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(salted);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fall through to deterministic hash
    }
  }
  let h = 2166136261;
  for (let i = 0; i < salted.length; i++) {
    h ^= salted.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a_${(h >>> 0).toString(16)}`;
}

const LOCAL_STAFF_STORAGE_KEY = 'vua_rau_local_staff_v1';

interface LocalStaffRecord extends StaffUserProfile {
  username: string;
  passwordHash: string;
  plainPassword?: string;
}

async function readLocalStaffRecords(): Promise<LocalStaffRecord[]> {
  try {
    const raw = localStorage.getItem(LOCAL_STAFF_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as LocalStaffRecord[];
      }
    }
  } catch {
    // ignore storage errors
  }
  const defaultHash = await hashPassword('123456');
  const seeded: LocalStaffRecord[] = [
    {
      uid: 'acct-tienthinhstr-gmail-com',
      email: BOOTSTRAPPED_ADMIN_EMAIL,
      username: 'admin',
      displayName: 'Chủ Vựa Rau (Admin)',
      role: 'admin',
      workspaceId: WORKSPACE_ID,
      passwordHash: defaultHash,
      plainPassword: '123456',
    },
  ];
  try {
    localStorage.setItem(LOCAL_STAFF_STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    // ignore
  }
  return seeded;
}

function writeLocalStaffRecords(records: LocalStaffRecord[]): void {
  try {
    localStorage.setItem(LOCAL_STAFF_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore storage errors
  }
}

export async function getLocalStaffProfiles(): Promise<StaffUserProfile[]> {
  const records = await readLocalStaffRecords();
  return records.map(({ uid, email, displayName, role, workspaceId, plainPassword }) => ({
    uid,
    email,
    displayName,
    role,
    workspaceId,
    plainPassword,
  }));
}

export async function ensureDefaultAdminInFirestore(): Promise<StaffUserProfile> {
  const records = await readLocalStaffRecords();
  const existingLocal = records.find(
    (r) => r.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  );
  const adminDocRef = doc(db, 'users', 'acct-tienthinhstr-gmail-com');
  try {
    const snap = await getDoc(adminDocRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: String(data.uid || 'acct-tienthinhstr-gmail-com'),
        email: String(data.email || BOOTSTRAPPED_ADMIN_EMAIL),
        displayName: String(data.displayName || existingLocal?.displayName || 'Chủ Vựa Rau (Admin)'),
        role: 'admin',
        workspaceId: WORKSPACE_ID,
        plainPassword: String(data.plainPassword || existingLocal?.plainPassword || '123456'),
      };
    }
    const defaultHash = await hashPassword('123456');
    await setDoc(adminDocRef, {
      uid: 'acct-tienthinhstr-gmail-com',
      email: BOOTSTRAPPED_ADMIN_EMAIL,
      username: 'admin',
      displayName: 'Chủ Vựa Rau (Admin)',
      role: 'admin',
      workspaceId: WORKSPACE_ID,
      passwordHash: existingLocal?.passwordHash || defaultHash,
      plainPassword: existingLocal?.plainPassword || '123456',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore default admin check notice:', err);
  }
  if (existingLocal) {
    return {
      uid: existingLocal.uid,
      email: existingLocal.email,
      displayName: existingLocal.displayName,
      role: 'admin',
      workspaceId: WORKSPACE_ID,
      plainPassword: existingLocal.plainPassword || '123456',
    };
  }
  return DEFAULT_STAFF_ACTOR;
}

export async function registerStaffAccountInFirestore(params: {
  displayName: string;
  identifier: string;
  password: string;
}): Promise<StaffUserProfile> {
  const cleanName = clampString(params.displayName, 100, '');
  const rawIdentifier = String(params.identifier || '').trim();
  const rawPassword = String(params.password || '').trim();

  if (!cleanName) {
    throw new Error('Vui lòng nhập Họ và tên nhân viên / chủ tài khoản.');
  }
  if (!rawIdentifier || rawIdentifier.length < 3) {
    throw new Error('Vui lòng nhập Email hoặc Tên đăng nhập (tối thiểu 3 ký tự).');
  }
  if (rawPassword.length < 4) {
    throw new Error('Mật khẩu phải có ít nhất 4 ký tự.');
  }

  const { email, username, docId } = normalizeAccountIdentifier(rawIdentifier);
  const records = await readLocalStaffRecords();
  const existing = records.find(
    (r) =>
      r.uid === docId ||
      r.email.toLowerCase() === email.toLowerCase() ||
      r.username.toLowerCase() === username.toLowerCase()
  );

  const isBootstrappedAdmin =
    email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() ||
    username.toLowerCase() === 'admin';

  const userRef = doc(db, 'users', docId);
  try {
    const cloudSnap = await getDoc(userRef);
    if (cloudSnap.exists() && !isBootstrappedAdmin) {
      throw new Error(
        `Tài khoản "${rawIdentifier}" đã được đăng ký trước đó. Vui lòng chuyển sang tab Đăng Nhập.`
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('đã được đăng ký')) {
      throw err;
    }
  }

  if (existing && !isBootstrappedAdmin) {
    throw new Error(
      `Tài khoản "${rawIdentifier}" đã được đăng ký trước đó. Vui lòng chuyển sang tab Đăng Nhập.`
    );
  }

  const passwordHash = await hashPassword(rawPassword);
  const initialRole: UserRole = isBootstrappedAdmin
    ? 'admin'
    : determineInitialRoleForEmail(email);

  const newRecord: LocalStaffRecord = {
    uid: docId,
    email: clampString(email, 160, 'staff@vuarau.vn'),
    username: clampString(username, 80, 'staff'),
    displayName: cleanName,
    role: initialRole,
    workspaceId: WORKSPACE_ID,
    passwordHash,
    plainPassword: rawPassword,
  };

  try {
    await setDoc(userRef, {
      ...newRecord,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore staff register notice:', error);
  }

  const nextRecords = existing
    ? records.map((r) => (r.uid === existing.uid ? newRecord : r))
    : [...records, newRecord];
  writeLocalStaffRecords(nextRecords);

  return {
    uid: newRecord.uid,
    email: newRecord.email,
    displayName: newRecord.displayName,
    role: newRecord.role,
    workspaceId: newRecord.workspaceId,
    plainPassword: newRecord.plainPassword,
  };
}

export async function loginStaffAccountInFirestore(params: {
  identifier: string;
  password: string;
}): Promise<StaffUserProfile> {
  const rawIdentifier = String(params.identifier || '').trim();
  const rawPassword = String(params.password || '').trim();

  if (!rawIdentifier) {
    throw new Error('Vui lòng nhập Email hoặc Tên đăng nhập.');
  }
  if (!rawPassword) {
    throw new Error('Vui lòng nhập mật khẩu.');
  }

  const isAdminShortcut =
    rawIdentifier.toLowerCase() === 'admin' ||
    rawIdentifier.toLowerCase() === 'admin@vuarau.vn' ||
    rawIdentifier.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  const targetIdentifier = isAdminShortcut ? BOOTSTRAPPED_ADMIN_EMAIL : rawIdentifier;
  const { email, docId } = normalizeAccountIdentifier(targetIdentifier);
  const passwordHash = await hashPassword(rawPassword);

  let matched: LocalStaffRecord | undefined;

  try {
    const directSnap = await getDoc(doc(db, 'users', docId));
    if (directSnap.exists()) {
      const d = directSnap.data();
      matched = {
        uid: String(d.uid || docId),
        email: String(d.email || email),
        username: String(d.username || rawIdentifier),
        displayName: String(d.displayName || 'Nhân viên'),
        role: d.role === 'admin' || d.role === 'cashier' || d.role === 'sales' ? d.role : 'sales',
        workspaceId: String(d.workspaceId || WORKSPACE_ID),
        passwordHash: String(d.passwordHash || ''),
        plainPassword: d.plainPassword ? String(d.plainPassword) : undefined,
      };
    } else {
      const q = query(collection(db, 'users'), where('workspaceId', '==', WORKSPACE_ID));
      const snap = await getDocs(q);
      for (const docItem of snap.docs) {
        const d = docItem.data();
        const dEmail = String(d.email || '').toLowerCase();
        const dUsername = String(d.username || '').toLowerCase();
        if (
          dEmail === email.toLowerCase() ||
          dEmail === rawIdentifier.toLowerCase() ||
          dUsername === rawIdentifier.toLowerCase()
        ) {
          matched = {
            uid: String(d.uid || docItem.id),
            email: String(d.email || email),
            username: String(d.username || rawIdentifier),
            displayName: String(d.displayName || 'Nhân viên'),
            role: d.role === 'admin' || d.role === 'cashier' || d.role === 'sales' ? d.role : 'sales',
            workspaceId: String(d.workspaceId || WORKSPACE_ID),
            passwordHash: String(d.passwordHash || ''),
            plainPassword: d.plainPassword ? String(d.plainPassword) : undefined,
          };
          break;
        }
      }
    }
  } catch (err) {
    console.warn('Firestore staff lookup fallback to local:', err);
  }

  if (!matched) {
    const records = await readLocalStaffRecords();
    matched = records.find(
      (r) =>
        r.uid === docId ||
        r.email.toLowerCase() === email.toLowerCase() ||
        r.email.toLowerCase() === rawIdentifier.toLowerCase() ||
        r.username.toLowerCase() === rawIdentifier.toLowerCase()
    );
  }

  if (!matched) {
    if (isAdminShortcut && rawPassword === '123456') {
      return await ensureDefaultAdminInFirestore();
    }
    throw new Error(
      `Không tìm thấy tài khoản "${rawIdentifier}". Nếu là nhân viên mới, vui lòng chọn mục "Đăng Ký" hoặc đăng nhập bằng Google.`
    );
  }

  if (matched.passwordHash && matched.passwordHash !== passwordHash) {
    if (!(isAdminShortcut && rawPassword === '123456' && !matched.plainPassword)) {
      throw new Error('Mật khẩu không chính xác. Vui lòng kiểm tra lại.');
    }
  }

  return {
    uid: matched.uid,
    email: matched.email,
    displayName: matched.displayName,
    role: matched.role,
    workspaceId: matched.workspaceId,
    plainPassword: matched.plainPassword || rawPassword,
  };
}

export async function changeStaffPasswordInFirestore(params: {
  uid?: string;
  identifier?: string;
  currentPassword?: string;
  newPassword: string;
  skipCurrentCheck?: boolean;
}): Promise<void> {
  const newPasswordRaw = String(params.newPassword || '').trim();
  if (newPasswordRaw.length < 4) {
    throw new Error('Mật khẩu mới phải có ít nhất 4 ký tự.');
  }

  const rawId = String(params.identifier || '').trim();
  const isAdminShortcut =
    rawId.toLowerCase() === 'admin' ||
    rawId.toLowerCase() === 'admin@vuarau.vn' ||
    rawId.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  const records = await readLocalStaffRecords();
  let targetIndex = records.findIndex(
    (r) =>
      (params.uid && r.uid === params.uid) ||
      (rawId &&
        (r.email.toLowerCase() === rawId.toLowerCase() ||
          r.username.toLowerCase() === rawId.toLowerCase())) ||
      (isAdminShortcut && r.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase())
  );

  if (targetIndex === -1 && (isAdminShortcut || rawId === '')) {
    await ensureDefaultAdminInFirestore();
    const refreshed = await readLocalStaffRecords();
    targetIndex = refreshed.findIndex(
      (r) => r.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
    );
    if (targetIndex !== -1) {
      records.splice(0, records.length, ...refreshed);
    }
  }

  const targetUid =
    params.uid ||
    (targetIndex !== -1
      ? records[targetIndex].uid
      : isAdminShortcut
      ? 'acct-tienthinhstr-gmail-com'
      : normalizeAccountIdentifier(rawId).docId);

  let targetPasswordHash = targetIndex !== -1 ? records[targetIndex].passwordHash : '';
  try {
    const snap = await getDoc(doc(db, 'users', targetUid));
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.passwordHash === 'string') {
        targetPasswordHash = data.passwordHash;
      }
    } else if (targetIndex === -1) {
      throw new Error(`Không tìm thấy tài khoản "${rawId}". Vui lòng kiểm tra lại Tên đăng nhập hoặc Email.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Không tìm thấy tài khoản')) {
      throw err;
    }
    if (targetIndex === -1) {
      throw new Error(`Không tìm thấy tài khoản "${rawId}". Vui lòng kiểm tra lại Tên đăng nhập hoặc Email.`);
    }
  }

  if (!params.skipCurrentCheck) {
    const currentRaw = String(params.currentPassword || '').trim();
    if (!currentRaw) {
      throw new Error('Vui lòng nhập mật khẩu hiện tại (mặc định ban đầu: 123456).');
    }
    const currentHash = await hashPassword(currentRaw);
    if (targetPasswordHash && currentHash !== targetPasswordHash) {
      throw new Error('Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại.');
    }
  }

  const newHash = await hashPassword(newPasswordRaw);
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      passwordHash: newHash,
      plainPassword: newPasswordRaw,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore change password notice:', err);
  }

  if (targetIndex !== -1) {
    records[targetIndex] = {
      ...records[targetIndex],
      passwordHash: newHash,
      plainPassword: newPasswordRaw,
    };
    writeLocalStaffRecords(records);
  }
}

export async function deleteStaffAccountInFirestore(targetUid: string): Promise<void> {
  const records = await readLocalStaffRecords();
  const filtered = records.filter((r) => r.uid !== targetUid);
  if (filtered.length !== records.length) {
    writeLocalStaffRecords(filtered);
  }

  const cleanUid = sanitizeId(targetUid, 'user');
  const userPath = `users/${cleanUid}`;
  try {
    await deleteDoc(doc(db, 'users', cleanUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, userPath);
  }
}

const pendingUserProfilePromises = new Map<string, Promise<StaffUserProfile>>();

export async function ensureUserProfileInFirestore(user: User): Promise<StaffUserProfile> {
  const uid = sanitizeId(user.uid, 'user');
  const existingPromise = pendingUserProfilePromises.get(uid);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async (): Promise<StaffUserProfile> => {
    const userPath = `users/${uid}`;
    const userRef = doc(db, 'users', uid);

    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        const role: UserRole =
          data.role === 'admin' || data.role === 'cashier' || data.role === 'sales'
            ? data.role
            : determineInitialRoleForEmail(user.email);
        return {
          uid: data.uid || uid,
          email: data.email || user.email || '',
          displayName: data.displayName || user.displayName || user.email || 'Nhân viên',
          role,
          workspaceId: data.workspaceId || WORKSPACE_ID,
        };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, userPath);
    }

    const initialRole = determineInitialRoleForEmail(user.email);
    const newProfile: StaffUserProfile = {
      uid,
      email: clampString(user.email, 160, 'staff@vuarau.vn'),
      displayName: clampString(
        user.displayName || user.email?.split('@')[0],
        100,
        'Nhân viên Vựa Rau'
      ),
      role: initialRole,
      workspaceId: WORKSPACE_ID,
    };

    try {
      await setDoc(userRef, {
        uid: newProfile.uid,
        email: newProfile.email,
        displayName: newProfile.displayName,
        role: newProfile.role,
        workspaceId: WORKSPACE_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }

    return newProfile;
  })();

  pendingUserProfilePromises.set(uid, promise);
  try {
    return await promise;
  } finally {
    pendingUserProfilePromises.delete(uid);
  }
}

export async function updateStaffRoleInFirestore(
  targetProfile: StaffUserProfile,
  newRole: UserRole,
  currentAdminUid: string
): Promise<void> {
  const records = await readLocalStaffRecords();
  const updatedRecords = records.map((r) =>
    r.uid === targetProfile.uid ? { ...r, role: newRole } : r
  );
  writeLocalStaffRecords(updatedRecords);

  const uid = sanitizeId(targetProfile.uid, 'user');
  const userPath = `users/${uid}`;
  const adminPath = `admins/${uid}`;

  try {
    await updateDoc(doc(db, 'users', uid), {
      role: newRole,
      displayName: clampString(targetProfile.displayName, 100, 'Nhân viên'),
      updatedAt: serverTimestamp(),
    });

    if (newRole === 'admin') {
      await setDoc(doc(db, 'admins', uid), {
        uid,
        email: clampString(targetProfile.email, 160, 'admin@vuarau.vn'),
        grantedBy: sanitizeId(auth.currentUser?.uid || currentAdminUid, 'admin'),
        createdAt: serverTimestamp(),
      });
    } else {
      const adminSnap = await getDoc(doc(db, 'admins', uid));
      if (adminSnap.exists()) {
        await deleteDoc(doc(db, 'admins', uid));
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${userPath} | ${adminPath}`);
  }
}

export async function updateOwnDisplayNameInFirestore(
  uid: string,
  newDisplayName: string
): Promise<void> {
  const cleanName = clampString(newDisplayName, 100, 'Nhân viên');
  const records = await readLocalStaffRecords();
  writeLocalStaffRecords(
    records.map((r) => (r.uid === uid ? { ...r, displayName: cleanName } : r))
  );

  const cleanUid = sanitizeId(auth.currentUser?.uid || uid, 'user');
  const userPath = `users/${cleanUid}`;
  try {
    await updateDoc(doc(db, 'users', cleanUid), {
      displayName: cleanName,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, userPath);
  }
}

export function buildFirestoreInvoicePayload(
  invoice: Invoice,
  creator: StaffUserProfile
) {
  const cleanId = sanitizeId(invoice.id, 'inv');
  const boundedItems = (invoice.items || []).slice(0, 50).map((it) => ({
    id: clampString(it.id, 64, 'line-1'),
    productId: clampString(it.productId, 120, 'prod-1'),
    productName: clampString(it.productName, 120, 'Rau cải'),
    category: it.category || 'rau_cai',
    unitCode: it.unitCode || 'kg',
    unitLabel: clampString(it.unitLabel, 40, 'Kg'),
    grossQuantity: Number.isFinite(it.grossQuantity) ? Math.max(0, it.grossQuantity) : 0,
    tareWeight: Number.isFinite(it.tareWeight) ? Math.max(0, it.tareWeight) : 0,
    netQuantity: Number.isFinite(it.netQuantity) ? Math.max(0, it.netQuantity) : 0,
    unitPrice: Number.isFinite(it.unitPrice) ? Math.max(0, Math.round(it.unitPrice)) : 0,
    estimatedKgPerUnit: Number.isFinite(it.estimatedKgPerUnit)
      ? Math.max(0, it.estimatedKgPerUnit)
      : 1,
    lineTotal: Number.isFinite(it.lineTotal) ? Math.max(0, Math.round(it.lineTotal)) : 0,
  }));

  const boundedPayments = (invoice.payments || []).slice(0, 50).map((p) => ({
    id: clampString(p.id, 64, 'pay-1'),
    amount: Number.isFinite(p.amount) ? Math.max(0, Math.round(p.amount)) : 0,
    method: p.method === 'transfer' ? 'transfer' : 'cash',
    timestamp: clampString(p.timestamp, 40, new Date().toISOString()),
    note: clampString(p.note, 160, ''),
  }));

  const totalAmount = Math.max(0, Math.round(invoice.totalAmount || 0));
  const paidAmount = Math.min(totalAmount, Math.max(0, Math.round(invoice.paidAmount || 0)));
  const remainingAmount = Math.max(0, totalAmount - paidAmount);

  return {
    id: cleanId,
    workspaceId: WORKSPACE_ID,
    code: clampString(invoice.code, 40, 'HD-001'),
    createdAtIso: clampString(
      invoice.createdAt && String(invoice.createdAt).trim().length >= 10
        ? invoice.createdAt
        : new Date().toISOString(),
      40,
      new Date().toISOString()
    ),
    customerId: clampString(invoice.customerId, 120, 'khach-le'),
    customerName: clampString(invoice.customerName, 120, 'Khách Mua Lẻ'),
    customerPhone: clampString(invoice.customerPhone, 40, ''),
    customerAddress: clampString(invoice.customerAddress, 200, ''),
    customerType: invoice.customerType === 'khach_le' ? 'khach_le' : 'moi_si',
    items: boundedItems,
    subtotal: Math.max(0, Math.round(invoice.subtotal || totalAmount)),
    discountAmount: Math.max(0, Math.round(invoice.discountAmount || 0)),
    crateDepositAmount: Math.max(0, Math.round(invoice.crateDepositAmount || 0)),
    totalAmount,
    paidAmount,
    remainingAmount,
    paymentStatus: invoice.paymentStatus || 'unpaid',
    paymentMethod: invoice.paymentMethod === 'transfer' ? 'transfer' : 'cash',
    payments: boundedPayments,
    printedCount: Math.max(0, Math.round(invoice.printedCount || 0)),
    createdByUid: sanitizeId(creator.uid, 'user'),
    createdByName: clampString(
      creator.displayName && creator.displayName.trim().length > 0
        ? creator.displayName
        : 'Nhân viên',
      100,
      'Nhân viên'
    ),
  };
}

export function mapFirestoreDocToInvoice(docId: string, data: Record<string, unknown>): Invoice {
  const createdAtField = data.createdAt as Timestamp | undefined;
  const isoFromTimestamp =
    createdAtField && typeof createdAtField.toDate === 'function'
      ? createdAtField.toDate().toISOString()
      : new Date().toISOString();

  return {
    id: String(data.id || docId),
    code: String(data.code || 'HD-001'),
    createdAt: String(data.createdAtIso || isoFromTimestamp),
    customerId: String(data.customerId || 'khach-le'),
    customerName: String(data.customerName || 'Khách Mua Lẻ'),
    customerPhone: String(data.customerPhone || ''),
    customerAddress: String(data.customerAddress || ''),
    customerType: data.customerType === 'khach_le' ? 'khach_le' : 'moi_si',
    items: Array.isArray(data.items) ? (data.items as Invoice['items']) : [],
    subtotal: Number(data.subtotal) || 0,
    discountAmount: Number(data.discountAmount) || 0,
    crateDepositAmount: Number(data.crateDepositAmount) || 0,
    totalAmount: Number(data.totalAmount) || 0,
    paidAmount: Number(data.paidAmount) || 0,
    remainingAmount: Number(data.remainingAmount) || 0,
    paymentStatus:
      data.paymentStatus === 'paid' ||
      data.paymentStatus === 'partial' ||
      data.paymentStatus === 'unpaid'
        ? data.paymentStatus
        : 'unpaid',
    paymentMethod: data.paymentMethod === 'transfer' ? 'transfer' : 'cash',
    payments: Array.isArray(data.payments) ? (data.payments as Invoice['payments']) : [],
    printedCount: Number(data.printedCount) || 0,
    createdByUid: data.createdByUid ? String(data.createdByUid) : undefined,
    createdByName: data.createdByName ? String(data.createdByName) : undefined,
  };
}

export async function createInvoiceInFirestore(
  invoice: Invoice,
  creator: StaffUserProfile
): Promise<void> {
  const authActor: StaffUserProfile = {
    ...creator,
    uid: auth.currentUser?.uid || creator.uid || DEFAULT_STAFF_ACTOR.uid,
  };
  const payload = buildFirestoreInvoicePayload(invoice, authActor);
  if (payload.items.length === 0) return;
  const path = `invoices/${payload.id}`;
  const docRef = doc(db, 'invoices', payload.id);
  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      return;
    }
    await setDoc(docRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateInvoicePaymentInFirestore(
  updatedInvoice: Invoice,
  actor: StaffUserProfile
): Promise<void> {
  const payload = buildFirestoreInvoicePayload(updatedInvoice, {
    ...actor,
    uid: auth.currentUser?.uid || actor.uid || DEFAULT_STAFF_ACTOR.uid,
  });
  const path = `invoices/${payload.id}`;
  const docRef = doc(db, 'invoices', payload.id);
  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      if (payload.items.length === 0) return;
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    await updateDoc(docRef, {
      paidAmount: payload.paidAmount,
      remainingAmount: payload.remainingAmount,
      paymentStatus: payload.paymentStatus,
      paymentMethod: payload.paymentMethod,
      payments: payload.payments,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function incrementInvoicePrintedCountInFirestore(
  updatedInvoice: Invoice,
  actor: StaffUserProfile
): Promise<void> {
  const payload = buildFirestoreInvoicePayload(updatedInvoice, {
    ...actor,
    uid: auth.currentUser?.uid || actor.uid || DEFAULT_STAFF_ACTOR.uid,
  });
  const path = `invoices/${payload.id}`;
  const docRef = doc(db, 'invoices', payload.id);
  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      if (payload.items.length === 0) return;
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    await updateDoc(docRef, {
      printedCount: payload.printedCount,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteInvoiceInFirestore(invoiceId: string): Promise<void> {
  const cleanId = sanitizeId(invoiceId, 'inv');
  const path = `invoices/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'invoices', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteMultipleInvoicesInFirestore(
  invoiceIds: string[]
): Promise<void> {
  await Promise.all(
    invoiceIds.map((id) => deleteInvoiceInFirestore(id))
  );
}

export async function saveStoreSettingsToFirestore(
  settings: StoreSettings,
  userUid: string
): Promise<void> {
  const path = 'settings/main';
  const effectiveUid = sanitizeId(
    auth.currentUser?.uid || userUid || DEFAULT_STAFF_ACTOR.uid,
    'user'
  );
  try {
    await setDoc(doc(db, 'settings', 'main'), {
      storeName: clampString(settings.storeName, 120, 'Vựa Rau Cải Thành Đạt'),
      phone: clampString(settings.phone, 60, ''),
      address: clampString(settings.address, 200, ''),
      bankName: clampString(settings.bankName, 80, 'Vietcombank'),
      bankAccountNo: clampString(settings.bankAccountNo, 50, ''),
      bankAccountName: clampString(settings.bankAccountHolder, 100, ''),
      updatedByUid: effectiveUid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function mapFirestoreDocToCustomer(docId: string, data: Record<string, unknown>): Customer {
  return {
    id: String(data.id || docId),
    name: String(data.name || 'Khách hàng'),
    phone: String(data.phone || ''),
    stallOrAddress: String(data.stallOrAddress || ''),
    type: data.type === 'khach_le' ? 'khach_le' : data.type === 'nha_hang' ? 'nha_hang' : 'moi_si',
    note: data.note ? String(data.note) : undefined,
    initialDebt: Number(data.initialDebt) || 0,
    debtPayments: Array.isArray(data.debtPayments) ? (data.debtPayments as CustomerDebtPayment[]) : [],
    workspaceId: String(data.workspaceId || WORKSPACE_ID),
    createdAt: String(data.createdAtIso || new Date().toISOString()),
    updatedAt: String(data.updatedAtIso || new Date().toISOString()),
  };
}

export async function createCustomerInFirestore(
  customer: Customer,
  actor: StaffUserProfile
): Promise<void> {
  const cleanId = sanitizeId(customer.id, 'cust');
  const path = `customers/${cleanId}`;
  const docRef = doc(db, 'customers', cleanId);
  const effectiveUid = sanitizeId(
    auth.currentUser?.uid || actor.uid || DEFAULT_STAFF_ACTOR.uid,
    'user'
  );
  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        name: clampString(customer.name, 120, 'Khách hàng'),
        phone: clampString(customer.phone, 40, ''),
        stallOrAddress: clampString(customer.stallOrAddress, 200, ''),
        type: customer.type || 'moi_si',
        note: clampString(customer.note || '', 300, ''),
        initialDebt: Math.max(0, Math.round(customer.initialDebt || 0)),
        debtPayments: Array.isArray(customer.debtPayments) ? customer.debtPayments.slice(0, 50) : [],
        updatedByUid: effectiveUid,
        updatedByName: clampString(actor.displayName || 'Nhân viên', 100, 'Nhân viên'),
        updatedAtIso: clampString(new Date().toISOString(), 40),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const createdAtIso =
      customer.createdAt && String(customer.createdAt).trim().length >= 10
        ? customer.createdAt
        : new Date().toISOString();
    await setDoc(docRef, {
      id: cleanId,
      workspaceId: WORKSPACE_ID,
      name: clampString(customer.name, 120, 'Khách hàng'),
      phone: clampString(customer.phone, 40, ''),
      stallOrAddress: clampString(customer.stallOrAddress, 200, ''),
      type: customer.type || 'moi_si',
      note: clampString(customer.note || '', 300, ''),
      initialDebt: Math.max(0, Math.round(customer.initialDebt || 0)),
      debtPayments: Array.isArray(customer.debtPayments) ? customer.debtPayments.slice(0, 50) : [],
      createdByUid: effectiveUid,
      createdByName: clampString(actor.displayName || 'Nhân viên', 100, 'Nhân viên'),
      createdAtIso: clampString(createdAtIso, 40, new Date().toISOString()),
      updatedAtIso: clampString(new Date().toISOString(), 40, new Date().toISOString()),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCustomerInFirestore(
  customer: Customer,
  actor: StaffUserProfile
): Promise<void> {
  const cleanId = sanitizeId(customer.id, 'cust');
  const path = `customers/${cleanId}`;
  const docRef = doc(db, 'customers', cleanId);
  const effectiveUid = sanitizeId(
    auth.currentUser?.uid || actor.uid || DEFAULT_STAFF_ACTOR.uid,
    'user'
  );
  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      await createCustomerInFirestore(customer, actor);
      return;
    }
    await updateDoc(docRef, {
      name: clampString(customer.name, 120, 'Khách hàng'),
      phone: clampString(customer.phone, 40, ''),
      stallOrAddress: clampString(customer.stallOrAddress, 200, ''),
      type: customer.type || 'moi_si',
      note: clampString(customer.note || '', 300, ''),
      initialDebt: Math.max(0, Math.round(customer.initialDebt || 0)),
      debtPayments: Array.isArray(customer.debtPayments) ? customer.debtPayments.slice(0, 50) : [],
      updatedByUid: effectiveUid,
      updatedByName: clampString(actor.displayName || 'Nhân viên', 100, 'Nhân viên'),
      updatedAtIso: clampString(new Date().toISOString(), 40),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCustomerInFirestore(customerId: string): Promise<void> {
  const cleanId = sanitizeId(customerId, 'cust');
  const path = `customers/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'customers', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

