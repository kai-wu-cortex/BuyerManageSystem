import assert from 'node:assert/strict';
import {
  cleanUndefined,
  createBuyerSystemViewSettingsRecord,
  createLedgerBackupDocuments,
  formatLedgerBackupSize,
  getBuyerSystemViewSettingsDocumentId,
  getLatestLedgerBackup,
  isLedgerBackupNewerThanLoaded,
  LedgerBackupIncompleteError,
  listDocuments,
  loadBuyerSystemViewSettings,
  loadLatestCompleteLedgerBackup,
  loadLedgerBackupOrders,
  normalizeCloudbaseDocumentId,
  setDocument,
  shouldLoadLedgerBackup,
  sortBackupsNewestFirst,
} from './cloudbaseData';
import type { PurchaseOrder } from '../types';

const cleaned = cleanUndefined({
  keep: 'value',
  drop: undefined,
  nested: {
    keep: 1,
    drop: undefined,
  },
  list: ['a', undefined, { keep: true, drop: undefined }],
});

assert.deepEqual(cleaned, {
  keep: 'value',
  nested: { keep: 1 },
  list: ['a', { keep: true }],
});

function makeOrder(id: string): PurchaseOrder {
  return {
    id,
    date: '2026-06-12',
    supplier: '供应商A',
    status: '已审核',
    executionStatus: '未执行',
    inboundStatus: '未入库',
    discountRate: 0,
    discountAmount: 0,
    transportMethod: '',
    settlementType: '',
    deliveryDate: '',
    remarks: '',
    items: [{
      code: `MAT-${id}`,
      name: '很长的物料名称'.repeat(8),
      spec: '',
      category: '',
      unit: '',
      orderedQty: 1,
      price: 2,
      taxAmount: 0,
      remark: '',
      receivedQty: 0,
    }],
  };
}

const { backup: chunkedBackup, chunks } = createLedgerBackupDocuments(
  [makeOrder('001'), makeOrder('002'), makeOrder('003')],
  new Date('2026-06-12T00:00:00.000Z'),
  520,
);
assert.equal(chunkedBackup.orders, undefined, 'new ledger backup metadata should not contain full orders');
assert.equal(chunkedBackup.chunkCount, chunks.length);
assert.equal(chunkedBackup.orderCount, 3);
assert.ok(chunks.length > 1, 'large ledger backup should be split into chunks');
assert.deepEqual(chunks.flatMap(chunk => chunk.orders).map(order => order.id), ['001', '002', '003']);
assert.ok(chunks.every(chunk => new Blob([JSON.stringify(chunk)]).size <= 900000), 'each chunk should stay below request size limit');

assert.equal(normalizeCloudbaseDocumentId('CG/DD 2026-001'), 'CG_DD_2026-001');
assert.equal(normalizeCloudbaseDocumentId(''), 'document');

const backups = [
  { id: 'old', rawTime: 100, name: 'old', timeCreated: 'old', size: 1, orders: [] },
  { id: 'new', rawTime: 300, name: 'new', timeCreated: 'new', size: 1, orders: [] },
  { id: 'middle', rawTime: 200, name: 'middle', timeCreated: 'middle', size: 1, orders: [] },
];

assert.deepEqual(sortBackupsNewestFirst(backups).map(item => item.id), ['new', 'middle', 'old']);
assert.equal(getLatestLedgerBackup(backups)?.id, 'new');
assert.equal(getLatestLedgerBackup([]), null);
assert.equal(isLedgerBackupNewerThanLoaded(getLatestLedgerBackup(backups), 299), true);
assert.equal(isLedgerBackupNewerThanLoaded(getLatestLedgerBackup(backups), 300), false);
assert.equal(
  shouldLoadLedgerBackup(
    { id: 'latest', rawTime: 300, name: 'latest', timeCreated: 'latest', size: 1, orderCount: 1485 },
    300,
    315,
  ),
  true,
  'a partial local ledger should reload even when the backup timestamp was already marked as loaded',
);
assert.equal(
  shouldLoadLedgerBackup(
    { id: 'latest', rawTime: 300, name: 'latest', timeCreated: 'latest', size: 1, orderCount: 1485 },
    300,
    1485,
  ),
  false,
);
assert.equal(formatLedgerBackupSize(2048), '2.0 KB');
assert.equal(formatLedgerBackupSize(0), '未知');

const viewSettingsUser = { uid: 'user/采购 001', username: 'caigou', email: null };
assert.equal(getBuyerSystemViewSettingsDocumentId(viewSettingsUser), 'buyer_system_view_settings_user____001');
assert.deepEqual(
  createBuyerSystemViewSettingsRecord(
    viewSettingsUser,
    'dashboard',
    { timelineCols: 3, visibleFields: { supplier: true } },
    '2026-06-08T10:00:00.000Z',
  ),
  {
    id: 'buyer_system_view_settings_user____001',
    uid: 'user/采购 001',
    username: 'caigou',
    dashboard: { timelineCols: 3, visibleFields: { supplier: true } },
    updatedAt: '2026-06-08T10:00:00.000Z',
  },
);

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { onLine: false },
});
const fetchBeforeOfflineViewSettings = globalThis.fetch;
globalThis.fetch = (async () => {
  throw new Error('fetch should not be called while offline');
}) as typeof fetch;
assert.equal(await loadBuyerSystemViewSettings(viewSettingsUser), null);
globalThis.fetch = fetchBeforeOfflineViewSettings;
if (originalNavigator) {
  Object.defineProperty(globalThis, 'navigator', originalNavigator);
} else {
  delete (globalThis as typeof globalThis & { navigator?: Navigator }).navigator;
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response('Request Entity Too Large', { status: 413, statusText: 'Content Too Large' })) as typeof fetch;
await assert.rejects(
  () => setDocument('ledger_backups', 'too-large', { id: 'too-large' }),
  /请求内容过大/,
);
globalThis.fetch = originalFetch;

const paginationFetch = globalThis.fetch;
const requestedOffsets: string[] = [];
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(String(input), 'http://localhost');
  requestedOffsets.push(url.searchParams.get('offset') ?? '');
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const data = offset === 0
    ? Array.from({ length: 1000 }, (_, index) => ({ id: `item-${index}` }))
    : [{ id: 'item-1000' }];
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;
const paginatedDocuments = await listDocuments<{ id: string }>('supplier_quotation_items');
assert.equal(paginatedDocuments.length, 1001, 'listDocuments should load every page instead of truncating at 1000 records');
assert.deepEqual(requestedOffsets, ['0', '1000']);
globalThis.fetch = paginationFetch;

const incompleteChunkFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url.endsWith('/ledger_backup_chunks/backup-1_chunk_0000')) {
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: 'backup-1_chunk_0000',
        backupId: 'backup-1',
        chunkIndex: 0,
        orders: [makeOrder('001')],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ success: false, message: 'temporary failure' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;
await assert.rejects(
  () => loadLedgerBackupOrders({
    id: 'backup-1',
    name: 'backup-1',
    timeCreated: '2026-06-13',
    rawTime: 1,
    size: 1,
    orderCount: 2,
    chunkCount: 2,
  }),
  (err: unknown) => err instanceof LedgerBackupIncompleteError && err.backupId === 'backup-1' && err.missingChunks === 1,
  'partial backup chunks must never be treated as a complete ledger',
);
globalThis.fetch = incompleteChunkFetch;

// === loadLatestCompleteLedgerBackup: 自动跳过损坏备份 ===

const fallbackFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input);
  // newest backup (backup-broken) 缺一个 chunk → 不完整
  if (url.endsWith('/ledger_backup_chunks/backup-broken_chunk_0000')) {
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: 'backup-broken_chunk_0000', backupId: 'backup-broken',
        chunkIndex: 0, orders: [makeOrder('001')],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.endsWith('/ledger_backup_chunks/backup-broken_chunk_0001')) {
    return new Response(JSON.stringify({ success: false, message: 'gone' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  // older backup (backup-good) 完整两个 chunks
  if (url.endsWith('/ledger_backup_chunks/backup-good_chunk_0000')) {
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: 'backup-good_chunk_0000', backupId: 'backup-good',
        chunkIndex: 0, orders: [makeOrder('A1')],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.endsWith('/ledger_backup_chunks/backup-good_chunk_0001')) {
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: 'backup-good_chunk_0001', backupId: 'backup-good',
        chunkIndex: 1, orders: [makeOrder('A2')],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('not found', { status: 404 });
}) as typeof fetch;

const fallbackResult = await loadLatestCompleteLedgerBackup([
  { id: 'backup-broken', name: 'broken', timeCreated: '2026-06-15', rawTime: 1500, size: 1, orderCount: 2, chunkCount: 2 },
  { id: 'backup-good', name: 'good', timeCreated: '2026-06-14', rawTime: 1400, size: 1, orderCount: 2, chunkCount: 2 },
]);
assert.ok(fallbackResult, '应该能回退到完整备份');
assert.equal(fallbackResult!.backup.id, 'backup-good', '损坏的 newest 被跳过，回退到旧的 good');
assert.equal(fallbackResult!.orders.length, 2);
assert.equal(fallbackResult!.skipped.length, 1);
assert.equal(fallbackResult!.skipped[0].id, 'backup-broken');
globalThis.fetch = fallbackFetch;

// 全部损坏时返回 null
const allBrokenFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, message: 'gone' }),
  { status: 503, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
const allBroken = await loadLatestCompleteLedgerBackup([
  { id: 'b1', name: 'b1', timeCreated: 't1', rawTime: 100, size: 1, orderCount: 1, chunkCount: 1 },
]);
assert.equal(allBroken, null, '所有备份都损坏时返回 null');
globalThis.fetch = allBrokenFetch;

// 空备份列表 → null
const emptyResult = await loadLatestCompleteLedgerBackup([]);
assert.equal(emptyResult, null);

console.log('cloudbaseData tests passed ✅');
