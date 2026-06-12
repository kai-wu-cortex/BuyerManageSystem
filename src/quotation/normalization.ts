import type {
  NormalizePriceInput,
  QuotationWorkflowStatus,
  PriceTaxMode,
} from './types';

const UNIT_ALIASES: Record<string, { canonical: string; dimension: string }> = {
  '个': { canonical: '个', dimension: 'count' },
  'pcs': { canonical: '个', dimension: 'count' },
  '件': { canonical: '个', dimension: 'count' },
  '只': { canonical: '个', dimension: 'count' },
  '支': { canonical: '个', dimension: 'count' },
  '条': { canonical: '个', dimension: 'count' },
  '根': { canonical: '个', dimension: 'count' },
  '把': { canonical: '个', dimension: 'count' },
  '双': { canonical: '双', dimension: 'count' },
  '对': { canonical: '对', dimension: 'count' },
  'kg': { canonical: '千克', dimension: 'weight' },
  '千克': { canonical: '千克', dimension: 'weight' },
  '公斤': { canonical: '千克', dimension: 'weight' },
  'g': { canonical: '克', dimension: 'weight' },
  '克': { canonical: '克', dimension: 'weight' },
  '吨': { canonical: '吨', dimension: 'weight' },
  't': { canonical: '吨', dimension: 'weight' },
  'l': { canonical: '升', dimension: 'volume' },
  '升': { canonical: '升', dimension: 'volume' },
  'ml': { canonical: '毫升', dimension: 'volume' },
  '毫升': { canonical: '毫升', dimension: 'volume' },
  '箱': { canonical: '箱', dimension: 'package' },
  '包': { canonical: '包', dimension: 'package' },
  '袋': { canonical: '袋', dimension: 'package' },
  '桶': { canonical: '桶', dimension: 'package' },
  '卷': { canonical: '卷', dimension: 'package' },
  '盒': { canonical: '盒', dimension: 'package' },
  '瓶': { canonical: '瓶', dimension: 'package' },
  'm': { canonical: '米', dimension: 'length' },
  '米': { canonical: '米', dimension: 'length' },
  'mm': { canonical: '毫米', dimension: 'length' },
  '毫米': { canonical: '毫米', dimension: 'length' },
  'cm': { canonical: '厘米', dimension: 'length' },
  '厘米': { canonical: '厘米', dimension: 'length' },
  'yd': { canonical: '码', dimension: 'length' },
  '码': { canonical: '码', dimension: 'length' },
  'ft': { canonical: '英尺', dimension: 'length' },
  '英尺': { canonical: '英尺', dimension: 'length' },
  'in': { canonical: '英寸', dimension: 'length' },
  '英寸': { canonical: '英寸', dimension: 'length' },
  'm²': { canonical: '平方米', dimension: 'area' },
  '平方米': { canonical: '平方米', dimension: 'area' },
  'cm²': { canonical: '平方厘米', dimension: 'area' },
  '平方厘米': { canonical: '平方厘米', dimension: 'area' },
  'm³': { canonical: '立方米', dimension: 'volume' },
  '立方米': { canonical: '立方米', dimension: 'volume' },
  '片': { canonical: '片', dimension: 'count' },
  '块': { canonical: '块', dimension: 'count' },
  '枚': { canonical: '枚', dimension: 'count' },
  '台': { canonical: '台', dimension: 'count' },
  '套': { canonical: '套', dimension: 'count' },
  '组': { canonical: '组', dimension: 'count' },
  '打': { canonical: '打', dimension: 'count' },
  '罗': { canonical: '罗', dimension: 'count' },
  '令': { canonical: '令', dimension: 'count' },
};

export function normalizeUnit(unit: string): { canonical: string; dimension: string } {
  const key = unit.toLowerCase().trim();
  return UNIT_ALIASES[key] ?? { canonical: unit, dimension: 'unknown' };
}

function roundToSixDecimals(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function normalizeTaxIncludedCnyPrice(input: NormalizePriceInput): number {
  if (input.sourcePackageQuantity <= 0) {
    throw new Error('sourcePackageQuantity must be positive');
  }

  const sourceNorm = normalizeUnit(input.sourceUnit);
  const targetNorm = normalizeUnit(input.normalizedUnit);

  if (sourceNorm.dimension !== targetNorm.dimension) {
    throw new Error(`不同量纲: ${input.sourceUnit}(${sourceNorm.dimension}) → ${input.normalizedUnit}(${targetNorm.dimension})`);
  }

  const taxMultiplier: number =
    input.priceTaxMode === 'tax_excluded' ? 1 + input.taxRate / 100 : 1;

  const cnyPackagePrice = input.sourceUnitPrice * input.exchangeRateToCny * taxMultiplier;
  const normalized = cnyPackagePrice / input.sourcePackageQuantity;

  return roundToSixDecimals(normalized);
}

export function deriveQuotationDisplayStatus(
  status: QuotationWorkflowStatus,
  validUntil: string | null,
  today?: string,
): QuotationWorkflowStatus | 'expired' {
  if (status !== 'active') return status;
  if (!validUntil) return 'active';

  const todayMs = today ? new Date(today).getTime() : Date.now();
  const validUntilMs = new Date(validUntil).getTime();

  return todayMs > validUntilMs ? 'expired' : 'active';
}
