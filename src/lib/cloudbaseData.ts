import { PurchaseOrder, SampleRecord } from '../types';

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
  role?: 'caigou' | 'caiwu' | null;
}

export type DashboardViewSettings = {
  timelineCols: 1 | 2 | 3 | 4;
  visibleFields: Record<string, boolean>;
  drawerCols: 1 | 2;
  drawerFields: Record<string, boolean>;
  ganttFields: Record<string, boolean>;
  moduleOrder: string[];
  moduleWidths: Record<string, number>;
  analysisConfigs?: Record<string, unknown>;
  customAnalysisModules?: unknown[];
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

export type BuyerSystemAccessMode = 'full' | 'ledgerUploadOnly' | 'none';

export interface BuyerSystemAccess {
  mode: BuyerSystemAccessMode;
  label: string;
}

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
  orders?: PurchaseOrder[];
  createdAt?: string; // ISO 8601, 给 MongoDB TTL 索引使用
  orderCount?: number;
  chunkCount?: number;
  /** 摘要模式 (listDocuments 带 sizeFields: ['orders']) 下返回，orders 不传，仅用于列表展示 */
  ordersCount?: number;
}

export interface LedgerBackupChunk {
  id: string;
  backupId: string;
  chunkIndex: number;
  orders: PurchaseOrder[];
  createdAt?: string;
}

export type CollectionName =
  | 'inventory_stock'
  | 'sample_records'
  | 'order_sticky_notes'
  | 'ledger_backups'
  | 'ledger_backup_chunks'
  | 'buyer_system_view_settings'
  | 'noteboard_items'
  | 'starred_po_ids'
  | 'supplier_profiles'
  | 'supplier_quotations'
  | 'supplier_quotation_items'
  | 'supplier_quote_parse_jobs'
  | 'supplier_product_groups'
  | 'supplier_quote_audit_logs';

const MAX_SYNC_DOCUMENT_BYTES = 900000;
const LEDGER_BACKUP_CHUNK_MAX_BYTES = 500000;

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

function getOptionalEnvValue(key: keyof ViteCloudbaseEnv): string | undefined {
  const value = viteCloudbaseEnv[key]?.trim();
  return value || undefined;
}

export function isCloudbaseConfigured(): boolean {
  // 登录与业务数据现已迁出 CloudBase，直接返回 true 保持上层 UI 的"已就绪"判断兼容。
  return true;
}

export function normalizeCloudbaseDocumentId(id: string): string {
  const normalized = id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return normalized || 'document';
}

const AUTH_STORAGE_KEY = 'buyer_system_auth_user';

function readStoredAuthUser(): CloudbaseAuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudbaseAuthUser | null;
    if (!parsed || typeof parsed.uid !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredAuthUser(user: CloudbaseAuthUser): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch {}
}

function clearStoredAuthUser(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {}
}

export function normalizeCloudbaseUsername(username: string): string {
  return username.trim();
}

export function getBuyerSystemAccess(user: CloudbaseAuthUser | null): BuyerSystemAccess {
  const username = user?.username?.trim().toLowerCase() ?? '';
  if (username === 'caigou') {
    return { mode: 'full', label: '采购' };
  }
  if (username === 'caiwu') {
    return { mode: 'ledgerUploadOnly', label: '财务' };
  }
  return { mode: 'none', label: '未授权' };
}

export function validateCloudbaseLoginInput(username: string, password: string): string | null {
  if (!normalizeCloudbaseUsername(username)) return '请输入用户名。';
  if (!password) return '请输入密码。';
  return null;
}

export async function getCurrentCloudbaseUser(): Promise<CloudbaseAuthUser | null> {
  return readStoredAuthUser();
}

export async function signInToCloudbase(username: string, password: string): Promise<CloudbaseAuthUser> {
  const validationError = validateCloudbaseLoginInput(username, password);
  if (validationError) throw new Error(validationError);

  let response: Response;
  try {
    response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: normalizeCloudbaseUsername(username), password }),
    });
  } catch {
    throw new Error('无法连接登录服务，请检查网络。');
  }

  const payload = await response.json().catch(() => null) as
    | { success?: boolean; message?: string; code?: string; data?: { uid: string; username: string; role?: 'caigou' | 'caiwu' | null } }
    | null;

  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.message ?? '登录失败，请稍后重试。');
  }

  const user: CloudbaseAuthUser = {
    uid: payload.data.uid,
    username: payload.data.username,
    email: null,
    role: payload.data.role ?? null,
  };

  writeStoredAuthUser(user);
  return user;
}

export async function signOutFromCloudbase(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  } catch {}
  clearStoredAuthUser();
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
  const text = await response.text();
  let payload: { success?: boolean; data?: T; message?: string; code?: string } | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as { success?: boolean; data?: T; message?: string; code?: string };
    } catch {
      payload = null;
    }
  }
  if (!response.ok || payload.success === false) {
    const fallback = response.status === 413
      ? '请求内容过大，请使用分片备份或减少单次上传数据量。'
      : text || response.statusText || 'MongoDB API request failed';
    throw new Error(`${path}: ${payload?.message ?? payload?.code ?? fallback}`);
  }
  return payload?.data as T;
}

function getDataApiPath(collectionName: CollectionName, documentId?: string): string {
  const basePath = `/api/data/${encodeURIComponent(collectionName)}`;
  return documentId ? `${basePath}/${encodeURIComponent(normalizeCloudbaseDocumentId(documentId))}` : basePath;
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
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
  console.error('Data API Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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

export interface ListDocumentsOptions {
  /** 仅返回这些字段（projection） */
  fields?: string[];
  /** 把数组字段在服务端转成 `${field}Count`，并去掉原数组——避免传输巨大 orders 数组 */
  sizeFields?: string[];
}

export async function listDocuments<T>(collectionName: CollectionName, options?: ListDocumentsOptions): Promise<T[]> {
  const url = new URL(getDataApiPath(collectionName), typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  if (options?.fields?.length) {
    url.searchParams.set('fields', options.fields.join(','));
  }
  if (options?.sizeFields?.length) {
    url.searchParams.set('sizeFields', options.sizeFields.join(','));
  }
  const path = url.pathname + (url.search ? url.search : '');
  const response = await fetch(path, { cache: 'no-store' });
  return readJsonResponse<T[]>(response, collectionName);
}

export async function getDocument<T>(collectionName: CollectionName, documentId: string): Promise<T | null> {
  const path = getDataApiPath(collectionName, documentId);
  const response = await fetch(path, { cache: 'no-store' });
  return readJsonResponse<T | null>(response, path);
}

async function listDocumentIds(collectionName: CollectionName): Promise<string[]> {
  const path = `${getDataApiPath(collectionName)}?includeIds=true`;
  const response = await fetch(path, { cache: 'no-store' });
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
  if (isBrowserOffline()) {
    return null;
  }
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
  if (isBrowserOffline()) {
    return;
  }
  const existing = await loadBuyerSystemViewSettings(user);
  const nextRecord: BuyerSystemViewSettingsRecord = {
    ...existing,
    ...createBuyerSystemViewSettingsRecord(user, scope, settings),
    dashboard: scope === 'dashboard' ? settings as Partial<DashboardViewSettings> : existing?.dashboard,
    ledger: scope === 'ledger' ? settings as Partial<LedgerViewSettings> : existing?.ledger,
  };

  await setDocument('buyer_system_view_settings', nextRecord.id, nextRecord);
}

export async function loadStarredPOs(user: CloudbaseAuthUser): Promise<string[]> {
  if (isBrowserOffline()) return [];
  const doc = await getDocument<{ id: string; starredIds: string[] }>(
    'starred_po_ids',
    user.uid,
  );
  return doc?.starredIds ?? [];
}

export async function saveStarredPOs(user: CloudbaseAuthUser, ids: string[]): Promise<void> {
  if (isBrowserOffline()) return;
  await setDocument('starred_po_ids', user.uid, {
    id: user.uid,
    starredIds: ids,
  });
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
  const { backup, chunks } = createLedgerBackupDocuments(orders);
  await runInChunks(chunks, chunk => setDocument('ledger_backup_chunks', chunk.id, chunk), 6);
  await setDocument('ledger_backups', backup.id, backup);
  return backup;
}

export function createLedgerBackupDocuments(
  orders: PurchaseOrder[],
  now = new Date(),
  maxChunkBytes = LEDGER_BACKUP_CHUNK_MAX_BYTES,
): { backup: LedgerBackup; chunks: LedgerBackupChunk[] } {
  const rawTime = now.getTime();
  const id = `ledger_backup_${rawTime}`;
  const createdAt = now.toISOString();
  const preparedOrders = cleanUndefined(orders);
  const chunks: LedgerBackupChunk[] = [];
  let currentOrders: PurchaseOrder[] = [];

  const makeChunk = (chunkIndex: number, chunkOrders: PurchaseOrder[]): LedgerBackupChunk => ({
    id: `${id}_chunk_${String(chunkIndex).padStart(4, '0')}`,
    backupId: id,
    chunkIndex,
    orders: chunkOrders,
    createdAt,
  });

  for (const order of preparedOrders) {
    const candidate = [...currentOrders, order];
    const candidateChunk = makeChunk(chunks.length, candidate);
    const candidateSize = new Blob([JSON.stringify(candidateChunk)]).size;
    if (currentOrders.length > 0 && candidateSize > maxChunkBytes) {
      chunks.push(makeChunk(chunks.length, currentOrders));
      currentOrders = [order];
    } else {
      currentOrders = candidate;
    }
  }

  if (currentOrders.length > 0 || preparedOrders.length === 0) {
    chunks.push(makeChunk(chunks.length, currentOrders));
  }

  const backup: LedgerBackup = {
    id,
    name: `ledger_backup_${now.toISOString().split('T')[0]}_${now.toTimeString().split(' ')[0].replace(/:/g, '-')}`,
    timeCreated: now.toLocaleString('zh-CN', { hour12: false }),
    rawTime,
    size: new Blob([JSON.stringify(preparedOrders)]).size,
    orderCount: preparedOrders.length,
    chunkCount: chunks.length,
    createdAt,
  };

  return { backup, chunks };
}

export async function loadLedgerBackupOrders(backup: LedgerBackup): Promise<PurchaseOrder[] | null> {
  if (Array.isArray(backup.orders)) {
    return backup.orders;
  }

  const chunkCount = backup.chunkCount ?? 0;
  if (chunkCount <= 0) {
    return null;
  }

  const chunkPromises = Array.from({ length: chunkCount }, (_, index) => (
    getDocument<LedgerBackupChunk>('ledger_backup_chunks', `${backup.id}_chunk_${String(index).padStart(4, '0')}`)
  ));
  const results = await Promise.allSettled(chunkPromises);
  const chunks = results
    .filter((r): r is PromiseFulfilledResult<LedgerBackupChunk | null> => r.status === 'fulfilled')
    .map(r => r.value);

  const validChunks = chunks.filter(
    (chunk): chunk is LedgerBackupChunk => Boolean(chunk) && Array.isArray(chunk.orders),
  );

  if (validChunks.length === 0) {
    return null;
  }

  return validChunks
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .flatMap(chunk => chunk.orders);
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

export const cloudbaseCollections = {
  inventory: 'inventory_stock',
  samples: 'sample_records',
  notes: 'order_sticky_notes',
  ledgerBackups: 'ledger_backups',
  ledgerBackupChunks: 'ledger_backup_chunks',
  viewSettings: 'buyer_system_view_settings',
  supplierProfiles: 'supplier_profiles',
  supplierQuotations: 'supplier_quotations',
  supplierQuotationItems: 'supplier_quotation_items',
  supplierQuoteParseJobs: 'supplier_quote_parse_jobs',
  supplierProductGroups: 'supplier_product_groups',
  supplierQuoteAuditLogs: 'supplier_quote_audit_logs',
} as const satisfies Record<string, CollectionName>;
