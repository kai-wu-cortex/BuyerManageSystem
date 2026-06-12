# Supplier Quotation Workspace Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the quotation review, supplier scoring, and price comparison layouts to match the approved procurement workspace references without adding a nested sidebar.

**Architecture:** Keep the existing workspace state, save handlers, and API calls. Extract presentation helpers inside the supplier quotation module and pass existing quotations and items into the supplier view so all new summaries remain derived from live data.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React, Vite

---

### Task 1: Lock The Approved Layout Contract

**Files:**
- Modify: `src/components/supplierQuotes/SupplierQuotationLayout.test.ts`

- [ ] Add failing assertions for the three named workspace sections: `解析校对页`, `供应商综合评分`, and `评估指标`.
- [ ] Assert the source still contains no `<aside` element.
- [ ] Run `npx tsx src/components/supplierQuotes/SupplierQuotationLayout.test.ts` and verify the new assertions fail.

### Task 2: Rebuild The Review Workspace

**Files:**
- Modify: `src/components/supplierQuotes/SupplierQuotationApp.tsx`

- [ ] Replace the current rounded review cards with a bordered 50/50 workspace.
- [ ] Add review status, completion summary, warning styles, and a bottom action bar.
- [ ] Preserve Excel/PDF/image preview, all editable fields, product-group selection, draft save, and confirm behavior.
- [ ] Run the focused layout test and TypeScript check.

### Task 3: Rebuild Supplier Profiles

**Files:**
- Modify: `src/components/supplierQuotes/SupplierQuotationApp.tsx`

- [ ] Pass quotations, items, and the review callback into `SuppliersView`.
- [ ] Add supplier selection, profile header, four score cards, editable note, and save action.
- [ ] Derive historical quotation rows and product summaries from existing workspace data.
- [ ] Run the focused layout test and TypeScript check.

### Task 4: Rebuild The Comparison Matrix

**Files:**
- Modify: `src/components/supplierQuotes/SupplierQuotationApp.tsx`

- [ ] Keep product-group and quote-version selection controls.
- [ ] Render each selected quote version as a matrix column.
- [ ] Render price, MOQ, lead time, payment terms, quality score, delivery score, and validity rows.
- [ ] Highlight row winners with a restrained pale-yellow treatment.
- [ ] Run the focused layout test, TypeScript check, and production build.

### Task 5: Publish And Verify

**Files:**
- Verify: `src/components/supplierQuotes/SupplierQuotationApp.tsx`
- Verify: `src/components/supplierQuotes/SupplierQuotationLayout.test.ts`

- [ ] Commit the implementation and push `codex/supplier-quotation`.
- [ ] Wait for the Vercel Preview to reach Ready.
- [ ] Verify login, supplier quotation navigation, and runtime logs.

