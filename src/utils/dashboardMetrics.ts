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
  /** 单据月份为“其他/未知/空白”或无法解析为 YYYY-MM 的整单不计入 */
  ignoreOtherMonth: boolean;
}

export const DEFAULT_DASHBOARD_DATA_FILTERS: DashboardDataFilters = {
  ignoreZeroOrInvalidPrice: true,
  ignoreZeroOrInvalidQuantity: true,
  ignoreGiftItems: true,
  ignoreVoidedOrders: false,
  ignoreEmptySupplier: false,
  ignoreEmptyCategory: false,
  ignoreOtherMonth: false,
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

export interface SupplierComparisonOptions {
  supplier?: string;
  month?: string;
  filters?: DashboardDataFilters;
  seriesLimit?: number;
}

export interface SupplierComparisonSupplierOption {
  name: string;
  amount: number;
}

export interface SupplierComparisonPeriodSummary {
  amount: number;
  quantity: number;
  orderCount: number;
  lineCount: number;
}

export interface SupplierComparisonPeriodMetric {
  currentValue: number;
  previousValue: number;
  delta: number;
  percentChange: number | null;
  direction: 'up' | 'down' | 'flat';
  available: boolean;
}

export interface SupplierComparisonPoint extends SupplierComparisonPeriodSummary {
  month: string;
}

export interface SupplierComparisonResult {
  supplierOptions: SupplierComparisonSupplierOption[];
  monthOptions: string[];
  selectedSupplier: string | null;
  selectedMonth: string | null;
  previousMonth: string | null;
  previousYearMonth: string | null;
  current: SupplierComparisonPeriodSummary;
  mom: {
    amount: SupplierComparisonPeriodMetric;
    quantity: SupplierComparisonPeriodMetric;
  };
  yoy: {
    amount: SupplierComparisonPeriodMetric;
    quantity: SupplierComparisonPeriodMetric;
  };
  series: SupplierComparisonPoint[];
}

const GIFT_RE = /赠品|赠送|^赠|\s赠/;
const VOID_RE = /作废|取消|废弃/;

/** 检测整单是否被作废/取消，如果开启了 ignoreVoidedOrders */
function isOrderVoided(po: PurchaseOrder): boolean {
  const haystack = [po.status ?? '', po.executionStatus ?? '', po.inboundStatus ?? '', po.remarks ?? ''].join(' ');
  return VOID_RE.test(haystack);
}

function getOrderMonth(po: PurchaseOrder): string {
  const raw = String(po.date ?? '').trim();
  const match = raw.match(/^(\d{4})[-/.年](\d{1,2})/);
  if (!match) return '其他';
  const month = Number(match[2]);
  if (!Number.isInteger(month) || month < 1 || month > 12) return '其他';
  return `${match[1]}-${String(month).padStart(2, '0')}`;
}

function isOtherMonthOrder(po: PurchaseOrder): boolean {
  const month = getOrderMonth(po);
  return month === '其他' || month === '未知月份' || month === '空白';
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

const EMPTY_SUPPLIER_COMPARISON_SUMMARY: SupplierComparisonPeriodSummary = {
  amount: 0,
  quantity: 0,
  orderCount: 0,
  lineCount: 0,
};

function addMonths(month: string, delta: number): string | null {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) return null;
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function createComparisonMetric(currentValue: number, previousValue: number): SupplierComparisonPeriodMetric {
  const current = roundCurrency(currentValue);
  const previous = roundCurrency(previousValue);
  const delta = roundCurrency(current - previous);
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  if (previous <= 0) {
    return { currentValue: current, previousValue: previous, delta, percentChange: null, direction, available: false };
  }
  return {
    currentValue: current,
    previousValue: previous,
    delta,
    percentChange: Math.round((delta / previous) * 10000) / 100,
    direction,
    available: true,
  };
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
    if (filters.ignoreOtherMonth && isOtherMonthOrder(po)) continue;
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

export function buildSupplierComparison(
  purchaseOrders: PurchaseOrder[],
  options: SupplierComparisonOptions = {},
): SupplierComparisonResult {
  const filters = options.filters ?? DEFAULT_DASHBOARD_DATA_FILTERS;
  const seriesLimit = options.seriesLimit ?? 12;
  const bySupplierMonth = new Map<string, Map<string, SupplierComparisonPeriodSummary & { orderIds: Set<string> }>>();
  const supplierAmounts = new Map<string, number>();
  const months = new Set<string>();

  const ensureSummary = (supplier: string, month: string) => {
    let supplierMap = bySupplierMonth.get(supplier);
    if (!supplierMap) {
      supplierMap = new Map();
      bySupplierMonth.set(supplier, supplierMap);
    }
    let summary = supplierMap.get(month);
    if (!summary) {
      summary = { amount: 0, quantity: 0, orderCount: 0, lineCount: 0, orderIds: new Set<string>() };
      supplierMap.set(month, summary);
    }
    return summary;
  };

  for (const po of purchaseOrders) {
    if (filters.ignoreVoidedOrders && isOrderVoided(po)) continue;
    if (filters.ignoreOtherMonth && isOtherMonthOrder(po)) continue;
    const supplier = String(po.supplier || '').trim() || '未知供应商';
    if (filters.ignoreEmptySupplier && supplier === '未知供应商') continue;
    const month = getOrderMonth(po);
    if (month === '其他') continue;

    for (const item of po.items) {
      if (isLineExcluded(item, po.remarks, filters)) continue;
      const category = String(item.category || '').trim();
      if (filters.ignoreEmptyCategory && !category) continue;
      const amount = getLineGrossAmount(item.orderedQty, item.price);
      const quantity = Math.max(0, toFiniteNumber(item.orderedQty));
      if (amount <= 0 || quantity <= 0) continue;

      const summary = ensureSummary(supplier, month);
      summary.amount += amount;
      summary.quantity += quantity;
      summary.lineCount += 1;
      summary.orderIds.add(po.id);
      supplierAmounts.set(supplier, (supplierAmounts.get(supplier) ?? 0) + amount);
      months.add(month);
    }
  }

  for (const supplierMap of bySupplierMonth.values()) {
    for (const summary of supplierMap.values()) {
      summary.orderCount = summary.orderIds.size;
      summary.amount = roundCurrency(summary.amount);
      summary.quantity = roundCurrency(summary.quantity);
    }
  }

  const supplierOptions = Array.from(supplierAmounts.entries())
    .map(([name, amount]) => ({ name, amount: roundCurrency(amount) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const monthOptions = Array.from(months).sort((a, b) => b.localeCompare(a));
  const selectedSupplier = supplierOptions.some(option => option.name === options.supplier)
    ? options.supplier!
    : supplierOptions[0]?.name ?? null;
  const selectedMonth = monthOptions.includes(options.month ?? '')
    ? options.month!
    : monthOptions[0] ?? null;
  const previousMonth = selectedMonth ? addMonths(selectedMonth, -1) : null;
  const previousYearMonth = selectedMonth ? addMonths(selectedMonth, -12) : null;

  const supplierMap = selectedSupplier ? bySupplierMonth.get(selectedSupplier) : undefined;
  const getSummary = (month: string | null): SupplierComparisonPeriodSummary => {
    if (!month) return { ...EMPTY_SUPPLIER_COMPARISON_SUMMARY };
    const summary = supplierMap?.get(month);
    if (!summary) return { ...EMPTY_SUPPLIER_COMPARISON_SUMMARY };
    return {
      amount: roundCurrency(summary.amount),
      quantity: roundCurrency(summary.quantity),
      orderCount: summary.orderCount,
      lineCount: summary.lineCount,
    };
  };

  const current = getSummary(selectedMonth);
  const momBase = getSummary(previousMonth);
  const yoyBase = getSummary(previousYearMonth);
  const series = selectedSupplier && supplierMap
    ? Array.from(supplierMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-seriesLimit)
      .map(([month, summary]) => ({
        month,
        amount: roundCurrency(summary.amount),
        quantity: roundCurrency(summary.quantity),
        orderCount: summary.orderCount,
        lineCount: summary.lineCount,
      }))
    : [];

  return {
    supplierOptions,
    monthOptions,
    selectedSupplier,
    selectedMonth,
    previousMonth,
    previousYearMonth,
    current,
    mom: {
      amount: createComparisonMetric(current.amount, momBase.amount),
      quantity: createComparisonMetric(current.quantity, momBase.quantity),
    },
    yoy: {
      amount: createComparisonMetric(current.amount, yoyBase.amount),
      quantity: createComparisonMetric(current.quantity, yoyBase.quantity),
    },
    series,
  };
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
    if (filters.ignoreOtherMonth && isOtherMonthOrder(po)) {
      excludedLineCount += po.items.length;
      continue;
    }
    if (filters.ignoreEmptySupplier && !String(po.supplier ?? '').trim()) {
      excludedLineCount += po.items.length;
      continue;
    }
    const month = getOrderMonth(po);
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
