import assert from 'node:assert/strict';
import { isRetryableQuotationParseStatus } from './quotationParseApi';

assert.equal(isRetryableQuotationParseStatus(429), true);
assert.equal(isRetryableQuotationParseStatus(500), true);
assert.equal(isRetryableQuotationParseStatus(503), true);
assert.equal(isRetryableQuotationParseStatus(400), false);
assert.equal(isRetryableQuotationParseStatus(401), false);
assert.equal(isRetryableQuotationParseStatus(422), false);

console.log('quotation parse retry tests passed');
