import assert from 'node:assert/strict';
import { getQuotationFileDisposition, isAllowedQuotationFile } from './quotationFileApi';

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
assert.equal(getQuotationFileDisposition('application/pdf', 'quote.pdf'), 'inline; filename="quote.pdf"');
assert.equal(getQuotationFileDisposition('image/png', 'quote.png'), 'inline; filename="quote.png"');
assert.equal(
  getQuotationFileDisposition(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'quote.xlsx',
  ),
  'attachment; filename="quote.xlsx"',
);

console.log('quotation file policy tests passed');
