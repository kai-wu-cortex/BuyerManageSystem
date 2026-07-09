import {
  cloudbaseCollections,
  deleteDocument,
  listDocuments,
  setDocument,
} from '../lib/cloudbaseData';

export { cloudbaseCollections, setDocument };
import type {
  QuotationDraft,
  SupplierProfile,
  SupplierQuotation,
  SupplierQuotationItem,
} from './types';
import type { ParsedQuotationValidation } from './quotationParser';

export interface QuotationWorkspace {
  quotations: SupplierQuotation[];
  items: SupplierQuotationItem[];
  suppliers: SupplierProfile[];
}

let quotationWorkspaceCache: QuotationWorkspace | null = null;
let quotationWorkspacePromise: Promise<QuotationWorkspace> | null = null;
const quotationItemsCache = new Map<string, SupplierQuotationItem[]>();
let allQuotationItemsCache: SupplierQuotationItem[] | null = null;

function rememberQuotationItems(items: SupplierQuotationItem[]): void {
  items.forEach(item => {
    const existing = quotationItemsCache.get(item.quotationId) ?? [];
    const byId = new Map(existing.map(existingItem => [existingItem.id, existingItem]));
    byId.set(item.id, item);
    quotationItemsCache.set(item.quotationId, Array.from(byId.values()));
  });
}

export function clearQuotationCache(): void {
  quotationWorkspaceCache = null;
  quotationWorkspacePromise = null;
  quotationItemsCache.clear();
  allQuotationItemsCache = null;
}

export async function loadQuotationWorkspace(options: { force?: boolean } = {}): Promise<QuotationWorkspace> {
  if (!options.force && quotationWorkspaceCache) {
    return quotationWorkspaceCache;
  }
  if (!options.force && quotationWorkspacePromise) {
    return quotationWorkspacePromise;
  }

  quotationWorkspacePromise = Promise.all([
    listDocuments<SupplierQuotation>(cloudbaseCollections.supplierQuotations),
    listDocuments<SupplierProfile>(cloudbaseCollections.supplierProfiles),
  ])
    .then(([quotations, suppliers]) => ({ quotations, items: [], suppliers }))
    .then(workspace => {
      quotationWorkspaceCache = workspace;
      quotationWorkspacePromise = null;
      return workspace;
    })
    .catch(error => {
      quotationWorkspacePromise = null;
      throw error;
    });
  return quotationWorkspacePromise;
}

export async function loadQuotationItems(quotationId?: string, options: { force?: boolean } = {}): Promise<SupplierQuotationItem[]> {
  if (!options.force && quotationId && quotationItemsCache.has(quotationId)) {
    return quotationItemsCache.get(quotationId) ?? [];
  }
  if (!options.force && !quotationId && allQuotationItemsCache) {
    return allQuotationItemsCache;
  }

  const items = await listDocuments<SupplierQuotationItem>(
    cloudbaseCollections.supplierQuotationItems,
    quotationId ? { filters: { quotationId } } : undefined,
  );
  if (quotationId) {
    quotationItemsCache.set(quotationId, items);
  } else {
    allQuotationItemsCache = items;
    rememberQuotationItems(items);
  }
  return items;
}

export async function saveQuotationDraft(
  draft: QuotationDraft,
  previousItems: SupplierQuotationItem[] = [],
): Promise<void> {
  const now = new Date().toISOString();
  const nextItemIds = new Set(draft.items.map(item => item.id));
  const staleItems = previousItems.filter(item => !nextItemIds.has(item.id) && !item.deletedAt);
  await Promise.all([
    setDocument(cloudbaseCollections.supplierQuotations, draft.quotation.id, draft.quotation),
    ...draft.items.map(item => setDocument(cloudbaseCollections.supplierQuotationItems, item.id, item)),
    ...staleItems.map(item => setDocument(
      cloudbaseCollections.supplierQuotationItems,
      item.id,
      { deletedAt: now, updatedAt: now },
    )),
  ]);
  clearQuotationCache();
}

export async function confirmQuotationDraft(draft: QuotationDraft): Promise<QuotationDraft> {
  const response = await fetch('/api/quotation/confirm', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  const payload = await response.json() as { success?: boolean; data?: QuotationDraft; message?: string };
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.message ?? '报价确认失败。');
  }
  return payload.data;
}

export async function saveSupplierProfile(profile: SupplierProfile): Promise<void> {
  await setDocument(cloudbaseCollections.supplierProfiles, profile.id, profile);
  clearQuotationCache();
}

export async function saveQuotationItem(item: SupplierQuotationItem): Promise<void> {
  await setDocument(cloudbaseCollections.supplierQuotationItems, item.id, item);
  clearQuotationCache();
}

export async function deleteQuotation(quotationId: string, items: SupplierQuotationItem[]): Promise<void> {
  const now = new Date().toISOString();
  const quotation = { deletedAt: now, updatedAt: now };
  await setDocument(cloudbaseCollections.supplierQuotations, quotationId, quotation);
  await Promise.all(
    items.map(item => setDocument(cloudbaseCollections.supplierQuotationItems, item.id, { deletedAt: now, updatedAt: now }))
  );
  clearQuotationCache();
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  const now = new Date().toISOString();
  await setDocument(cloudbaseCollections.supplierProfiles, supplierId, { deletedAt: now, updatedAt: now });
  clearQuotationCache();
}

export async function parseQuotationFile(pathname: string, mimeType: string, customPrompt?: string): Promise<ParsedQuotationValidation> {
  const response = await fetch('/api/quotation/parse', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname, mimeType, customPrompt }),
  });
  const payload = await response.json() as {
    success?: boolean;
    data?: ParsedQuotationValidation;
    message?: string;
  };
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.message ?? '报价单解析失败。');
  }
  return payload.data;
}
