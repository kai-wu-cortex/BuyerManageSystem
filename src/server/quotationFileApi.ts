import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { head } from '@vercel/blob';
import type { Response } from 'express';
import { requireBuyerSession } from './sessionAuth.ts';

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = new Set(['xlsx', 'xls', 'pdf', 'png', 'jpg', 'jpeg', 'webp']);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

type ApiRequest = {
  method?: string;
  body?: unknown;
  params?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
};
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader' | 'send'>;

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 100);
}

function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : '';
}

function generateBlobPath(originalName: string, uploaderUid: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const safeName = sanitizeFilename(originalName);
  return `supplier-quotes/${year}/${month}/${uploaderUid}-${uuid}-${safeName}`;
}

export async function handleQuotationUploadToken(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' });
  }

  let user;
  try {
    user = requireBuyerSession({ headers: req.headers }, process.env.SESSION_SECRET || 'test-secret');
  } catch {
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: '请先登录。' });
  }

  const body = req.body as { filename?: unknown; mimeType?: unknown; size?: unknown } | undefined;
  const filename = typeof body?.filename === 'string' ? body.filename : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
  const size = typeof body?.size === 'number' ? body.size : 0;

  if (!filename) {
    return res.status(400).json({ success: false, code: 'INVALID_INPUT', message: '缺少文件名。' });
  }

  const ext = getExtension(filename);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_EXTENSION',
      message: `不支持的文件格式: .${ext}。支持: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
    });
  }

  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_MIME_TYPE',
      message: `不支持的文件类型: ${mimeType}`,
    });
  }

  if (size > MAX_FILE_SIZE) {
    return res.status(400).json({
      success: false,
      code: 'FILE_TOO_LARGE',
      message: `文件大小超过限制: ${(size / 1024 / 1024).toFixed(1)}MB > 25MB`,
    });
  }

  const blobPath = generateBlobPath(filename, user.uid);
  const fileMetadata = {
    originalName: filename,
    mimeType: mimeType || 'application/octet-stream',
    sizeBytes: size,
    uploadedBy: user.uid,
    uploadedAt: new Date().toISOString(),
  };

  try {
    const result = await handleUpload({
      body: req.body as HandleUploadBody,
      request: new Request('https://placeholder', {
        method: req.method || 'POST',
        headers: req.headers as Record<string, string>,
      }),
      onBeforeGenerateToken: async (pathname, _clientPayload, _multipart) => {
        if (!pathname.startsWith('supplier-quotes/')) {
          throw new Error('INVALID_PATH: 文件路径必须以 supplier-quotes/ 开头');
        }
        return {
          allowedContentTypes: [...ALLOWED_MIME_TYPES],
          maximumSizeInBytes: MAX_FILE_SIZE,
          tokenPayload: JSON.stringify(fileMetadata),
        };
      },
      onUploadCompleted: async (uploadResult) => {
        console.log('Upload completed:', uploadResult);
      },
    });

    if (result.type !== 'blob.generate-client-token') {
      return res.status(200).json({ success: true, data: { status: 'completed' } });
    }

    return res.status(200).json({
      success: true,
      data: {
        clientToken: result.clientToken,
        blobPath,
        metadata: fileMetadata,
      },
    });
  } catch (error) {
    console.error('Upload token error:', error);
    return res.status(500).json({
      success: false,
      code: 'UPLOAD_TOKEN_ERROR',
      message: error instanceof Error ? error.message : '生成上传令牌失败',
    });
  }
}

export async function handleQuotationFileDownload(
  req: ApiRequest,
  res: ApiResponse,
  blobPath: string,
): Promise<unknown> {
  let user;
  try {
    user = requireBuyerSession({ headers: req.headers }, process.env.SESSION_SECRET || 'test-secret');
  } catch {
    return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: '请先登录。' });
  }

  if (!blobPath) {
    return res.status(400).json({ success: false, code: 'INVALID_PATH', message: '缺少文件路径。' });
  }

  // Sanitize path to prevent traversal
  const normalizedPath = blobPath.replace(/\.\./g, '').replace(/^\/+/, '');
  if (!normalizedPath.startsWith('supplier-quotes/')) {
    return res.status(400).json({ success: false, code: 'INVALID_PATH', message: '无效的文件路径。' });
  }

  try {
    const headResult = await head(normalizedPath);
    const url = headResult.url;

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(404).json({ success: false, code: 'FILE_NOT_FOUND', message: '文件不存在或已过期。' });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const body = await response.arrayBuffer();
    return res.status(200).send(Buffer.from(body));
  } catch (error) {
    console.error('File download error:', error);
    return res.status(500).json({
      success: false,
      code: 'DOWNLOAD_ERROR',
      message: error instanceof Error ? error.message : '文件下载失败',
    });
  }
}
