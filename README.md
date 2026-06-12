<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/24e9690d-6c4e-4b85-afb9-c7f8ca353427

## CloudBase migration

Firebase has been fully replaced with CloudBase Web SDK following the CloudBase Firebase migration guide:

- SDK init: `firebase.initializeApp(config)` -> `cloudbase.init({ env })`
- Firestore database: `getFirestore(app)` -> `app.database()`
- Collections: `collection(db, name)` -> `db.collection(name)`
- Reads/writes/deletes: `getDocs`, `setDoc`, `deleteDoc` -> `get`, `set`, `remove`
- Realtime sync: CloudBase database `watch()`

CloudBase collections used by the app:

- `inventory_stock`
- `sample_records`
- `order_sticky_notes`
- `ledger_backups`
- `buyer_system_view_settings`

## Supplier quotation mini-app

The `供应商报价单` mini-app stores supplier quotation files, creates editable
drafts from Excel/PDF/images, requires human review, and compares selected
quotation versions after currency, tax, package, and unit normalization.

Required server environment variables:

- `MONGODB_URI` (or `MONGODB_DIRECT_URI`)
- `SESSION_SECRET` (at least 32 random characters)
- `GEMINI_API_KEY` for PDF/image parsing
- `BLOB_READ_WRITE_TOKEN` for private Vercel Blob source files

The following MongoDB collections are created on first use:

- `supplier_profiles`
- `supplier_quotations`
- `supplier_quotation_items`
- `supplier_quote_parse_jobs`
- `supplier_product_groups`
- `supplier_quote_audit_logs`

Create the recommended indexes after configuring MongoDB:

```bash
npm run setup:quotation-indexes
```

Supported files are `.xlsx`, `.xls`, `.pdf`, `.png`, `.jpg`, `.jpeg`, and
`.webp`, up to 25 MB. Source files remain private. AI output always enters the
`待校对` workflow and cannot directly activate a quotation or confirm a product
group.

The Vercel CLI is not installed in this workspace. Install it with
`npm i -g vercel` before using `vercel env pull`, `vercel deploy`, or
`vercel logs`.

Before running against CloudBase, create these collections in CloudBase 文档型数据库, enable anonymous login if this app should keep its no-login behavior, and apply rules equivalent to [cloudbase.rules.json](cloudbase.rules.json).

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local`, then set `GEMINI_API_KEY` and `VITE_CLOUDBASE_ENV_ID`
3. Run the app:
   `npm run dev`
