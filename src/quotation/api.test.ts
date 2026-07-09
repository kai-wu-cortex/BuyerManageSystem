import assert from 'node:assert/strict';
import { clearQuotationCache, loadQuotationItems, loadQuotationWorkspace, saveQuotationDraft } from './api';
import type { QuotationDraft, SupplierQuotationItem } from './types';

const now = '2026-06-14T08:00:00.000Z';
const makeItem = (id: string, name: string): SupplierQuotationItem => ({
  id,
  quotationId: 'quote-1',
  lineNumber: 1,
  sourceProductCode: '',
  sourceProductName: name,
  sourceSpecification: '',
  sourceUnit: 'KG',
  sourcePackageDescription: '',
  sourcePackageQuantity: null,
  sourceUnitPrice: 73,
  minimumOrderQuantity: null,
  lineLeadTimeDays: null,
  productGroupId: null,
  groupMatchStatus: 'unmatched',
  normalizedQuantity: null,
  normalizedUnit: null,
  normalizedTaxIncludedCnyPrice: null,
  normalizationDetails: null,
  fieldConfidence: {},
  reviewIssues: [],
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
});

const draft: QuotationDraft = {
  quotation: {
    id: 'quote-1',
    supplierId: 'supplier-1',
    quotationNumber: 'fengcai',
    quotationDate: '2026-06-14',
    validUntil: null,
    currency: 'CNY',
    exchangeRateToCny: 1,
    taxRate: 0,
    priceTaxMode: 'tax_included',
    paymentTerms: '',
    leadTimeDays: null,
    status: 'review_required',
    sourceFile: {
      id: 'file-1',
      pathname: 'supplier-quotes/test.png',
      fileName: 'test.png',
      mimeType: 'image/png',
      size: 1,
      checksum: '',
    },
    parseJobId: null,
    version: 1,
    confirmedBy: null,
    confirmedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  },
  items: [makeItem('new-item', '镭射银LB100')],
};

const previousItems = [makeItem('old-item', '旧产品')];
const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  requests.push({
    url: String(input),
    body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
  });
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

await saveQuotationDraft(draft, previousItems);

const savedNewItem = requests.find(request => request.url.endsWith('/supplier_quotation_items/new-item'));
assert.equal(savedNewItem?.body.sourceProductName, '镭射银LB100');
const deletedOldItem = requests.find(request => request.url.endsWith('/supplier_quotation_items/old-item'));
assert.equal(typeof deletedOldItem?.body.deletedAt, 'string', 'replaced quotation items should soft-delete stale records');

globalThis.fetch = originalFetch;

const loadRequests: string[] = [];
clearQuotationCache();
globalThis.fetch = (async (input: string | URL | Request) => {
  loadRequests.push(String(input));
  return new Response(JSON.stringify({ success: true, data: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

await loadQuotationWorkspace();
const firstWorkspaceRequestCount = loadRequests.length;
assert.equal(
  loadRequests.some(url => url.includes('/supplier_quotation_items') && !url.includes('quotationId=')),
  false,
  'quotation archive initial load should not fetch all quotation item rows',
);

await loadQuotationWorkspace();
assert.equal(
  loadRequests.length,
  firstWorkspaceRequestCount,
  're-entering quotation archive in the same session should use the cached quotation workspace',
);

await loadQuotationWorkspace({ force: true });
assert.equal(
  loadRequests.length,
  firstWorkspaceRequestCount * 2,
  'explicit refresh should reload quotation workspace from the server',
);

await loadQuotationItems('quote-1');
assert.equal(
  loadRequests.some(url => url.includes('/supplier_quotation_items') && url.includes('quotationId=quote-1')),
  true,
  'quotation item rows should be loaded lazily for the selected quotation',
);

globalThis.fetch = originalFetch;

console.log('quotation api tests passed');
