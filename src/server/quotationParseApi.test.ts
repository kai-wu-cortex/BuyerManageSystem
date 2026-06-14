import assert from 'node:assert/strict';
import { BASE_QUOTATION_PARSE_INSTRUCTION, isRetryableQuotationParseStatus } from './quotationParseApi';

assert.equal(isRetryableQuotationParseStatus(429), true);
assert.equal(isRetryableQuotationParseStatus(500), true);
assert.equal(isRetryableQuotationParseStatus(503), true);
assert.equal(isRetryableQuotationParseStatus(400), false);
assert.equal(isRetryableQuotationParseStatus(401), false);
assert.equal(isRetryableQuotationParseStatus(422), false);
assert.match(BASE_QUOTATION_PARSE_INSTRUCTION, /镭射银LB100/);
assert.match(BASE_QUOTATION_PARSE_INSTRUCTION, /必须完整保留在 sourceProductName/);

console.log('quotation parse retry tests passed');
