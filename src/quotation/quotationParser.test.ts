import assert from 'node:assert/strict';
import { rowsToQuotationDraft, validateParsedQuotation } from './quotationParser';

const draft = rowsToQuotationDraft([
  ['供应商', '华东包装有限公司'],
  ['报价日期', '2026-06-10'],
  ['币种', 'CNY'],
  ['税率', '13%'],
  [],
  ['产品编码', '产品名称', '规格', '单位', '包装数量', '单价', 'MOQ', '交期'],
  ['BX-01', '瓦楞纸箱', '600x400x350', '箱', 20, 94.4, 500, 7],
]);

assert.equal(draft.supplierName, '华东包装有限公司');
assert.equal(draft.items.length, 1);
assert.equal(draft.items[0].sourceProductCode, 'BX-01');
assert.equal(draft.items[0].sourceUnitPrice, 94.4);
assert.equal(draft.items[0].sourcePackageQuantity, 20);

const invalid = validateParsedQuotation({
  supplierName: '',
  quotationDate: '',
  currency: '',
  exchangeRateToCny: 0,
  taxRate: 13,
  priceTaxMode: 'tax_included',
  items: [{
    sourceProductCode: '',
    sourceProductName: '测试产品',
    sourceSpecification: '',
    sourceUnit: '',
    sourcePackageDescription: '',
    sourcePackageQuantity: null,
    sourceUnitPrice: null,
    minimumOrderQuantity: null,
    lineLeadTimeDays: null,
    fieldConfidence: {},
  }],
});

assert.equal(invalid.valid, false);
assert.ok(invalid.issues.some(issue => issue.field === 'supplierName' && issue.blocking));
assert.ok(invalid.issues.some(issue => issue.field === 'items.0.sourceUnitPrice' && issue.blocking));
assert.equal(invalid.value.items[0].sourceUnitPrice, null);

console.log('quotation parser tests passed');
