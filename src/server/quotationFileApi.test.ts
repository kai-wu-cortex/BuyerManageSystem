import assert from 'node:assert/strict';
import { isAllowedQuotationFile } from './quotationFileApi';

assert.equal(isAllowedQuotationFile('supplier-quotes/2026-06/quote.pdf', 'application/pdf'), true);
assert.equal(
  isAllowedQuotationFile(
    'supplier-quotes/2026-06/quote.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ),
  true,
);
assert.equal(isAllowedQuotationFile('supplier-quotes/2026-06/quote.exe', 'application/octet-stream'), false);
assert.equal(isAllowedQuotationFile('other/quote.pdf', 'application/pdf'), false);

console.log('quotation file policy tests passed');
