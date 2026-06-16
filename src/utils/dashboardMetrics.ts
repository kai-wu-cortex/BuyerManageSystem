import { PurchaseOrder } from '../types';

export interface DashboardChartDatum {
  name: string;
  value: number;
}

export interface DashboardMetrics {
  totalAmount: number;
  monthlySpend: DashboardChartDatum[];
  supplierSpend: DashboardChartDatum[];
  categorySpend: DashboardChartDatum[];
  /** 被过滤跳过的行数（按 dashboardDataFilters 规则）。0 表示全部计入 */
  excludedLineCount: number;
  /** 实际参与统计的行数 */
  includedLineCount: number;
}

/**
 * 大屏数据过滤规则。任一开启的规则都会让对应行不计入统计指标
 * （totalAmount / monthlySpend / supplierSpend / categorySpend / breakdown）。
 */
export interface DashboardDataFilters {
  /** 单价为 0 / null / 非数字 的行不计入 */
  ignoreZeroOrInvalidPrice: boolean;
  /** 数量为 0 / null / 非数字 的行不计入 */
  ignoreZeroOrInvalidQuantity: boolean;
  /** 备注 / 类别 / 单据备注里含 "赠品/赠送" 的行不计入 */
  ignoreGiftItems: boolean;
  /** 单据备注 / 状态里含 "作废/取消/废弃" 的整单不计入 */
  ignoreVoidedOrders: boolean;
  /** 供应商为空白的整单不计入 */
  ignoreEmptySupplier: boolean;
  /** 物料类别为空白的行不计入（仅影响 categorySpend / 按类别 breakdown） */
  ignoreEmptyCategory: boolean;
}

export const DEFAULT_DASHBOARD_DATA_FILTERS: DashboardDataFilters = {
  ignoreZeroOrInvalidPrice: true,
  ignoreZeroOrInvalidQuantity: true,
  ignoreGiftItems: true,
  ignoreVoidedOrders: false,
  ignoreEmptySupplier: false,
  ignoreEmptyCategory: false,
};

export function sanitizeDashboardDataFilters(value: unknown): DashboardDataFilters {
  if (!value || typeof value !== 'object') return { ...DEFAULT_DASHBOARD_DATA_FILTERS };
  const raw = value as Record<string, unknown>;
  const out = { ...DEFAULT_DASHBOARD_DATA_FILTERS };
  for (const key of Object.keys(out) as Array<keyof DashboardDataFilters>) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean;
  }
  return out;
}

export type LedgerBreakdownField =
  | 'id'
  | 'date'
  | 'month'
  | 'supplier'
  | 'status'
  | 'executionStatus'
  | 'inboundStatus'
  | 'code'
  | 'name'
  | 'spec'
  | 'category'
  | 'unit'
  | 'customerName'
  | 'sourceOrderId'
  | 'transportMethod'
  | 'settlementType'
  | 'deliveryDate';

export type LedgerBreakdownMetric = 'amount' | 'quantity' | 'taxAmount' | 'lineCount' | 'orderCount';

export interface LedgerBreakdownOptions {
  groupBy: LedgerBreakdownField;
  metric: LedgerBreakdownMetric;
  limit?: number;
  filters?: DashboardDataFilters;
}

interface BuildDashboardMetricsOptions {
  categoryLimit?: number;
  supplierLimit?: number;
  filters?: DashboardDataFilters;
}

const GIFT_RE = /赠品|赠送|^赠|\s赠/;
const VOID_RE = /作废|取消|废弃/;

/** 检测整单是否被作废/取消，如果开启了 ignoreVoidedOrders */
function isOrderVoided(po: PurchaseOrder): boolean {
  const haystack = [po.status ?? '', po.executionStatus ?? '', po.inboundStatus ?? '', po.remarks ?? ''].join(' ');
  return VOID_RE.test(haystack);
}

function isLineGift(item: PurchaseOrder['items'][number], poRemarks: string): boolean {
  const haystack = [
    typeof item.remark === 'string' ? item.remark : '',
    typeof item.category === 'string' ? item.category : '',
    typeof poRemarks === 'string' ? poRemarks : '',
  ].join(' ');
  return GIFT_RE.test(haystack);
}

/**
 * 根据 filters 判断一条行是否应被排除。
 * 整单层（供应商空 / 作废）由调用方在外层判断以避免重复计算。
 */
function isLineExcluded(
  item: PurchaseOrder['items'][number],
  poRemarks: string,
  filters: DashboardDataFilters,
): boolean {
  if (filters.ignoreGiftItems && isLineGift(item, poRemarks)) return true;
  if (filters.ignoreZeroOrInvalidPrice) {
    const p = toFiniteNumber(item.price, NaN);
    if (!Number.isFinite(p) || p <= 0) return true;
  }
  if (filters.ignoreZeroOrInvalidQuantity) {
    const q = toFiniteNumber(item.orderedQty, NaN);
    if (!Number.isFinite(q) || q <= 0) return true;
  }
  return false;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function getLineGrossAmount(orderedQty: unknown, price: unknown): number {
  const qty = toFiniteNumber(orderedQty);
  const unitPrice = toFiniteNumber(price);
  if (qty <= 0 || unitPrice < 0) return 0;
  return qty * unitPrice;
}

function addAmount(target: Record<string, number>, key: string, amount: number): void {
  if (amount <= 0) return;
  target[key] = (target[key] || 0) + amount;
}

function toSortedChartData(data: Record<string, number>): DashboardChartDatum[] {
  return Object.entries(data)
    .map(([name, value]) => ({ name, value: roundCurrency(value) }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function limitCategoryData(data: DashboardChartDatum[], limit: number): DashboardChartDatum[] {
  if (data.length <= limit) return data;
  const top = data.slice(0, limit);
  const otherValue = roundCurrency(data.slice(limit).reduce((sum, item) => sum + item.value, 0));
  return otherValue > 0 ? [...top, { name: '其他', value: otherValue }] : top;
}

function getGroupValue(po: PurchaseOrder, item: PurchaseOrder['items'][number], field: LedgerBreakdownField): string {
  if (field === 'month') return String(po.date || '').substring(0, 7) || '空白';
  if (field === 'id') return po.id || '空白';
  if (field === 'date') return po.date || '空白';
  if (field === 'supplier') return po.supplier || '空白';
  if (field === 'status') return po.status || '空白';
  if (field === 'executionStatus') return po.executionStatus || '空白';
  if (field === 'inboundStatus') return po.inboundStatus || '空白';
  if (field === 'transportMethod') return po.transportMethod || '空白';
  if (field === 'settlementType') return po.settlementType || '空白';
  if (field === 'deliveryDate') return po.deliveryDate || '空白';
  return String(item[field] || '').trim() || '空白';
}

function getMetricValue(
  po: PurchaseOrder,
  item: PurchaseOrder['items'][number],
  metric: LedgerBreakdownMetric,
  seenOrdersByGroup: Record<string, Set<string>>,
  groupName: string,
): number {
  if (metric === 'amount') return getLineGrossAmount(item.orderedQty, item.price);
  if (metric === 'quantity') return Math.max(0, toFiniteNumber(item.orderedQty));
  if (metric === 'taxAmount') return Math.max(0, toFiniteNumber(item.taxAmount));
  if (metric === 'lineCount') return 1;
  if (metric === 'orderCount') {
    if (!seenOrdersByGroup[groupName]) seenOrdersByGroup[groupName] = new Set();
    const before = seenOrdersByGroup[groupName].size;
    seenOrdersByGroup[groupName].add(po.id);
    return seenOrdersByGroup[groupName].size > before ? 1 : 0;
  }
  return 0;
}

export function buildLedgerBreakdown(
  purchaseOrders: PurchaseOrder[],
  options: LedgerBreakdownOptions,
): DashboardChartDatum[] {
  const limit = options.limit ?? 8;
  const filters = options.filters ?? DEFAULT_DASHBOARD_DATA_FILTERS;
  const data: Record<string, number> = {};
  const seenOrdersByGroup: Record<string, Set<string>> = {};

  for (const po of purchaseOrders) {
    if (filters.ignoreVoidedOrders && isOrderVoided(po)) continue;
    if (filters.ignoreEmptySupplier && !String(po.supplier ?? '').trim()) continue;
    for (const item of po.items) {
      if (isLineExcluded(item, po.remarks, filters)) continue;
      if (filters.ignoreEmptyCategory && options.groupBy === 'category' && !String(item.category ?? '').trim()) continue;
      const groupName = getGroupValue(po, item, options.groupBy);
      const value = getMetricValue(po, item, options.metric, seenOrdersByGroup, groupName);
      addAmount(data, groupName, value);
    }
  }

  return limitCategoryData(toSortedChartData(data), limit);
}

export function buildDashboardMetrics(
  purchaseOrders: PurchaseOrder[],
  options: BuildDashboardMetricsOptions = {},
): DashboardMetrics {
  const categoryLimit = options.categoryLimit ?? 8;
  const supplierLimit = options.supplierLimit ?? 5;
  const filters = options.filters ?? DEFAULT_DASHBOARD_DATA_FILTERS;
  const monthlyData: Record<string, number> = {};
  const supplierData: Record<string, number> = {};
  const categoryData: Record<string, number> = {};
  let totalAmount = 0;
  let excludedLineCount = 0;
  let includedLineCount = 0;

  for (const po of purchaseOrders) {
    if (filters.ignoreVoidedOrders && isOrderVoided(po)) {
      excludedLineCount += po.items.length;
      continue;
    }
    if (filters.ignoreEmptySupplier && !String(po.supplier ?? '').trim()) {
      excludedLineCount += po.items.length;
      continue;
    }
    const month = String(po.date || '').substring(0, 7) || '未知月份';
    const supplier = String(po.supplier || '').trim() || '未知供应商';

    po.items.forEach(item => {
      if (isLineExcluded(item, po.remarks, filters)) {
        excludedLineCount += 1;
        return;
      }
      const grossLineAmount = getLineGrossAmount(item.orderedQty, item.price);
      if (grossLineAmount <= 0) {
        excludedLineCount += 1;
        return;
      }
      const category = String(item.category || '').trim();
      if (filters.ignoreEmptyCategory && !category) {
        excludedLineCount += 1;
        return;
      }
      includedLineCount += 1;
      addAmount(monthlyData, month, grossLineAmount);
      addAmount(supplierData, supplier, grossLineAmount);
      addAmount(categoryData, category || '空白', grossLineAmount);
      totalAmount += grossLineAmount;
    });
  }

  return {
    totalAmount: roundCurrency(totalAmount),
    excludedLineCount,
    includedLineCount,
    monthlySpend: Object.entries(monthlyData)
      .map(([name, value]) => ({ name, value: roundCurrency(value) }))
      .filter(item => item.value > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
    supplierSpend: toSortedChartData(supplierData).slice(0, supplierLimit),
    categorySpend: limitCategoryData(toSortedChartData(categoryData), categoryLimit),
  };
}
