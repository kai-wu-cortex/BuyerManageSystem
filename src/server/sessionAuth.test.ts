import assert from 'node:assert/strict';
import {
  createSessionCookie,
  createSessionToken,
  readSessionFromRequest,
  requireBuyerSession,
  verifySessionToken,
} from './sessionAuth';

const now = new Date('2026-06-12T00:00:00Z');
const token = createSessionToken(
  { uid: 'caigou', username: 'caigou', role: 'caigou' },
  'test-secret',
  now,
);

assert.deepEqual(
  verifySessionToken(token, 'test-secret', new Date('2026-06-12T01:00:00Z')),
  { uid: 'caigou', username: 'caigou', role: 'caigou' },
);
assert.equal(verifySessionToken(`${token}tampered`, 'test-secret', now), null);
assert.equal(verifySessionToken(token, 'wrong-secret', now), null);
assert.equal(verifySessionToken(token, 'test-secret', new Date('2026-06-12T09:00:00Z')), null);

const cookie = createSessionCookie(token, false);
assert.match(cookie, /^buyer_session=/);
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /SameSite=Lax/);

assert.deepEqual(
  readSessionFromRequest({ headers: { cookie: `theme=dark; buyer_session=${token}` } }, 'test-secret', now),
  { uid: 'caigou', username: 'caigou', role: 'caigou' },
);

assert.equal(
  requireBuyerSession({ headers: { cookie: `buyer_session=${token}` } }, 'test-secret', now).uid,
  'caigou',
);

const financeToken = createSessionToken(
  { uid: 'caiwu', username: 'caiwu', role: 'caiwu' },
  'test-secret',
  now,
);
assert.throws(
  () => requireBuyerSession({ headers: { cookie: `buyer_session=${financeToken}` } }, 'test-secret', now),
  /无权访问/,
);

console.log('session auth tests passed');
