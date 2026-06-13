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

const seriesDraft = rowsToQuotationDraft([
  ['序号', '产品系列图片', '系列名称', '包装方式', '箱规', '内包装尺寸/容量', '价格'],
  [1, '', '幻彩系列', '袋装', 24, '100g', 18.5],
]);

assert.equal(seriesDraft.items.length, 1);
assert.equal(seriesDraft.items[0].sourceProductName, '幻彩系列');
assert.equal(seriesDraft.items[0].sourcePackageDescription, '袋装');
assert.equal(seriesDraft.items[0].sourcePackageQuantity, 24);
assert.equal(seriesDraft.items[0].sourceUnitPrice, 18.5);

const matrixDraft = rowsToQuotationDraft([
  ['常用颜色以黄色标注价格为准', '', '东莞市佰仕特工艺制品有限公司', '', '', '', '', '', '$/KG'],
  ['序号', '产品名称/编号', '厚度', '1/128-1/8', '', '1/170', '1/256'],
  ['', '', '', '25kg以下', '25kg以上'],
  [1, '白片 B1100', '25U', '2.50', '', '3.50', '3.67'],
  [2, '银色系列 B0100', '16U', '5.00', '4.83', '5.33', '6.33'],
  ['', '', '25U', '3.00', '2.67', '3.50', '4.17'],
]);

assert.equal(matrixDraft.supplierName, '东莞市佰仕特工艺制品有限公司');
assert.equal(matrixDraft.currency, 'USD');
assert.equal(matrixDraft.items.length, 11);
assert.equal(matrixDraft.items[0].sourceProductName, '白片 B1100');
assert.equal(matrixDraft.items[0].sourceUnit, 'KG');
assert.equal(matrixDraft.items[0].sourceUnitPrice, 2.5);
assert.match(matrixDraft.items[0].sourceSpecification, /25U/);
assert.match(matrixDraft.items[0].sourcePackageDescription, /1\/128-1\/8/);
assert.equal(matrixDraft.items.at(-1)?.sourceProductName, '银色系列 B0100');

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
