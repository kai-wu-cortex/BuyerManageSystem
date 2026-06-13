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

export async function loadQuotationWorkspace(): Promise<QuotationWorkspace> {
  const [quotations, items, suppliers] = await Promise.all([
    listDocuments<SupplierQuotation>(cloudbaseCollections.supplierQuotations),
    listDocuments<SupplierQuotationItem>(cloudbaseCollections.supplierQuotationItems),
    listDocuments<SupplierProfile>(cloudbaseCollections.supplierProfiles),
  ]);
  return { quotations, items, suppliers };
}

export async function saveQuotationDraft(draft: QuotationDraft): Promise<void> {
  await Promise.all([
    setDocument(cloudbaseCollections.supplierQuotations, draft.quotation.id, draft.quotation),
    ...draft.items.map(item => setDocument(cloudbaseCollections.supplierQuotationItems, item.id, item)),
  ]);
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
}

export async function saveQuotationItem(item: SupplierQuotationItem): Promise<void> {
  await setDocument(cloudbaseCollections.supplierQuotationItems, item.id, item);
}

export async function deleteQuotation(quotationId: string, items: SupplierQuotationItem[]): Promise<void> {
  const now = new Date().toISOString();
  const quotation = { deletedAt: now, updatedAt: now };
  await setDocument(cloudbaseCollections.supplierQuotations, quotationId, quotation);
  await Promise.all(
    items.map(item => setDocument(cloudbaseCollections.supplierQuotationItems, item.id, { deletedAt: now, updatedAt: now }))
  );
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  const now = new Date().toISOString();
  await setDocument(cloudbaseCollections.supplierProfiles, supplierId, { deletedAt: now, updatedAt: now });
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
