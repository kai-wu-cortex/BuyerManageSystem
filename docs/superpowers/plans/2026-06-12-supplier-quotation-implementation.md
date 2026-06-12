# Supplier Quotation Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-ready supplier quotation mini-app to the existing procurement system, including private source files, AI-assisted parsing, human review, product grouping, standardized pricing, supplier scoring, and version-selected comparison.

**Architecture:** Keep pure quotation rules in focused TypeScript modules, expose authenticated quotation-specific APIs backed by MongoDB, store source files in private Vercel Blob, and lazy-load a new React module from the existing mini-app navigation. Parsing creates editable drafts; only server-validated review confirmation creates active quotations and comparison-ready normalized prices.

**Tech Stack:** React 19, TypeScript, Vite, Express/Vercel Functions, MongoDB Node driver, `@google/genai`, `@vercel/blob`, ExcelJS/SheetJS, Node test assertions, Tailwind CSS 4.

---

## File Map

**Domain and client**

- Create `src/quotation/types.ts`: quotation, item, supplier, product-group, parse-job, comparison and API types.
- Create `src/quotation/normalization.ts`: currency/tax/package/unit normalization.
- Create `src/quotation/quotationParser.ts`: Excel row extraction and parsed-result validation.
- Create `src/quotation/api.ts`: authenticated quotation API client.
- Create `src/quotation/hooks.ts`: module loading, mutation and refresh state.
- Create `src/quotation/normalization.test.ts`: normalization tests.
- Create `src/quotation/quotationParser.test.ts`: parser and schema tests.

**Server**

- Create `src/server/sessionAuth.ts`: signed HttpOnly session cookie helpers and role guard.
- Modify `src/server/loginApi.ts`: issue session cookie.
- Create `src/server/logoutApi.ts`: clear session cookie.
- Create `src/server/quotationApi.ts`: list/detail/save/review/group/score/comparison operations.
- Create `src/server/quotationFileApi.ts`: Blob upload token and authenticated file delivery.
- Create `src/server/quotationParseApi.ts`: Gemini parse task and retry classification.
- Create `src/server/sessionAuth.test.ts`.
- Create `src/server/quotationApi.test.ts`.
- Create `src/server/quotationParseApi.test.ts`.
- Modify `src/server/mongoDataApi.ts`: allow quotation collections only where generic access is still required.
- Modify `server.ts`: mount quotation, auth and file routes.
- Create matching `api/quotation/*` Vercel handlers.

**UI**

- Create `src/components/supplierQuotes/SupplierQuotationApp.tsx`: module shell and archive navigation.
- Create `src/components/supplierQuotes/QuotationArchive.tsx`: filters and quotation table.
- Create `src/components/supplierQuotes/QuotationUploadDialog.tsx`: upload and parse start.
- Create `src/components/supplierQuotes/QuotationReview.tsx`: side-by-side source and editable draft.
- Create `src/components/supplierQuotes/SupplierProfiles.tsx`: supplier score editor.
- Create `src/components/supplierQuotes/ProductGroups.tsx`: suggested/confirmed grouping.
- Create `src/components/supplierQuotes/QuotationComparison.tsx`: version picker and matrix.
- Create `src/components/supplierQuotes/quotationUi.ts`: presentation helpers.
- Modify `src/appModules.tsx`: lazy loader and tab type.
- Modify `src/App.tsx`: navigation item, heading and module render.

**Configuration**

- Modify `package.json`: Blob dependency and test scripts.
- Modify `.env.example`: `BLOB_READ_WRITE_TOKEN` and `SESSION_SECRET`.
- Modify `README.md`: quotation setup and collections.

### Task 1: Quotation Domain Types and Price Normalization

**Files:**
- Create: `src/quotation/types.ts`
- Create: `src/quotation/normalization.ts`
- Create: `src/quotation/normalization.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing normalization tests**

Create assertions for:

```ts
assert.equal(normalizeTaxIncludedCnyPrice({
  sourceUnitPrice: 100,
  currency: 'USD',
  exchangeRateToCny: 7.2,
  priceTaxMode: 'tax_excluded',
  taxRate: 13,
  sourcePackageQuantity: 10,
  sourceUnit: '箱',
  normalizedUnit: '个',
}), 81.36);

assert.throws(
  () => normalizeTaxIncludedCnyPrice({
    sourceUnitPrice: 10,
    currency: 'CNY',
    exchangeRateToCny: 1,
    priceTaxMode: 'tax_included',
    taxRate: 13,
    sourcePackageQuantity: 1,
    sourceUnit: 'kg',
    normalizedUnit: '个',
  }),
  /不同量纲/,
);
```

Also cover tax-included prices, CNY exchange rate enforcement, zero/negative package quantities, rounding to six decimals, and supported aliases (`PCS`/`个`, `KG`/`千克`).

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx src/quotation/normalization.test.ts
```

Expected: FAIL because `src/quotation/normalization.ts` does not exist.

- [ ] **Step 3: Add domain types**

Define string unions for:

```ts
export type QuotationWorkflowStatus = 'parsing' | 'review_required' | 'active' | 'voided';
export type ParseJobStatus = 'queued' | 'processing' | 'review_required' | 'failed' | 'completed';
export type PriceTaxMode = 'tax_included' | 'tax_excluded';
export type GroupMatchStatus = 'unmatched' | 'suggested' | 'confirmed';
```

Define the interfaces from the approved design using camelCase property names and ISO date strings. Add `SourceFileRef`, `NormalizationDetails`, `FieldConfidence`, `ReviewIssue`, `SupplierProfile`, `SupplierQuotation`, `SupplierQuotationItem`, `SupplierProductGroup`, `SupplierQuoteParseJob`, `QuotationDraft`, `ComparisonColumn`, and `ComparisonResult`.

- [ ] **Step 4: Implement minimal normalization**

Expose:

```ts
export function normalizeUnit(unit: string): { canonical: string; dimension: string };
export function normalizeTaxIncludedCnyPrice(input: NormalizePriceInput): number;
export function deriveQuotationDisplayStatus(
  status: QuotationWorkflowStatus,
  validUntil: string | null,
  today?: string,
): QuotationWorkflowStatus | 'expired';
```

Use explicit unit alias maps. Do not infer conversions across dimensions. Formula:

```ts
const taxMultiplier = input.priceTaxMode === 'tax_excluded'
  ? 1 + input.taxRate / 100
  : 1;
const cnyPackagePrice = input.sourceUnitPrice * input.exchangeRateToCny * taxMultiplier;
const normalized = cnyPackagePrice / input.sourcePackageQuantity;
```

- [ ] **Step 5: Run tests and full lint**

Run:

```bash
npx tsx src/quotation/normalization.test.ts
npm run lint
```

Expected: both exit 0.

- [ ] **Step 6: Add the new test to `npm test` and commit**

Append the test command to `package.json`, then:

```bash
git add package.json src/quotation
git commit -m "feat: add quotation price normalization"
```

### Task 2: Server-Verifiable Sessions

**Files:**
- Create: `src/server/sessionAuth.ts`
- Create: `src/server/sessionAuth.test.ts`
- Create: `src/server/logoutApi.ts`
- Modify: `src/server/loginApi.ts`
- Modify: `src/lib/cloudbaseData.ts`
- Modify: `server.ts`
- Create: `api/logout.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing session tests**

Test:

```ts
const token = createSessionToken(
  { uid: 'caigou', username: 'caigou', role: 'caigou' },
  'test-secret',
  new Date('2026-06-12T00:00:00Z'),
);
assert.deepEqual(
  verifySessionToken(token, 'test-secret', new Date('2026-06-12T01:00:00Z')),
  { uid: 'caigou', username: 'caigou', role: 'caigou' },
);
assert.equal(verifySessionToken(`${token}tampered`, 'test-secret'), null);
assert.equal(verifySessionToken(token, 'wrong-secret'), null);
```

Also test cookie parsing, expired tokens and `requireBuyerSession`.

- [ ] **Step 2: Run and verify RED**

```bash
npx tsx src/server/sessionAuth.test.ts
```

Expected: FAIL because session helpers are missing.

- [ ] **Step 3: Implement signed sessions**

Use `node:crypto` HMAC SHA-256 with base64url JSON payload:

```ts
type SessionPayload = {
  uid: string;
  username: string;
  role: 'caigou' | 'caiwu';
  exp: number;
};
```

Expose `createSessionToken`, `verifySessionToken`, `readSessionFromRequest`, `requireSession`, `requireBuyerSession`, `createSessionCookie`, and `createExpiredSessionCookie`. Require `SESSION_SECRET` outside tests and use constant-time signature comparison.

- [ ] **Step 4: Issue and clear cookies**

Update login success to set:

```http
Set-Cookie: buyer_session=<token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800
```

Add `POST /api/logout` that expires the cookie. Update browser fetches to use `credentials: 'same-origin'`; logout must call the endpoint before clearing local compatibility state.

- [ ] **Step 5: Run focused and existing auth/data tests**

```bash
npx tsx src/server/sessionAuth.test.ts
npx tsx src/lib/cloudbaseData.test.ts
npm run lint
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add .env.example api/logout.ts server.ts src/server src/lib/cloudbaseData.ts package.json
git commit -m "feat: add authenticated server sessions"
```

### Task 3: Quotation Repository and Authenticated APIs

**Files:**
- Create: `src/server/quotationRepository.ts`
- Create: `src/server/quotationApi.ts`
- Create: `src/server/quotationApi.test.ts`
- Create: `api/quotation/index.ts`
- Create: `api/quotation/[id].ts`
- Create: `api/quotation/[id]/review.ts`
- Create: `api/quotation/suppliers.ts`
- Create: `api/quotation/product-groups.ts`
- Create: `api/quotation/compare.ts`
- Modify: `server.ts`

- [ ] **Step 1: Write failing API behavior tests**

Use in-memory repository doubles and request/response fakes. Cover:

```ts
assert.equal(await listWithoutSession(), 401);
assert.equal(await listAsFinance(), 403);
assert.equal(await createDraftAsBuyer(validDraft), 201);
assert.equal(await confirmDraftWithBlockingIssues(), 422);
assert.equal(await softDeleteActiveQuotation(), 200);
```

Verify comparison only includes explicitly requested quotation-item IDs.

- [ ] **Step 2: Run and verify RED**

```bash
npx tsx src/server/quotationApi.test.ts
```

Expected: FAIL because API modules are missing.

- [ ] **Step 3: Implement repository**

Create a repository factory around `getMongoCollection` with focused methods:

```ts
listQuotations(filters)
getQuotationBundle(id)
createQuotationDraft(draft, actor)
saveReviewDraft(id, draft, actor)
confirmQuotation(id, actor)
softDeleteQuotation(id, actor)
restoreQuotation(id, actor)
upsertSupplierProfile(profile, actor)
listProductGroups()
saveProductGroup(group, actor)
buildComparison(productGroupId, itemIds)
```

Use MongoDB sessions/transactions when available for quotation + items + audit writes. In local test doubles, preserve atomic behavior.

- [ ] **Step 4: Implement authenticated handlers**

Parse and validate query/body values explicitly. Return consistent envelopes:

```ts
{ success: true, data }
{ success: false, code, message, issues? }
```

Confirmation must recompute normalized prices server-side and reject unresolved blocking issues or unconfirmed product groups.

- [ ] **Step 5: Mount Express and Vercel routes**

Mount:

```text
GET/POST  /api/quotation
GET/PUT/DELETE /api/quotation/:id
POST /api/quotation/:id/review
GET/PUT /api/quotation/suppliers
GET/PUT /api/quotation/product-groups
POST /api/quotation/compare
```

- [ ] **Step 6: Run tests**

```bash
npx tsx src/server/quotationApi.test.ts
npm test
npm run lint
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add api/quotation server.ts src/server/quotationApi.ts src/server/quotationRepository.ts src/server/quotationApi.test.ts package.json
git commit -m "feat: add quotation data APIs"
```

### Task 4: Private Source File Upload and Delivery

**Files:**
- Modify: `package.json`
- Create: `src/server/quotationFileApi.ts`
- Create: `src/server/quotationFileApi.test.ts`
- Create: `api/quotation/files/upload.ts`
- Create: `api/quotation/files/[id].ts`
- Modify: `server.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install Blob client**

```bash
npm install @vercel/blob
```

- [ ] **Step 2: Write failing file-policy tests**

Test allowed MIME/extensions (`xlsx`, `xls`, `pdf`, `png`, `jpeg`, `webp`), 25 MB maximum, sanitized path generation, buyer-only upload authorization, and owner-independent authenticated download.

- [ ] **Step 3: Run and verify RED**

```bash
npx tsx src/server/quotationFileApi.test.ts
```

Expected: FAIL because file policy is missing.

- [ ] **Step 4: Implement client upload token handler**

Use official `handleUpload` from `@vercel/blob/client`. The token callback must:

- require a buyer session;
- validate extension and MIME;
- produce `supplier-quotes/<yyyy>/<mm>/<uuid>-<safe-name>`;
- restrict content types and maximum size;
- return metadata needed to create `SourceFileRef`.

- [ ] **Step 5: Implement private file delivery**

Store only private Blob paths/URLs in MongoDB. File delivery must require a buyer session, load the quotation source-file reference, fetch with `BLOB_READ_WRITE_TOKEN`, and stream content with safe `Content-Type` and `Content-Disposition`.

- [ ] **Step 6: Run tests and build**

```bash
npx tsx src/server/quotationFileApi.test.ts
npm run build
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example api/quotation/files server.ts src/server/quotationFileApi*
git commit -m "feat: add private quotation file storage"
```

### Task 5: Excel and Gemini Parsing Pipeline

**Files:**
- Create: `src/quotation/quotationParser.ts`
- Create: `src/quotation/quotationParser.test.ts`
- Create: `src/server/quotationParseApi.ts`
- Create: `src/server/quotationParseApi.test.ts`
- Create: `api/quotation/[id]/parse.ts`
- Modify: `server.ts`

- [ ] **Step 1: Write failing parser tests**

Use fixture rows with alternate Chinese headers. Verify extraction of supplier, quotation date, currency, tax mode, product code/name/spec, quantity, unit, package quantity, unit price, MOQ and lead time. Verify malformed rows produce review issues rather than invented defaults.

- [ ] **Step 2: Run and verify RED**

```bash
npx tsx src/quotation/quotationParser.test.ts
```

Expected: FAIL because parser functions are missing.

- [ ] **Step 3: Implement Excel parser**

Expose:

```ts
analyzeQuotationHeaders(rows: unknown[][]): QuotationHeaderAnalysis
rowsToQuotationDraft(rows: unknown[][]): QuotationDraft
validateQuotationDraft(value: unknown): DraftValidationResult
```

Use alias maps and structured row parsing. Preserve source row numbers and do not default missing prices, tax modes, currency or units.

- [ ] **Step 4: Write failing Gemini request/retry tests**

Verify the generated structured-output schema includes every required draft field. Verify `429`, `500` and `503` classify as retryable while `400`, invalid JSON and schema mismatch do not.

- [ ] **Step 5: Implement Gemini parser**

Fetch the authenticated private file, pass PDF/image bytes to `@google/genai`, and request `application/json` with a fixed response schema. Validate the response with the same runtime validator as Excel. Limit retry attempts to three with injectable delay for tests.

- [ ] **Step 6: Persist parse jobs**

`POST /api/quotation/:id/parse` moves:

```text
queued -> processing -> review_required
queued -> processing -> failed
```

Store attempt count, parser version, structured result, issues and actionable error codes.

- [ ] **Step 7: Run tests**

```bash
npx tsx src/quotation/quotationParser.test.ts
npx tsx src/server/quotationParseApi.test.ts
npm test
npm run lint
```

Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add api/quotation src/quotation src/server/quotationParseApi* server.ts package.json
git commit -m "feat: parse supplier quotation files"
```

### Task 6: Client API, Module Shell and Archive Page

**Files:**
- Create: `src/quotation/api.ts`
- Create: `src/quotation/hooks.ts`
- Create: `src/components/supplierQuotes/SupplierQuotationApp.tsx`
- Create: `src/components/supplierQuotes/QuotationArchive.tsx`
- Create: `src/components/supplierQuotes/QuotationUploadDialog.tsx`
- Create: `src/components/supplierQuotes/quotationUi.ts`
- Modify: `src/appModules.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing presentation-helper tests**

Test status labels/colors, date filtering, supplier/product search normalization and archive sorting in `quotationUi.test.ts`.

- [ ] **Step 2: Run and verify RED**

```bash
npx tsx src/components/supplierQuotes/quotationUi.test.ts
```

- [ ] **Step 3: Implement client API and hooks**

All requests use `credentials: 'same-origin'` and throw readable API errors. Hooks expose explicit `loading`, `error`, `data`, `refresh`, and mutation states; no hidden optimistic writes.

- [ ] **Step 4: Implement archive-management layout**

Create the approved left navigation and central archive table. Include:

- all/review/active/expired/voided views;
- supplier, product, date and free-text filters;
- upload button;
- source-file, detail, audit and soft-delete actions;
- empty/loading/error states.

- [ ] **Step 5: Implement upload dialog**

Validate the file locally, request a client-upload token, upload to private Blob, create a draft, and start parsing. Excel files additionally run local extraction so review can start even if Gemini is unavailable.

- [ ] **Step 6: Add lazy navigation**

Add `supplier-quotes` to `AppTab`, `moduleLoaders`, fallback labels, mini-app tabs, heading and render branch. Use a `FileSpreadsheet` icon.

- [ ] **Step 7: Run tests, lint and build**

```bash
npx tsx src/components/supplierQuotes/quotationUi.test.ts
npm run lint
npm run build
```

Expected: exit 0.

- [ ] **Step 8: Browser verification**

Start the app and verify in the in-app browser:

- module navigation loads without console errors;
- archive filters work;
- upload validation rejects unsupported files;
- loading and empty states render correctly.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/appModules.tsx src/quotation src/components/supplierQuotes package.json
git commit -m "feat: add quotation archive workspace"
```

### Task 7: Side-by-Side Review and Confirmation

**Files:**
- Create: `src/components/supplierQuotes/QuotationReview.tsx`
- Create: `src/components/supplierQuotes/QuotationReview.test.ts`
- Modify: `src/components/supplierQuotes/SupplierQuotationApp.tsx`
- Modify: `src/quotation/api.ts`

- [ ] **Step 1: Write failing review-state tests**

Test immutable row add/remove/update, issue resolution, blocking-state calculation, and payload construction. A missing currency, unit, price, package quantity or unconfirmed product group must block confirmation.

- [ ] **Step 2: Run and verify RED**

```bash
npx tsx src/components/supplierQuotes/QuotationReview.test.ts
```

- [ ] **Step 3: Implement review state helpers**

Keep state transitions in pure exported functions:

```ts
updateDraftField(draft, field, value)
updateDraftItem(draft, itemId, patch)
addDraftItem(draft)
removeDraftItem(draft, itemId)
getBlockingReviewIssues(draft)
```

- [ ] **Step 4: Implement side-by-side UI**

Left pane:

- native PDF iframe;
- image preview with fit/zoom;
- Excel sheet preview table;
- authenticated source-file URL.

Right pane:

- quotation header fields;
- editable line table;
- confidence and issue badges;
- add/remove/split line actions;
- save draft, retry parse and confirm buttons.

- [ ] **Step 5: Confirm through server API**

Never calculate final normalized values only in the browser. Submit corrected source fields, let the server validate/recompute, and refresh the saved active quotation.

- [ ] **Step 6: Verify**

```bash
npx tsx src/components/supplierQuotes/QuotationReview.test.ts
npm run lint
npm run build
```

Then verify PDF/image/Excel preview branches and blocked confirmation in the browser.

- [ ] **Step 7: Commit**

```bash
git add src/components/supplierQuotes src/quotation/api.ts package.json
git commit -m "feat: add quotation review workflow"
```

### Task 8: Product Group Management

**Files:**
- Create: `src/quotation/productMatching.ts`
- Create: `src/quotation/productMatching.test.ts`
- Create: `src/components/supplierQuotes/ProductGroups.tsx`
- Modify: `src/server/quotationApi.ts`
- Modify: `src/components/supplierQuotes/SupplierQuotationApp.tsx`

- [ ] **Step 1: Write failing matching tests**

Test exact product-code matches, confirmed aliases, normalized name/spec candidates, incompatible unit dimensions, suggested status and explicit confirmation.

- [ ] **Step 2: Run and verify RED**

```bash
npx tsx src/quotation/productMatching.test.ts
```

- [ ] **Step 3: Implement deterministic matching first**

Return ranked candidates with reasons:

```ts
type ProductGroupCandidate = {
  productGroupId: string;
  score: number;
  reasons: string[];
};
```

Exact codes and confirmed aliases outrank normalized text. Reject different unit dimensions before AI recommendations.

- [ ] **Step 4: Add AI suggestions behind the same candidate contract**

AI can suggest candidates only when deterministic matching has no strong match. Persist suggestions as `suggested`; never auto-confirm.

- [ ] **Step 5: Implement management UI**

Provide ungrouped/suggested/confirmed filters, candidate reasons, move to group, create group, merge, split, alias and conversion-rule editing. Require confirmation before the group is comparison-ready.

- [ ] **Step 6: Verify and commit**

```bash
npx tsx src/quotation/productMatching.test.ts
npm test
npm run lint
npm run build
git add src/quotation src/components/supplierQuotes src/server/quotationApi.ts package.json
git commit -m "feat: manage quotation product groups"
```

### Task 9: Supplier Scores and Comparison Matrix

**Files:**
- Create: `src/quotation/comparison.ts`
- Create: `src/quotation/comparison.test.ts`
- Create: `src/components/supplierQuotes/SupplierProfiles.tsx`
- Create: `src/components/supplierQuotes/QuotationComparison.tsx`
- Modify: `src/components/supplierQuotes/SupplierQuotationApp.tsx`

- [ ] **Step 1: Write failing comparison tests**

Test explicit version selection, minimum price highlighting, shortest lead-time highlighting, highest per-dimension score highlighting, expired marker, no automatic composite ranking, and traceable normalization details.

- [ ] **Step 2: Run and verify RED**

```bash
npx tsx src/quotation/comparison.test.ts
```

- [ ] **Step 3: Implement comparison projection**

Expose:

```ts
buildComparisonResult(group, selectedItems, suppliers): ComparisonResult
getObjectiveHighlights(result): ComparisonHighlights
```

Do not assign a winner or weighted total score.

- [ ] **Step 4: Implement supplier score editor**

Validate each score as integer `0..100`, keep notes and update timestamp, and show four dimensions separately.

- [ ] **Step 5: Implement comparison matrix**

Use sticky comparison labels and horizontal supplier columns. Include a version selector, original and normalized prices, MOQ, lead time, payment terms, validity, four scores, expiration state and expandable formula details.

- [ ] **Step 6: Verify and commit**

```bash
npx tsx src/quotation/comparison.test.ts
npm test
npm run lint
npm run build
git add src/quotation src/components/supplierQuotes package.json
git commit -m "feat: compare supplier quotation versions"
```

### Task 10: Integration, Security and Documentation

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `src/utils/bundleGuards.test.ts`
- Create: `scripts/setup-quotation-indexes.ts`
- Modify: `package.json`

- [ ] **Step 1: Add index setup script**

Create indexes for normalized supplier name, quotation status/date/supplier, quotation items by quotation/product group, parse jobs by quotation/status, product-group aliases, audit object/time, and a partial unique index for non-deleted suppliers.

- [ ] **Step 2: Add bundle guard**

Verify the quotation module remains dynamically imported and `exceljs`, `xlsx`, `@google/genai` and `@vercel/blob` do not enter the initial browser chunk unnecessarily.

- [ ] **Step 3: Document setup**

Document:

```text
GEMINI_API_KEY
BLOB_READ_WRITE_TOKEN
SESSION_SECRET
MONGODB_URI / MONGODB_DB
```

Include collection/index setup, private Blob requirement, supported files, 25 MB limit and quotation workflow.

- [ ] **Step 4: Run full verification**

```bash
npm test
npm run lint
npm run build
```

Expected: all exit 0 with no TypeScript errors or build failures.

- [ ] **Step 5: Run browser acceptance**

Verify:

1. Buyer can log in and open the quotation module.
2. Finance cannot access quotation APIs.
3. Upload creates a parsing draft.
4. Parse failure remains retryable and preserves the file.
5. Review blocks unresolved issues.
6. Confirmed quotations appear active.
7. Product groups require manual confirmation.
8. Scores persist.
9. Selected versions appear in the comparison matrix.
10. Source files require an authenticated session.

- [ ] **Step 6: Review working tree and commit**

```bash
git status --short
git diff --check
git add README.md .env.example package.json package-lock.json scripts/setup-quotation-indexes.ts src/utils/bundleGuards.test.ts
git commit -m "docs: finalize supplier quotation module"
```

## Implementation Constraints

- Follow red-green-refactor for every behavior change.
- Do not expose permanent public source-file URLs.
- Do not trust client-computed normalized prices.
- Do not let AI output directly activate quotations or confirm product groups.
- Do not invent unit conversions across dimensions.
- Preserve unrelated user changes in the working tree.
- Use the existing Chinese UI tone and compact procurement-dashboard styling.
- Prefer focused files over expanding `App.tsx` or `SupplierQuotationApp.tsx` into business-logic containers.
