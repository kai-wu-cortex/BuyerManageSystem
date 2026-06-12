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

function normalizeCategory(rawCategory: unknown): string {
  const category = String(rawCategory || '').trim();
  if (!category || category === '其它') return '其他';

  const hasNumber = /\d/.test(category);
  const looksLikeSpecOrDepartment =
    /规格|事业部|部门|^NO\.?/i.test(category) ||
    (hasNumber && (
      /[宽高长厚Φφ*×/]/.test(category) ||
      /(mm|cm|kg|g|pcs)/i.test(category)
    ));

  if (looksLikeSpecOrDepartment) {
    return '其他';
  }

  return category.length <= 8 ? category : '其他';
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
    const grossLineAmounts = po.items.map(item => getLineGrossAmount(item.orderedQty, item.price));
    const grossTotal = grossLineAmounts.reduce((sum, amount) => sum + amount, 0);
    if (grossTotal <= 0) continue;

    const discountRate = Math.max(0, Math.min(100, toFiniteNumber(po.discountRate)));
    const afterRateTotal = grossTotal * (1 - discountRate / 100);
    const discountAmount = Math.max(0, Math.min(afterRateTotal, toFiniteNumber(po.discountAmount)));
    const netTotal = roundCurrency(Math.max(0, afterRateTotal - discountAmount));
    if (netTotal <= 0) continue;

    const month = String(po.date || '').substring(0, 7) || '未知月份';
    const supplier = String(po.supplier || '').trim() || '未知供应商';
    addAmount(monthlyData, month, netTotal);
    addAmount(supplierData, supplier, netTotal);
    totalAmount += netTotal;

    po.items.forEach((item, index) => {
      const grossLineAmount = grossLineAmounts[index] || 0;
      if (grossLineAmount <= 0) return;
      const proportionalNetAmount = roundCurrency(netTotal * (grossLineAmount / grossTotal));
      addAmount(categoryData, normalizeCategory(item.category), proportionalNetAmount);
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
