# Supplier Quotation Navigation Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the supplier quotation app's nested sidebar and integrate its navigation into the main content area as horizontal tabs.

**Architecture:** Keep the existing `view` state and business views unchanged. Replace only the outer shell in `SupplierQuotationApp.tsx`, rendering the existing navigation model as a top tab list and preserving `review` as an archive detail state.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React, Vite

---

### Task 1: Lock The Integrated Navigation Contract

**Files:**
- Create: `src/components/supplierQuotes/SupplierQuotationLayout.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing source-structure test**

Create a test that reads `SupplierQuotationApp.tsx` and asserts that the old `<aside>` shell and `bg-[#182329]` class are absent, while `role="tablist"` and four `role="tab"` controls are present.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx src/components/supplierQuotes/SupplierQuotationLayout.test.ts`

Expected: FAIL because the component still contains the nested `<aside>` and has no tab semantics.

- [ ] **Step 3: Add the test to the project test sequence**

Add `tsx src/components/supplierQuotes/SupplierQuotationLayout.test.ts` after the quotation parser tests in `package.json`.

### Task 2: Replace The Nested Sidebar With Top Tabs

**Files:**
- Modify: `src/components/supplierQuotes/SupplierQuotationApp.tsx`

- [ ] **Step 1: Simplify the outer page shell**

Replace the rounded two-column container and `<aside>` with a single content wrapper using the main system's light surface.

- [ ] **Step 2: Render navigation as horizontal tabs**

Render the existing four navigation entries below the title using `role="tablist"` and buttons with `role="tab"` and `aria-selected`. Use the system blue accent for the active tab and keep horizontal overflow for narrow widths.

- [ ] **Step 3: Preserve review behavior**

Treat `review` as an active archive detail so the “报价档案” tab remains selected while reviewing a quotation.

- [ ] **Step 4: Run the focused test**

Run: `npx tsx src/components/supplierQuotes/SupplierQuotationLayout.test.ts`

Expected: PASS.

### Task 3: Verify And Publish

**Files:**
- Verify: `src/components/supplierQuotes/SupplierQuotationApp.tsx`
- Verify: `src/components/supplierQuotes/SupplierQuotationLayout.test.ts`

- [ ] **Step 1: Run static and focused checks**

Run: `npx tsx src/components/supplierQuotes/SupplierQuotationLayout.test.ts && npm run lint && npm run build`

Expected: all commands exit successfully.

- [ ] **Step 2: Verify in the browser**

Open the local or Vercel Preview supplier quotation page and confirm only the system sidebar remains, the four tabs switch views, and archive review navigation still works.

- [ ] **Step 3: Commit and push**

Commit the layout change and push `codex/supplier-quotation` so Vercel creates a fresh Preview deployment.

