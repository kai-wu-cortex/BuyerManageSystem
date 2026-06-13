# Main Quotation UI Business Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the latest `main` supplier quotation UI while replacing mock data and incomplete routes with working upload, parsing, MongoDB persistence, review, supplier, grouping, and comparison behavior.

**Architecture:** Use a single quotation workspace contract backed by the existing MongoDB data API collections. Upload files directly to private Vercel Blob, parse Excel in the browser and PDF/images through the authenticated server endpoint, then persist quotation headers and line items separately. The top-level UI owns workspace loading and selected quotation state; each existing visual page receives real data and explicit save callbacks.

**Tech Stack:** React 19, TypeScript, Express, MongoDB, Vercel Blob, XLSX, Gemini parser, existing Tailwind CSS.

---

### Task 1: Restore the proven quotation data contract

**Files:**
- Modify: `src/quotation/types.ts`
- Modify: `src/lib/cloudbaseData.ts`
- Modify: `src/server/mongoDataApi.ts`
- Modify: `src/quotation/api.ts`
- Create: `src/quotation/quotationParser.ts`
- Create: `src/quotation/quotationParser.test.ts`

- [ ] Write parser tests covering normal row quotations, price matrices, and missing required values.
- [ ] Run `npx tsx src/quotation/quotationParser.test.ts` and verify it fails because the parser is missing.
- [ ] Add the quotation workspace types, parser, collection allow-list entries, and MongoDB persistence helpers.
- [ ] Re-run the parser test and verify it passes.

### Task 2: Complete Blob upload, preview, parse, and confirmation routes

**Files:**
- Modify: `server.ts`
- Modify: `src/server/quotationFileApi.ts`
- Create: `src/server/quotationParseApi.ts`
- Create: `src/server/quotationConfirmApi.ts`
- Create: `src/server/quotationFileApi.test.ts`
- Create: `src/server/quotationConfirmApi.test.ts`

- [ ] Add failing tests for accepted quotation paths, Unicode download disposition, and confirmed price normalization.
- [ ] Run the focused tests and verify the missing exports fail.
- [ ] Add authenticated upload, private file serving, PDF/image parsing, and transactional confirmation endpoints.
- [ ] Re-run focused tests and verify they pass.

### Task 3: Wire the latest UI shell and archive to the workspace

**Files:**
- Modify: `src/components/supplierQuotes/SupplierQuotationApp.tsx`
- Modify: `src/components/supplierQuotes/QuotationArchive.tsx`
- Create: `src/components/supplierQuotes/QuotationBusinessLogic.test.ts`

- [ ] Add a failing source-level integration test requiring workspace loading, selected quotation propagation, and the absence of `MOCK_` business data.
- [ ] Run the focused test and verify the current mock implementation fails.
- [ ] Load the workspace once at the module shell, preserve the latest sidebar UI, and implement upload-parse-persist-refresh flow.
- [ ] Re-run the focused test and verify the shell/archive requirements pass.

### Task 4: Wire review, supplier, grouping, and comparison pages

**Files:**
- Modify: `src/components/supplierQuotes/QuotationReview.tsx`
- Modify: `src/components/supplierQuotes/SupplierProfiles.tsx`
- Modify: `src/components/supplierQuotes/ProductGroups.tsx`
- Modify: `src/components/supplierQuotes/QuotationComparison.tsx`

- [ ] Extend the failing integration test to require real save/confirm/profile/group APIs in all four pages.
- [ ] Run the focused test and verify it fails on mock data and missing callbacks.
- [ ] Bind review fields and rows to the selected quotation, render the original private file, and persist draft/confirmation changes.
- [ ] Bind supplier scores/history, product groups/item matching, and comparison metrics to workspace data.
- [ ] Re-run the focused test and verify it passes.

### Task 5: Verify and publish

**Files:**
- Modify only files required by verification failures.

- [ ] Run quotation parser, server API, and UI integration tests.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run the full test suite and record the known unrelated ledger import baseline failure if unchanged.
- [ ] Verify upload, archive, review preview, saving, supplier profile, grouping, and comparison in the browser.
- [ ] Commit and push `main`, then verify the Vercel deployment is ready.
