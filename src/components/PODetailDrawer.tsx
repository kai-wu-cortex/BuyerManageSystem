import { motion, AnimatePresence } from 'motion/react';
import { Briefcase, Calendar, Clock, MessageSquare, Sliders, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OrderItem, PurchaseOrder } from '../types';

const DEFAULT_DRAWER_FIELDS = {
  supplier: true,
  status: true,
  dates: true,
  items: true,
  amount: true,
  progress: true,
} as const;

// 物料行可选展示字段 (key 对应 OrderItem 上的字段，或 'subtotal' 等计算值)
type ItemFieldKey =
  | 'price'
  | 'orderedQty'
  | 'basicQty'
  | 'executedQty'
  | 'executedBasicQty'
  | 'unexecutedQty'
  | 'unexecutedBasicQty'
  | 'executedInboundQty'
  | 'executedNotInboundQty'
  | 'executionRate'
  | 'rowExecutionStatus'
  | 'rowInboundStatus'
  | 'taxRate'
  | 'taxAmount'
  | 'category'
  | 'daysRemaining'
  | 'lastInboundDate'
  | 'inboundDate'
  | 'customerName'
  | 'sourceOrderId'
  | 'remark'
  | 'subtotal';

const ITEM_FIELD_LABELS: Record<ItemFieldKey, string> = {
  price: '采购单价',
  orderedQty: '采购数量',
  basicQty: '基本数量',
  executedQty: '已执行数量',
  executedBasicQty: '已执行基本数量',
  unexecutedQty: '未执行数量',
  unexecutedBasicQty: '未执行基本数量',
  executedInboundQty: '已执行已入库',
  executedNotInboundQty: '已执行未入库',
  executionRate: '执行比例',
  rowExecutionStatus: '行执行状态',
  rowInboundStatus: '行入库状态',
  taxRate: '税率',
  taxAmount: '税额',
  category: '商品类别',
  daysRemaining: '剩余备货天数',
  lastInboundDate: '最近入库日期',
  inboundDate: '实际入库时间',
  customerName: '客户名称',
  sourceOrderId: '源单单号',
  remark: '行备注',
  subtotal: '小计金额',
};

const DEFAULT_ITEM_FIELDS: Record<ItemFieldKey, boolean> = {
  price: true,
  orderedQty: true,
  executedQty: true,
  unexecutedQty: true,
  subtotal: true,
  basicQty: false,
  executedBasicQty: false,
  unexecutedBasicQty: false,
  executedInboundQty: false,
  executedNotInboundQty: false,
  executionRate: false,
  rowExecutionStatus: false,
  rowInboundStatus: false,
  taxRate: false,
  taxAmount: false,
  category: false,
  daysRemaining: false,
  lastInboundDate: false,
  inboundDate: false,
  customerName: false,
  sourceOrderId: false,
  remark: false,
};

type DrawerFields = Record<keyof typeof DEFAULT_DRAWER_FIELDS, boolean>;
type ItemFields = Record<ItemFieldKey, boolean>;
type DrawerCols = 1 | 2;

const STORAGE_KEY_FIELDS = 'po_detail_drawer_fields';
const STORAGE_KEY_ITEM_FIELDS = 'po_detail_drawer_item_fields';
const STORAGE_KEY_COLS = 'po_detail_drawer_cols';

function readStoredFields(): DrawerFields {
  if (typeof window === 'undefined') return { ...DEFAULT_DRAWER_FIELDS };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY_FIELDS);
    if (!saved) return { ...DEFAULT_DRAWER_FIELDS };
    const parsed = JSON.parse(saved) as Partial<DrawerFields>;
    const merged: DrawerFields = { ...DEFAULT_DRAWER_FIELDS };
    for (const key of Object.keys(merged) as (keyof DrawerFields)[]) {
      if (typeof parsed[key] === 'boolean') merged[key] = parsed[key] as boolean;
    }
    return merged;
  } catch {
    return { ...DEFAULT_DRAWER_FIELDS };
  }
}

function readStoredItemFields(): ItemFields {
  if (typeof window === 'undefined') return { ...DEFAULT_ITEM_FIELDS };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY_ITEM_FIELDS);
    if (!saved) return { ...DEFAULT_ITEM_FIELDS };
    const parsed = JSON.parse(saved) as Partial<ItemFields>;
    const merged: ItemFields = { ...DEFAULT_ITEM_FIELDS };
    for (const key of Object.keys(merged) as ItemFieldKey[]) {
      if (typeof parsed[key] === 'boolean') merged[key] = parsed[key] as boolean;
    }
    return merged;
  } catch {
    return { ...DEFAULT_ITEM_FIELDS };
  }
}

function readStoredCols(): DrawerCols {
  if (typeof window === 'undefined') return 1;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY_COLS);
    if (saved === '1' || saved === '2') return Number(saved) as DrawerCols;
  } catch {
    // ignore
  }
  return 1;
}

interface PODetailDrawerProps {
  open: boolean;
  po: PurchaseOrder | null;
  onClose: () => void;
  /** 点击「前往管理台账」时跳转，传 null 隐藏跳转按钮 */
  onJumpToLedger?: ((poId: string) => void) | null;
  /** 跳转按钮文案，默认「前往管理台账 →」 */
  jumpLabel?: string;
}

export default function PODetailDrawer({ open, po, onClose, onJumpToLedger, jumpLabel }: PODetailDrawerProps) {
  const [drawerFields, setDrawerFields] = useState<DrawerFields>(readStoredFields);
  const [itemFields, setItemFields] = useState<ItemFields>(readStoredItemFields);
  const [drawerCols, setDrawerCols] = useState<DrawerCols>(readStoredCols);
  const [showDrawerConfig, setShowDrawerConfig] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY_FIELDS, JSON.stringify(drawerFields));
  }, [drawerFields]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY_ITEM_FIELDS, JSON.stringify(itemFields));
  }, [itemFields]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY_COLS, String(drawerCols));
  }, [drawerCols]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="relative w-full max-w-2xl bg-slate-50 shadow-2xl border-l border-slate-200 h-full flex flex-col z-10"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
              <div>
                <span className="font-mono font-bold text-slate-400 text-[10px] uppercase">
                  单据详情 / ORDER DETAIL
                </span>
                <h2 className="text-sm font-extrabold text-slate-900 font-mono mt-1">
                  PO ID: {po?.id ?? '-'}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDrawerConfig(prev => !prev)}
                  className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 text-[10px] uppercase font-bold ${
                    showDrawerConfig
                      ? 'bg-blue-50 border-blue-200 text-blue-600'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                  title="显示与布局设置"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>显示与布局</span>
                </button>
                <button
                  onClick={onClose}
                  className="p-1 px-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-transparent"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Config panel */}
            {showDrawerConfig && (
              <div className="bg-white p-4 border-b border-slate-200 shadow-inner space-y-4 max-h-[55vh] overflow-y-auto">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5 font-mono">
                    每行显示数量 / COLS
                  </span>
                  <div className="flex bg-slate-100 p-1 rounded-lg w-max">
                    {([1, 2] as DrawerCols[]).map(cols => (
                      <button
                        key={cols}
                        onClick={() => setDrawerCols(cols)}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${
                          drawerCols === cols ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {cols === 1 ? '单列 (一列)' : '双列 (二列并排)'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5 font-mono">
                    单据级展示字段 / PO FIELDS
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {([
                      ['supplier', '供应商 VEN'],
                      ['status', '单据状态 STATUS'],
                      ['dates', '协议交期 TIME'],
                      ['items', '物料条目 ITEMS'],
                      ['amount', '订单总金额 AMNT'],
                      ['progress', '入库与履约 PROGRESS'],
                    ] as [keyof DrawerFields, string][]).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-1.5 rounded cursor-pointer text-[11px] font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={drawerFields[key]}
                          onChange={event => setDrawerFields(prev => ({ ...prev, [key]: event.target.checked }))}
                          className="w-3.5 h-3.5 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 block font-mono">
                      物料行展示字段 / ITEM FIELDS
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setItemFields({ ...DEFAULT_ITEM_FIELDS })}
                        className="px-2 py-0.5 text-[9px] font-bold rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                      >
                        重置默认
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setItemFields(prev => {
                            const next = { ...prev };
                            for (const key of Object.keys(next) as ItemFieldKey[]) next[key] = true;
                            return next;
                          })
                        }
                        className="px-2 py-0.5 text-[9px] font-bold rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                      >
                        全选
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(Object.keys(ITEM_FIELD_LABELS) as ItemFieldKey[]).map(key => (
                      <label key={key} className="flex items-center gap-1.5 rounded cursor-pointer text-[11px] font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={itemFields[key]}
                          onChange={event => setItemFields(prev => ({ ...prev, [key]: event.target.checked }))}
                          className="w-3.5 h-3.5 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                        />
                        {ITEM_FIELD_LABELS[key]}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 content-start select-text">
              {!po ? (
                <div className="text-center py-16 text-slate-400 font-mono text-xs border-2 border-dashed border-slate-200 bg-white rounded-xl">
                  未找到该订单的详细信息 / INFO NOT FOUND
                </div>
              ) : (
                <PODetailBody po={po} drawerCols={drawerCols} drawerFields={drawerFields} itemFields={itemFields} />
              )}
            </div>

            {/* Footer jump button */}
            {po && onJumpToLedger && (
              <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">在主台账中编辑或查看更多操作</p>
                <button
                  onClick={() => onJumpToLedger(po.id)}
                  className="px-3.5 py-1.5 text-[11px] font-bold bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all font-mono whitespace-nowrap shrink-0"
                >
                  {jumpLabel ?? '前往管理台账 →'}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface PODetailBodyProps {
  po: PurchaseOrder;
  drawerCols: DrawerCols;
  drawerFields: DrawerFields;
  itemFields: ItemFields;
}

function formatItemFieldValue(item: OrderItem, key: ItemFieldKey): string | null {
  if (key === 'subtotal') {
    const value = item.orderedQty * item.price;
    return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const raw = item[key as keyof OrderItem];
  if (raw === undefined || raw === null || raw === '') return null;

  if (key === 'price' || key === 'taxAmount') {
    const num = Number(raw);
    if (!Number.isFinite(num)) return String(raw);
    return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (key === 'taxRate' || key === 'executionRate') {
    const num = Number(raw);
    if (!Number.isFinite(num)) return String(raw);
    return `${num}%`;
  }

  if (key === 'orderedQty' || key === 'basicQty' || key === 'executedQty' || key === 'executedBasicQty'
    || key === 'unexecutedQty' || key === 'unexecutedBasicQty' || key === 'executedInboundQty'
    || key === 'executedNotInboundQty') {
    const num = Number(raw);
    if (!Number.isFinite(num)) return String(raw);
    return `${num.toLocaleString()} ${item.unit ?? ''}`.trim();
  }

  if (key === 'daysRemaining') {
    const num = Number(raw);
    if (!Number.isFinite(num)) return String(raw);
    return `${num} 天`;
  }

  return String(raw);
}

function PODetailBody({ po, drawerCols, drawerFields, itemFields }: PODetailBodyProps) {
  const totalPOAmount = po.items.reduce((sum, item) => sum + (item.orderedQty * item.price), 0);
  const activeItemFieldKeys = (Object.keys(ITEM_FIELD_LABELS) as ItemFieldKey[]).filter(key => itemFields[key]);

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 ${drawerCols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {drawerFields.supplier && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block mb-1">
              供应商 / SUPPLIER
            </span>
            <span className="text-xs font-bold text-slate-700 font-sans flex items-center gap-1.5 mt-1">
              <Briefcase className="w-4 h-4 text-[#2563EB] shrink-0" />
              <span className="truncate" title={po.supplier}>{po.supplier}</span>
            </span>
          </div>
        )}

        {drawerFields.status && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block mb-1">
              单据与执行状态 / STATUS
            </span>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                po.status === '已审核' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-[#B45309] border border-amber-200'
              }`}>
                {po.status}
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-650 px-2 py-0.5 rounded font-bold border border-slate-200 font-mono">
                {po.executionStatus}
              </span>
            </div>
          </div>
        )}

        {drawerFields.dates && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block mb-2">
              周期节点信息 / MILESTONES
            </span>
            <div className="space-y-1.5 text-[11px] font-mono text-slate-605 font-medium">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-sans text-[10px]">下单日期:</span>
                <span className="text-slate-800 font-bold flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {po.date}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 font-sans text-[10px]">交期承诺:</span>
                <span className="text-slate-800 font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {po.deliveryDate}
                </span>
              </div>
            </div>
          </div>
        )}

        {drawerFields.amount && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block mb-1">
              采购明细总价 / TOTAL BUDGET
            </span>
            <div className="mt-1">
              <span className="text-[16px] font-mono font-bold text-emerald-600">
                ¥{totalPOAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {drawerFields.progress && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block mb-1.5 font-sans">
              入库执行进度 / INBOUND PROGRESS
            </span>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>{po.inboundStatus}</span>
                <span className="font-mono text-[#2563EB]">
                  {po.inboundStatus === '全部入库' ? '100%' : po.inboundStatus === '部分入库' ? '50%' : '0%'}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden bg-opacity-70">
                <div
                  className="bg-[#2563EB] h-2 transition-all duration-300"
                  style={{
                    width: po.inboundStatus === '全部入库' ? '100%' : po.inboundStatus === '部分入库' ? '50%' : '0%',
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {drawerFields.items && po.items.length > 0 && (
        <div className="space-y-3 mt-4">
          <div className="border-b border-slate-200 pb-1.5">
            <h3 className="text-xs font-bold text-slate-700 font-sans uppercase tracking-wider">
              订作物料明细清单 / PO ITEMS ({po.items.length})
            </h3>
          </div>

          <div className={`grid gap-3 ${drawerCols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {po.items.map((item, idx) => (
              <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-1 border-b border-slate-105 pb-2 mb-2">
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 text-xs block truncate" title={item.name}>{item.name}</span>
                      <span className="text-[10px] font-mono text-slate-400 block truncate" title={item.spec}>
                        规格: {item.spec}
                      </span>
                    </div>
                    <span className="text-[9px] bg-slate-100 text-slate-500 font-mono px-1.5 py-0.5 rounded font-bold shrink-0">
                      #{idx + 1}
                    </span>
                  </div>

                  {activeItemFieldKeys.length === 0 ? (
                    <p className="text-[10px] text-slate-400 font-mono">在「显示与布局 → 物料行展示字段」勾选要显示的字段</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono text-slate-500">
                      {activeItemFieldKeys.map(key => {
                        const display = formatItemFieldValue(item, key);
                        if (display === null) return null;
                        return (
                          <div key={key} className="flex items-baseline justify-between gap-2 min-w-0">
                            <span className="text-slate-400 font-sans text-[9px] shrink-0">{ITEM_FIELD_LABELS[key]}</span>
                            <strong className="text-slate-700 truncate text-right" title={display}>{display}</strong>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {po.remarks && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider">
              单据备注 / REMARKS
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">{po.remarks}</p>
        </div>
      )}
    </div>
  );
}
