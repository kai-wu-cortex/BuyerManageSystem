import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { normalizeUnit, normalizeTaxIncludedCnyPrice, deriveQuotationDisplayStatus } from './normalization';

describe('normalizeUnit', () => {
  it('resolves known aliases', () => {
    assert.deepEqual(normalizeUnit('PCS'), { canonical: '个', dimension: 'count' });
    assert.deepEqual(normalizeUnit('kg'), { canonical: '千克', dimension: 'weight' });
    assert.deepEqual(normalizeUnit('米'), { canonical: '米', dimension: 'length' });
    assert.deepEqual(normalizeUnit('升'), { canonical: '升', dimension: 'volume' });
  });

  it('returns canonical for Chinese terms', () => {
    assert.deepEqual(normalizeUnit('个'), { canonical: '个', dimension: 'count' });
    assert.deepEqual(normalizeUnit('千克'), { canonical: '千克', dimension: 'weight' });
  });

  it('preserves unknown units', () => {
    assert.deepEqual(normalizeUnit('xyz'), { canonical: 'xyz', dimension: 'unknown' });
  });
});

describe('normalizeTaxIncludedCnyPrice', () => {
  it('converts tax-excluded USD to CNY per unit', () => {
    const result = normalizeTaxIncludedCnyPrice({
      sourceUnitPrice: 100,
      currency: 'USD',
      exchangeRateToCny: 7.2,
      priceTaxMode: 'tax_excluded',
      taxRate: 13,
      sourcePackageQuantity: 10,
      sourceUnit: '箱',
      normalizedUnit: '箱',
    });
    assert.equal(result, 81.36);
  });

  it('handles tax-included prices (no tax multiplication)', () => {
    const result = normalizeTaxIncludedCnyPrice({
      sourceUnitPrice: 100,
      currency: 'CNY',
      exchangeRateToCny: 1,
      priceTaxMode: 'tax_included',
      taxRate: 13,
      sourcePackageQuantity: 10,
      sourceUnit: '个',
      normalizedUnit: '个',
    });
    assert.equal(result, 10);
  });

  it('rounds to six decimals', () => {
    const result = normalizeTaxIncludedCnyPrice({
      sourceUnitPrice: 1,
      currency: 'USD',
      exchangeRateToCny: 7.2,
      priceTaxMode: 'tax_excluded',
      taxRate: 13,
      sourcePackageQuantity: 3,
      sourceUnit: '个',
      normalizedUnit: '个',
    });
    assert.equal(result, 2.712);
  });

  it('throws on zero package quantity', () => {
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
      /sourcePackageQuantity must be positive/,
    );
  });

  it('throws on negative package quantity', () => {
    assert.throws(
      () => normalizeTaxIncludedCnyPrice({
        sourceUnitPrice: 10,
        currency: 'CNY',
        exchangeRateToCny: 1,
        priceTaxMode: 'tax_included',
        taxRate: 13,
        sourcePackageQuantity: -5,
        sourceUnit: '个',
        normalizedUnit: '个',
      }),
      /sourcePackageQuantity must be positive/,
    );
  });

  it('throws on different dimensions', () => {
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
  });

  it('allows same-dimension cross-unit conversion', () => {
    const result = normalizeTaxIncludedCnyPrice({
      sourceUnitPrice: 20,
      currency: 'CNY',
      exchangeRateToCny: 1,
      priceTaxMode: 'tax_included',
      taxRate: 13,
      sourcePackageQuantity: 1,
      sourceUnit: 'kg',
      normalizedUnit: '千克',
    });
    assert.equal(result, 20);
  });
});

describe('deriveQuotationDisplayStatus', () => {
  it('returns non-active statuses unchanged', () => {
    assert.equal(deriveQuotationDisplayStatus('parsing', null), 'parsing');
    assert.equal(deriveQuotationDisplayStatus('voided', null), 'voided');
  });

  it('returns active when no validUntil', () => {
    assert.equal(deriveQuotationDisplayStatus('active', null), 'active');
  });

  it('returns active when not expired', () => {
    assert.equal(
      deriveQuotationDisplayStatus('active', '2026-12-31', '2026-06-13'),
      'active',
    );
  });

  it('returns expired when past validUntil', () => {
    assert.equal(
      deriveQuotationDisplayStatus('active', '2026-01-01', '2026-06-13'),
      'expired',
    );
  });
});
