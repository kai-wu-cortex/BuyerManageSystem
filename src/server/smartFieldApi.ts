import type { IncomingMessage } from 'node:http';
import type { Response } from 'express';
import { get } from '@vercel/blob';
import { GoogleGenAI, Type } from '@google/genai';

type ApiRequest = IncomingMessage & {
  method?: string;
  body?: { pathname?: unknown; mimeType?: unknown; prompt?: unknown; itemCount?: unknown };
};
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader'>;

function sendError(res: ApiResponse, status: number, code: string, message: string): unknown {
  return res.status(status).json({ success: false, code, message });
}

async function excelToTextForGemini(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1, raw: false, blankrows: false,
    });
    parts.push(`=== Sheet: ${sheetName} ===`);
    for (const row of rows) {
      parts.push(row.map(cell => String(cell ?? '')).join('\t'));
    }
  }
  return parts.join('\n');
}

export async function handleSmartFieldExtractRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.');
  }

  const pathname = typeof req.body?.pathname === 'string' ? req.body.pathname : '';
  const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : '';
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const itemCount = typeof req.body?.itemCount === 'number' ? req.body.itemCount : 0;

  if (!pathname.startsWith('supplier-quotes/')) {
    return sendError(res, 400, 'INVALID_FILE', '无效的文件路径。');
  }
  if (!prompt) {
    return sendError(res, 400, 'INVALID_PROMPT', '请输入提取提示词。');
  }
  if (!process.env.GEMINI_API_KEY) {
    return sendError(res, 503, 'GEMINI_NOT_CONFIGURED', 'Gemini API Key 尚未配置。');
  }

  try {
    const blob = await get(pathname, { access: 'private', useCache: false });
    if (!blob || blob.statusCode !== 200) {
      return sendError(res, 404, 'FILE_NOT_FOUND', '报价原文件不存在。');
    }

    const isExcel = mimeType.includes('spreadsheet') || mimeType.includes('ms-excel');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const instruction = `你是一个数据提取引擎。根据用户提供的提示词，从报价单中提取每个产品的对应数据。

规则：
- 返回一个JSON数组，长度必须等于产品数量（${itemCount}个）
- 每个元素是一个字符串，代表该产品对应的提取结果
- 如果某个产品无法提取到对应数据，返回空字符串""
- 不要猜测，只提取文件中明确存在的信息

用户提示词：${prompt}`;

    let contents: { parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> };

    if (isExcel) {
      const arrayBuffer = await new Response(blob.stream).arrayBuffer();
      const textData = await excelToTextForGemini(arrayBuffer);
      contents = { parts: [{ text: `以下是Excel报价单内容：\n\n${textData}\n\n${instruction}` }] };
    } else {
      const base64 = Buffer.from(await new Response(blob.stream).arrayBuffer()).toString('base64');
      contents = { parts: [{ text: instruction }, { inlineData: { mimeType, data: base64 } }] };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            values: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['values'],
        },
      },
    });

    if (!response.text) throw new Error('Gemini 未返回结果。');
    const result = JSON.parse(response.text) as { values: string[] };
    const values = (result.values || []).slice(0, itemCount);
    while (values.length < itemCount) values.push('');

    return res.status(200).json({ success: true, data: { values } });
  } catch (error) {
    return sendError(res, 502, 'EXTRACT_FAILED', error instanceof Error ? error.message : String(error));
  }
}
