import assert from 'node:assert/strict';
import {
  cleanUndefined,
  createBuyerSystemViewSettingsRecord,
  filterExpiredBackups,
  formatLedgerBackupSize,
  getBuyerSystemAccess,
  getBuyerSystemViewSettingsDocumentId,
  getLatestLedgerBackup,
  isLedgerBackupNewerThanLoaded,
  normalizeCloudbaseDocumentId,
  normalizeCloudbaseUsername,
  sortBackupsNewestFirst,
  validateCloudbaseLoginInput,
} from './cloudbaseData';

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

assert.equal(normalizeCloudbaseDocumentId('CG/DD 2026-001'), 'CG_DD_2026-001');
assert.equal(normalizeCloudbaseDocumentId(''), 'document');

const backups = [
  { id: 'old', rawTime: 100, name: 'old', timeCreated: 'old', size: 1, orders: [] },
  { id: 'new', rawTime: 300, name: 'new', timeCreated: 'new', size: 1, orders: [] },
  { id: 'middle', rawTime: 200, name: 'middle', timeCreated: 'middle', size: 1, orders: [] },
];

assert.deepEqual(sortBackupsNewestFirst(backups).map(item => item.id), ['new', 'middle', 'old']);
assert.deepEqual(filterExpiredBackups(backups, 450, 250).expiredIds, ['old']);
assert.deepEqual(filterExpiredBackups(backups, 450, 250).activeBackups.map(item => item.id), ['new', 'middle']);
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

assert.deepEqual(getBuyerSystemAccess({ uid: '1', username: 'caigou', role: 'caigou' }), {
  mode: 'full',
  label: '采购',
});
assert.deepEqual(getBuyerSystemAccess({ uid: '2', username: 'caiwu', role: 'caiwu' }), {
  mode: 'ledgerUploadOnly',
  label: '财务',
});
assert.deepEqual(getBuyerSystemAccess({ uid: '3', username: 'ops', role: null }), {
  mode: 'none',
  label: '未授权',
});

const viewSettingsUser = { uid: 'user/采购 001', username: 'caigou', role: 'caigou' as const };
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