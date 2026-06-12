import type { Response } from 'express';
import { createExpiredSessionCookie } from './sessionAuth.ts';

type ApiRequest = { method?: string };
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader'>;

export async function handleLogoutRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' });
  }
  res.setHeader('Set-Cookie', createExpiredSessionCookie(process.env.NODE_ENV === 'production'));
  return res.status(200).json({ success: true });
}
