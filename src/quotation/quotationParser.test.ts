import assert from 'node:assert/strict';
import {
  findMissingRawTokens,
  reconcileItemAgainstRaw,
  rowsToQuotationDraft,
  tokenizeForLossCheck,
  validateParsedQuotation,
} from './quotationParser';

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

// === 无损保留 (lossless retention) ===

// tokenize：中文逐字 + 英数字按段
assert.deepEqual(tokenizeForLossCheck('镭射银LB100'), ['镭', '射', '银', 'LB100']);
assert.deepEqual(tokenizeForLossCheck('Φ50×3mm L=6m'), ['50', '3mm', 'L', '6m']);
assert.deepEqual(tokenizeForLossCheck(''), []);

// findMissingRawTokens：无丢失
assert.deepEqual(
  findMissingRawTokens('镭射银LB100', '镭射银LB100'),
  { missing: [], missingText: '' },
);
// 完整覆盖（顺序无关）
assert.deepEqual(
  findMissingRawTokens('镭射银LB100', 'LB100 镭射银'),
  { missing: [], missingText: '' },
);
// LB100 被丢掉
const lostId = findMissingRawTokens('镭射银LB100', '镭射银');
assert.deepEqual(lostId.missing, ['LB100']);
assert.equal(lostId.missingText, 'LB100');
// 多个连续中文片段被合并
const lostChinese = findMissingRawTokens('幻彩系列LB100', 'LB100');
assert.deepEqual(lostChinese.missing, ['幻', '彩', '系', '列']);
assert.equal(lostChinese.missingText, '幻彩系列');

// reconcileItemAgainstRaw：自动把丢失的 ID 补回 spec
const reconciled = reconcileItemAgainstRaw({
  sourceProductCode: '',
  sourceProductName: '镭射银',
  sourceSpecification: '0.5mm',
  sourceUnit: 'kg',
  sourcePackageDescription: '',
  sourcePackageQuantity: 1,
  sourceUnitPrice: 100,
  minimumOrderQuantity: null,
  lineLeadTimeDays: null,
  sourceRawText: '镭射银LB100 0.5mm',
  fieldConfidence: {},
});
assert.equal(reconciled.recovered, true);
assert.equal(reconciled.recoveredText, 'LB100');
assert.equal(reconciled.item.sourceSpecification, '0.5mm | LB100');
assert.equal(reconciled.item.sourceProductName, '镭射银'); // name 保持原样

// 没有 sourceRawText → 直接返回
const noRaw = reconcileItemAgainstRaw({
  sourceProductCode: '', sourceProductName: 'X', sourceSpecification: '',
  sourceUnit: '', sourcePackageDescription: '',
  sourcePackageQuantity: null, sourceUnitPrice: null,
  minimumOrderQuantity: null, lineLeadTimeDays: null,
  fieldConfidence: {},
});
assert.equal(noRaw.recovered, false);

// validateParsedQuotation 集成：sourceRawText 透传 + 自动 reconcile
const losslessValidation = validateParsedQuotation({
  supplierName: '某公司',
  quotationDate: '2026-06-10',
  currency: 'CNY',
  exchangeRateToCny: 1,
  taxRate: 13,
  priceTaxMode: 'tax_included',
  items: [{
    sourceProductCode: '',
    sourceProductName: '镭射银',          // ❌ 丢了 LB100
    sourceSpecification: '',
    sourceUnit: 'kg',
    sourcePackageDescription: '',
    sourcePackageQuantity: 1,
    sourceUnitPrice: 100,
    minimumOrderQuantity: null,
    lineLeadTimeDays: null,
    sourceRawText: '镭射银LB100',         // 原文里有 LB100
    fieldConfidence: {},
  }],
});
// reconcile 后 LB100 进入 spec，原始文本被保留
assert.equal(losslessValidation.value.items[0].sourceSpecification, 'LB100');
assert.equal(losslessValidation.value.items[0].sourceRawText, '镭射银LB100');

// rowsToQuotationDraft 也填充 sourceRawText
const rawTextDraft = rowsToQuotationDraft([
  ['产品编码', '产品名称', '规格', '单位', '包装数量', '单价'],
  ['LB-100', '镭射银LB100', '0.5mm 蓝色', 'kg', 1, 12.5],
]);
assert.equal(rawTextDraft.items.length, 1);
assert.ok(rawTextDraft.items[0].sourceRawText, 'sourceRawText 应被填充');
assert.match(rawTextDraft.items[0].sourceRawText!, /镭射银LB100/);
assert.match(rawTextDraft.items[0].sourceRawText!, /0\.5mm 蓝色/);

console.log('quotation parser tests passed');
