import cloudbase from '@cloudbase/js-sdk';
import { InventoryItem, PurchaseOrder, SampleRecord, StickyNote } from '../types';

type CloudbaseConfig = Parameters<typeof cloudbase.init>[0];
type CloudbaseApp = ReturnType<typeof cloudbase.init>;
type CloudbaseAuth = ReturnType<CloudbaseApp['auth']>;

type ViteCloudbaseEnv = {
  readonly VITE_CLOUDBASE_ENV_ID?: string;
  readonly VITE_CLOUDBASE_REGION?: string;
  readonly VITE_CLOUDBASE_ACCESS_KEY?: string;
  readonly VITE_CLOUDBASE_DATABASE?: string;
};

type CloudbaseRecord = Record<string, unknown>;

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
  email: string | null;
}

export type BuyerSystemAccessMode = 'full' | 'ledgerUploadOnly' | 'none';

export interface BuyerSystemAccess {
  mode: BuyerSystemAccessMode;
  label: string;
}

export type CloudbaseOtpMethod = 'phone' | 'email';

export interface CloudbaseOtpChallenge {
  method: CloudbaseOtpMethod;
  target: string;
  verify: (code: string) => Promise<CloudbaseAuthUser>;
}

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
  | 'buyer_system_view_settings';

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
let cloudbaseAuth: CloudbaseAuth | null = null;

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
      auth: {
        detectSessionInUrl: true,
      },
    };

    const accessKey = getOptionalEnvValue('VITE_CLOUDBASE_ACCESS_KEY');
    if (accessKey) {
      config.accessKey = accessKey;
    }

    cloudbaseApp = cloudbase.init(config);
  }
  return cloudbaseApp;
}

function getCloudbaseAuth(): CloudbaseAuth {
  if (!cloudbaseAuth) {
    cloudbaseAuth = getCloudbaseApp().auth({ persistence: 'local' });
  }
  return cloudbaseAuth;
}

function isCloudbaseRecord(value: unknown): value is CloudbaseRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

async function readJsonResponse<T>(response: Response, path: string): Promise<T> {
  const payload = await response.json() as { success?: boolean; data?: T; message?: string; code?: string };
  if (!response.ok || payload.success === false) {
    throw new Error(`${path}: ${payload.message ?? payload.code ?? 'MongoDB API request failed'}`);
  }
  return payload.data as T;
}

function getDataApiPath(collectionName: CollectionName, documentId?: string): string {
  const basePath = `/api/data/${encodeURIComponent(collectionName)}`;
  return documentId ? `${basePath}/${encodeURIComponent(normalizeCloudbaseDocumentId(documentId))}` : basePath;
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

function readStringField(source: Record<string, unknown>, field: string): string | null {
  const value = source[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNestedStringField(source: Record<string, unknown>, objectField: string, nestedField: string): string | null {
  const value = source[objectField];
  if (!isCloudbaseRecord(value)) {
    return null;
  }

  return readStringField(value, nestedField);
}

function getSessionUser(result: { data?: { session?: { user?: unknown }; user?: unknown }; error?: unknown }): CloudbaseAuthUser | null {
  if (result.error) {
    throw result.error;
  }

  const user = result.data?.session?.user ?? result.data?.user;
  if (!isCloudbaseRecord(user)) {
    return null;
  }

  const uid = readStringField(user, 'id') ?? readStringField(user, 'uid') ?? readStringField(user, '_id');
  if (!uid) {
    return null;
  }

  const isAnonymous = user.is_anonymous;
  if (isAnonymous === true) {
    return null;
  }

  return {
    uid,
    username: readStringField(user, 'username') ?? readNestedStringField(user, 'user_metadata', 'username'),
    email: readStringField(user, 'email'),
  };
}

export function normalizeCloudbaseUsername(username: string): string {
  return username.trim();
}

export function getBuyerSystemAccess(user: CloudbaseAuthUser | null): BuyerSystemAccess {
  const username = user?.username?.trim().toLowerCase() ?? '';
  if (username === 'caigou') {
    return {
      mode: 'full',
      label: '采购',
    };
  }

  if (username === 'caiwu') {
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

export function normalizeCloudbaseOtpTarget(method: CloudbaseOtpMethod, target: string): string {
  const trimmed = target.trim();
  if (method === 'email') {
    return trimmed;
  }

  const compact = trimmed.replace(/[\s-]/g, '');
  if (compact.startsWith('+')) {
    return `+${compact.slice(1).replace(/\D/g, '')}`;
  }

  const digits = compact.replace(/\D/g, '');
  if (/^1\d{10}$/.test(digits)) {
    return `+86${digits}`;
  }

  return digits;
}

export function validateCloudbaseOtpTarget(method: CloudbaseOtpMethod, target: string): string | null {
  const normalized = normalizeCloudbaseOtpTarget(method, target);
  if (!normalized) {
    if (method === 'phone' && target.trim()) {
      return '请输入有效手机号，国内手机号可直接输入 11 位数字。';
    }
    return method === 'phone' ? '请输入手机号。' : '请输入邮箱地址。';
  }

  if (method === 'phone') {
    if (!/^\+\d{8,16}$/.test(normalized)) {
      return '请输入有效手机号，国内手机号可直接输入 11 位数字。';
    }
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return '请输入有效邮箱地址。';
  }

  return null;
}

export function validateCloudbaseOtpCode(code: string): string | null {
  if (!code.trim()) {
    return '请输入验证码。';
  }

  return null;
}

export async function getCurrentCloudbaseUser(): Promise<CloudbaseAuthUser | null> {
  if (!isCloudbaseConfigured()) {
    return null;
  }

  const result = await getCloudbaseAuth().getSession();
  return getSessionUser(result);
}

export async function signInToCloudbase(username: string, password: string): Promise<CloudbaseAuthUser> {
  const validationError = validateCloudbaseLoginInput(username, password);
  if (validationError) {
    throw new Error(validationError);
  }

  const result = await getCloudbaseAuth().signInWithPassword({
    username: normalizeCloudbaseUsername(username),
    password,
  });
  const user = getSessionUser(result);
  if (!user) {
    throw new Error('CloudBase 登录成功但未返回有效用户会话。');
  }

  return user;
}

export async function sendCloudbaseOtp(method: CloudbaseOtpMethod, rawTarget: string): Promise<CloudbaseOtpChallenge> {
  const validationError = validateCloudbaseOtpTarget(method, rawTarget);
  if (validationError) {
    throw new Error(validationError);
  }

  const target = normalizeCloudbaseOtpTarget(method, rawTarget);
  const result = method === 'phone'
    ? await getCloudbaseAuth().signInWithOtp({ phone: target })
    : await getCloudbaseAuth().signInWithOtp({ email: target });

  if (result.error) {
    throw result.error;
  }

  const verifyOtp = result.data.verifyOtp;
  if (!verifyOtp) {
    throw new Error('CloudBase 未返回验证码验证入口，请检查登录方式配置。');
  }

  return {
    method,
    target,
    verify: async (code: string) => {
      const codeValidationError = validateCloudbaseOtpCode(code);
      if (codeValidationError) {
        throw new Error(codeValidationError);
      }

      const signInResult = await verifyOtp({ token: code.trim() });
      const user = getSessionUser(signInResult);
      if (!user) {
        throw new Error('CloudBase 验证成功但未返回有效用户会话。');
      }

      return user;
    },
  };
}

export async function signOutFromCloudbase(): Promise<void> {
  if (!isCloudbaseConfigured()) {
    return;
  }

  await getCloudbaseAuth().signOut();
}

export async function listDocuments<T>(collectionName: CollectionName): Promise<T[]> {
  const path = getDataApiPath(collectionName);
  const response = await fetch(path);
  return readJsonResponse<T[]>(response, collectionName);
}

export async function getDocument<T>(collectionName: CollectionName, documentId: string): Promise<T | null> {
  const path = getDataApiPath(collectionName, documentId);
  const response = await fetch(path);
  return readJsonResponse<T | null>(response, path);
}

async function listDocumentIds(collectionName: CollectionName): Promise<string[]> {
  const path = `${getDataApiPath(collectionName)}?includeIds=true`;
  const response = await fetch(path);
  return readJsonResponse<string[]>(response, collectionName);
}

export async function setDocument<T extends object>(
  collectionName: CollectionName,
  documentId: string,
  value: T,
): Promise<void> {
  const path = getDataApiPath(collectionName, documentId);
  const response = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cleanUndefined(value)),
  });
  await readJsonResponse<null>(response, path);
}

export async function deleteDocument(collectionName: CollectionName, documentId: string): Promise<void> {
  const path = getDataApiPath(collectionName, documentId);
  const response = await fetch(path, { method: 'DELETE' });
  await readJsonResponse<null>(response, path);
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
} as const satisfies Record<string, CollectionName>;
