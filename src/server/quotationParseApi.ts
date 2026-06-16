import type { IncomingMessage } from 'node:http';
import type { Response } from 'express';
import { get } from '@vercel/blob';
import { GoogleGenAI, Type } from '@google/genai';
import { validateParsedQuotation } from '../quotation/quotationParser.ts';
import type { ParsedQuotation, ParsedQuotationItem } from '../quotation/quotationParser.ts';

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

/**
 * 大文件分批阈值：超过这一行数的 Excel 报价单会被拆批解析。
 * 经验值：6000+ 行的纯产品列表，单次 Gemini 输出 JSON 容易超 65K token 上限被截断。
 * 800 行/批在 gemini-3.5-flash 下输出体积稳定可控（≈12K token）。
 */
const EXCEL_BATCH_THRESHOLD = 800;
const EXCEL_BATCH_SIZE = 800;
const MAX_OUTPUT_TOKENS = 65536;

interface ExcelTextDump {
  fullText: string;
  totalRows: number;
  headerLines: string[]; // 表头与表头之前的元数据行（每个 sheet 各 ~10 行），分批时复用
  bodyLinesPerSheet: Array<{ sheetName: string; headerRows: string[]; bodyRows: string[] }>;
}

export interface ExcelBatchPlan {
  sheetName: string;
  headerRows: string[];
  bodyRows: string[];
  rangeStart: number;
  rangeEnd: number;
}

/** 把多 sheet 的 (header, body) 切成固定大小的批次，按 sheet 顺序展开。 */
export function planExcelBatches(
  sheets: Array<{ sheetName: string; headerRows: string[]; bodyRows: string[] }>,
  batchSize: number = EXCEL_BATCH_SIZE,
): ExcelBatchPlan[] {
  const batches: ExcelBatchPlan[] = [];
  for (const sheet of sheets) {
    if (sheet.bodyRows.length === 0) continue;
    for (let offset = 0; offset < sheet.bodyRows.length; offset += batchSize) {
      const slice = sheet.bodyRows.slice(offset, offset + batchSize);
      batches.push({
        sheetName: sheet.sheetName,
        headerRows: sheet.headerRows,
        bodyRows: slice,
        rangeStart: offset + 1,
        rangeEnd: offset + slice.length,
      });
    }
  }
  return batches;
}

export function shouldUseExcelBatching(totalRows: number, threshold: number = EXCEL_BATCH_THRESHOLD): boolean {
  return totalRows > threshold;
}

/** 把 Excel 拆为 (元数据 + 表头) 与 (数据行)，方便后续按行分批。 */
async function dumpExcelForGemini(buffer: ArrayBuffer): Promise<ExcelTextDump> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const fullParts: string[] = [];
  const bodyLinesPerSheet: ExcelTextDump['bodyLinesPerSheet'] = [];
  const headerLines: string[] = [];
  let totalRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      blankrows: false,
    });
    const lines = rows.map(row => row.map(cell => String(cell ?? '')).join('\t'));

    // 简单启发式：寻找含产品/编码/单价等关键字的表头行作为切分点
    const headerKeywords = /产品|编码|名称|规格|单价|价格|数量|item|product|price/i;
    let headerIndex = lines.findIndex(line => headerKeywords.test(line));
    if (headerIndex < 0) headerIndex = 0;
    const headerRows = lines.slice(0, headerIndex + 1); // 含表头本身
    const bodyRows = lines.slice(headerIndex + 1);

    fullParts.push(`=== Sheet: ${sheetName} ===`, ...lines);
    bodyLinesPerSheet.push({ sheetName, headerRows, bodyRows });
    headerLines.push(`=== Sheet: ${sheetName} ===`, ...headerRows);
    totalRows += bodyRows.length;
  }

  return {
    fullText: fullParts.join('\n'),
    totalRows,
    headerLines,
    bodyLinesPerSheet,
  };
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

### ⚠️ 产品名 / 型号 / 规格 字段的"无损保留"铁律（最高优先级）
这三个字段（sourceProductCode / sourceProductName / sourceSpecification）必须确保**原文不丢字、不改写、不翻译、不缩写、不补全**。请务必：
1. **逐字保留**：原始文本里的每一个汉字、英文字母、数字、符号都必须出现在 code/name/spec 三个字段之一中
2. **不要"美化"**：不要把"LB-100"改写成"LB100"或"LB 100"；不要把"Φ50×100mm"改写成"50x100"；不要把"红色RED"改写成"红色"或"RED"
3. **不要翻译**：中文/英文混排的内容保持原文（"镭射银LB100" 不能变成 "Laser Silver LB100" 或 "镭射银"）
4. **不要省略后缀编号**：产品名末尾的英文+数字编号是关键 ID，必须完整保留在 sourceProductName 里。例如：
   - "镭射银LB100" → name="镭射银LB100"，spec=""，✅
   - "镭射银LB100" → name="镭射银",  spec="LB100"，❌（LB100 不是规格，是 ID）
   - "镭射银系列LB100-LB101" → name 必须完整含 "LB100-LB101"
5. **🚨 纯数字也是产品 ID（高频踩坑！）**：
   产品名/型号/规格列里如果**只有数字**（如"8516"、"3025"、"AB1003"），这数字本身就是产品 ID，必须**原样作为字符串填入 sourceProductName 或 sourceProductCode**。
   - 型号列="8516" → sourceProductCode="8516"（或 sourceProductName="8516"），**不能因为它是纯数字就当成数量、价格、空字段而丢弃**
   - 产品名列="3025" 规格列="0.5mm" → name="3025", spec="0.5mm"，✅
   - 产品名列空 / 型号列="A8516" → code="A8516", name="A8516"（缺名时用型号顶替）
   - **绝对禁止把纯数字 ID 转成 number 再回填**——用字符串原样保留，不丢前导零（"008516" ≠ 8516）
6. **拆分规则**（仅当确有规格时）：
   - "LED灯珠 5050 RED 0.2W" → name="LED灯珠"，spec="5050 RED 0.2W"
   - "钢管 Φ50×3mm L=6m" → name="钢管"，spec="Φ50×3mm L=6m"
   - 拆分后 name + spec 拼起来必须能还原成原文（顺序可调，但字符必须齐）
7. **额外保险字段 sourceRawText**：每条产品都必须额外返回 sourceRawText 字段，**原样填写"产品名/型号/规格列在原表格中的拼接文本"**，这是系统做完整性校验用的，不能省略、不能改写。
   - 例：原行的产品名列="镭射银LB100"、规格列="0.5mm 蓝色"，则 sourceRawText="镭射银LB100 0.5mm 蓝色"
   - 例：型号列="8516"，规格列空，则 sourceRawText="8516"

### 多规格展开为独立行
- 同一产品的不同规格变体（不同厚度、粒径、尺寸、颜色等），每种变体单独一行
- 例：0.5mm/1.0mm/2.0mm三种厚度 → 3行，各自填对应规格和价格
- 展开后每行的 name 仍保持原产品名（含 ID 后缀），spec 填该行对应的规格值

### 矩阵表展开
- 行=产品，列=不同规格的价格 → 每个价格单元格展开为独立行
- 列头标识的规格信息进入 sourceSpecification

### 合并单元格处理
- 产品名称跨多行时，下方每行都是该产品的不同变体，每行独立记录，每行都填完整产品名

### 数据准确性
- 只提取明确存在的信息，不要猜测
- 价格必须与对应产品行匹配
- 数字字段只填纯数字（不含单位）`;

const ITEM_SCHEMA = {
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
    sourceRawText: { type: Type.STRING },
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
    'sourceRawText',
  ],
} as const;

const FULL_RESPONSE_SCHEMA = {
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
    items: { type: Type.ARRAY, items: ITEM_SCHEMA },
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
} as const;

const ITEMS_ONLY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: { type: Type.ARRAY, items: ITEM_SCHEMA },
  },
  required: ['items'],
} as const;

function safeJsonParse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    // 截断时通常是中间出错；尝试找到最后一个完整的 } 收尾再解析
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > 0) {
      try {
        return JSON.parse(text.slice(0, lastBrace + 1)) as T;
      } catch { /* fall through */ }
    }
    throw cause;
  }
}

/**
 * Excel 分批解析：把数据行按 batchSize 切片，每批与表头一起送给 Gemini。
 * 第一批拿元数据（供应商/币种/税率/items），后续批次只取 items 合并。
 */
async function parseExcelInBatches(
  ai: GoogleGenAI,
  dump: ExcelTextDump,
  fullPrompt: string,
): Promise<ParsedQuotation> {
  const batches = planExcelBatches(dump.bodyLinesPerSheet, EXCEL_BATCH_SIZE);
  if (batches.length === 0) {
    // 没有数据行，退回到原走法：尝试把 fullText 当一个批次解析
    return runSingleParse(ai, fullPrompt, dump.fullText);
  }

  // 2) 第一批解析完整 schema（拿元数据），后续批次只解析 items
  const allItems: ParsedQuotationItem[] = [];
  let header: Omit<ParsedQuotation, 'items'> | null = null;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const isFirst = batchIndex === 0;
    const partLabel = `（第 ${batchIndex + 1} / ${batches.length} 批，本批 ${batch.bodyRows.length} 行，` +
      `位于 Sheet "${batch.sheetName}" 第 ${batch.rangeStart}-${batch.rangeEnd} 行）`;
    const sheetText = [`=== Sheet: ${batch.sheetName} ===`, ...batch.headerRows, ...batch.bodyRows].join('\n');

    const batchPrompt = isFirst
      ? `以下是Excel报价单的第 1 批数据${partLabel}，文件总计约 ${dump.totalRows} 行产品数据，将分多次发送：\n\n${sheetText}\n\n${fullPrompt}\n\n注意：本次请严格只解析以上提供的数据行，不要凭空推测后续数据。元数据（供应商、币种等）请以本批为准。`
      : `这是同一份Excel报价单的续批数据${partLabel}。表头已在第 1 批确认过，请仅返回 items 数组（同样的字段结构），按表头映射逐行解析，不要重复表头：\n\n${sheetText}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: { parts: [{ text: batchPrompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: isFirst ? FULL_RESPONSE_SCHEMA : ITEMS_ONLY_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });
    if (!response.text) throw new Error(`Gemini 第 ${batchIndex + 1} 批未返回内容。`);

    if (isFirst) {
      const first = safeJsonParse<ParsedQuotation>(response.text);
      const { items, ...meta } = first;
      header = meta as Omit<ParsedQuotation, 'items'>;
      if (Array.isArray(items)) allItems.push(...items);
    } else {
      const partial = safeJsonParse<{ items: ParsedQuotationItem[] }>(response.text);
      if (Array.isArray(partial.items)) allItems.push(...partial.items);
    }
  }

  if (!header) throw new Error('分批解析未拿到报价单元数据。');
  return { ...header, items: allItems };
}

/** 单次（非分批）解析：原始路径。 */
async function runSingleParse(
  ai: GoogleGenAI,
  fullPrompt: string,
  excelText: string,
): Promise<ParsedQuotation> {
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: {
      parts: [{ text: `以下是Excel报价单的原始数据（Tab分隔，每行为一行，第一行通常是表头）：\n\n${excelText}\n\n${fullPrompt}` }],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: FULL_RESPONSE_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });
  if (!response.text) throw new Error('Gemini 未返回解析结果。');
  return safeJsonParse<ParsedQuotation>(response.text);
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
    const extraPrompt = customPrompt ? `\n\n用户额外要求：${customPrompt}` : '';
    const fullPrompt = BASE_QUOTATION_PARSE_INSTRUCTION + extraPrompt;
    let parsed: ParsedQuotation;

    if (isExcel) {
      const arrayBuffer = await new Response(blob.stream).arrayBuffer();
      const dump = await dumpExcelForGemini(arrayBuffer);
      if (dump.totalRows > EXCEL_BATCH_THRESHOLD) {
        parsed = await parseExcelInBatches(ai, dump, fullPrompt);
      } else {
        parsed = await runSingleParse(ai, fullPrompt, dump.fullText);
      }
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
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: {
          parts: [
            { text: imageInstruction + fullPrompt },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: FULL_RESPONSE_SCHEMA,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      });
      if (!response.text) throw new Error('Gemini 未返回解析结果。');
      parsed = safeJsonParse<ParsedQuotation>(response.text);
    }

    const validation = validateParsedQuotation(parsed);
    return res.status(200).json({ success: true, data: validation });
  } catch (error) {
    return sendError(res, 502, 'PARSE_FAILED', error instanceof Error ? error.message : String(error));
  }
}
