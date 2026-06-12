import {
  cloudbaseCollections,
  listDocuments,
  setDocument,
} from '../lib/cloudbaseData';
import type {
  QuotationDraft,
  SupplierProductGroup,
  SupplierProfile,
  SupplierQuotation,
  SupplierQuotationItem,
} from './types';
import type { ParsedQuotationValidation } from './quotationParser';

export interface QuotationWorkspace {
  quotations: SupplierQuotation[];
  items: SupplierQuotationItem[];
  suppliers: SupplierProfile[];
  productGroups: SupplierProductGroup[];
}

export async function loadQuotationWorkspace(): Promise<QuotationWorkspace> {
  const [quotations, items, suppliers, productGroups] = await Promise.all([
    listDocuments<SupplierQuotation>(cloudbaseCollections.supplierQuotations),
    listDocuments<SupplierQuotationItem>(cloudbaseCollections.supplierQuotationItems),
    listDocuments<SupplierProfile>(cloudbaseCollections.supplierProfiles),
    listDocuments<SupplierProductGroup>(cloudbaseCollections.supplierProductGroups),
  ]);
  return { quotations, items, suppliers, productGroups };
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

export async function saveProductGroup(group: SupplierProductGroup): Promise<void> {
  await setDocument(cloudbaseCollections.supplierProductGroups, group.id, group);
}

export async function saveQuotationItem(item: SupplierQuotationItem): Promise<void> {
  await setDocument(cloudbaseCollections.supplierQuotationItems, item.id, item);
}

export async function parseQuotationFile(pathname: string, mimeType: string): Promise<ParsedQuotationValidation> {
  const response = await fetch('/api/quotation/parse', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname, mimeType }),
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
