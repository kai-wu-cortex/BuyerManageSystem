import type {
  SupplierQuotation,
  QuotationDraft,
  SourceFileRef,
} from './types';

const API_BASE = '/api';

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `请求失败: ${response.status}`);
  }
  return data.data;
}

export async function listQuotations(filters?: {
  status?: string;
  searchTerm?: string;
}): Promise<SupplierQuotation[]> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') {
    params.set('status', filters.status);
  }
  if (filters?.searchTerm) {
    params.set('search', filters.searchTerm);
  }
  const query = params.toString();
  return requestJson<SupplierQuotation[]>(`/quotation${query ? `?${query}` : ''}`);
}

export async function getQuotation(id: string): Promise<SupplierQuotation> {
  return requestJson<SupplierQuotation>(`/quotation/${id}`);
}

export async function createQuotationDraft(draft: QuotationDraft): Promise<SupplierQuotation> {
  return requestJson<SupplierQuotation>('/quotation', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export async function uploadQuotationFile(file: File): Promise<{
  clientToken: string;
  blobPath: string;
  metadata: SourceFileRef;
}> {
  const response = await fetch(`${API_BASE}/quotation/files/upload`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.message || '上传失败');
  }
  return data.data;
}

export async function getFileDownloadUrl(blobPath: string): Promise<string> {
  return `${API_BASE}/quotation/files/${encodeURIComponent(blobPath)}`;
}
