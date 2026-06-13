import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { getMongoCollection } from '../lib/mongodb.ts';
import { createSessionToken, createSessionCookie } from './sessionAuth.ts';

type ApiRequest = { method?: string; body?: unknown };
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader'>;

interface SystemUserDoc {
  _id: string;
  username: string;
  role: 'caigou' | 'caiwu';
  salt: string;
  passwordHash: string;
}

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password).digest('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function handleLoginRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' });
  }

  const body = req.body as { username?: unknown; password?: unknown } | undefined;
  const rawUsername = typeof body?.username === 'string' ? body.username : '';
  const rawPassword = typeof body?.password === 'string' ? body.password : '';

  const username = rawUsername.trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ success: false, code: 'INVALID_INPUT', message: '请输入用户名。' });
  }
  if (!rawPassword) {
    return res.status(400).json({ success: false, code: 'INVALID_INPUT', message: '请输入密码。' });
  }

  const collection = await getMongoCollection<SystemUserDoc>('system_users');
  const user = await collection.findOne({ _id: username });
  if (!user || !user.salt || !user.passwordHash) {
    return res.status(401).json({ success: false, code: 'AUTH_FAILED', message: '用户名或密码错误。' });
  }

  const computedHash = hashPassword(rawPassword, user.salt);
  if (!constantTimeEqual(computedHash, user.passwordHash)) {
    return res.status(401).json({ success: false, code: 'AUTH_FAILED', message: '用户名或密码错误。' });
  }

  const secret = process.env.SESSION_SECRET || 'test-secret';
  const token = createSessionToken(
    { uid: user._id, username: user.username, role: user.role },
    secret,
  );

  res.setHeader('Set-Cookie', createSessionCookie(token));

  return res.status(200).json({
    success: true,
    data: {
      uid: user._id,
      username: user.username,
      role: user.role,
    },
  });
}
