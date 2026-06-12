import type { QuotationWorkflowStatus, SupplierProfile } from '../../quotation/types';

export const STATUS_LABELS: Record<QuotationWorkflowStatus | 'expired', string> = {
  parsing: '解析中',
  review_required: '待审核',
  active: '已生效',
  expired: '已过期',
  voided: '已作废',
};

export const STATUS_COLORS: Record<QuotationWorkflowStatus | 'expired', string> = {
  parsing: 'bg-amber-100 text-amber-700',
  review_required: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-slate-100 text-slate-500',
  voided: 'bg-red-100 text-red-600',
};

export function getStatusLabel(status: QuotationWorkflowStatus | 'expired'): string {
  return STATUS_LABELS[status] ?? status;
}

export function getStatusColor(status: QuotationWorkflowStatus | 'expired'): string {
  return STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-500';
}

export function getScoreColor(score: number): string {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 80) return 'bg-blue-500';
  if (score >= 70) return 'bg-amber-500';
  return 'bg-red-500';
}

export function getScoreTextColor(score: number): string {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 80) return 'text-blue-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
}

export function formatCurrency(amount: number, currency: string): string {
  if (currency === 'CNY') return `¥ ${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === 'USD') return `$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === 'EUR') return `€ ${amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${currency} ${amount.toLocaleString()}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export type SortField = 'supplierName' | 'quotationDate' | 'status';
export type SortDir = 'asc' | 'desc';

export interface FilterState {
  status: QuotationWorkflowStatus | 'all';
  searchTerm: string;
  dateFrom: string;
  dateTo: string;
}

export function matchesFilter(item: { status: QuotationWorkflowStatus; supplierName: string; quotationDate: string }, filter: FilterState): boolean {
  if (filter.status !== 'all' && item.status !== filter.status) return false;
  if (filter.searchTerm) {
    const term = filter.searchTerm.toLowerCase();
    if (!item.supplierName.toLowerCase().includes(term)) return false;
  }
  if (filter.dateFrom && item.quotationDate < filter.dateFrom) return false;
  if (filter.dateTo && item.quotationDate > filter.dateTo) return false;
  return true;
}
