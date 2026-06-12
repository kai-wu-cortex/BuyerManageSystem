import type { IncomingMessage } from 'node:http';
import type { Response } from 'express';
import { get } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireBuyerSession, SessionAuthError } from './sessionAuth.ts';

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
];
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type ApiRequest = IncomingMessage & {
  method?: string;
  body?: HandleUploadBody;
  query?: Record<string, unknown>;
};
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader' | 'send'>;

function authorize(req: ApiRequest, res: ApiResponse): boolean {
  try {
    requireBuyerSession(req, process.env.SESSION_SECRET ?? '');
    return true;
  } catch (error) {
    const status = error instanceof SessionAuthError ? error.statusCode : 503;
    const code = error instanceof SessionAuthError ? error.code : 'SESSION_NOT_CONFIGURED';
    res.status(status).json({ success: false, code, message: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

export function isAllowedQuotationFile(pathname: string, contentType: string): boolean {
  return pathname.startsWith('supplier-quotes/') && ALLOWED_CONTENT_TYPES.includes(contentType);
}

export async function handleQuotationUploadRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' });
  }
  if (!authorize(req, res)) return undefined;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ success: false, code: 'BLOB_NOT_CONFIGURED', message: '私有文件存储尚未配置。' });
  }

  const result = await handleUpload({
    token: process.env.BLOB_READ_WRITE_TOKEN,
    request: req,
    body: req.body as HandleUploadBody,
    onBeforeGenerateToken: async (pathname) => {
      if (!pathname.startsWith('supplier-quotes/')) {
        throw new Error('非法报价文件路径。');
      }
      return {
        access: 'private',
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: MAX_FILE_BYTES,
        addRandomSuffix: true,
      };
    },
    onUploadCompleted: async () => undefined,
  });
  return res.status(200).json(result);
}

export async function handleQuotationFileRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Only GET is supported.' });
  }
  if (!authorize(req, res)) return undefined;
  const pathname = typeof req.query?.pathname === 'string' ? req.query.pathname : '';
  if (!pathname.startsWith('supplier-quotes/')) {
    return res.status(400).json({ success: false, code: 'INVALID_PATH', message: '文件路径无效。' });
  }
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) {
    return res.status(404).json({ success: false, code: 'FILE_NOT_FOUND', message: '报价原文件不存在。' });
  }
  const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
  res.setHeader('Content-Type', result.blob.contentType);
  res.setHeader('Content-Disposition', result.blob.contentDisposition || 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(bytes);
}
