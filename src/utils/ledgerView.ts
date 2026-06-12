import { FlatLedgerRow } from './ledgerHelper';

export type LedgerViewMode = 'table' | 'po-card' | 'item-card';
export type DisplayLedgerRow = FlatLedgerRow & { _bgGroup?: number };

function compareLedgerRows(
  a: FlatLedgerRow,
  b: FlatLedgerRow,
  sortField: keyof FlatLedgerRow,
  sortOrder: 'asc' | 'desc',
): number {
  const aVal = a[sortField];
  const bVal = b[sortField];

  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  }

  const aStr = String(aVal || '').toLowerCase();
  const bStr = String(bVal || '').toLowerCase();

  if (aStr < bStr) return sortOrder === 'asc' ? -1 : 1;
  if (aStr > bStr) return sortOrder === 'asc' ? 1 : -1;
  return 0;
}

function dedupePurchaseOrderRows(rows: FlatLedgerRow[]): FlatLedgerRow[] {
  const seen = new Set<string>();
  const result: FlatLedgerRow[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    result.push(row);
  }

  return result;
}

function withAlternatingPurchaseOrderGroups(rows: FlatLedgerRow[]): DisplayLedgerRow[] {
  let currentGroupId = 0;
  let lastId: string | null = null;

  return rows.map(row => {
    if (row.id !== lastId) {
      if (lastId !== null) {
        currentGroupId = (currentGroupId + 1) % 2;
      }
      lastId = row.id;
    }
    return {
      ...row,
      _bgGroup: currentGroupId,
    };
  });
}

export function getLedgerRowsForView(
  rows: FlatLedgerRow[],
  viewMode: LedgerViewMode,
  sortField: keyof FlatLedgerRow,
  sortOrder: 'asc' | 'desc',
): DisplayLedgerRow[] {
  const viewRows = viewMode === 'po-card' ? dedupePurchaseOrderRows(rows) : rows;
  const sorted = [...viewRows].sort((a, b) => compareLedgerRows(a, b, sortField, sortOrder));

  return viewMode === 'table' ? withAlternatingPurchaseOrderGroups(sorted) : sorted;
}
