import type { Response } from 'express';
import { requireSession, SessionAuthError } from './sessionAuth.ts';

type ApiRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader'>;

export async function handleSessionRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Only GET is supported.' });
  }
  try {
    const user = requireSession(req, process.env.SESSION_SECRET ?? '');
    return res.status(200).json({
      success: true,
      data: { ...user, email: null },
    });
  } catch (error) {
    if (error instanceof SessionAuthError) {
      return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    }
    return res.status(503).json({ success: false, code: 'SESSION_NOT_CONFIGURED', message: '服务端会话尚未配置。' });
  }
}
