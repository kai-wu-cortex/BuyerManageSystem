import type { IncomingMessage } from 'node:http';
import type { Response } from 'express';
import { get } from '@vercel/blob';
import { GoogleGenAI, Type } from '@google/genai';
import { validateParsedQuotation } from '../quotation/quotationParser.ts';

type ApiRequest = IncomingMessage & {
  method?: string;
  body?: { pathname?: unknown; mimeType?: unknown; customPrompt?: unknown };
};
type ApiResponse = Pick<Response, 'status' | 'json' | 'setHeader'>;

function sendError(res: ApiResponse, status: number, code: string, message: string): unknown {
  return res.status(status).json({ success: false, code, message });
}

export function isRetryableQuotationParseStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

async function excelToTextForGemini(buffer: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      blankrows: false,
    });
    parts.push(`=== Sheet: ${sheetName} ===`);
    for (const row of rows) {
      parts.push(row.map(cell => String(cell ?? '')).join('\t'));
    }
  }
  return parts.join('\n');
}

export async function handleQuotationParseRequest(req: ApiRequest, res: ApiResponse): Promise<unknown> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is supported.');
  }
  const pathname = typeof req.body?.pathname === 'string' ? req.body.pathname : '';
  const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : '';
  const customPrompt = typeof req.body?.customPrompt === 'string' ? req.body.customPrompt.trim() : '';
  const isExcel = mimeType.includes('spreadsheet') || mimeType.includes('ms-excel');
  if (!pathname.startsWith('supplier-quotes/') || (!mimeType.startsWith('image/') && mimeType !== 'application/pdf' && !isExcel)) {
    return sendError(res, 400, 'INVALID_FILE', '仅支持已上传的 PDF、图片或 Excel 报价单。');
  }
  if (!process.env.GEMINI_API_KEY) {
    return sendError(res, 503, 'GEMINI_NOT_CONFIGURED', 'Gemini API Key 尚未配置。');
  }

  try {
    const blob = await get(pathname, { access: 'private', useCache: false });
    if (!blob || blob.statusCode !== 200) {
      return sendError(res, 404, 'FILE_NOT_FOUND', '报价原文件不存在。');
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let contents: { parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> };

    const baseInstruction = `你是一个专业的报价单解析引擎。请严格按照以下规则解析报价单：

## 解析规则

### 1. 表头信息提取
- 供应商名称、报价单号、报价日期、有效期、币种、汇率、税率、含税模式、付款方式、交期
- 如果某些字段未明确标注，留空即可，不要猜测

### 2. 产品行解析（核心规则）
- **产品名称与型号分离**：如果产品名称和型号写在同一单元格（如"XX产品-A001"），请拆分为：产品名称="XX产品"，产品编码="A001"
- **产品系列展开**：如果产品编号用范围表示（如"A-001~A-005"或"Model X-1 到 X-10"），请展开为每一项单独的行，每行赋予正确的价格。如果范围内价格不同，按实际价格填写；如果价格相同，每行都填相同价格
- **多规格/多厚度展开**：同一产品有不同规格（如厚度0.5mm/1.0mm/2.0mm），每个规格视为独立产品行，分别填写各自的规格和价格
- **矩阵式价格表**：如果表格是矩阵格式（行是产品，列是不同规格/数量的价格），请将每个价格单元格展开为独立的产品行，在sourceSpecification中注明对应的规格/数量条件
- **合并单元格处理**：如果一个产品名称跨越多行，下方的每行都是该产品的不同规格/变体，为每行创建独立的产品记录

### 3. 字段映射
- sourceProductCode: 产品编码/料号/编号/型号
- sourceProductName: 产品名称（不含型号部分）
- sourceSpecification: 规格/型号/厚度/尺寸等详细参数
- sourceUnit: 计量单位
- sourcePackageDescription: 包装说明/包装方式
- sourcePackageQuantity: 包装数量/每箱数量/装箱数
- sourceUnitPrice: 单价/含税单价
- minimumOrderQuantity: 最小起订量/MOQ
- lineLeadTimeDays: 交期/货期

### 4. 数据准确性
- 只提取文件中明确存在的信息，不要猜测
- 价格必须与对应产品行匹配，不要张冠李戴
- 如果一个产品有多个价格条件（如不同数量段），每个条件单独一行
- 数字字段（价格、数量、交期）只填数字，不填单位`;
const extraPrompt = customPrompt ? `\n\n用户额外要求：${customPrompt}` : '';

    if (isExcel) {
      const arrayBuffer = await new Response(blob.stream).arrayBuffer();
      const textData = await excelToTextForGemini(arrayBuffer);
      contents = {
        parts: [
          {
            text: `以下是Excel报价单的原始数据（Tab分隔，每行为一行，第一行通常是表头）：\n\n${textData}\n\n${baseInstruction}${extraPrompt}`,
          },
        ],
      };
    } else {
      const base64 = Buffer.from(await new Response(blob.stream).arrayBuffer()).toString('base64');
      contents = {
        parts: [
          {
            text: `${baseInstruction}${extraPrompt}`,
          },
          { inlineData: { mimeType, data: base64 } },
        ],
      };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents,
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
