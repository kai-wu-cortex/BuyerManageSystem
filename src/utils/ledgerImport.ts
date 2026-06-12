export const STANDARD_HEADERS = [
  '单据编号',
  '单据日期',
  '供应商',
  '单据状态',
  '执行状态',
  '入库状态',
  '单据备注',
  '折扣率',
  '折扣额',
  '行执行状态',
  '行入库状态',
  '商品编码',
  '商品名称',
  '规格型号',
  '商品类别',
  '单位',
  '数量',
  '基本数量',
  '实际含税单价',
  '增值税税率',
  '税额',
  '商品行备注',
  '行已执行基本单位数量',
  '行已执行数量',
  '行未执行基本单位数量',
  '行未执行数量',
  '已执行已入库数量',
  '已执行未入库数量',
  '执行比例',
  '剩余备货天数',
  '最近入库日期',
  '客户名称',
  '源单单号',
  '运输方式',
  '结算方式',
  '交货日期',
] as const;

const HEADER_ALIASES: Record<string, readonly string[]> = {
  单据编号: ['单据编号', '单据号', '采购单号', '采购订单号', '编号', 'po', 'po no', 'order no'],
  单据日期: ['单据日期', '日期', '下单日期', '采购日期', 'date'],
  供应商: ['供应商', '供应商名称', 'vendor', 'supplier'],
  单据状态: ['单据状态', '审核状态', '状态'],
  执行状态: ['执行状态'],
  入库状态: ['入库状态'],
  单据备注: ['单据备注', '备注'],
  折扣率: ['折扣率', '整单折扣率'],
  折扣额: ['折扣额', '整单折扣额'],
  行执行状态: ['行执行状态'],
  行入库状态: ['行入库状态'],
  商品编码: ['商品编码', '物料编码', '编码', 'code'],
  商品名称: ['商品名称', '物料名称', '名称', '品名', 'name'],
  规格型号: ['规格型号', '规格', '型号', 'spec'],
  商品类别: ['商品类别', '物料类别', '类别', '分类', 'category'],
  单位: ['单位', 'unit'],
  数量: ['数量', '采购数量', '订购数量', 'qty'],
  基本数量: ['基本数量'],
  实际含税单价: ['实际含税单价', '含税单价', '单价', 'price'],
  增值税税率: ['增值税税率', '税率'],
  税额: ['税额'],
  商品行备注: ['商品行备注', '行备注'],
  行已执行基本单位数量: ['行已执行基本单位数量'],
  行已执行数量: ['行已执行数量', '已执行数量'],
  行未执行基本单位数量: ['行未执行基本单位数量'],
  行未执行数量: ['行未执行数量', '未执行数量'],
  已执行已入库数量: ['已执行已入库数量'],
  已执行未入库数量: ['已执行未入库数量'],
  执行比例: ['执行比例'],
  剩余备货天数: ['剩余备货天数'],
  最近入库日期: ['最近入库日期'],
  客户名称: ['客户名称'],
  源单单号: ['源单单号'],
  运输方式: ['运输方式'],
  结算方式: ['结算方式'],
  交货日期: ['交货日期', '协议交期', '到货日期'],
};

const REQUIRED_HEADERS = [
  '单据编号',
  '单据日期',
  '供应商',
  '商品编码',
  '商品名称',
  '数量',
  '实际含税单价',
] as const;

function normalizeCell(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().split('T')[0];
  return String(cell).replace(/\t|\n/g, ' ').trim();
}

function normalizeHeader(cell: unknown): string {
  return normalizeCell(cell)
    .toLowerCase()
    .replace(/[()\[\]（）【】\s:_：/\\-]/g, '');
}

function isHeaderRow(row: unknown[]): boolean {
  const normalized = row.map(normalizeHeader).filter(Boolean);
  if (normalized.length === 0) return false;
  let matches = 0;
  for (const aliases of Object.values(HEADER_ALIASES)) {
    if (aliases.some(alias => normalized.includes(normalizeHeader(alias)))) {
      matches += 1;
    }
  }
  return matches >= 3;
}

function buildHeaderIndex(row: unknown[]): Map<string, number> {
  const normalizedHeaders = row.map(normalizeHeader);
  const index = new Map<string, number>();

  STANDARD_HEADERS.forEach(header => {
    const aliases = HEADER_ALIASES[header] || [header];
    const matchIndex = normalizedHeaders.findIndex(cell => aliases.some(alias => cell === normalizeHeader(alias)));
    if (matchIndex >= 0) {
      index.set(header, matchIndex);
    }
  });

  return index;
}

export interface LedgerHeaderAnalysis {
  hasHeader: boolean;
  recognizedHeaders: string[];
  unknownHeaders: string[];
  missingRequiredHeaders: string[];
}

export function analyzeLedgerHeaders(rows: unknown[][]): LedgerHeaderAnalysis {
  const firstRow = rows[0] || [];
  if (!isHeaderRow(firstRow)) {
    return {
      hasHeader: false,
      recognizedHeaders: [],
      unknownHeaders: [],
      missingRequiredHeaders: [],
    };
  }

  const recognizedHeaders: string[] = [];
  const unknownHeaders: string[] = [];
  const matchedStandardHeaders = new Set<string>();

  firstRow.forEach(cell => {
    const label = normalizeCell(cell);
    if (!label) return;
    const normalized = normalizeHeader(label);
    const matchedHeader = STANDARD_HEADERS.find(header => {
      const aliases = HEADER_ALIASES[header] || [header];
      return aliases.some(alias => normalizeHeader(alias) === normalized);
    });

    if (matchedHeader) {
      recognizedHeaders.push(label);
      matchedStandardHeaders.add(matchedHeader);
    } else {
      unknownHeaders.push(label);
    }
  });

  return {
    hasHeader: true,
    recognizedHeaders,
    unknownHeaders,
    missingRequiredHeaders: REQUIRED_HEADERS.filter(header => !matchedStandardHeaders.has(header)),
  };
}

function formatRowAsLine(row: unknown[]): string {
  return row.map(normalizeCell).join('\t');
}

interface RowsToLedgerLinesOptions {
  ignoreUnknownHeaders?: boolean;
}

export function rowsToLedgerLines(rows: unknown[][], _options: RowsToLedgerLinesOptions = {}): string[] {
  if (rows.length === 0) return [];
  const firstRow = rows[0];

  if (!isHeaderRow(firstRow)) {
    return rows.map(formatRowAsLine);
  }

  const headerIndex = buildHeaderIndex(firstRow);
  return rows.slice(1).map(row => (
    STANDARD_HEADERS.map(header => {
      const sourceIndex = headerIndex.get(header);
      return sourceIndex === undefined ? '' : normalizeCell(row[sourceIndex]);
    }).join('\t')
  ));
}
