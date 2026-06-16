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

// === 纯数字 ID 场景（型号 8516）===

// 1) 客户端 reconcile：name 和 code 都为空但 raw 是数字 → name=raw
const numericIdReconcile = reconcileItemAgainstRaw({
  sourceProductCode: '',
  sourceProductName: '',
  sourceSpecification: '',
  sourceUnit: '',
  sourcePackageDescription: '',
  sourcePackageQuantity: 1,
  sourceUnitPrice: 12.5,
  minimumOrderQuantity: null,
  lineLeadTimeDays: null,
  sourceRawText: '8516',
  fieldConfidence: {},
});
assert.equal(numericIdReconcile.recovered, true);
assert.equal(numericIdReconcile.item.sourceProductName, '8516');
assert.equal(numericIdReconcile.item.sourceSpecification, '');

// 2) Gemini 返回 name 空、code 空、raw="8516" → 自动顶到 name
const numericValidation = validateParsedQuotation({
  supplierName: '某公司',
  quotationDate: '2026-06-10',
  currency: 'CNY',
  exchangeRateToCny: 1,
  taxRate: 13,
  priceTaxMode: 'tax_included',
  items: [{
    sourceProductCode: '',
    sourceProductName: '',
    sourceSpecification: '',
    sourceUnit: 'kg',
    sourcePackageDescription: '',
    sourcePackageQuantity: 1,
    sourceUnitPrice: 100,
    minimumOrderQuantity: null,
    lineLeadTimeDays: null,
    sourceRawText: '8516',
    fieldConfidence: {},
  }],
});
assert.equal(numericValidation.value.items[0].sourceProductName, '8516');

// 3) Gemini 返回时把 8516 当成 number → text() 兜底转字符串
const numberAsName = validateParsedQuotation({
  supplierName: '某公司', quotationDate: '2026-06-10', currency: 'CNY',
  exchangeRateToCny: 1, taxRate: 13, priceTaxMode: 'tax_included',
  items: [{
    sourceProductCode: '',
    sourceProductName: 8516 as unknown as string, // 模型偷懒返回数字
    sourceSpecification: '0.5mm',
    sourceUnit: 'kg', sourcePackageDescription: '',
    sourcePackageQuantity: 1, sourceUnitPrice: 100,
    minimumOrderQuantity: null, lineLeadTimeDays: null,
    sourceRawText: '8516 0.5mm',
    fieldConfidence: {},
  }],
});
assert.equal(numberAsName.value.items[0].sourceProductName, '8516');

// 4) 内部算法：纯数字型号列也要被保留（不会因为 name 列为空而误删）
const numericRowsDraft = rowsToQuotationDraft([
  ['产品编码', '产品名称', '规格', '单位', '包装数量', '单价'],
  ['', '8516', '', 'kg', 10, 25.5],         // 名字本身是 8516
  ['', '', '3025', 'kg', 5, 30.0],          // name 空、规格列="3025"（也是 ID）
]);
assert.equal(numericRowsDraft.items.length, 2, '纯数字 ID 行不能被过滤掉');
assert.equal(numericRowsDraft.items[0].sourceProductName, '8516');
// row 2: name 空，但 spec="3025" → 兜底把 raw 顶给 name
assert.match(numericRowsDraft.items[1].sourceProductName, /3025/);
assert.match(numericRowsDraft.items[1].sourceRawText ?? '', /3025/);

// 5) 前导零保留（"008516" ≠ 8516）
const leadingZero = validateParsedQuotation({
  supplierName: '某公司', quotationDate: '2026-06-10', currency: 'CNY',
  exchangeRateToCny: 1, taxRate: 13, priceTaxMode: 'tax_included',
  items: [{
    sourceProductCode: '008516',
    sourceProductName: '008516',
    sourceSpecification: '',
    sourceUnit: 'kg', sourcePackageDescription: '',
    sourcePackageQuantity: 1, sourceUnitPrice: 100,
    minimumOrderQuantity: null, lineLeadTimeDays: null,
    sourceRawText: '008516',
    fieldConfidence: {},
  }],
});
assert.equal(leadingZero.value.items[0].sourceProductName, '008516', '前导零必须保留');
assert.equal(leadingZero.value.items[0].sourceProductCode, '008516');

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
