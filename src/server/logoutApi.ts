import type { Response } from 'express';
import { clearSessionCookie } from './sessionAuth.ts';

type ApiRequest = { method?: string };
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader'>;

export async function handleLogoutRequest(_req: ApiRequest, res: ApiResponse): Promise<unknown> {
  clearSessionCookie(res);
  return res.status(200).json({ success: true, message: '已退出登录' });
}
