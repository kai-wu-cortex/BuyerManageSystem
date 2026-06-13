import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  createSessionToken,
  verifySessionToken,
  readSessionFromRequest,
  requireBuyerSession,
  createSessionCookie,
  createExpiredSessionCookie,
} from './sessionAuth';

const SECRET = 'test-secret';
const FIXED_TIME = new Date('2026-06-12T00:00:00Z');

function makeUser() {
  return { uid: 'caigou', username: 'caigou', role: 'caigou' as const };
}

describe('createSessionToken / verifySessionToken', () => {
  it('creates and verifies a valid token', () => {
    const token = createSessionToken(makeUser(), SECRET, FIXED_TIME);
    const verified = verifySessionToken(token, SECRET, new Date('2026-06-12T01:00:00Z'));
    assert.deepEqual(verified, makeUser());
  });

  it('rejects tampered token', () => {
    const token = createSessionToken(makeUser(), SECRET, FIXED_TIME);
    assert.equal(verifySessionToken(`${token}tampered`, SECRET), null);
  });

  it('rejects wrong secret', () => {
    const token = createSessionToken(makeUser(), SECRET, FIXED_TIME);
    assert.equal(verifySessionToken(token, 'wrong-secret'), null);
  });

  it('rejects expired token', () => {
    const token = createSessionToken(makeUser(), SECRET, FIXED_TIME);
    const futureTime = new Date('2026-06-13T00:00:01Z'); // past 8-hour expiry
    assert.equal(verifySessionToken(token, SECRET, futureTime), null);
  });

  it('rejects malformed token (no dot)', () => {
    assert.equal(verifySessionToken('not-a-token', SECRET), null);
  });

  it('rejects empty payload', () => {
    assert.equal(verifySessionToken('.sig', SECRET), null);
  });
});

describe('readSessionFromRequest', () => {
  it('returns user from valid session cookie', () => {
    const token = createSessionToken(makeUser(), SECRET);
    const cookie = createSessionCookie(token);
    const sessionValue = cookie.split(';')[0]!.split('=').slice(1).join('=');
    const req = { headers: { cookie: `buyer_session=${sessionValue}` } };
    assert.deepEqual(readSessionFromRequest(req, SECRET), makeUser());
  });

  it('returns null when no cookie', () => {
    assert.equal(readSessionFromRequest({ headers: {} }, SECRET), null);
  });

  it('returns null for invalid token in cookie', () => {
    const req = { headers: { cookie: 'buyer_session=invalid' } };
    assert.equal(readSessionFromRequest(req, SECRET), null);
  });
});

describe('requireBuyerSession', () => {
  it('returns buyer user', () => {
    const token = createSessionToken(makeUser(), SECRET);
    const cookie = createSessionCookie(token);
    const sessionValue = cookie.split(';')[0]!.split('=').slice(1).join('=');
    const req = { headers: { cookie: `buyer_session=${sessionValue}` } };
    assert.deepEqual(requireBuyerSession(req, SECRET), makeUser());
  });

  it('throws UNAUTHORIZED for missing session', () => {
    assert.throws(
      () => requireBuyerSession({ headers: {} }, SECRET),
      /UNAUTHORIZED/,
    );
  });

  it('throws FORBIDDEN for finance role', () => {
    const financeUser = { uid: 'caiwu', username: 'caiwu', role: 'caiwu' as const };
    const token = createSessionToken(financeUser, SECRET);
    const cookie = createSessionCookie(token);
    const sessionValue = cookie.split(';')[0]!.split('=').slice(1).join('=');
    const req = { headers: { cookie: `buyer_session=${sessionValue}` } };
    assert.throws(
      () => requireBuyerSession(req, SECRET),
      /FORBIDDEN/,
    );
  });
});

describe('cookie helpers', () => {
  it('createSessionCookie includes HttpOnly and Secure', () => {
    const cookie = createSessionCookie('tok123');
    assert.ok(cookie.includes('HttpOnly'));
    assert.ok(cookie.includes('Secure'));
    assert.ok(cookie.includes('SameSite=Lax'));
    assert.ok(cookie.startsWith('buyer_session=tok123'));
  });

  it('createExpiredSessionCookie has Max-Age=0', () => {
    const cookie = createExpiredSessionCookie();
    assert.ok(cookie.includes('Max-Age=0'));
  });
});
