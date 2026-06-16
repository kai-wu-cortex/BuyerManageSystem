import type { FieldConfidence, PriceTaxMode, ReviewIssue } from './types';

export interface ParsedQuotationItem {
  sourceProductCode: string;
  sourceProductName: string;
  sourceSpecification: string;
  sourceUnit: string;
  sourcePackageDescription: string;
  sourcePackageQuantity: number | null;
  sourceUnitPrice: number | null;
  minimumOrderQuantity: number | null;
  lineLeadTimeDays: number | null;
  /**
   * 原始单元格拼接文本（产品名 / 型号 / 规格列原文，未经清洗）。
   * Gemini 必须原样回填，便于客户端做"无损保留"校验：
   * 校验 name + code + spec 是否覆盖了 sourceRawText 的所有 token，
   * 缺失片段会自动补回 sourceSpecification 末尾。
   */
  sourceRawText?: string;
  fieldConfidence: FieldConfidence;
}

export interface ParsedQuotation {
  supplierName: string;
  quotationNumber?: string;
  quotationDate: string;
  validUntil?: string;
  currency: string;
  exchangeRateToCny: number;
  taxRate: number;
  priceTaxMode: PriceTaxMode;
  paymentTerms?: string;
  leadTimeDays?: number | null;
  items: ParsedQuotationItem[];
}

export interface ParsedQuotationValidation {
  valid: boolean;
  value: ParsedQuotation;
  issues: ReviewIssue[];
}

type ParsedQuotationColumn = Exclude<keyof ParsedQuotationItem, 'fieldConfidence'>;

const HEADER_ALIASES: Record<string, ParsedQuotationColumn> = {
  产品编码: 'sourceProductCode',
  商品编码: 'sourceProductCode',
  物料编码: 'sourceProductCode',
  产品名称: 'sourceProductName',
  商品名称: 'sourceProductName',
  物料名称: 'sourceProductName',
  '产品名称/编号': 'sourceProductName',
  系列名称: 'sourceProductName',
  规格: 'sourceSpecification',
  规格型号: 'sourceSpecification',
  厚度: 'sourceSpecification',
  '内包装尺寸/容量': 'sourceSpecification',
  单位: 'sourceUnit',
  计量单位: 'sourceUnit',
  包装: 'sourcePackageDescription',
  包装说明: 'sourcePackageDescription',
  包装方式: 'sourcePackageDescription',
  包装数量: 'sourcePackageQuantity',
  包装规格: 'sourcePackageQuantity',
  箱规: 'sourcePackageQuantity',
  单价: 'sourceUnitPrice',
  含税单价: 'sourceUnitPrice',
  报价: 'sourceUnitPrice',
  价格: 'sourceUnitPrice',
  moq: 'minimumOrderQuantity',
  最小起订量: 'minimumOrderQuantity',
  起订量: 'minimumOrderQuantity',
  交期: 'lineLeadTimeDays',
  交货期: 'lineLeadTimeDays',
};

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || text(value) === '') return null;
  const parsed = Number(text(value).replace(/[,%￥¥$]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHeader(value: unknown): string {
  return text(value).toLowerCase().replace(/[\s()（）]/g, '');
}

function findHeaderRow(rows: unknown[][]): number {
  return rows.findIndex(row => row.some(cell => HEADER_ALIASES[normalizeHeader(cell)] === 'sourceProductName'));
}

function readMetadata(rows: unknown[][], headerIndex: number): Map<string, string> {
  const metadata = new Map<string, string>();
  for (const row of rows.slice(0, Math.max(0, headerIndex))) {
    for (let index = 0; index < row.length - 1; index += 1) {
      const key = text(row[index]);
      const value = text(row[index + 1]);
      if (key && value) metadata.set(key.replace(/[:：]/g, ''), value);
    }
  }
  return metadata;
}

function inferSupplierName(rows: unknown[][], headerIndex: number): string {
  for (const row of rows.slice(0, Math.max(0, headerIndex))) {
    const company = row.map(text).find(value => /公司|工厂|供应商/.test(value) && value.length >= 4);
    if (company) {
      return company
        .split(/\s{2,}|\n/)
        .map(value => value.trim())
        .find(value => /公司|工厂|供应商/.test(value)) ?? company;
    }
  }
  return '';
}

function inferPriceContext(rows: unknown[][], headerIndex: number): { currency: string; unit: string } {
  const context = rows.slice(0, headerIndex + 1).flat().map(text).join(' ');
  const unitMatch = context.match(/(?:\$|USD)?\s*\/\s*([a-zA-Z]+)/i);
  return {
    currency: /\$|USD/i.test(context) ? 'USD' : /￥|¥|CNY/i.test(context) ? 'CNY' : '',
    unit: unitMatch?.[1]?.toUpperCase() ?? '',
  };
}

function createEmptyItem(sourceRow: number): ParsedQuotationItem {
  return {
    sourceProductCode: '',
    sourceProductName: '',
    sourceSpecification: '',
    sourceUnit: '',
    sourcePackageDescription: '',
    sourcePackageQuantity: null,
    sourceUnitPrice: null,
    minimumOrderQuantity: null,
    lineLeadTimeDays: null,
    fieldConfidence: { sourceRow },
  };
}

function parseMatrixItems(
  rows: unknown[][],
  headerIndex: number,
  headerMap: Map<number, ParsedQuotationColumn>,
  inferredUnit: string,
): ParsedQuotationItem[] {
  if ([...headerMap.values()].includes('sourceUnitPrice')) return [];
  const nameColumn = [...headerMap].find(([, field]) => field === 'sourceProductName')?.[0];
  const specificationColumn = [...headerMap].find(([, field]) => field === 'sourceSpecification')?.[0];
  if (nameColumn === undefined) return [];

  const firstPriceColumn = Math.max(nameColumn, specificationColumn ?? nameColumn) + 1;
  const followingRows = rows.slice(headerIndex + 1);
  const priceColumns = rows[headerIndex]
    .map((_, index) => index)
    .filter(index => index >= firstPriceColumn)
    .filter(index => followingRows.some(row => numberOrNull(row[index]) !== null));
  if (priceColumns.length < 2) return [];

  const topLabels: string[] = [];
  let previousTopLabel = '';
  rows[headerIndex].forEach((cell, index) => {
    const value = text(cell);
    if (value) previousTopLabel = value;
    topLabels[index] = previousTopLabel;
  });
  const secondaryHeader = followingRows.find(row => (
    !numberOrNull(row[nameColumn])
    && priceColumns.some(index => text(row[index]) && numberOrNull(row[index]) === null)
  ));

  const items: ParsedQuotationItem[] = [];
  let currentProductName = '';
  for (let offset = 0; offset < followingRows.length; offset += 1) {
    const row = followingRows[offset];
    const rowProductName = text(row[nameColumn]);
    if (rowProductName) currentProductName = rowProductName;
    if (!currentProductName) continue;
    const specification = specificationColumn === undefined ? '' : text(row[specificationColumn]);

    for (const column of priceColumns) {
      const price = numberOrNull(row[column]);
      if (price === null) continue;
      const secondaryLabel = secondaryHeader ? text(secondaryHeader[column]) : '';
      const priceLabel = [topLabels[column], secondaryLabel].filter(Boolean).join(' · ');
      items.push({
        ...createEmptyItem(offset + headerIndex + 2),
        sourceProductName: currentProductName,
        sourceSpecification: specification,
        sourceUnit: inferredUnit,
        sourcePackageDescription: priceLabel,
        sourcePackageQuantity: inferredUnit ? 1 : null,
        sourceUnitPrice: price,
      });
    }
  }
  return items;
}

export function rowsToQuotationDraft(rows: unknown[][]): ParsedQuotation {
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) {
    return validateParsedQuotation({ items: [] }).value;
  }

  const metadata = readMetadata(rows, headerIndex);
  const headerMap = new Map<number, ParsedQuotationColumn>();
  rows[headerIndex].forEach((cell, index) => {
    const field = HEADER_ALIASES[normalizeHeader(cell)];
    if (field) headerMap.set(index, field);
  });

  const priceContext = inferPriceContext(rows, headerIndex);
  // 找到产品名/型号/规格三列，给每行拼出 sourceRawText（无损保留兜底）
  const nameColumns: number[] = [];
  for (const [index, field] of headerMap) {
    if (field === 'sourceProductName' || field === 'sourceProductCode' || field === 'sourceSpecification') {
      nameColumns.push(index);
    }
  }
  const matrixItems = parseMatrixItems(rows, headerIndex, headerMap, priceContext.unit);
  const items = matrixItems.length > 0 ? matrixItems : rows.slice(headerIndex + 1).map((row, rowOffset) => {
    const item = createEmptyItem(rowOffset + headerIndex + 2);
    for (const [index, field] of headerMap) {
      if (
        field === 'sourcePackageQuantity'
        || field === 'sourceUnitPrice'
        || field === 'minimumOrderQuantity'
        || field === 'lineLeadTimeDays'
      ) {
        item[field] = numberOrNull(row[index]);
      } else {
        item[field] = text(row[index]);
      }
    }
    // 用产品名/型号/规格三列原文拼成 sourceRawText
    const rawParts = nameColumns.map(idx => text(row[idx])).filter(Boolean);
    if (rawParts.length > 0) item.sourceRawText = rawParts.join(' ');
    return item;
  }).filter(item => (
    // 只要标识列任一非空即保留，避免纯数字 ID（型号列单独 = "8516"）被当成空行丢弃
    Boolean(item.sourceProductName)
    || Boolean(item.sourceProductCode)
    || Boolean(item.sourceSpecification)
    || Boolean(item.sourceRawText)
  )).map(item => {
    // 若 name 空但其他标识列有值（如型号 = 8516、规格 = 0.5mm），把 raw 顶给 name
    if (!item.sourceProductName) {
      const fallback = item.sourceProductCode || item.sourceRawText || item.sourceSpecification;
      if (fallback) item.sourceProductName = fallback;
    }
    return item;
  });

  const taxText = metadata.get('税率') ?? '0';
  const currency = (metadata.get('币种') ?? priceContext.currency).toUpperCase();
  return {
    supplierName: metadata.get('供应商') ?? metadata.get('供应商名称') ?? inferSupplierName(rows, headerIndex),
    quotationNumber: metadata.get('报价单号') ?? '',
    quotationDate: metadata.get('报价日期') ?? '',
    validUntil: metadata.get('有效期') ?? '',
    currency,
    exchangeRateToCny: currency === 'CNY' ? 1 : numberOrNull(metadata.get('汇率')) ?? 0,
    taxRate: numberOrNull(taxText) ?? 0,
    priceTaxMode: taxText.includes('未税') ? 'tax_excluded' : 'tax_included',
    paymentTerms: metadata.get('付款方式') ?? '',
    leadTimeDays: numberOrNull(metadata.get('交期')),
    items,
  };
}

/**
 * 把字符串拆成可比对的 token 集合（中文按单字、英文/数字按连续段）。
 * 用于"无损保留"校验：判断 name + code + spec 是否覆盖了原文。
 */
export function tokenizeForLossCheck(value: string): string[] {
  if (!value) return [];
  const tokens: string[] = [];
  // 中文单字
  for (const ch of value.matchAll(/[一-鿿]/g)) tokens.push(ch[0]);
  // 英文/数字连续段（保留大小写差异）
  for (const seg of value.matchAll(/[A-Za-z0-9]+/g)) tokens.push(seg[0]);
  return tokens;
}

/**
 * 检查 name + code + spec 是否完整保留了 raw 原文中的所有 token。
 * 返回 raw 中"还没出现"的字段片段，调用方可把它们补回 spec 末尾。
 */
export function findMissingRawTokens(
  raw: string,
  combined: string,
): { missing: string[]; missingText: string } {
  const rawTokens = tokenizeForLossCheck(raw);
  if (rawTokens.length === 0) return { missing: [], missingText: '' };
  const combinedTokens = new Set(tokenizeForLossCheck(combined));
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const token of rawTokens) {
    if (combinedTokens.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    missing.push(token);
  }
  // 把连续的中文单字合并成原片段，便于阅读
  const missingText = missing.length === 0 ? '' : (() => {
    const result: string[] = [];
    for (const token of missing) {
      const last = result[result.length - 1];
      if (last && /[一-鿿]/.test(last) && /[一-鿿]/.test(token)) {
        result[result.length - 1] = last + token;
      } else {
        result.push(token);
      }
    }
    return result.join(' ');
  })();
  return { missing, missingText };
}

/**
 * 对单条解析结果做"无损保留"修复：name + code + spec 的拼接必须覆盖 sourceRawText
 * 中的所有 token，否则把缺失片段补到 spec 末尾。
 *
 * 特殊场景：name 和 code 都为空、但 raw 里有内容 → 把 raw 整体补到 name
 * （处理"型号列只有数字 8516，name 应该等于 8516"这类）。
 */
export function reconcileItemAgainstRaw(item: ParsedQuotationItem): {
  item: ParsedQuotationItem;
  recovered: boolean;
  recoveredText: string;
} {
  const raw = (item.sourceRawText ?? '').trim();
  if (!raw) return { item, recovered: false, recoveredText: '' };

  // 兜底 1：name 和 code 都为空，但 raw 有内容 → 把 raw 当 name（保留纯数字 ID）
  const hasName = Boolean(item.sourceProductName.trim());
  const hasCode = Boolean(item.sourceProductCode.trim());
  if (!hasName && !hasCode) {
    return {
      item: { ...item, sourceProductName: raw },
      recovered: true,
      recoveredText: raw,
    };
  }

  // 兜底 2：name + code + spec 没覆盖 raw 的全部 token → 把缺失部分补到 spec 末尾
  const combined = [item.sourceProductName, item.sourceSpecification, item.sourceProductCode]
    .filter(Boolean).join(' ');
  const { missingText } = findMissingRawTokens(raw, combined);
  if (!missingText) return { item, recovered: false, recoveredText: '' };
  const nextSpec = item.sourceSpecification
    ? `${item.sourceSpecification} | ${missingText}`
    : missingText;
  return {
    item: { ...item, sourceSpecification: nextSpec },
    recovered: true,
    recoveredText: missingText,
  };
}

export function validateParsedQuotation(value: unknown): ParsedQuotationValidation {
  const raw = value && typeof value === 'object' ? value as Partial<ParsedQuotation> : {};
  const parsed: ParsedQuotation = {
    supplierName: text(raw.supplierName),
    quotationNumber: text(raw.quotationNumber),
    quotationDate: text(raw.quotationDate),
    validUntil: text(raw.validUntil),
    currency: text(raw.currency).toUpperCase(),
    exchangeRateToCny: Number(raw.exchangeRateToCny) || 0,
    taxRate: Number(raw.taxRate) || 0,
    priceTaxMode: raw.priceTaxMode === 'tax_excluded' ? 'tax_excluded' : 'tax_included',
    paymentTerms: text(raw.paymentTerms),
    leadTimeDays: numberOrNull(raw.leadTimeDays),
    items: Array.isArray(raw.items) ? raw.items.map(item => {
      const baseItem: ParsedQuotationItem = {
        sourceProductCode: text(item?.sourceProductCode),
        sourceProductName: text(item?.sourceProductName),
        sourceSpecification: text(item?.sourceSpecification),
        sourceUnit: text(item?.sourceUnit),
        sourcePackageDescription: text(item?.sourcePackageDescription),
        sourcePackageQuantity: numberOrNull(item?.sourcePackageQuantity),
        sourceUnitPrice: numberOrNull(item?.sourceUnitPrice),
        minimumOrderQuantity: numberOrNull(item?.minimumOrderQuantity),
        lineLeadTimeDays: numberOrNull(item?.lineLeadTimeDays),
        sourceRawText: text(item?.sourceRawText) || undefined,
        fieldConfidence: item?.fieldConfidence && typeof item.fieldConfidence === 'object'
          ? item.fieldConfidence
          : {},
      };
      // 无损保留校验：name + code + spec 的拼接必须覆盖 sourceRawText 的所有 token
      const { item: reconciled } = reconcileItemAgainstRaw(baseItem);
      return reconciled;
    }) : [],
  };

  const issues: ReviewIssue[] = [];
  const requireField = (condition: boolean, field: string, message: string) => {
    if (!condition) issues.push({ field, message, blocking: true });
  };
  requireField(Boolean(parsed.supplierName), 'supplierName', '缺少供应商名称。');
  requireField(Boolean(parsed.quotationDate), 'quotationDate', '缺少报价日期。');
  requireField(Boolean(parsed.currency), 'currency', '缺少币种。');
  requireField(parsed.exchangeRateToCny > 0, 'exchangeRateToCny', '缺少有效固定汇率。');
  requireField(parsed.items.length > 0, 'items', '未识别到报价明细。');
  parsed.items.forEach((item, index) => {
    requireField(Boolean(item.sourceProductName), `items.${index}.sourceProductName`, '缺少产品名称。');
    requireField(Boolean(item.sourceUnit), `items.${index}.sourceUnit`, '缺少计量单位。');
    requireField(
      item.sourcePackageQuantity !== null && item.sourcePackageQuantity > 0,
      `items.${index}.sourcePackageQuantity`,
      '缺少有效包装数量。',
    );
    requireField(
      item.sourceUnitPrice !== null && item.sourceUnitPrice >= 0,
      `items.${index}.sourceUnitPrice`,
      '缺少有效单价。',
    );
  });

  return { valid: !issues.some(issue => issue.blocking), value: parsed, issues };
}
