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

Before running against CloudBase, create these collections in CloudBase 文档型数据库, enable anonymous login if this app should keep its no-login behavior, and apply rules equivalent to [cloudbase.rules.json](cloudbase.rules.json).

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local`, then set `GEMINI_API_KEY` and `VITE_CLOUDBASE_ENV_ID`
3. Run the app:
   `npm run dev`
