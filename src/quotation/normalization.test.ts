import assert from 'node:assert/strict';
import {
  deriveQuotationDisplayStatus,
  normalizeTaxIncludedCnyPrice,
  normalizeUnit,
} from './normalization';

assert.equal(
  normalizeTaxIncludedCnyPrice({
    sourceUnitPrice: 100,
    currency: 'USD',
    exchangeRateToCny: 7.2,
    priceTaxMode: 'tax_excluded',
    taxRate: 13,
    sourcePackageQuantity: 10,
    sourceUnit: '箱',
    normalizedUnit: '个',
  }),
  81.36,
);

assert.equal(
  normalizeTaxIncludedCnyPrice({
    sourceUnitPrice: 12.3456789,
    currency: 'CNY',
    exchangeRateToCny: 1,
    priceTaxMode: 'tax_included',
    taxRate: 13,
    sourcePackageQuantity: 1,
    sourceUnit: 'PCS',
    normalizedUnit: '个',
  }),
  12.345679,
);

assert.throws(
  () => normalizeTaxIncludedCnyPrice({
    sourceUnitPrice: 10,
    currency: 'CNY',
    exchangeRateToCny: 1,
    priceTaxMode: 'tax_included',
    taxRate: 13,
    sourcePackageQuantity: 1,
    sourceUnit: 'kg',
    normalizedUnit: '个',
  }),
  /不同量纲/,
);

assert.throws(
  () => normalizeTaxIncludedCnyPrice({
    sourceUnitPrice: 10,
    currency: 'CNY',
    exchangeRateToCny: 1.2,
    priceTaxMode: 'tax_included',
    taxRate: 13,
    sourcePackageQuantity: 1,
    sourceUnit: '个',
    normalizedUnit: '个',
  }),
  /人民币汇率必须为 1/,
);

assert.throws(
  () => normalizeTaxIncludedCnyPrice({
    sourceUnitPrice: 10,
    currency: 'CNY',
    exchangeRateToCny: 1,
    priceTaxMode: 'tax_included',
    taxRate: 13,
    sourcePackageQuantity: 0,
    sourceUnit: '个',
    normalizedUnit: '个',
  }),
  /包装数量必须大于 0/,
);

assert.deepEqual(normalizeUnit('KG'), { canonical: '千克', dimension: 'mass' });
assert.deepEqual(normalizeUnit('pcs'), { canonical: '个', dimension: 'count' });
assert.equal(deriveQuotationDisplayStatus('active', '2026-06-11', '2026-06-12'), 'expired');
assert.equal(deriveQuotationDisplayStatus('active', '2026-06-12', '2026-06-12'), 'active');
assert.equal(deriveQuotationDisplayStatus('voided', '2026-06-11', '2026-06-12'), 'voided');

console.log('quotation normalization tests passed');
