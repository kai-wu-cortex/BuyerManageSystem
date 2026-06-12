import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

type UserRole = 'caigou' | 'caiwu';

interface SessionPayload {
  uid: string;
  username: string;
  role: UserRole;
  exp: number;
}

interface SessionUser {
  uid: string;
  username: string;
  role: UserRole;
}

const SESSION_COOKIE = 'buyer_session';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV !== 'test') {
    throw new Error('SESSION_SECRET environment variable is required');
  }
  return secret || 'test-secret';
}

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString();
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}

export function createSessionToken(
  user: SessionUser,
  secret: string,
  now?: Date,
): string {
  const payload: SessionPayload = {
    uid: user.uid,
    username: user.username,
    role: user.role,
    exp: (now ? now.getTime() : Date.now()) + SESSION_MAX_AGE_MS,
  };
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now?: Date,
): SessionUser | null {
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const encoded = token.slice(0, dotIndex);
  const receivedSig = token.slice(dotIndex + 1);

  const expectedSig = sign(encoded, secret);
  const sigBuf = Buffer.from(receivedSig, 'base64url');
  const expBuf = Buffer.from(expectedSig, 'base64url');

  if (!constantTimeEqual(sigBuf, expBuf)) return null;

  try {
    const payload: SessionPayload = JSON.parse(base64urlDecode(encoded));
    const currentTime = now ? now.getTime() : Date.now();
    if (payload.exp <= currentTime) return null;
    return { uid: payload.uid, username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [key, ...rest] = part.split('=');
    if (key) {
      result[key.trim()] = rest.join('=').trim();
    }
  }
  return result;
}

export function readSessionFromRequest(req: Pick<Request, 'headers'>, secret: string): SessionUser | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token, secret);
}

export function requireSession(req: Pick<Request, 'headers'>, secret: string): SessionUser {
  const user = readSessionFromRequest(req, secret);
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

export function requireBuyerSession(req: Pick<Request, 'headers'>, secret: string): SessionUser {
  const user = requireSession(req, secret);
  if (user.role !== 'caigou') throw new Error('FORBIDDEN');
  return user;
}

export function createSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_MS / 1000}`;
}

export function createExpiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function setSessionCookie(res: Pick<Response, 'setHeader'>, token: string): void {
  res.setHeader('Set-Cookie', createSessionCookie(token));
}

export function clearSessionCookie(res: Pick<Response, 'setHeader'>): void {
  res.setHeader('Set-Cookie', createExpiredSessionCookie());
}
