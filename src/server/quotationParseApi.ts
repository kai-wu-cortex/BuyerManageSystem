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

export const BASE_QUOTATION_PARSE_INSTRUCTION = `你是专业的报价单解析引擎。请按以下两步流程解析：

## 第一步：识别表头并映射到系统字段

扫描表格表头，识别每列含义，映射到系统字段：

| 系统字段 | 可能的表头名称 |
|---------|--------------|
| sourceProductCode | 编号、编码、料号、型号、产品代码、Item No、Part No、SKU |
| sourceProductName | 产品名称、品名、商品名、物料名称、Product Name、Description |
| sourceSpecification | 规格、参数、尺寸、厚度、粒径、直径、Spec、Size |
| sourceUnit | 单位、计量单位、Unit |
| sourcePackageDescription | 包装、包装方式、包装说明 |
| sourcePackageQuantity | 包装数量、装箱数、每箱数量、箱规、Pack Qty |
| sourceUnitPrice | 单价、价格、含税价、未税价、Price |
| minimumOrderQuantity | MOQ、最小起订量、起订量 |
| lineLeadTimeDays | 交期、货期、Lead Time |

无法映射的列直接忽略。

## 第二步：逐行读取产品数据

### 过滤无关信息
- 跳过公司介绍、地址、电话、传真、邮箱、网址等联系信息
- 跳过发货规则、付款条款、免责声明、备注说明等非产品数据
- 跳过空行、分隔行、合计行、小计行
- 只保留实际的产品数据行

### 产品名称与型号分离
- 同一单元格包含名称和型号（如"LED灯珠-5050-RED"），拆分为：
  - sourceProductName = 纯产品名称（"LED灯珠"）
  - sourceSpecification = 规格参数（"5050 RED"）
- 已有独立编码列和名称列时保持原样
- 产品名称末尾连续的英文与数字编号是产品关键 ID。例如“镭射银LB100”必须完整保留在 sourceProductName 中，不能删除、忽略或拆成规格；“镭射银系列LB100-LB101”也必须保留完整编号范围

### 多规格展开为独立行
- 同一产品的不同规格变体（不同厚度、粒径、尺寸、颜色等），每种变体单独一行
- 例：0.5mm/1.0mm/2.0mm三种厚度 → 3行，各自填对应规格和价格

### 矩阵表展开
- 行=产品，列=不同规格的价格 → 每个价格单元格展开为独立行

### 合并单元格处理
- 产品名称跨多行时，下方每行都是该产品的不同变体，每行独立记录

### 数据准确性
- 只提取明确存在的信息，不要猜测
- 价格必须与对应产品行匹配
- 数字字段只填纯数字（不含单位）`;

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
    const extraPrompt = customPrompt ? `\n\n用户额外要求：${customPrompt}` : '';
    const fullPrompt = BASE_QUOTATION_PARSE_INSTRUCTION + extraPrompt;
    let contents: { parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> };

    if (isExcel) {
      const arrayBuffer = await new Response(blob.stream).arrayBuffer();
      const textData = await excelToTextForGemini(arrayBuffer);
      contents = {
        parts: [
          {
            text: `以下是Excel报价单的原始数据（Tab分隔，每行为一行，第一行通常是表头）：\n\n${textData}\n\n${fullPrompt}`,
          },
        ],
      };
    } else {
      const base64 = Buffer.from(await new Response(blob.stream).arrayBuffer()).toString('base64');
      const isImage = mimeType.startsWith('image/');
      const imageInstruction = isImage ? `这是一张报价单的图片。请先用OCR识别图片中的所有文字内容，然后按以下步骤处理：

1. 识别图片中的表格结构（行列关系）
2. 识别每个单元格中的文字（包括中文、英文、数字、特殊符号）
3. 如果文字模糊或不清晰，根据上下文推断最可能的内容
4. 识别表头行，确定每列的含义
5. 逐行读取产品数据

` : '';
      contents = {
        parts: [
          { text: imageInstruction + fullPrompt },
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
