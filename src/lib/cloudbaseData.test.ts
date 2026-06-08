import assert from 'node:assert/strict';
import {
  cleanUndefined,
  filterExpiredBackups,
  formatLedgerBackupSize,
  getBuyerSystemAccess,
  getLatestLedgerBackup,
  isLedgerBackupNewerThanLoaded,
  normalizeCloudbaseDocumentId,
  normalizeCloudbaseOtpTarget,
  normalizeCloudbaseUsername,
  sortBackupsNewestFirst,
  validateCloudbaseLoginInput,
  validateCloudbaseOtpCode,
  validateCloudbaseOtpTarget,
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

assert.equal(normalizeCloudbaseOtpTarget('phone', '138 0013 8000'), '+8613800138000');
assert.equal(normalizeCloudbaseOtpTarget('phone', '+1 415-555-0100'), '+14155550100');
assert.equal(normalizeCloudbaseOtpTarget('email', '  ops@example.com  '), 'ops@example.com');
assert.equal(validateCloudbaseOtpTarget('phone', ''), '请输入手机号。');
assert.equal(validateCloudbaseOtpTarget('phone', 'abc'), '请输入有效手机号，国内手机号可直接输入 11 位数字。');
assert.equal(validateCloudbaseOtpTarget('email', 'ops@example.com'), null);
assert.equal(validateCloudbaseOtpTarget('email', 'bad-mail'), '请输入有效邮箱地址。');
assert.equal(validateCloudbaseOtpCode('123456'), null);
assert.equal(validateCloudbaseOtpCode(''), '请输入验证码。');

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
