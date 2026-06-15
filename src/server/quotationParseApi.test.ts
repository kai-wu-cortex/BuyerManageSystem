import assert from 'node:assert/strict';
import {
  BASE_QUOTATION_PARSE_INSTRUCTION,
  isRetryableQuotationParseStatus,
  planExcelBatches,
  shouldUseExcelBatching,
} from './quotationParseApi';

assert.equal(isRetryableQuotationParseStatus(429), true);
assert.equal(isRetryableQuotationParseStatus(500), true);
assert.equal(isRetryableQuotationParseStatus(503), true);
assert.equal(isRetryableQuotationParseStatus(400), false);
assert.equal(isRetryableQuotationParseStatus(401), false);
assert.equal(isRetryableQuotationParseStatus(422), false);
assert.match(BASE_QUOTATION_PARSE_INSTRUCTION, /镭射银LB100/);
assert.match(BASE_QUOTATION_PARSE_INSTRUCTION, /必须完整保留在 sourceProductName/);

// === Excel 分批 ===
assert.equal(shouldUseExcelBatching(799), false, '阈值以下不分批');
assert.equal(shouldUseExcelBatching(801), true, '阈值以上分批');
assert.equal(shouldUseExcelBatching(50, 30), true, '可定制阈值');

// 6000 行 / 800 一批 → 8 批，最后一批 800 行
const big = Array.from({ length: 6000 }, (_, i) => `row${i}`);
const batches = planExcelBatches([{ sheetName: 'Sheet1', headerRows: ['hdr'], bodyRows: big }]);
assert.equal(batches.length, Math.ceil(6000 / 800), '6000 行应切成 8 批');
assert.equal(batches[0].rangeStart, 1);
assert.equal(batches[0].rangeEnd, 800);
assert.equal(batches[0].bodyRows.length, 800);
assert.equal(batches[batches.length - 1].rangeEnd, 6000);
// 表头每批都被复用，便于 Gemini 知道字段
for (const batch of batches) assert.deepEqual(batch.headerRows, ['hdr']);

// 多 sheet：每个 sheet 单独切批，sheet 间不混
const twoSheet = planExcelBatches([
  { sheetName: 'A', headerRows: ['ha'], bodyRows: Array.from({ length: 1500 }, (_, i) => `a${i}`) },
  { sheetName: 'B', headerRows: ['hb'], bodyRows: Array.from({ length: 200 }, (_, i) => `b${i}`) },
]);
assert.equal(twoSheet.length, 2 + 1, '1500 行 A → 2 批，200 行 B → 1 批');
assert.equal(twoSheet[0].sheetName, 'A');
assert.equal(twoSheet[1].sheetName, 'A');
assert.equal(twoSheet[2].sheetName, 'B');
assert.equal(twoSheet[2].rangeEnd, 200);

// 空 sheet 跳过，不产生空批
const sparse = planExcelBatches([
  { sheetName: 'Empty', headerRows: ['h'], bodyRows: [] },
  { sheetName: 'OneRow', headerRows: ['h'], bodyRows: ['only'] },
]);
assert.equal(sparse.length, 1);
assert.equal(sparse[0].sheetName, 'OneRow');

// 自定义 batchSize
const small = planExcelBatches(
  [{ sheetName: 'X', headerRows: ['h'], bodyRows: Array.from({ length: 10 }, (_, i) => `r${i}`) }],
  3,
);
assert.equal(small.length, Math.ceil(10 / 3));
assert.equal(small[0].rangeEnd, 3);
assert.equal(small[small.length - 1].rangeEnd, 10);

console.log('quotation parse retry tests passed');

