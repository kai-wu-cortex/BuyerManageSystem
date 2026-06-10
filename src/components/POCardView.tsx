import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { PurchaseOrder } from '../types';
import { FlatLedgerRow } from '../utils/ledgerHelper';

export type CardViewMode = 'po-card' | 'item-card';

interface POCardViewProps {
  mode: CardViewMode;
  rows: FlatLedgerRow[];
  purchaseOrders: PurchaseOrder[];
  starredIds: Set<string>;
  onToggleStar?: (id: string) => void;
  onCardClick: (poId: string) => void;
  /** 可见字段 (FlatLedgerRow 字段名) */
  visibleFields: (keyof FlatLedgerRow)[];
  /** 字段中文名映射 */
  fieldNames: Record<string, string>;
  /** 分组字段，null = 不分组 */
  groupBy: keyof FlatLedgerRow | null;
}

const PO_LEVEL_FIELDS = new Set<keyof FlatLedgerRow>([
  'id', 'date', 'supplier', 'status', 'executionStatus', 'inboundStatus',
  'remarks', 'discountRate', 'discountAmount', 'transportMethod',
  'settlementType', 'deliveryDate',
]);

function renderValue(field: keyof FlatLedgerRow, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') {
    if (field === 'price' || field === 'taxAmount' || field === 'discountAmount') {
      return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (field === 'executionRate' || field === 'discountRate' || field === 'taxRate') {
      return `${value}%`;
    }
    return value.toLocaleString();
  }
  return String(value);
}

export default function POCardView({
  mode,
  rows,
  purchaseOrders,
  starredIds,
  onToggleStar,
  onCardClick,
  visibleFields,
  fieldNames,
  groupBy,
}: POCardViewProps) {
  // mode === 'po-card' 时，把同一 PO 的多行折叠为 1 张卡片
  const cards = useMemo(() => {
    if (mode === 'item-card') return rows;
    const seen = new Set<string>();
    const dedup: FlatLedgerRow[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      dedup.push(row);
    }
    return dedup;
  }, [mode, rows]);

  const grouped = useMemo(() => {
    if (!groupBy) {
      return [{ key: '__all__', label: '全部', items: cards }];
    }

    const map = new Map<string, FlatLedgerRow[]>();
    for (const row of cards) {
      const rawKey = row[groupBy];
      const key = rawKey === null || rawKey === undefined || rawKey === '' ? '(空)' : String(rawKey);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    const groupList = Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: key,
      items,
    }));
    groupList.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
    return groupList;
  }, [cards, groupBy]);

  return (
    <div className="space-y-3">
      {grouped.map(group => {
        return (
          <CardGroup
            key={group.key}
            group={group}
            mode={mode}
            purchaseOrders={purchaseOrders}
            starredIds={starredIds}
            onToggleStar={onToggleStar}
            onCardClick={onCardClick}
            visibleFields={visibleFields}
            fieldNames={fieldNames}
            showHeader={groupBy !== null}
          />
        );
      })}
      {grouped.every(group => group.items.length === 0) && (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs font-sans">
          🚨 当前筛选条件下没有匹配的台账
        </div>
      )}
    </div>
  );
}

interface CardGroupProps {
  group: { key: string; label: string; items: FlatLedgerRow[] };
  mode: CardViewMode;
  purchaseOrders: PurchaseOrder[];
  starredIds: Set<string>;
  onToggleStar?: (id: string) => void;
  onCardClick: (poId: string) => void;
  visibleFields: (keyof FlatLedgerRow)[];
  fieldNames: Record<string, string>;
  showHeader: boolean;
  key?: string;
}

function CardGroup({
  group,
  mode,
  purchaseOrders,
  starredIds,
  onToggleStar,
  onCardClick,
  visibleFields,
  fieldNames,
  showHeader,
}: CardGroupProps) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      {showHeader && (
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-colors mb-2"
        >
          <span className="flex items-center gap-2">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {group.label}
          </span>
          <span className="text-[10px] font-mono text-slate-500">{group.items.length} 项</span>
        </button>
      )}

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {group.items.map((row, idx) => (
            <PurchaseCard
              key={`${row.id}-${row.code}-${idx}`}
              row={row}
              mode={mode}
              purchaseOrders={purchaseOrders}
              starredIds={starredIds}
              onToggleStar={onToggleStar}
              onCardClick={onCardClick}
              visibleFields={visibleFields}
              fieldNames={fieldNames}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PurchaseCardProps {
  row: FlatLedgerRow;
  mode: CardViewMode;
  purchaseOrders: PurchaseOrder[];
  starredIds: Set<string>;
  onToggleStar?: (id: string) => void;
  onCardClick: (poId: string) => void;
  visibleFields: (keyof FlatLedgerRow)[];
  fieldNames: Record<string, string>;
  key?: string;
}

function PurchaseCard({
  row,
  mode,
  purchaseOrders,
  starredIds,
  onToggleStar,
  onCardClick,
  visibleFields,
  fieldNames,
}: PurchaseCardProps) {
  const isStarred = starredIds.has(row.id);
  const po = useMemo(() => purchaseOrders.find(p => p.id === row.id) ?? null, [purchaseOrders, row.id]);
  const itemCount = po?.items.length ?? 0;
  const totalAmount = po ? po.items.reduce((sum, item) => sum + item.orderedQty * item.price, 0) : 0;

  // po-card 模式下只显示 PO 级别字段；item-card 模式下两类字段都显示
  const fields = useMemo(() => {
    return visibleFields.filter(field => {
      if (field === 'id') return false; // 已显示在标题
      if (mode === 'po-card') return PO_LEVEL_FIELDS.has(field);
      return true;
    });
  }, [visibleFields, mode]);

  return (
    <div
      onClick={() => onCardClick(row.id)}
      className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex flex-col"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            {mode === 'po-card' ? 'PO 单据' : '物料行'}
          </div>
          <div className="text-sm font-extrabold text-slate-900 font-mono truncate" title={row.id}>
            {row.id}
          </div>
          {mode === 'item-card' && (
            <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5" title={`${row.code} · ${row.name}`}>
              {row.code} · {row.name}
            </div>
          )}
        </div>
        {onToggleStar && (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onToggleStar(row.id);
            }}
            className="shrink-0 p-1 rounded hover:bg-slate-100 transition-colors"
            title={isStarred ? '取消星标' : '加星标'}
          >
            <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
          </button>
        )}
      </div>

      {/* Quick stats */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100 text-[10px] font-mono">
        <span className="text-slate-500">
          供应商: <strong className="text-slate-800 font-sans truncate max-w-[140px] inline-block align-bottom" title={row.supplier}>{row.supplier || '-'}</strong>
        </span>
        {mode === 'po-card' && (
          <span className="text-slate-500">
            物料 <strong className="text-slate-800">{itemCount}</strong> 项 · ¥<strong className="text-emerald-600">{totalAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</strong>
          </span>
        )}
      </div>

      {/* Status pills */}
      <div className="px-4 py-2 flex flex-wrap gap-1 border-b border-slate-100">
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
          row.status === '已审核' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          {row.status || '-'}
        </span>
        <span className="text-[9px] bg-slate-50 text-slate-600 px-1.5 py-0.5 rounded font-bold border border-slate-200">
          {row.executionStatus || '-'}
        </span>
        <span className="text-[9px] bg-slate-50 text-slate-600 px-1.5 py-0.5 rounded font-bold border border-slate-200">
          {row.inboundStatus || '-'}
        </span>
      </div>

      {/* Field grid */}
      <div className="px-4 py-3 space-y-1.5 text-[11px] flex-1">
        {fields.length === 0 ? (
          <p className="text-[10px] text-slate-400 font-mono">在「字段配置」中开启字段以显示更多信息</p>
        ) : (
          fields.map(field => {
            const value = row[field];
            if (value === undefined || value === null || value === '') return null;
            const label = fieldNames[field] ?? String(field);
            return (
              <div key={String(field)} className="flex items-start justify-between gap-3">
                <span className="text-slate-400 font-sans text-[10px] shrink-0">{label}</span>
                <span className="text-slate-700 font-mono font-semibold text-right break-all">
                  {renderValue(field, value)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
