import assert from 'node:assert/strict';
import {
  cleanUndefined,
  createBuyerSystemViewSettingsRecord,
  createLedgerBackupDocuments,
  formatLedgerBackupSize,
  getBuyerSystemAccess,
  getBuyerSystemViewSettingsDocumentId,
  getLatestLedgerBackup,
  isLedgerBackupNewerThanLoaded,
  normalizeCloudbaseDocumentId,
  normalizeCloudbaseUsername,
  setDocument,
  sortBackupsNewestFirst,
  validateCloudbaseLoginInput,
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
assert.equal(formatLedgerBackupSize(2048), '2.0 KB');
assert.equal(formatLedgerBackupSize(0), '未知');

assert.equal(normalizeCloudbaseUsername('  buyer_admin  '), 'buyer_admin');
assert.equal(validateCloudbaseLoginInput('buyer_admin', 'secret123'), null);
assert.equal(validateCloudbaseLoginInput('   ', 'secret123'), '请输入用户名。');
assert.equal(validateCloudbaseLoginInput('buyer_admin', ''), '请输入密码。');

assert.deepEqual(getBuyerSystemAccess({ uid: '1', username: 'caigou', email: null }), {
  mode: 'full',
  label: '采购',
});
assert.deepEqual(getBuyerSystemAccess({ uid: '2', username: 'caiwu', email: null }), {
  mode: 'ledgerUploadOnly',
  label: '财务',
});
assert.deepEqual(getBuyerSystemAccess({ uid: '3', username: null, email: 'ops@example.com' }), {
  mode: 'none',
  label: '未授权',
});

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

const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response('Request Entity Too Large', { status: 413, statusText: 'Content Too Large' })) as typeof fetch;
await assert.rejects(
  () => setDocument('ledger_backups', 'too-large', { id: 'too-large' }),
  /请求内容过大/,
);
globalThis.fetch = originalFetch;

console.log('cloudbaseData tests passed ✅');
