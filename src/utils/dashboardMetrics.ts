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
}

interface BuildDashboardMetricsOptions {
  categoryLimit?: number;
  supplierLimit?: number;
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
  const data: Record<string, number> = {};
  const seenOrdersByGroup: Record<string, Set<string>> = {};

  for (const po of purchaseOrders) {
    for (const item of po.items) {
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
  const monthlyData: Record<string, number> = {};
  const supplierData: Record<string, number> = {};
  const categoryData: Record<string, number> = {};
  let totalAmount = 0;

  for (const po of purchaseOrders) {
    const month = String(po.date || '').substring(0, 7) || '未知月份';
    const supplier = String(po.supplier || '').trim() || '未知供应商';

    po.items.forEach(item => {
      const grossLineAmount = getLineGrossAmount(item.orderedQty, item.price);
      if (grossLineAmount <= 0) return;
      addAmount(monthlyData, month, grossLineAmount);
      addAmount(supplierData, supplier, grossLineAmount);
      addAmount(categoryData, String(item.category || '').trim() || '空白', grossLineAmount);
      totalAmount += grossLineAmount;
    });
  }

  return {
    totalAmount: roundCurrency(totalAmount),
    monthlySpend: Object.entries(monthlyData)
      .map(([name, value]) => ({ name, value: roundCurrency(value) }))
      .filter(item => item.value > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
    supplierSpend: toSortedChartData(supplierData).slice(0, supplierLimit),
    categorySpend: limitCategoryData(toSortedChartData(categoryData), categoryLimit),
  };
}
