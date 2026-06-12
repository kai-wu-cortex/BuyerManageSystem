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
assert.equal(
  getQuotationFileDisposition('application/vnd.ms-excel', '佰仕特报价单.xls'),
  "attachment; filename=\"quotation-file.xls\"; filename*=UTF-8''%E4%BD%B0%E4%BB%95%E7%89%B9%E6%8A%A5%E4%BB%B7%E5%8D%95.xls",
);

console.log('quotation file policy tests passed');
