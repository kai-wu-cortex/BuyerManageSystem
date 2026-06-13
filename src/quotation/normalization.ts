import type {
  PriceTaxMode,
  QuotationDisplayStatus,
  QuotationWorkflowStatus,
} from './types';

export interface NormalizePriceInput {
  sourceUnitPrice: number;
  currency: string;
  exchangeRateToCny: number;
  priceTaxMode: PriceTaxMode;
  taxRate: number;
  sourcePackageQuantity: number;
  sourceUnit: string;
  normalizedUnit: string;
}

type NormalizedUnit = {
  canonical: string;
  dimension: 'count' | 'mass' | 'length' | 'area' | 'volume' | 'unknown';
};

const UNIT_ALIASES: Record<string, NormalizedUnit> = {
  pcs: { canonical: '个', dimension: 'count' },
  pc: { canonical: '个', dimension: 'count' },
  个: { canonical: '个', dimension: 'count' },
  件: { canonical: '个', dimension: 'count' },
  只: { canonical: '个', dimension: 'count' },
  片: { canonical: '个', dimension: 'count' },
  箱: { canonical: '个', dimension: 'count' },
  包: { canonical: '个', dimension: 'count' },
  kg: { canonical: '千克', dimension: 'mass' },
  千克: { canonical: '千克', dimension: 'mass' },
  公斤: { canonical: '千克', dimension: 'mass' },
  g: { canonical: '克', dimension: 'mass' },
  克: { canonical: '克', dimension: 'mass' },
  m: { canonical: '米', dimension: 'length' },
  米: { canonical: '米', dimension: 'length' },
  cm: { canonical: '厘米', dimension: 'length' },
  厘米: { canonical: '厘米', dimension: 'length' },
  'm2': { canonical: '平方米', dimension: 'area' },
  '㎡': { canonical: '平方米', dimension: 'area' },
  平方米: { canonical: '平方米', dimension: 'area' },
  l: { canonical: '升', dimension: 'volume' },
  升: { canonical: '升', dimension: 'volume' },
  ml: { canonical: '毫升', dimension: 'volume' },
  毫升: { canonical: '毫升', dimension: 'volume' },
};

export function normalizeUnit(unit: string): NormalizedUnit {
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, '');
  return UNIT_ALIASES[normalized] ?? { canonical: unit.trim(), dimension: 'unknown' };
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}必须是有效的非负数。`);
  }
}

export function normalizeTaxIncludedCnyPrice(input: NormalizePriceInput): number {
  assertFiniteNonNegative(input.sourceUnitPrice, '原始单价');
  assertFiniteNonNegative(input.taxRate, '税率');
  if (!Number.isFinite(input.exchangeRateToCny) || input.exchangeRateToCny <= 0) {
    throw new Error('人民币汇率必须大于 0。');
  }
  if (!Number.isFinite(input.sourcePackageQuantity) || input.sourcePackageQuantity <= 0) {
    throw new Error('包装数量必须大于 0。');
  }

  const currency = input.currency.trim().toUpperCase();
  if (currency === 'CNY' && input.exchangeRateToCny !== 1) {
    throw new Error('人民币汇率必须为 1。');
  }

  const source = normalizeUnit(input.sourceUnit);
  const target = normalizeUnit(input.normalizedUnit);
  if (source.dimension === 'unknown' || target.dimension === 'unknown') {
    throw new Error('计量单位缺少明确的换算维度。');
  }
  if (source.dimension !== target.dimension) {
    throw new Error('不同量纲的计量单位不能自动换算。');
  }

  const taxMultiplier = input.priceTaxMode === 'tax_excluded'
    ? 1 + input.taxRate / 100
    : 1;
  const normalized = (
    input.sourceUnitPrice
    * input.exchangeRateToCny
    * taxMultiplier
  ) / input.sourcePackageQuantity;

  return Math.round((normalized + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function deriveQuotationDisplayStatus(
  status: QuotationWorkflowStatus,
  validUntil: string | null,
  today = new Date().toISOString().slice(0, 10),
): QuotationDisplayStatus {
  if (status !== 'active' || !validUntil) {
    return status;
  }
  return validUntil < today ? 'expired' : status;
}
