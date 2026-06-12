import { createHmac, timingSafeEqual } from 'node:crypto';

export type SessionUser = {
  uid: string;
  username: string;
  role: 'caigou' | 'caiwu';
};

type SessionPayload = SessionUser & { exp: number };
type SessionRequest = { headers?: Record<string, string | string[] | undefined> };

export class SessionAuthError extends Error {
  readonly statusCode: 401 | 403;
  readonly code: 'AUTH_REQUIRED' | 'FORBIDDEN';

  constructor(
    message: string,
    statusCode: 401 | 403,
    code: 'AUTH_REQUIRED' | 'FORBIDDEN',
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createSessionToken(
  user: SessionUser,
  secret: string,
  now = new Date(),
  ttlSeconds = 8 * 60 * 60,
): string {
  if (!secret) throw new Error('SESSION_SECRET 未配置。');
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
  };
  const encodedPayload = encode(payload);
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now = new Date(),
): SessionUser | null {
  if (!token || !secret) return null;
  const [encodedPayload, receivedSignature, extra] = token.split('.');
  if (!encodedPayload || !receivedSignature || extra) return null;

  const expectedSignature = sign(encodedPayload, secret);
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(receivedSignature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    if (
      typeof payload.uid !== 'string'
      || typeof payload.username !== 'string'
      || (payload.role !== 'caigou' && payload.role !== 'caiwu')
      || typeof payload.exp !== 'number'
      || payload.exp <= Math.floor(now.getTime() / 1000)
    ) {
      return null;
    }
    return { uid: payload.uid, username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

function getCookieHeader(req: SessionRequest): string {
  const raw = req.headers?.cookie;
  return Array.isArray(raw) ? raw.join('; ') : raw ?? '';
}

export function readSessionFromRequest(
  req: SessionRequest,
  secret: string,
  now = new Date(),
): SessionUser | null {
  const cookie = getCookieHeader(req)
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith('buyer_session='));
  if (!cookie) return null;
  return verifySessionToken(decodeURIComponent(cookie.slice('buyer_session='.length)), secret, now);
}

export function requireSession(
  req: SessionRequest,
  secret: string,
  now = new Date(),
): SessionUser {
  const user = readSessionFromRequest(req, secret, now);
  if (!user) {
    throw new SessionAuthError('请先登录。', 401, 'AUTH_REQUIRED');
  }
  return user;
}

export function requireBuyerSession(
  req: SessionRequest,
  secret: string,
  now = new Date(),
): SessionUser {
  const user = requireSession(req, secret, now);
  if (user.role !== 'caigou') {
    throw new SessionAuthError('当前账号无权访问供应商报价单。', 403, 'FORBIDDEN');
  }
  return user;
}

export function createSessionCookie(token: string, secure = true): string {
  const parts = [
    `buyer_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=28800',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function createExpiredSessionCookie(secure = true): string {
  const parts = [
    'buyer_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
