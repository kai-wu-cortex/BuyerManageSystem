import cloudbase from '@cloudbase/js-sdk';
import { InventoryItem, PurchaseOrder, SampleRecord, StickyNote } from '../types';

type CloudbaseConfig = Parameters<typeof cloudbase.init>[0];
type CloudbaseApp = ReturnType<typeof cloudbase.init>;
type CloudbaseDatabase = ReturnType<CloudbaseApp['database']>;

type ViteCloudbaseEnv = {
  readonly VITE_CLOUDBASE_ENV_ID?: string;
  readonly VITE_CLOUDBASE_REGION?: string;
  readonly VITE_CLOUDBASE_ACCESS_KEY?: string;
  readonly VITE_CLOUDBASE_DATABASE?: string;
};

type CloudbaseRecord = Record<string, unknown>;

type WatchSnapshot = {
  docs: CloudbaseRecord[];
};

type WatchListener = {
  close: () => void;
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface CloudbaseErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  envId: string | null;
}

export interface CloudbaseAuthUser {
  uid: string;
  username: string | null;
  role: 'caigou' | 'caiwu' | null;
}

export type BuyerSystemAccessMode = 'full' | 'ledgerUploadOnly' | 'none';

export interface BuyerSystemAccess {
  mode: BuyerSystemAccessMode;
  label: string;
}

const AUTH_SESSION_KEY = 'buyer_system_auth_session';
const SALT_LENGTH = 16; // 128-bit salt
const HASH_ALGORITHM = 'SHA-256';

export type DashboardViewSettings = {
  timelineCols: 1 | 2 | 3 | 4;
  visibleFields: Record<string, boolean>;
  drawerCols: 1 | 2;
  drawerFields: Record<string, boolean>;
  ganttFields: Record<string, boolean>;
  moduleOrder: string[];
  moduleWidths: Record<string, number>;
};

export type LedgerViewSettings = {
  rowHeight: 'compact' | 'medium' | 'relaxed';
  sheetSortField: string;
  sheetSortOrder: 'asc' | 'desc';
  columnsList: { field: string; name: string }[];
  hiddenFields: string[];
  columnWidths: Record<string, number>;
};

export type BuyerSystemViewSettingsScope = 'dashboard' | 'ledger';

export interface BuyerSystemViewSettingsRecord {
  id: string;
  uid: string;
  username: string | null;
  dashboard?: Partial<DashboardViewSettings>;
  ledger?: Partial<LedgerViewSettings>;
  updatedAt: string;
}

export interface LedgerBackup {
  id: string;
  name: string;
  timeCreated: string;
  rawTime: number;
  size: number;
  orders: PurchaseOrder[];
}

export type CollectionName =
  | 'inventory_stock'
  | 'sample_records'
  | 'order_sticky_notes'
  | 'ledger_backups'
  | 'buyer_system_view_settings'
  | 'system_users';

export interface SystemUser {
  username: string;
  passwordHash: string;
  salt: string;
  role: 'caigou' | 'caiwu';
  createdAt: string;
}

const DEFAULT_REGION = 'ap-shanghai';
const MAX_SYNC_DOCUMENT_BYTES = 900000;
const LEDGER_BACKUP_TTL_MS = 5 * 24 * 60 * 60 * 1000;
const viteCloudbaseEnv: ViteCloudbaseEnv = {
  VITE_CLOUDBASE_ENV_ID:
    typeof import.meta.env === 'undefined' ? undefined : import.meta.env.VITE_CLOUDBASE_ENV_ID,
  VITE_CLOUDBASE_REGION:
    typeof import.meta.env === 'undefined' ? undefined : import.meta.env.VITE_CLOUDBASE_REGION,
  VITE_CLOUDBASE_ACCESS_KEY:
    typeof import.meta.env === 'undefined' ? undefined : import.meta.env.VITE_CLOUDBASE_ACCESS_KEY,
  VITE_CLOUDBASE_DATABASE:
    typeof import.meta.env === 'undefined' ? undefined : import.meta.env.VITE_CLOUDBASE_DATABASE,
};

let cloudbaseApp: CloudbaseApp | null = null;
let cloudbaseDb: CloudbaseDatabase | null = null;

function requiredCloudbaseEnvId(): string {
  const envId = getOptionalEnvValue('VITE_CLOUDBASE_ENV_ID');
  if (!envId) {
    throw new Error('缺少 VITE_CLOUDBASE_ENV_ID，请在 .env.local 中配置 CloudBase 环境 ID。');
  }
  return envId;
}

function getOptionalEnvValue(key: keyof ViteCloudbaseEnv): string | undefined {
  const value = viteCloudbaseEnv[key]?.trim();
  return value || undefined;
}

export function isCloudbaseConfigured(): boolean {
  return Boolean(getOptionalEnvValue('VITE_CLOUDBASE_ENV_ID'));
}

function getCloudbaseApp(): CloudbaseApp {
  if (!cloudbaseApp) {
    const config: CloudbaseConfig = {
      env: requiredCloudbaseEnvId(),
      region: getOptionalEnvValue('VITE_CLOUDBASE_REGION') ?? DEFAULT_REGION,
    };

    const accessKey = getOptionalEnvValue('VITE_CLOUDBASE_ACCESS_KEY');
    if (accessKey) {
      config.accessKey = accessKey;
    }

    cloudbaseApp = cloudbase.init(config);
  }
  return cloudbaseApp;
}

function getCloudbaseDb(): CloudbaseDatabase {
  if (!cloudbaseDb) {
    const database = getOptionalEnvValue('VITE_CLOUDBASE_DATABASE');
    cloudbaseDb = database ? getCloudbaseApp().database({ database }) : getCloudbaseApp().database();
  }
  return cloudbaseDb;
}

// ─── Password Hashing (Web Crypto API) ──────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function generateSalt(length = SALT_LENGTH): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return bytesToHex(array);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const saltedPassword = salt + password;
  const data = encoder.encode(saltedPassword);
  const hash = await crypto.subtle.digest(HASH_ALGORITHM, data);
  return bytesToHex(new Uint8Array(hash));
}

async function verifyPassword(password: string, salt: string, storedHash: string): Promise<boolean> {
  const computedHash = await hashPassword(password, salt);
  // Constant-time comparison to prevent timing attacks
  if (computedHash.length !== storedHash.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}

// ─── Session Management ─────────────────────────────────────────────────────

interface AuthSession {
  uid: string;
  username: string;
  role: 'caigou' | 'caiwu' | null;
  loginTime: string;
}

function saveAuthSession(user: AuthSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
  } catch {
    // localStorage may be full or unavailable
  }
}

function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore
  }
}

function readAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (!session.uid || !session.username) return null;
    return session;
  } catch {
    return null;
  }
}

function isCloudbaseRecord(value: unknown): value is CloudbaseRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getCloudbaseDocumentId(value: CloudbaseRecord): string | null {
  const id = value._id;
  return typeof id === 'string' ? id : null;
}

function hasSdkError(result: { code?: string; message?: string }): boolean {
  return Boolean(result.code);
}

function assertNoSdkError(result: { code?: string; message?: string }, path: string): void {
  if (hasSdkError(result)) {
    throw new Error(`${path}: ${result.message ?? result.code ?? 'CloudBase operation failed'}`);
  }
}

export function normalizeCloudbaseDocumentId(id: string): string {
  const normalized = id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return normalized || 'document';
}

export function cleanUndefined<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map(item => cleanUndefined(item))
      .filter(item => item !== undefined) as T;
  }

  const cleaned: CloudbaseRecord = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (nestedValue !== undefined) {
      cleaned[key] = cleanUndefined(nestedValue);
    }
  }
  return cleaned as T;
}

function stripCloudbaseSystemFields<T>(record: CloudbaseRecord): T {
  const { _id, _openid, _createTime, _updateTime, ...businessFields } = record;
  void _id;
  void _openid;
  void _createTime;
  void _updateTime;
  return businessFields as T;
}

async function runInChunks<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  chunkSize = 40,
): Promise<void> {
  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    await Promise.all(chunk.map(item => worker(item)));
  }
}

export function handleCloudbaseError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: CloudbaseErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    envId: getOptionalEnvValue('VITE_CLOUDBASE_ENV_ID') ?? null,
    operationType,
    path,
  };
  console.error('CloudBase Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function normalizeCloudbaseUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function getBuyerSystemAccess(user: CloudbaseAuthUser | null): BuyerSystemAccess {
  const role = user?.role ?? null;
  if (role === 'caigou') {
    return {
      mode: 'full',
      label: '采购',
    };
  }

  if (role === 'caiwu') {
    return {
      mode: 'ledgerUploadOnly',
      label: '财务',
    };
  }

  return {
    mode: 'none',
    label: '未授权',
  };
}

export function getBuyerSystemViewSettingsDocumentId(user: CloudbaseAuthUser): string {
  return normalizeCloudbaseDocumentId(`buyer_system_view_settings_${user.uid}`);
}

export function createBuyerSystemViewSettingsRecord(
  user: CloudbaseAuthUser,
  scope: BuyerSystemViewSettingsScope,
  settings: Partial<DashboardViewSettings> | Partial<LedgerViewSettings>,
  updatedAt = new Date().toISOString(),
): BuyerSystemViewSettingsRecord {
  return {
    id: getBuyerSystemViewSettingsDocumentId(user),
    uid: user.uid,
    username: user.username,
    [scope]: settings,
    updatedAt,
  };
}

export function validateCloudbaseLoginInput(username: string, password: string): string | null {
  if (!normalizeCloudbaseUsername(username)) {
    return '请输入用户名。';
  }

  if (!password) {
    return '请输入密码。';
  }

  return null;
}

// ─── New: DB-based Authentication ──────────────────────────────────────────

export async function getCurrentCloudbaseUser(): Promise<CloudbaseAuthUser | null> {
  if (!isCloudbaseConfigured()) {
    return null;
  }

  // Read session from localStorage
  const session = readAuthSession();
  if (!session) {
    return null;
  }

  return {
    uid: session.uid,
    username: session.username,
    role: session.role,
  };
}

export async function signInToCloudbase(username: string, password: string): Promise<CloudbaseAuthUser> {
  const validationError = validateCloudbaseLoginInput(username, password);
  if (validationError) {
    throw new Error(validationError);
  }

  const normalizedUser = normalizeCloudbaseUsername(username);

  // Query the system_users collection for this username
  const result = await getCloudbaseDb().collection('system_users')
    .where({ username: normalizedUser })
    .limit(1)
    .get();

  if (typeof result.code === 'string') {
    throw new Error(`数据库查询失败: ${result.message ?? result.code}`);
  }

  const records = result.data ?? [];
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('用户名或密码错误。');
  }

  const userDoc = records[0] as CloudbaseRecord;
  const userHash = userDoc.passwordHash as string | undefined;
  const userSalt = userDoc.salt as string | undefined;
  const userRole = userDoc.role as string | undefined;

  if (!userHash || !userSalt) {
    throw new Error('用户数据异常，请联系管理员。');
  }

  // Verify password
  const isValid = await verifyPassword(password, userSalt, userHash);
  if (!isValid) {
    throw new Error('用户名或密码错误。');
  }

  const role = (userRole === 'caigou' || userRole === 'caiwu') ? userRole as 'caigou' | 'caiwu' : null;

  const sessionUser: CloudbaseAuthUser = {
    uid: normalizedUser,
    username: normalizedUser,
    role,
  };

  // Save session to localStorage
  saveAuthSession({
    uid: sessionUser.uid,
    username: sessionUser.username,
    role: sessionUser.role,
    loginTime: new Date().toISOString(),
  });

  return sessionUser;
}

export async function signOutFromCloudbase(): Promise<void> {
  clearAuthSession();
}

export function watchCollection<T>(
  collectionName: CollectionName,
  onChange: (records: T[]) => void | Promise<void>,
  onError: (error: unknown) => void,
): () => void {
  let isClosed = false;
  let listener: WatchListener | null = null;

  void (async () => {
    if (isClosed) return;

    listener = getCloudbaseDb().collection(collectionName).watch({
      onChange: (snapshot: WatchSnapshot) => {
        const records = snapshot.docs
          .filter(isCloudbaseRecord)
          .map(record => stripCloudbaseSystemFields<T>(record));

        Promise.resolve(onChange(records)).catch(onError);
      },
      onError,
    }) as WatchListener;
  })().catch(onError);

  return () => {
    isClosed = true;
    listener?.close();
  };
}

export async function listDocuments<T>(collectionName: CollectionName): Promise<T[]> {
  const result = await getCloudbaseDb().collection(collectionName).limit(1000).get();
  assertNoSdkError(result, collectionName);
  return result.data.filter(isCloudbaseRecord).map(record => stripCloudbaseSystemFields<T>(record));
}

export async function getDocument<T>(collectionName: CollectionName, documentId: string): Promise<T | null> {
  const id = normalizeCloudbaseDocumentId(documentId);
  const result = await getCloudbaseDb().collection(collectionName).doc(id).get();
  assertNoSdkError(result, `${collectionName}/${id}`);

  const data = result.data;
  if (Array.isArray(data)) {
    const first = data.find(isCloudbaseRecord);
    return first ? stripCloudbaseSystemFields<T>(first) : null;
  }

  if (isCloudbaseRecord(data)) {
    return stripCloudbaseSystemFields<T>(data);
  }

  return null;
}

async function listDocumentIds(collectionName: CollectionName): Promise<string[]> {
  const result = await getCloudbaseDb().collection(collectionName).limit(1000).get();
  assertNoSdkError(result, collectionName);
  return result.data.filter(isCloudbaseRecord).map(getCloudbaseDocumentId).filter((id): id is string => Boolean(id));
}

export async function setDocument<T extends object>(
  collectionName: CollectionName,
  documentId: string,
  value: T,
): Promise<void> {
  const id = normalizeCloudbaseDocumentId(documentId);
  const result = await getCloudbaseDb().collection(collectionName).doc(id).set(cleanUndefined(value));
  assertNoSdkError(result, `${collectionName}/${id}`);
}

export async function deleteDocument(collectionName: CollectionName, documentId: string): Promise<void> {
  const id = normalizeCloudbaseDocumentId(documentId);
  const result = await getCloudbaseDb().collection(collectionName).doc(id).remove();
  assertNoSdkError(result, `${collectionName}/${id}`);
}

export async function upsertDocuments<T extends object>(
  collectionName: CollectionName,
  records: T[],
  getId: (record: T) => string,
): Promise<void> {
  await runInChunks(records, record => setDocument(collectionName, getId(record), record));
}

export async function replaceCollection<T extends object>(
  collectionName: CollectionName,
  nextRecords: T[],
  previousRecords: T[],
  getId: (record: T) => string,
): Promise<void> {
  const nextIds = new Set(nextRecords.map(record => normalizeCloudbaseDocumentId(getId(record))));
  const staleIds = previousRecords
    .map(record => normalizeCloudbaseDocumentId(getId(record)))
    .filter(id => !nextIds.has(id));

  await upsertDocuments(collectionName, nextRecords, getId);
  await runInChunks(staleIds, staleId => deleteDocument(collectionName, staleId));
}

export async function replaceRecordCollection<T extends object>(
  collectionName: CollectionName,
  nextRecords: Record<string, T>,
  previousRecords: Record<string, T>,
): Promise<void> {
  const nextIds = new Set(Object.keys(nextRecords).map(normalizeCloudbaseDocumentId));
  const staleIds = Object.keys(previousRecords)
    .map(normalizeCloudbaseDocumentId)
    .filter(id => !nextIds.has(id));

  await runInChunks(
    Object.entries(nextRecords),
    ([documentId, record]) => setDocument(collectionName, documentId, record),
  );
  await runInChunks(staleIds, staleId => deleteDocument(collectionName, staleId));
}

export async function clearCloudbaseCollections(collectionNames: CollectionName[]): Promise<void> {
  for (const collectionName of collectionNames) {
    const ids = await listDocumentIds(collectionName);
    await runInChunks(ids, id => deleteDocument(collectionName, id));
  }
}

export async function loadBuyerSystemViewSettings(
  user: CloudbaseAuthUser,
): Promise<BuyerSystemViewSettingsRecord | null> {
  return getDocument<BuyerSystemViewSettingsRecord>(
    'buyer_system_view_settings',
    getBuyerSystemViewSettingsDocumentId(user),
  );
}

export async function saveBuyerSystemViewSettings(
  user: CloudbaseAuthUser,
  scope: BuyerSystemViewSettingsScope,
  settings: Partial<DashboardViewSettings> | Partial<LedgerViewSettings>,
): Promise<void> {
  const existing = await loadBuyerSystemViewSettings(user);
  const nextRecord: BuyerSystemViewSettingsRecord = {
    ...existing,
    ...createBuyerSystemViewSettingsRecord(user, scope, settings),
    dashboard: scope === 'dashboard' ? settings as Partial<DashboardViewSettings> : existing?.dashboard,
    ledger: scope === 'ledger' ? settings as Partial<LedgerViewSettings> : existing?.ledger,
  };

  await setDocument('buyer_system_view_settings', nextRecord.id, nextRecord);
}

export function prepareSampleForCloudbaseSync(sample: SampleRecord): SampleRecord {
  const prepared: SampleRecord = {
    ...sample,
    imgUrls: sample.imgUrls ? [...sample.imgUrls] : undefined,
  };

  const documentSize = new Blob([JSON.stringify(prepared)]).size;
  if (documentSize <= MAX_SYNC_DOCUMENT_BYTES) {
    return prepared;
  }

  delete prepared.imgUrl;
  delete prepared.imgUrls;
  if (!prepared.notes.includes('超出限制')) {
    prepared.notes = `${prepared.notes}\n(由于图片体积超过云端容量限制，历史原图未同步上云，请重新上传压缩图片)`;
  }
  return prepared;
}

export async function saveLedgerBackup(orders: PurchaseOrder[]): Promise<LedgerBackup> {
  const now = new Date();
  const rawTime = now.getTime();
  const id = `ledger_backup_${rawTime}`;
  const backup: LedgerBackup = {
    id,
    name: `ledger_backup_${now.toISOString().split('T')[0]}_${now.toTimeString().split(' ')[0].replace(/:/g, '-')}`,
    timeCreated: now.toLocaleString('zh-CN', { hour12: false }),
    rawTime,
    size: new Blob([JSON.stringify(orders)]).size,
    orders,
  };

  await setDocument('ledger_backups', id, backup);
  return backup;
}

export function sortBackupsNewestFirst(backups: LedgerBackup[]): LedgerBackup[] {
  return [...backups].sort((a, b) => b.rawTime - a.rawTime);
}

export function getLatestLedgerBackup(backups: LedgerBackup[]): LedgerBackup | null {
  return sortBackupsNewestFirst(backups)[0] ?? null;
}

export function isLedgerBackupNewerThanLoaded(backup: LedgerBackup | null, loadedRawTime: number): boolean {
  if (!backup || !Number.isFinite(backup.rawTime)) {
    return false;
  }

  const normalizedLoadedTime = Number.isFinite(loadedRawTime) && loadedRawTime > 0 ? loadedRawTime : 0;
  return backup.rawTime > normalizedLoadedTime;
}

export function formatLedgerBackupSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return '未知';
  }

  return `${(size / 1024).toFixed(1)} KB`;
}

export function filterExpiredBackups(
  backups: LedgerBackup[],
  nowMs = Date.now(),
  ttlMs = LEDGER_BACKUP_TTL_MS,
): { activeBackups: LedgerBackup[]; expiredIds: string[] } {
  const activeBackups: LedgerBackup[] = [];
  const expiredIds: string[] = [];

  for (const backup of backups) {
    if (backup.rawTime > 0 && nowMs - backup.rawTime > ttlMs) {
      expiredIds.push(backup.id);
    } else {
      activeBackups.push(backup);
    }
  }

  return {
    activeBackups: sortBackupsNewestFirst(activeBackups),
    expiredIds,
  };
}

export async function pruneExpiredLedgerBackups(): Promise<void> {
  const backups = await listDocuments<LedgerBackup>('ledger_backups');
  const { expiredIds } = filterExpiredBackups(backups);
  await runInChunks(expiredIds, id => deleteDocument('ledger_backups', id));
}

export async function listActiveLedgerBackups(): Promise<LedgerBackup[]> {
  const backups = await listDocuments<LedgerBackup>('ledger_backups');
  const { activeBackups, expiredIds } = filterExpiredBackups(backups);
  await runInChunks(expiredIds, id => deleteDocument('ledger_backups', id));
  return activeBackups;
}

export const cloudbaseCollections = {
  inventory: 'inventory_stock',
  samples: 'sample_records',
  notes: 'order_sticky_notes',
  ledgerBackups: 'ledger_backups',
  viewSettings: 'buyer_system_view_settings',
  systemUsers: 'system_users',
} as const satisfies Record<string, CollectionName>;
