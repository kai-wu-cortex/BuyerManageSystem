import type { IncomingMessage } from 'node:http';
import type { Response } from 'express';
import { get } from '@vercel/blob';
import { GoogleGenAI, Type } from '@google/genai';
import { validateParsedQuotation } from '../quotation/quotationParser.ts';
import { requireBuyerSession, SessionAuthError } from './sessionAuth.ts';

type ApiRequest = IncomingMessage & {
  method?: string;
  body?: { pathname?: unknown; mimeType?: unknown };
};
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader'>;

function sendError(res: ApiResponse, status: number, code: string, message: string): unknown {
  return res.status(status).json({ success: false, code, message });
}

export function isRetryableQuotationParseStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

export async function handleQuotationParseRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.');
  }
  try {
    requireBuyerSession(req, process.env.SESSION_SECRET ?? '');
  } catch (error) {
    if (error instanceof SessionAuthError) {
      return sendError(res, error.statusCode, error.code, error.message);
    }
    return sendError(res, 503, 'SESSION_NOT_CONFIGURED', '服务端会话尚未配置。');
  }

  const pathname = typeof req.body?.pathname === 'string' ? req.body.pathname : '';
  const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : '';
  if (!pathname.startsWith('supplier-quotes/') || (!mimeType.startsWith('image/') && mimeType !== 'application/pdf')) {
    return sendError(res, 400, 'INVALID_FILE', '仅支持已上传的 PDF 或图片报价单。');
  }
  if (!process.env.GEMINI_API_KEY) {
    return sendError(res, 503, 'GEMINI_NOT_CONFIGURED', 'Gemini API Key 尚未配置。');
  }

  try {
    const blob = await get(pathname, { access: 'private', useCache: false });
    if (!blob || blob.statusCode !== 200) {
      return sendError(res, 404, 'FILE_NOT_FOUND', '报价原文件不存在。');
    }
    const base64 = Buffer.from(await new Response(blob.stream).arrayBuffer()).toString('base64');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: {
        parts: [
          {
            text: `解析这份供应商报价单。只能提取文件中明确存在的信息，不要猜测价格、币种、税率、单位或包装数量。
返回供应商、报价日期、有效期、币种、固定汇率、含税模式、付款方式、交期和全部产品行。`,
          },
          { inlineData: { mimeType, data: base64 } },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            supplierName: { type: Type.STRING },
            quotationNumber: { type: Type.STRING },
            quotationDate: { type: Type.STRING },
            validUntil: { type: Type.STRING },
            currency: { type: Type.STRING },
            exchangeRateToCny: { type: Type.NUMBER },
            taxRate: { type: Type.NUMBER },
            priceTaxMode: { type: Type.STRING, enum: ['tax_included', 'tax_excluded'] },
            paymentTerms: { type: Type.STRING },
            leadTimeDays: { type: Type.NUMBER, nullable: true },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sourceProductCode: { type: Type.STRING },
                  sourceProductName: { type: Type.STRING },
                  sourceSpecification: { type: Type.STRING },
                  sourceUnit: { type: Type.STRING },
                  sourcePackageDescription: { type: Type.STRING },
                  sourcePackageQuantity: { type: Type.NUMBER, nullable: true },
                  sourceUnitPrice: { type: Type.NUMBER, nullable: true },
                  minimumOrderQuantity: { type: Type.NUMBER, nullable: true },
                  lineLeadTimeDays: { type: Type.NUMBER, nullable: true },
                },
                required: [
                  'sourceProductCode',
                  'sourceProductName',
                  'sourceSpecification',
                  'sourceUnit',
                  'sourcePackageDescription',
                  'sourcePackageQuantity',
                  'sourceUnitPrice',
                  'minimumOrderQuantity',
                  'lineLeadTimeDays',
                ],
              },
            },
          },
          required: [
            'supplierName',
            'quotationNumber',
            'quotationDate',
            'validUntil',
            'currency',
            'exchangeRateToCny',
            'taxRate',
            'priceTaxMode',
            'paymentTerms',
            'leadTimeDays',
            'items',
          ],
        },
      },
    });
    if (!response.text) throw new Error('Gemini 未返回解析结果。');
    const validation = validateParsedQuotation(JSON.parse(response.text));
    return res.status(200).json({ success: true, data: validation });
  } catch (error) {
    return sendError(res, 502, 'PARSE_FAILED', error instanceof Error ? error.message : String(error));
  }
}
