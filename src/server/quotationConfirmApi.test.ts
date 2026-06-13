import assert from 'node:assert/strict';
import { prepareConfirmedQuotation } from './quotationConfirmApi';
import type { QuotationDraft } from '../quotation/types';

const now = '2026-06-12T00:00:00.000Z';
const draft: QuotationDraft = {
  quotation: {
    id: 'quote-1',
    supplierId: 'supplier-1',
    quotationNumber: 'Q-001',
    quotationDate: '2026-06-12',
    validUntil: '2026-07-12',
    currency: 'USD',
    exchangeRateToCny: 7.2,
    taxRate: 13,
    priceTaxMode: 'tax_excluded',
    paymentTerms: '月结30天',
    leadTimeDays: 7,
    status: 'review_required',
    sourceFile: {
      id: 'file-1',
      pathname: 'supplier-quotes/2026-06/test.pdf',
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 100,
      checksum: 'abc',
    },
    parseJobId: null,
    version: 1,
    confirmedBy: null,
    confirmedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  },
  items: [{
    id: 'item-1',
    quotationId: 'quote-1',
    lineNumber: 1,
    sourceProductCode: 'BX-01',
    sourceProductName: '纸箱',
    sourceSpecification: '标准',
    sourceUnit: '箱',
    sourcePackageDescription: '10个/箱',
    sourcePackageQuantity: 10,
    sourceUnitPrice: 100,
    minimumOrderQuantity: 10,
    lineLeadTimeDays: 7,
    productGroupId: null,
    groupMatchStatus: 'unmatched',
    normalizedQuantity: null,
    normalizedUnit: null,
    normalizedTaxIncludedCnyPrice: 0.01,
    normalizationDetails: null,
    fieldConfidence: {},
    reviewIssues: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }],
};

const confirmed = prepareConfirmedQuotation(draft, 'caigou', now);
assert.equal(confirmed.quotation.status, 'active');
assert.equal(confirmed.items[0].normalizedTaxIncludedCnyPrice, 81.36);
assert.equal(confirmed.items[0].normalizedUnit, '箱');

console.log('quotation confirmation tests passed');
