import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PurchaseOrder, POStatus, PurchaseExecutionStatus, InboundStatus, OrderItem } from '../types';
import { getFlatLedgerRows, FlatLedgerRow, parseClipboardLine } from '../utils/ledgerHelper';
// xlsx + exceljs 体积大且仅在文件上传时使用，改为函数内 dynamic import 按需加载
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  ArrowUpDown, 
  FileSpreadsheet,
  Upload,
  RotateCcw,
  Sliders,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Settings,
  HelpCircle,
  MessageSquare,
  Copy,
  Check,
  X,
  Star
} from 'lucide-react';
import { useStarredPOs } from '../lib/hooks';
import {
  loadBuyerSystemViewSettings,
  saveBuyerSystemViewSettings,
  type CloudbaseAuthUser,
  type LedgerViewSettings,
} from '../lib/cloudbaseData';
import PODetailDrawer from './PODetailDrawer';
import POCardView, { type CardViewMode } from './POCardView';

interface POListProps {
  purchaseOrders: PurchaseOrder[];
  onReplaceOrders: (orders: PurchaseOrder[]) => void;
  targetSearchTerm?: string;
  onClearTargetSearchTerm?: () => void;
  onNavigateToNotes?: (poId: string, autoAdd?: boolean) => void;
  notes?: Record<string, any>;
  authUser?: CloudbaseAuthUser | null;
}

type LedgerColumnConfig = { field: keyof FlatLedgerRow; name: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRowHeight(value: unknown): value is LedgerViewSettings['rowHeight'] {
  return value === 'compact' || value === 'medium' || value === 'relaxed';
}

function isSheetSortOrder(value: unknown): value is LedgerViewSettings['sheetSortOrder'] {
  return value === 'asc' || value === 'desc';
}

function sanitizeLedgerColumnsList(
  value: unknown,
  defaultColumns: LedgerColumnConfig[],
): LedgerColumnConfig[] {
  const validFields = new Set(defaultColumns.map(column => column.field));
  if (!Array.isArray(value)) {
    return defaultColumns;
  }

  const filtered: LedgerColumnConfig[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.field !== 'string' || typeof item.name !== 'string') {
      continue;
    }

    const field = item.field as keyof FlatLedgerRow;
    if (validFields.has(field) && !filtered.some(column => column.field === field)) {
      filtered.push({ field, name: item.name });
    }
  }

  if (filtered.length === 0) {
    return defaultColumns;
  }

  const missing = defaultColumns.filter(column => !filtered.some(item => item.field === column.field));
  return [...filtered, ...missing];
}

function sanitizeHiddenFields(value: unknown, defaultColumns: LedgerColumnConfig[]): (keyof FlatLedgerRow)[] {
  const validFields = new Set(defaultColumns.map(column => column.field));
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((field): field is keyof FlatLedgerRow => (
    typeof field === 'string' && validFields.has(field as keyof FlatLedgerRow)
  ));
}

function sanitizeColumnWidths(value: unknown, defaultWidths: Record<string, number>): Record<string, number> {
  if (!isRecord(value)) {
    return defaultWidths;
  }

  const next = { ...defaultWidths };
  for (const [field, width] of Object.entries(value)) {
    if (field in defaultWidths && typeof width === 'number' && Number.isFinite(width)) {
      next[field] = Math.max(50, Math.round(width));
    }
  }
  return next;
}

// Supplier typical material fallback
export const SUPPLIER_MATERIAL_MAPPING: Record<string, Partial<OrderItem>> = {
  "广东邦固化学科技有限公司": { code: "NHJBHG7501", name: "粘合剂BHG-20KG/件", spec: "20KG/件", category: "包装物", unit: "KG", price: 50.00 },
  "厦门联盛智能包装科技有限公司": { code: "PBQRFID741", name: "沃尔玛RFID", spec: "7.4*1.8CM", category: "标签", unit: "PCS", price: 0.23 },
  "广州市新稀冶金化工有限公司": { code: "HXCXHCGSI", name: "活性超细合成铝", spec: "SHGL-101-4", category: "原材料", unit: "KG", price: 22.50 },
  "深圳祥泰兴包装制品有限公司": { code: "RFHDFZX15", name: "复合袋 仿真雪", spec: "10*15+4CM 7c", category: "袋子", unit: "PCS", price: 0.165 },
  "东莞市凌宇颜料有限公司": { code: "RLY12000400", name: "LY120/110", spec: "100目", category: "珠光粉", unit: "KG", price: 27.00 },
  "致业": { code: "WLSM", name: "拉伸膜", spec: "1000m,五卷", category: "原材料", unit: "卷", price: 24.1667 },
  "东莞市丰彩新材料有限公司": { code: "XSJ102165", name: "102#稀释剂", spec: "1*165", category: "原材料", unit: "KG", price: 8.80 }
};

// Row height class generator
const getRowPaddingClass = (rowHeight: 'compact' | 'medium' | 'relaxed') => {
  switch (rowHeight) {
    case 'compact':
      return 'py-1 px-2.5 text-[10px] leading-tight';
    case 'relaxed':
      return 'py-3.5 px-3.5 text-[13px] leading-relaxed';
    default:
      return 'py-2 px-2.5 text-[11px]';
  }
};

// Render content cell based on field
const renderCellContent = (
  field: keyof FlatLedgerRow, 
  row: FlatLedgerRow, 
  isOverdue: boolean,
  starredIds: Set<string>,
  toggleStar: (id: string) => void,
  onNavigateToNotes?: (poId: string, autoAdd?: boolean) => void,
  notesCount?: number
) => {
  switch (field) {
    case 'id':
      const isStarred = starredIds.has(row.id);
      return (
        <div className="flex items-center gap-0.5 group">
          <button 
            type="button"
            onClick={(e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              toggleStar(row.id); 
            }} 
            className="shrink-0 p-1.5 -ml-1 rounded transition-colors cursor-pointer outline-none hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center relative z-20 pointer-events-auto"
            title={isStarred ? "取消星标" : "设为星标"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={isStarred ? "#EAB308" : "none"} stroke={isStarred ? "#EAB308" : "#94A3B8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 pointer-events-none">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
          <span className="font-bold text-slate-800 font-mono text-[11px] truncate max-w-[105px]">{row.id}</span>
          
          {/* Quick Note Badge / Create note button */}
          {onNavigateToNotes && (
            notesCount && notesCount > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onNavigateToNotes(row.id, false);
                }}
                className="ml-1 shrink-0 px-1 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-800 text-[8px] font-sans font-black flex items-center gap-0.5 hover:bg-amber-200 hover:shadow-2xs transition-all cursor-pointer relative z-20 pointer-events-auto scale-90"
                title={`该采购单已有 ${notesCount} 条便签备注。点击查看详情`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8.5L15.5 3Z"/>
                  <path d="M15 3v6h6"/>
                </svg>
                <span>{notesCount}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onNavigateToNotes(row.id, true);
                }}
                className="ml-1 shrink-0 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 hover:border hover:border-blue-200 rounded transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 relative z-20 pointer-events-auto"
                title="写便签 / 直接创建备注便签"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8.5L15.5 3Z"/>
                  <path d="M15 3v6h6"/>
                </svg>
              </button>
            )
          )}
        </div>
      );
    case 'date':
      return <span className="text-slate-500 font-mono text-[11px]">{row.date}</span>;
    case 'supplier':
      return <span className="text-slate-800 font-sans font-semibold text-[11px]">{row.supplier}</span>;
    case 'status':
      return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold inline-block ${row.status === '已审核' ? 'bg-emerald-50 text-[#22C55E]' : 'bg-rose-50 text-[#EF4444]'}`}>
          {row.status}
        </span>
      );
    case 'executionStatus':
      return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold inline-block ${row.executionStatus === '全部执行' ? 'bg-emerald-50 text-[#22C55E]' : row.executionStatus === '部分执行' ? 'bg-amber-50 text-[#F97316]' : 'bg-slate-100 text-slate-500'}`}>
          {row.executionStatus}
        </span>
      );
    case 'inboundStatus':
      return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold inline-block ${row.inboundStatus === '全部入库' ? 'bg-emerald-50 text-[#22C55E]' : row.inboundStatus === '部分入库' ? 'bg-amber-50 text-[#F97316]' : 'bg-slate-100 text-slate-500'}`}>
          {row.inboundStatus}
        </span>
      );
    case 'remarks':
      return <span className="text-slate-500 font-sans max-w-[150px] truncate block" title={row.remarks}>{row.remarks || '-'}</span>;
    case 'discountRate': {
      const val = typeof row.discountRate === 'number' ? `${row.discountRate}%` : row.discountRate;
      return <span className="text-right font-bold text-slate-600 block">{val || '0%'}</span>;
    }
    case 'discountAmount': {
      const val = typeof row.discountAmount === 'number' ? `¥${row.discountAmount.toFixed(2)}` : row.discountAmount;
      return <span className="text-right font-bold text-indigo-600 block">{val || '¥0.00'}</span>;
    }
    case 'rowExecutionStatus':
      return (
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold inline-block ${row.rowExecutionStatus === '全部执行' ? 'bg-emerald-100 text-[#22C55E]' : row.rowExecutionStatus === '部分执行' ? 'bg-amber-100 text-[#F97316]' : 'bg-slate-100 text-slate-500'}`}>
          {row.rowExecutionStatus}
        </span>
      );
    case 'rowInboundStatus':
      return (
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold inline-block ${row.rowInboundStatus === '全部入库' ? 'bg-emerald-100 text-[#22C55E]' : row.rowInboundStatus === '部分入库' ? 'bg-amber-100 text-[#F97316]' : 'bg-slate-100 text-slate-500'}`}>
          {row.rowInboundStatus}
        </span>
      );
    case 'code':
      return <span className="text-blue-700 font-mono font-bold">{row.code}</span>;
    case 'name':
      return <span className="text-slate-900 font-sans font-semibold">{row.name}</span>;
    case 'spec':
      return <span className="text-slate-600 font-sans">{row.spec}</span>;
    case 'category':
      return <span className="text-slate-500 font-sans">{row.category}</span>;
    case 'unit':
      return <span className="text-center text-slate-600 block">{row.unit}</span>;
    case 'orderedQty':
      return <span className="text-right font-bold text-slate-900 block">{row.orderedQty.toLocaleString()}</span>;
    case 'basicQty':
      return <span className="text-right font-bold text-slate-600 block">{(row.basicQty !== undefined ? row.basicQty : row.orderedQty).toLocaleString()}</span>;
    case 'price':
      return <span className="text-right font-bold text-slate-900 block font-mono">¥{row.price.toFixed(4)}</span>;
    case 'taxRate':
      return <span className="text-right text-slate-500 block">{row.taxRate}%</span>;
    case 'taxAmount':
      return <span className="text-right font-semibold text-amber-600 block">¥{row.taxAmount ? row.taxAmount.toFixed(2) : '0.00'}</span>;
    case 'remark':
      return <span className="text-slate-400 font-sans max-w-[150px] truncate block" title={row.remark}>{row.remark || '-'}</span>;
    case 'executedBasicQty':
      return <span className="text-right text-slate-600 block">{row.executedBasicQty}</span>;
    case 'executedQty':
      return <span className="text-right font-bold text-[#22C55E] block">{row.executedQty}</span>;
    case 'unexecutedBasicQty':
      return <span className="text-right text-slate-600 block">{row.unexecutedBasicQty}</span>;
    case 'unexecutedQty':
      return <span className="text-right text-slate-600 block">{row.unexecutedQty}</span>;
    case 'executedInboundQty':
      return <span className="text-right font-semibold text-slate-800 block">{row.executedInboundQty}</span>;
    case 'executedNotInboundQty':
      return <span className="text-right text-slate-500 block">{row.executedNotInboundQty}</span>;
    case 'executionRate':
      return <span className="text-right font-bold text-[#22C55E] block">{row.executionRate}%</span>;
    case 'daysRemaining':
      return (
        <span className={`text-center font-bold block ${isOverdue ? 'text-red-500 font-extrabold animate-pulse' : 'text-slate-600'}`}>
          {row.daysRemaining !== undefined ? (isOverdue && typeof row.daysRemaining === 'number' ? `超期 ${Math.abs(row.daysRemaining)} 天` : `${row.daysRemaining} 天`) : '-'}
        </span>
      );
    case 'lastInboundDate':
      return <span className="text-slate-500 block font-mono">{row.lastInboundDate || '未开始'}</span>;
    case 'customerName':
      return <span className="text-slate-700 font-sans font-semibold block">{row.customerName || '烫金事业部'}</span>;
    case 'sourceOrderId':
      return <span className="font-mono text-slate-500 block">{row.sourceOrderId || '无自提源'}</span>;
    case 'transportMethod':
      return <span className="text-slate-600 font-sans block">{row.transportMethod}</span>;
    case 'settlementType':
      return <span className="text-slate-600 font-sans block">{row.settlementType}</span>;
    case 'deliveryDate':
      return <span className="font-bold text-[#F97316] block font-mono">{row.deliveryDate}</span>;
    default:
      return <span>{String(row[field] || '')}</span>;
  }
};

export default function POList({ 
  purchaseOrders, 
  onReplaceOrders,
  targetSearchTerm, 
  onClearTargetSearchTerm,
  onNavigateToNotes,
  notes,
  authUser = null
}: POListProps) {
  const { starredIds, toggleStar } = useStarredPOs();

  // Load sticky notes count map for badges
  const [poNotesMap, setPoNotesMap] = useState<Record<string, number>>({});

  useEffect(() => {
    const handleLoadNotes = () => {
      const activeNotes = notes || (() => {
        const savedNotes = localStorage.getItem('order_sticky_notes');
        try {
          return savedNotes ? JSON.parse(savedNotes) : {};
        } catch (e) {
          return {};
        }
      })();

      const map: Record<string, number> = {};
      Object.keys(activeNotes).forEach(poId => {
        const entry = activeNotes[poId];
        if (entry) {
          if (Array.isArray(entry.notesList)) {
            const nonEmptyCount = entry.notesList.filter((n: any) => n.noteText && n.noteText.trim().length > 0).length;
            if (nonEmptyCount > 0) {
              map[poId] = nonEmptyCount;
            }
          } else if (entry.noteText && entry.noteText.trim().length > 0) {
            map[poId] = 1;
          }
        }
      });
      setPoNotesMap(map);
    };
    handleLoadNotes();
  }, [purchaseOrders, notes]);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [execFilter, setExecFilter] = useState<string>('');
  const [inboundFilter, setInboundFilter] = useState<string>('');
  const [dateStartFilter, setDateStartFilter] = useState<string>('');
  const [dateEndFilter, setDateEndFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [showStarredOnly, setShowStarredOnly] = useState(false);

  useEffect(() => {
    if (targetSearchTerm) {
      setSearchTerm(targetSearchTerm);
      setStatusFilter('');
      setExecFilter('');
      setInboundFilter('');
      setDateStartFilter('');
      setDateEndFilter('');
      setSupplierFilter('');
      if (onClearTargetSearchTerm) onClearTargetSearchTerm();
    }
  }, [targetSearchTerm, onClearTargetSearchTerm]);

  // Remark Detail Modal State
  const [remarkModal, setRemarkModal] = useState<{
    title: string;
    fieldName: string;
    content: string;
    poId: string;
    itemName: string;
  } | null>(null);

  // 行点击打开 PO 详情抽屉
  const [detailDrawerPOId, setDetailDrawerPOId] = useState<string | null>(null);
  const detailDrawerPO = useMemo(
    () => (detailDrawerPOId ? purchaseOrders.find(po => po.id === detailDrawerPOId) ?? null : null),
    [detailDrawerPOId, purchaseOrders],
  );

  // 视图模式: 表格 / PO 卡片 / 物料行卡片
  const [viewMode, setViewMode] = useState<'table' | CardViewMode>(() => {
    if (typeof window === 'undefined') return 'table';
    const saved = window.localStorage.getItem('po_list_view_mode');
    if (saved === 'table' || saved === 'po-card' || saved === 'item-card') return saved;
    return 'table';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('po_list_view_mode', viewMode);
  }, [viewMode]);

  // 卡片视图分组字段
  const [cardGroupBy, setCardGroupBy] = useState<keyof FlatLedgerRow | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem('po_list_card_group_by');
    return (saved && saved !== '__none__') ? (saved as keyof FlatLedgerRow) : null;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('po_list_card_group_by', cardGroupBy ?? '__none__');
  }, [cardGroupBy]);

  // Row Height State: 'compact' | 'medium' | 'relaxed' with persistence
  const [rowHeight, setRowHeight] = useState<'compact' | 'medium' | 'relaxed'>(() => {
    const saved = localStorage.getItem('po_list_row_height');
    if (saved === 'compact' || saved === 'medium' || saved === 'relaxed') {
      return saved;
    }
    return 'medium';
  });

  useEffect(() => {
    localStorage.setItem('po_list_row_height', rowHeight);
  }, [rowHeight]);

  // Spreadsheet Sort fields with persistence
  const [sheetSortField, setSheetSortField] = useState<keyof FlatLedgerRow>(() => {
    const saved = localStorage.getItem('po_list_sheet_sort_field');
    const validFields = [
      'id', 'date', 'supplier', 'status', 'executionStatus', 'inboundStatus', 'remarks',
      'discountRate', 'discountAmount', 'rowExecutionStatus', 'rowInboundStatus', 'code',
      'name', 'spec', 'category', 'unit', 'orderedQty', 'basicQty', 'price', 'taxRate',
      'taxAmount', 'remark', 'executedBasicQty', 'executedQty', 'unexecutedBasicQty',
      'unexecutedQty', 'executedInboundQty', 'executedNotInboundQty', 'executionRate',
      'daysRemaining', 'lastInboundDate', 'customerName', 'sourceOrderId', 'transportMethod',
      'settlementType', 'deliveryDate'
    ];
    if (saved && validFields.includes(saved)) {
      return saved as keyof FlatLedgerRow;
    }
    return 'date';
  });

  const [sheetSortOrder, setSheetSortOrder] = useState<'asc' | 'desc'>(() => {
    const saved = localStorage.getItem('po_list_sheet_sort_order');
    if (saved === 'asc' || saved === 'desc') {
      return saved;
    }
    return 'desc';
  });

  useEffect(() => {
    localStorage.setItem('po_list_sheet_sort_field', sheetSortField);
  }, [sheetSortField]);

  useEffect(() => {
    localStorage.setItem('po_list_sheet_sort_order', sheetSortOrder);
  }, [sheetSortOrder]);

  // Standard Columns Definition List
  const DEFAULT_COLUMNS: LedgerColumnConfig[] = [
    { field: 'id', name: '单据编号' }, 
    { field: 'date', name: '单据日期' }, 
    { field: 'supplier', name: '供应商' },
    { field: 'status', name: '单据状态' }, 
    { field: 'executionStatus', name: '执行状态' }, 
    { field: 'inboundStatus', name: '入库状态' },
    { field: 'remarks', name: '单据备注' }, 
    { field: 'discountRate', name: '整单折扣率（%）' }, 
    { field: 'discountAmount', name: '整单折扣额' },
    { field: 'rowExecutionStatus', name: '行执行状态' }, 
    { field: 'rowInboundStatus', name: '行入库状态' }, 
    { field: 'code', name: '商品编码' },
    { field: 'name', name: '商品名称' }, 
    { field: 'spec', name: '规格型号' }, 
    { field: 'category', name: '商品类别' },
    { field: 'unit', name: '单位' }, 
    { field: 'orderedQty', name: '数量' }, 
    { field: 'basicQty', name: '基本数量' },
    { field: 'price', name: '实际含税单价' }, 
    { field: 'taxRate', name: '增值税税率（%）' }, 
    { field: 'taxAmount', name: '税额' },
    { field: 'remark', name: '商品行备注' }, 
    { field: 'executedBasicQty', name: '行已执行基本单位数量' }, 
    { field: 'executedQty', name: '行已执行数量' },
    { field: 'unexecutedBasicQty', name: '行未执行基本单位数量' }, 
    { field: 'unexecutedQty', name: '行未执行数量' }, 
    { field: 'executedInboundQty', name: '已执行已入库数量' },
    { field: 'executedNotInboundQty', name: '已执行未入库数量' }, 
    { field: 'executionRate', name: '执行比例(%)' }, 
    { field: 'daysRemaining', name: '剩余备货天数' },
    { field: 'lastInboundDate', name: '最近入库日期' }, 
    { field: 'customerName', name: '客户名称' }, 
    { field: 'sourceOrderId', name: '源单单号' },
    { field: 'transportMethod', name: '运输方式' }, 
    { field: 'settlementType', name: '结算方式' }, 
    { field: 'deliveryDate', name: '交货日期' }
  ];

  const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    id: 120,
    date: 100,
    supplier: 180,
    status: 80,
    executionStatus: 90,
    inboundStatus: 90,
    remarks: 140,
    discountRate: 110,
    discountAmount: 110,
    rowExecutionStatus: 95,
    rowInboundStatus: 95,
    code: 110,
    name: 180,
    spec: 120,
    category: 100,
    unit: 60,
    orderedQty: 80,
    basicQty: 80,
    price: 110,
    taxRate: 115,
    taxAmount: 100,
    remark: 140,
    executedBasicQty: 140,
    executedQty: 100,
    unexecutedBasicQty: 140,
    unexecutedQty: 100,
    executedInboundQty: 120,
    executedNotInboundQty: 120,
    executionRate: 100,
    daysRemaining: 110,
    lastInboundDate: 110,
    customerName: 120,
    sourceOrderId: 120,
    transportMethod: 95,
    settlementType: 95,
    deliveryDate: 100
  };

  const [columnsList, setColumnsList] = useState<{ field: keyof FlatLedgerRow; name: string }[]>(() => {
    const saved = localStorage.getItem('po_list_columns_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validFields = DEFAULT_COLUMNS.map(c => c.field);
          const filtered = parsed.filter((item: any) => item && typeof item === 'object' && validFields.includes(item.field));
          if (filtered.length > 0) {
            const missing = DEFAULT_COLUMNS.filter(dc => !filtered.some((f: any) => f.field === dc.field));
            return [...filtered, ...missing];
          }
        }
      } catch (err) {
        console.error('Failed to parse columnsList from localStorage', err);
      }
    }
    return DEFAULT_COLUMNS;
  });

  const [hiddenFields, setHiddenFields] = useState<(keyof FlatLedgerRow)[]>(() => {
    const saved = localStorage.getItem('po_list_hidden_fields');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed as (keyof FlatLedgerRow)[];
        }
      } catch (err) {
        console.error('Failed to parse hiddenFields from localStorage', err);
      }
    }
    return [];
  });

  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Column width state with persistence
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('po_list_column_widths');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_COLUMN_WIDTHS, ...parsed };
        }
      } catch (err) {
        console.error('Failed to parse columnWidths from localStorage', err);
      }
    }
    return DEFAULT_COLUMN_WIDTHS;
  });

  // Scrolling & Virtual viewport state
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const PO_LEVEL_FIELDS = useMemo(() => new Set<keyof FlatLedgerRow>([
    'id', 'date', 'supplier', 'status', 'executionStatus', 'inboundStatus', 'remarks', 'discountRate', 'discountAmount'
  ]), []);

  // Persist configurations to localStorage via useEffect
  useEffect(() => {
    localStorage.setItem('po_list_columns_list', JSON.stringify(columnsList));
  }, [columnsList]);

  useEffect(() => {
    localStorage.setItem('po_list_hidden_fields', JSON.stringify(hiddenFields));
  }, [hiddenFields]);

  // Use ref to hold current column widths to avoid stale closure under dragging stop and avoid writing to localStorage at 60fps
  const columnWidthsRef = useRef(columnWidths);
  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  const cloudSettingsLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    cloudSettingsLoadedRef.current = false;

    if (!authUser) {
      return () => {
        cancelled = true;
      };
    }

    void loadBuyerSystemViewSettings(authUser)
      .then(record => {
        if (cancelled || !record?.ledger) return;
        const settings = record.ledger;
        const validFieldSet = new Set(DEFAULT_COLUMNS.map(column => column.field));

        if (isRowHeight(settings.rowHeight)) {
          setRowHeight(settings.rowHeight);
        }
        if (typeof settings.sheetSortField === 'string' && validFieldSet.has(settings.sheetSortField as keyof FlatLedgerRow)) {
          setSheetSortField(settings.sheetSortField as keyof FlatLedgerRow);
        }
        if (isSheetSortOrder(settings.sheetSortOrder)) {
          setSheetSortOrder(settings.sheetSortOrder);
        }
        setColumnsList(sanitizeLedgerColumnsList(settings.columnsList, DEFAULT_COLUMNS));
        setHiddenFields(sanitizeHiddenFields(settings.hiddenFields, DEFAULT_COLUMNS));
        setColumnWidths(sanitizeColumnWidths(settings.columnWidths, DEFAULT_COLUMN_WIDTHS));
      })
      .catch(error => {
        console.warn('Failed to load ledger view settings from CloudBase:', error);
      })
      .finally(() => {
        if (!cancelled) {
          cloudSettingsLoadedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !cloudSettingsLoadedRef.current) {
      return;
    }

    const settings: LedgerViewSettings = {
      rowHeight,
      sheetSortField,
      sheetSortOrder,
      columnsList: columnsList.map(column => ({ field: column.field, name: column.name })),
      hiddenFields,
      columnWidths,
    };

    const timer = window.setTimeout(() => {
      void saveBuyerSystemViewSettings(authUser, 'ledger', settings).catch(error => {
        console.warn('Failed to save ledger view settings to CloudBase:', error);
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [authUser, rowHeight, sheetSortField, sheetSortOrder, columnsList, hiddenFields, columnWidths]);

  const CORE_FIELDS: (keyof FlatLedgerRow)[] = [
    'id', 'date', 'supplier', 'status', 'executionStatus', 'inboundStatus', 
    'code', 'name', 'spec', 'orderedQty', 'price', 'taxAmount', 'deliveryDate'
  ];

  const toggleFieldVisibility = (field: keyof FlatLedgerRow) => {
    setHiddenFields(prev => {
      if (prev.includes(field)) {
        return prev.filter(f => f !== field);
      } else {
        if (DEFAULT_COLUMNS.length - prev.length <= 2) return prev;
        return [...prev, field];
      }
    });
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columnsList.length) return;
    
    setColumnsList(prev => {
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return updated;
    });
  };

  const handleShowAll = () => {
    setHiddenFields([]);
  };

  const handleShowCoreOnly = () => {
    const hidden = DEFAULT_COLUMNS
      .map(c => c.field)
      .filter(f => !CORE_FIELDS.includes(f));
    setHiddenFields(hidden);
  };

  // Column Resizing mouse dragging mechanics
  const resizingRef = useRef<{ field: keyof FlatLedgerRow; startX: number; startWidth: number } | null>(null);

  const handleResizeStart = (e: React.MouseEvent, field: keyof FlatLedgerRow) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = columnWidths[field] || DEFAULT_COLUMN_WIDTHS[field] || 110;
    resizingRef.current = { field, startX, startWidth };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeStop);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { field, startX, startWidth } = resizingRef.current;
    const deltaX = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + deltaX);

    setColumnWidths(prev => ({
      ...prev,
      [field]: newWidth
    }));
  };

  const handleResizeStop = () => {
    if (resizingRef.current) {
      localStorage.setItem('po_list_column_widths', JSON.stringify(columnWidthsRef.current));
    }
    resizingRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeStop);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeStop);
    };
  }, []);

  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedColIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverColIndex !== index) {
      setDragOverColIndex(index);
    }
  };
  
  const handleDragLeave = () => {
    setDragOverColIndex(null);
  };
  
  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    const sourceIndex = sourceIndexStr ? parseInt(sourceIndexStr, 10) : draggedColIndex;
    if (sourceIndex === null || sourceIndex === undefined || isNaN(sourceIndex)) return;
    
    if (sourceIndex !== targetIndex) {
      const updated = [...columnsList];
      const [draggedItem] = updated.splice(sourceIndex, 1);
      updated.splice(targetIndex, 0, draggedItem);
      setColumnsList(updated);
    }
    
    setDraggedColIndex(null);
    setDragOverColIndex(null);
  };
  
  const handleDragEnd = () => {
    setDraggedColIndex(null);
    setDragOverColIndex(null);
  };

  const handleResetColumns = () => {
    setColumnsList(DEFAULT_COLUMNS);
    setHiddenFields([]);
  };

  const handleSheetSort = (field: keyof FlatLedgerRow) => {
    if (sheetSortField === field) {
      setSheetSortOrder(sheetSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSheetSortField(field);
      setSheetSortOrder('desc');
    }
  };

  const processDataLines = (lines: string[]) => {
    const poMap: Record<string, PurchaseOrder> = {};
    
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed === '') return;

      if (trimmed.includes("单据编号") || trimmed.includes("单据日期") || trimmed.includes("商品编码") || trimmed.includes("商品名称")) {
        return;
      }

      const parsed = parseClipboardLine(line);
      if (!parsed) {
        const cols = trimmed.split(/[,\t]|\s{2,}/);
        if (cols.length >= 3) {
          const id = cols[0]?.trim();
          const rawDate = cols[1]?.trim();
          const supplier = cols[2]?.trim();
          const isDatePattern = /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(rawDate);
          if (!id || !rawDate || !supplier || !isDatePattern) return;

          const statusRaw = cols[3]?.trim() || "已审核";
          const status: POStatus = statusRaw.includes("未") ? "未审核" : "已审核";
          const execRaw = cols[4]?.trim() || "未执行";
          let executionStatus: PurchaseExecutionStatus = "未执行";
          if (execRaw.includes("全部")) executionStatus = "全部执行";
          else if (execRaw.includes("部分")) executionStatus = "部分执行";

          const typicalMat = SUPPLIER_MATERIAL_MAPPING[supplier] || {
            code: "GENERIC-01", name: "常规系统自配辅料", spec: "标准", category: "辅料", unit: "PCS", price: 5.0
          };

          const expectedDelivery = new Date(rawDate);
          expectedDelivery.setDate(expectedDelivery.getDate() + 5);

          const fallbackItem: OrderItem = {
            code: typicalMat.code || "GENERIC-01", name: typicalMat.name || "常规采购物料", spec: typicalMat.spec || "公制",
            category: typicalMat.category || "原材料", unit: typicalMat.unit || "PCS", orderedQty: 1000, basicQty: 1000,
            price: typicalMat.price || 1.0, taxRate: 13, taxAmount: Math.round(1000 * (typicalMat.price || 1.0) * 0.08),
            receivedQty: executionStatus === '全部执行' ? 1000 : 0, remark: "导入补全",
            inboundDate: executionStatus === '全部执行' ? rawDate : undefined
          };

          const fallbackPO: PurchaseOrder = {
            id, date: rawDate, supplier, status, executionStatus,
            inboundStatus: executionStatus === '全部执行' ? '全部入库' : executionStatus === '部分执行' ? '部分入库' : '未入库',
            discountRate: 0, discountAmount: 0, transportMethod: "快递", settlementType: "月结",
            deliveryDate: expectedDelivery.toISOString().split('T')[0], remarks: "自动导入",
            items: [fallbackItem]
          };

          if (!poMap[id]) poMap[id] = fallbackPO;
          else poMap[id].items.push(fallbackItem);
        }
        return;
      }

      const poId = parsed.po.id!;
      if (!poMap[poId]) {
        poMap[poId] = {
          ...parsed.po,
          executionStatus: parsed.po.executionStatus || "未执行",
          inboundStatus: parsed.po.inboundStatus || "未入库",
          items: [parsed.item as OrderItem]
        } as PurchaseOrder;
      } else {
        poMap[poId].items.push(parsed.item as OrderItem);
      }
    });

    onReplaceOrders(Object.values(poMap));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let finalRows: any[][] = [];
      const extension = file.name.split('.').pop()?.toLowerCase();

      // 按需加载电子表格解析库
      const [{ default: ExcelJS }, XLSX] = await Promise.all([
        import('exceljs'),
        import('xlsx'),
      ]);

      try {
        if (extension === 'xlsx') {
          const workbook = new ExcelJS.Workbook();
          const buffer = await file.arrayBuffer();
          await workbook.xlsx.load(buffer);
          const worksheet = workbook.worksheets[0];
          worksheet.eachRow((row) => {
            // ExcelJS index 0 is empty, so we slice
            const rowValues = (row.values as any[]).slice(1);
            finalRows.push(rowValues);
          });
        } else {
          throw new Error('Fallback to XLSX');
        }
      } catch (exceljsErr: any) {
        console.warn('ExcelJS parser bypassed/failed, falling back to SheetJS XLSX:', exceljsErr.message);
        let workbook;
        try {
          const data = await file.arrayBuffer();
          workbook = XLSX.read(data, { type: 'array' });
        } catch (initialErr: any) {
          console.warn('Standard arrayBuffer parse failed. Attempting text-based fallback.', initialErr.message);
          // Fallback for ERP-generated Excel (often XML/HTML disguised as XLSX which fails ZIP inflation)
          const textData = await file.text();
          workbook = XLSX.read(textData, { type: 'string' });
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        finalRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      }
      
      // Detec and remove header row
      if (finalRows.length > 0) {
        const firstRow = finalRows[0];
        const headerKeywords = [
          '编号', '单据', '日期', '供应商', '状态', '备注', '编码', '名称', '规格', '类别', 
          '单位', '数量', '比例', '天数', '客户', '方式', '交货', 'ID', 'Date', 'Supplier', 
          'Status', 'Qty', 'Price', 'Tax', 'Amount', 'Remark', 'Days', 'Rate', 'No', 'Code'
        ];
        
        let matchCount = 0;
        firstRow.forEach(cell => {
          const text = String(cell || '').trim();
          if (!text) return;
          const isKeyword = headerKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
          if (isKeyword) {
            matchCount++;
          }
        });

        const firstCellText = String(firstRow[0] || '').trim().toLowerCase();
        const firstIsHeader = ['单据', '单号', '编号', '序号', 'id', 'po', 'no', 'code', 'order'].some(k => firstCellText.includes(k));
        
        if (matchCount >= 3 || (firstRow.length >= 1 && firstIsHeader)) {
          finalRows = finalRows.slice(1);
        }
      }

      const lines = finalRows.map(row => row.map(cell => {
        if (cell === null || cell === undefined) return '';
        if (cell instanceof Date) return cell.toISOString().split('T')[0];
        return cell.toString().replace(/\t|\n/g, ' ');
      }).join('\t'));
      
      // Before setting new data, we inform parent to clear old data if needed
      // but parent handleUpdateOrders already completely replaces the array.
      processDataLines(lines);
    } catch (err: any) {
      console.warn("Excel parsing final failure:", err.message);
      if (err.message && err.message.includes("Bad uncompressed size")) {
        alert(
          "文件解析失败: XLSX 文件内部压缩格式异常 (Bad uncompressed size)。\n\n" +
          "【解决方案】:\n" +
          "由于这通常是导出系统生成的非标准 Excel 文件，请您使用 Microsoft Excel 或 WPS 打开该文件，" +
          "然后点击【文件 -> 另存为】，选择标准的【Excel 工作簿 (*.xlsx)】格式重新保存，再次上传即可。"
        );
      } else {
        alert(`文件解析失败: ${err.message}\n请尝试将文件另存为标准的现代.xlsx格式再重新上传。`);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (purchaseOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white border border-slate-200 rounded-xl shadow-sm text-center p-8">
        <div className="w-16 h-16 bg-[#2563EB]/10 rounded-full flex items-center justify-center mb-6">
          <FileSpreadsheet className="w-8 h-8 text-[#2563EB]" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">系统初始化待就绪</h2>
        <p className="text-slate-500 max-w-md text-sm mb-8 leading-relaxed">
          目前系统内尚未加载任何采购日志数据。请点击下方按钮上传标准的 36 列采购合规分录台账 (XLSX) 文件，以激活所有 analysis 追踪功能。
        </p>
        <input 
          type="file" 
          accept=".xlsx" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-6 py-3 bg-[#2563EB] text-white rounded-lg font-sans font-bold shadow-lg shadow-blue-500/30 hover:bg-[#1D4ED8] hover:shadow-blue-500/50 transition-all hover:-translate-y-0.5 active:translate-y-0"
        >
          <Upload className="w-5 h-5" />
          立即加载 XLSX 台账文件
        </button>
      </div>
    );
  }

  // 1. Spreadsheet / Ledger Rows Generation & Filtering (Memoized for high performance)
  const rawLedgerRows = useMemo(() => {
    return getFlatLedgerRows(purchaseOrders);
  }, [purchaseOrders]);

  // Extract unique suppliers for filter dropdown
  const uniqueSuppliers = useMemo(() => {
    const suppliers = new Set(rawLedgerRows.map(row => row.supplier).filter(Boolean));
    return Array.from(suppliers).sort();
  }, [rawLedgerRows]);

  const filteredLedgerRows = useMemo(() => {
    return rawLedgerRows.filter(row => {
      // Starred filter
      if (showStarredOnly && !starredIds.has(row.id)) return false;

      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        row.id.toLowerCase().includes(term) || 
        row.supplier.toLowerCase().includes(term) ||
        row.name.toLowerCase().includes(term) ||
        row.code.toLowerCase().includes(term) ||
        row.category.toLowerCase().includes(term) ||
        (row.customerName && row.customerName.toLowerCase().includes(term)) ||
        (row.sourceOrderId && row.sourceOrderId.toLowerCase().includes(term)) ||
        (row.remarks && row.remarks.toLowerCase().includes(term)) ||
        (row.remark && row.remark.toLowerCase().includes(term));

      const matchesStatus = statusFilter === '' || row.status === statusFilter;
      const matchesExec = execFilter === '' || row.executionStatus === execFilter || row.rowExecutionStatus === execFilter;
      const matchesInbound = inboundFilter === '' || row.inboundStatus === inboundFilter || row.rowInboundStatus === inboundFilter;
      const matchesSupplier = supplierFilter === '' || row.supplier === supplierFilter;
      
      let matchesDate = true;
      if (dateStartFilter || dateEndFilter) {
        const rowDateStr = row.date; // assuming YYYY-MM-DD
        if (dateStartFilter && rowDateStr < dateStartFilter) matchesDate = false;
        if (dateEndFilter && rowDateStr > dateEndFilter) matchesDate = false;
      }

      return matchesSearch && matchesStatus && matchesExec && matchesInbound && matchesSupplier && matchesDate;
    });
  }, [rawLedgerRows, searchTerm, statusFilter, execFilter, inboundFilter, supplierFilter, dateStartFilter, dateEndFilter, showStarredOnly, starredIds]);

  const sortedLedgerRows = useMemo(() => {
    const sorted = [...filteredLedgerRows].sort((a, b) => {
      let aVal = a[sheetSortField];
      let bVal = b[sheetSortField];

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sheetSortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal || '').toLowerCase();
      const bStr = String(bVal || '').toLowerCase();

      if (aStr < bStr) return sheetSortOrder === 'asc' ? -1 : 1;
      if (aStr > bStr) return sheetSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    let currentGroupId = 0;
    let lastId: string | null = null;
    return sorted.map((row) => {
      if (row.id !== lastId) {
        if (lastId !== null) {
          currentGroupId = (currentGroupId + 1) % 2;
        }
        lastId = row.id;
      }
      return {
        ...row,
        _bgGroup: currentGroupId
      };
    });
  }, [filteredLedgerRows, sheetSortField, sheetSortOrder]);

  // Reset scroll viewport on search/filter/sort/data changes
  // 加载新台账后 purchaseOrders 长度变了, 老的 scrollTop 可能超出新数据范围
  // 导致虚拟滚动看到空白; 这里要把 scroll 复位
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setScrollTop(0);
  }, [searchTerm, statusFilter, execFilter, inboundFilter, sheetSortField, sheetSortOrder, purchaseOrders.length]);

  const totalAmountSum = sortedLedgerRows.reduce((sum, row) => sum + (row.orderedQty * row.price), 0);
  const totalQtySum = sortedLedgerRows.reduce((sum, row) => sum + row.orderedQty, 0);
  const totalTaxSum = sortedLedgerRows.reduce((sum, row) => sum + (row.taxAmount || 0), 0);

  // Compute active loaded data date range for indicator - ignore non-date header leakages
  const dates = purchaseOrders
    .map(po => po.date)
    .filter(Boolean)
    .filter(d => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(d.trim()) || /^\d{4}年\d{1,2}月\d{1,2}日/.test(d.trim()));
  const minDate = dates.length > 0 ? dates.reduce((min, d) => d < min ? d : min, dates[0]) : '';
  const maxDate = dates.length > 0 ? dates.reduce((max, d) => d > max ? d : max, dates[0]) : '';
  const dateRangeDisplay = minDate && maxDate 
    ? `${minDate} 至 ${maxDate}`
    : minDate || '无数据区间';

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">采购订单大账目与期账合规台账 / TRANSACTION LEDGER INDEX</h2>
          <p className="text-[10px] text-slate-500 font-mono uppercase mt-1">
            只读数据归档视图，当前仅支持由统一报表通过流式导入或替换加载。
          </p>
          {purchaseOrders.length > 0 && (
            <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-md text-[11px] font-sans font-semibold text-[#2563EB]">
              <span className="w-1.5 h-1.5 bg-[#2563EB] rounded-full animate-pulse" />
              当前数据日期范围: <span className="font-mono text-[#1E40AF]">{dateRangeDisplay}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 self-start lg:self-auto">
          <input 
            type="file" 
            accept=".xlsx" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-4.5 py-2 bg-[#2563EB] text-white rounded-lg font-sans text-xs uppercase font-semibold hover:bg-[#1D4ED8] transition-all cursor-pointer shadow-md hover:scale-[1.02] active:scale-95 duration-100"
          >
            <Upload className="w-3.5 h-3.5" /> 加载 XLSX文件
          </button>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowStarredOnly(!showStarredOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              showStarredOnly 
                ? 'bg-amber-50 border-amber-200 text-amber-700' 
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
             <Star className={`w-3.5 h-3.5 ${showStarredOnly ? 'fill-amber-500 text-amber-500' : ''}`} />
             星标
          </button>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus-within:border-[#2563EB] focus-within:ring-1 focus-within:ring-[#2563EB]">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">日期:</span>
            <input
              type="date"
              value={dateStartFilter}
              onChange={(e) => setDateStartFilter(e.target.value)}
              className="text-xs bg-transparent outline-none text-slate-700 font-sans font-semibold w-28 cursor-pointer"
            />
            <span className="text-xs text-slate-300">-</span>
            <input
              type="date"
              value={dateEndFilter}
              onChange={(e) => setDateEndFilter(e.target.value)}
              className="text-xs bg-transparent outline-none text-slate-700 font-sans font-semibold w-28 cursor-pointer"
            />
          </div>

          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="py-2 px-3 border border-slate-200 rounded-lg bg-white text-xs font-sans font-semibold text-slate-700 outline-none focus:border-[#2563EB] transition-colors cursor-pointer max-w-[150px] truncate"
          >
            <option value="">供应商: 全部</option>
            {uniqueSuppliers.map(supplier => (
              <option key={supplier} value={supplier}>{supplier}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-3 border border-slate-200 rounded-lg bg-white text-xs font-sans font-semibold text-slate-700 outline-none focus:border-[#2563EB] transition-colors cursor-pointer"
          >
            <option value="">单据审核: 全部</option>
            <option value="已审核">已审核 (AUDITED)</option>
            <option value="未审核">未审核 (DRAFT)</option>
          </select>

          <select
            value={execFilter}
            onChange={(e) => setExecFilter(e.target.value)}
            className="py-2 px-3 border border-slate-200 rounded-lg bg-white text-xs font-sans font-semibold text-slate-700 outline-none focus:border-[#2563EB] transition-colors cursor-pointer"
          >
            <option value="">分录执行状态: 全部</option>
            <option value="未执行">未执行</option>
            <option value="部分执行">部分执行</option>
            <option value="全部执行">全部执行</option>
          </select>

          <select
            value={inboundFilter}
            onChange={(e) => setInboundFilter(e.target.value)}
            className="py-2 px-3 border border-slate-200 rounded-lg bg-white text-xs font-sans font-semibold text-slate-700 outline-none focus:border-[#2563EB] transition-colors cursor-pointer"
          >
            <option value="">分录入库状态: 全部</option>
            <option value="未入库">未入库</option>
            <option value="部分入库">部分入库</option>
            <option value="全部入库">全部入库</option>
          </select>

          {/* Row height selector */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/50 p-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 px-1 font-mono">行高:</span>
            <button
              type="button"
              onClick={() => setRowHeight('compact')}
              className={`px-2 py-1 text-[10px] font-bold rounded cursor-pointer transition-all ${rowHeight === 'compact' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 bg-transparent'}`}
              title="紧凑型行高"
            >
              紧密
            </button>
            <button
              type="button"
              onClick={() => setRowHeight('medium')}
              className={`px-2 py-1 text-[10px] font-bold rounded cursor-pointer transition-all ${rowHeight === 'medium' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 bg-transparent'}`}
              title="标准型行高"
            >
              标准
            </button>
            <button
              type="button"
              onClick={() => setRowHeight('relaxed')}
              className={`px-2 py-1 text-[10px] font-bold rounded cursor-pointer transition-all ${rowHeight === 'relaxed' ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 bg-transparent'}`}
              title="宽松型行高"
            >
              宽松
            </button>
          </div>

          {/* Reset column structure */}
          <button
            type="button"
            onClick={handleResetColumns}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:border-slate-300 rounded-lg bg-white text-xs font-semibold text-slate-600 hover:text-slate-850 hover:bg-slate-50 transition-colors cursor-pointer shadow-sm animate-none"
            title="重置台账列展示顺序与显隐"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>恢复默认列</span>
          </button>

          {/* Config center outer button */}
          <button
            type="button"
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-all ${
              isConfigOpen 
                ? 'bg-blue-50 border-[#2563EB] text-[#2563EB] ring-1 ring-[#2563EB]/40' 
                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-650 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>显示字段与排序</span>
            {isConfigOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {(searchTerm || statusFilter || execFilter || inboundFilter || dateStartFilter || dateEndFilter || supplierFilter || showStarredOnly) && (
            <button 
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setExecFilter('');
                setInboundFilter('');
                setDateStartFilter('');
                setDateEndFilter('');
                setSupplierFilter('');
                setShowStarredOnly(false);
              }}
              className="text-xs bg-red-50 text-[#EF4444] hover:bg-red-100 font-semibold uppercase px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
              [清除过滤]
            </button>
          )}
        </div>

        <div className="relative w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="极速检索：单号、供应商、物料类目、行备注、客户、源单关联..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans outline-none text-slate-800 placeholder-slate-400 focus:bg-white focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-all"
          />
        </div>

        {/* Display config collapsible dashboard */}
        {isConfigOpen && (
          <div className="border-t border-slate-100 pt-4 mt-1 space-y-4 font-sans animate-fadeIn">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
              {/* Outer sorting controls */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-xs font-bold text-slate-700 font-sans flex items-center gap-1.5 shrink-0">
                  <Settings className="w-3.5 h-3.5 text-[#2563EB]" />
                  台账行数据检索排序 (表格外单独设置):
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={sheetSortField}
                    onChange={(e) => setSheetSortField(e.target.value as keyof FlatLedgerRow)}
                    className="py-1.5 px-3 border border-slate-200 rounded-lg bg-white text-xs font-sans font-semibold text-slate-705 outline-none focus:border-[#2563EB] transition-colors cursor-pointer"
                  >
                    {columnsList.map(col => (
                      <option key={col.field} value={col.field}>{col.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSheetSortOrder(sheetSortOrder === 'asc' ? 'desc' : 'asc')}
                    className="flex items-center gap-1 py-1.5 px-3.5 border border-slate-200 hover:border-slate-300 rounded-lg bg-white text-xs font-bold text-slate-650 hover:text-slate-900 cursor-pointer shadow-xs transition-all active:scale-95"
                  >
                    <span>{sheetSortOrder === 'asc' ? '升序 (Asc)' : '降序 (Desc)'}</span>
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Display presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono mr-1">显示模式:</span>
                <button
                  type="button"
                  onClick={handleShowAll}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer transition-all shadow-xs"
                >
                  显示全部 (36列)
                </button>
                <button
                  type="button"
                  onClick={handleShowCoreOnly}
                  className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-150 text-[#2563EB] text-xs font-semibold rounded-lg cursor-pointer transition-all shadow-xs"
                >
                  核心视图 (13列)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const hidden = DEFAULT_COLUMNS.map(c => c.field).filter(f => f !== 'id' && f !== 'name' && f !== 'supplier' && f !== 'code');
                    setHiddenFields(hidden);
                  }}
                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-100 text-[#EF4444] text-xs font-semibold rounded-lg cursor-pointer transition-all"
                >
                  极简视图 (4列)
                </button>
              </div>
            </div>

            {/* Custom checkboxes for show/hide and arrow position tuning */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 font-mono tracking-wider flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  列排列顺序与可选项显隐微调中心 (通过勾选显隐，点击 ⇦ ⇨ 调整在台账中的左右次序)
                </span>
                <span className="text-[10px] font-bold text-[#2563EB] font-mono">
                  已启用 {columnsList.length - hiddenFields.length} 列 / 已隐藏 {hiddenFields.length} 列
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-2 pb-2 max-h-[220px] overflow-y-auto px-1">
                {columnsList.map((col, idx) => {
                  const isHidden = hiddenFields.includes(col.field);
                  const isVisible = !isHidden;
                  return (
                    <div 
                      key={col.field} 
                      className={`flex items-center justify-between p-1.5 px-3 rounded-lg border text-xs transition-all ${
                        isVisible 
                          ? 'bg-white border-slate-200 text-slate-800 shadow-xs' 
                          : 'bg-slate-100/60 border-slate-150 text-slate-400'
                      }`}
                    >
                      <label className="flex items-center gap-1.5 truncate cursor-pointer select-none">
                        <input 
                          type="checkbox"
                          checked={isVisible}
                          onChange={() => toggleFieldVisibility(col.field)}
                          className="w-3.5 h-3.5 text-[#2563EB] border-slate-300 rounded focus:ring-[#2563EB] cursor-pointer"
                        />
                        <span className={`truncate font-semibold text-[11px] ${isVisible ? 'text-slate-750' : 'text-slate-400 font-normal line-through'}`}>{col.name}</span>
                      </label>
                      
                      <div className="flex items-center gap-0.5 shrink-0 ml-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveColumn(idx, 'up')}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 border border-slate-200 bg-white text-[10px] text-slate-500 disabled:opacity-20 disabled:pointer-events-none cursor-pointer font-sans"
                          title="在台账中向左移一列"
                        >
                          ⇦
                        </button>
                        <button
                          type="button"
                          disabled={idx === columnsList.length - 1}
                          onClick={() => moveColumn(idx, 'down')}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 border border-slate-200 bg-white text-[10px] text-slate-500 disabled:opacity-20 disabled:pointer-events-none cursor-pointer font-sans"
                          title="在台账中向右移一列"
                        >
                          ⇨
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-[11px] font-mono text-slate-500">
          <div>筛选匹配分录数: <span className="text-slate-800 font-bold font-sans">{sortedLedgerRows.length} 行 (Rows)</span></div>
          <div>计划订购总件数: <span className="text-slate-800 font-bold font-sans">{totalQtySum.toLocaleString()} 件</span></div>
          <div>估算契税累加额: <span className="text-slate-800 font-bold font-sans">¥{totalTaxSum.toLocaleString()}</span></div>
          <div>含税订购价总计: <span className="text-emerald-600 font-bold font-sans">¥{totalAmountSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        </div>
      </div>

      {/* 视图切换 + 分组（卡片视图专用） */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          {([
            { id: 'table', label: '表格视图' },
            { id: 'po-card', label: 'PO 卡片' },
            { id: 'item-card', label: '物料行卡片' },
          ] as { id: 'table' | CardViewMode; label: string }[]).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setViewMode(item.id)}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-colors ${
                viewMode === item.id ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {viewMode !== 'table' && (
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <span className="text-slate-400 font-mono uppercase tracking-wider">分组依据</span>
            <select
              value={cardGroupBy ?? '__none__'}
              onChange={event => {
                const val = event.target.value;
                setCardGroupBy(val === '__none__' ? null : (val as keyof FlatLedgerRow));
              }}
              className="bg-white border border-slate-200 rounded-md px-2 py-1 text-[11px] font-bold focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
            >
              <option value="__none__">不分组</option>
              <option value="supplier">供应商</option>
              <option value="status">单据状态</option>
              <option value="executionStatus">执行状态</option>
              <option value="inboundStatus">入库状态</option>
              <option value="category">商品类别</option>
              <option value="date">下单日期</option>
              <option value="deliveryDate">交货日期</option>
              <option value="transportMethod">运输方式</option>
              <option value="settlementType">结算方式</option>
              <option value="customerName">客户名称</option>
            </select>
          </div>
        )}
      </div>

      {viewMode !== 'table' ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-md p-4">
          <POCardView
            mode={viewMode}
            rows={sortedLedgerRows}
            purchaseOrders={purchaseOrders}
            starredIds={starredIds}
            onToggleStar={toggleStar}
            onCardClick={poId => setDetailDrawerPOId(poId)}
            visibleFields={columnsList.filter(col => !hiddenFields.includes(col.field)).map(col => col.field)}
            fieldNames={Object.fromEntries(columnsList.map(col => [col.field, col.name]))}
            groupBy={cardGroupBy}
          />
        </div>
      ) : (
      <div className="bg-white border border-slate-200 rounded-xl shadow-md overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="overflow-auto max-w-full max-h-[640px]"
        >
          {(() => {
            const visibleColumns = columnsList.filter(col => !hiddenFields.includes(col.field));
            const totalWidth = 60 + visibleColumns.reduce((sum, col) => sum + (columnWidths[col.field] ?? DEFAULT_COLUMN_WIDTHS[col.field] ?? 110), 0);
            
            const rowHeights: Record<'compact' | 'medium' | 'relaxed', number> = {
              compact: 29,
              medium: 38,
              relaxed: 54
            };
            const singleRowHeight = rowHeights[rowHeight];
            const totalRows = sortedLedgerRows.length;
            
            // Viewport calculation with 8 row padding buffer
            const viewportHeight = 640;
            const startIndex = Math.max(0, Math.floor(scrollTop / singleRowHeight) - 8);
            const endIndex = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / singleRowHeight) + 8);
            const visibleRows = sortedLedgerRows.slice(startIndex, endIndex);

            return (
              <table
                style={{ width: totalWidth, minWidth: totalWidth, tableLayout: 'fixed' }}
                className="text-left border-collapse"
              >
                <thead>
                  <tr className="bg-slate-900 text-slate-200 font-sans text-[10px] tracking-wider border-b border-slate-800 uppercase sticky top-0 z-20 shadow-sm">
                    <th style={{ width: 60, minWidth: 60, maxWidth: 60 }} className="p-3 text-center sticky left-0 top-0 bg-slate-900 text-white border-r border-slate-800 select-all z-30">序号</th>
                    {visibleColumns.map((col, index) => {
                      const isDragged = draggedColIndex === index;
                      const isOver = dragOverColIndex === index;
                      const colWidth = columnWidths[col.field] ?? DEFAULT_COLUMN_WIDTHS[col.field] ?? 110;
                      return (
                        <th 
                          key={col.field} 
                          draggable="true"
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDragEnd={handleDragEnd}
                          onDrop={(e) => handleDrop(e, index)}
                          onClick={() => handleSheetSort(col.field)} 
                          style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                          className={`p-3 text-sm font-semibold cursor-grab select-none py-4 hover:bg-slate-800 hover:text-[#2563EB] transition-all border-r border-slate-800 active:bg-slate-850 relative group/th sticky top-0 z-20 ${
                            isDragged ? 'opacity-30 bg-slate-800' : ''
                          } ${
                            isOver ? 'border-l-4 border-l-[#2563EB] bg-slate-850' : ''
                          }`}
                          title="按住鼠标拖拽此列头，即可调整台账列展示左右顺序！"
                        >
                          <div className="flex items-center gap-1.5 justify-between">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-slate-500 font-mono text-[10px] hover:text-slate-300 select-none cursor-grab">☰</span>
                              <span className="truncate" title={col.name}>{col.name}</span>
                            </div>
                            <ArrowUpDown className="w-3 h-3 opacity-60 shrink-0" />
                          </div>

                          {/* Interactive Resize Handle */}
                          <div
                            onMouseDown={(e) => handleResizeStart(e, col.field)}
                            onClick={(e) => e.stopPropagation()} // stop sort behavior
                            className="absolute right-0 top-0 bottom-0 w-2 h-full cursor-col-resize z-25 hover:bg-[#2563EB]/45 bg-transparent transition-all active:bg-[#2563EB]"
                            title="拖拽边缘调整此列宽度！"
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-755 font-mono text-[11px] bg-white">
                  {totalRows === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} className="p-16 text-center text-slate-400 font-sans text-xs uppercase bg-slate-50">
                        🚨 未能找到对应的 {visibleColumns.length} 列台账数据。请更换筛选条件或录入新报表日志。
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* Top Spacer Row */}
                      {startIndex > 0 && (
                        <tr style={{ height: startIndex * singleRowHeight }}>
                          <td colSpan={visibleColumns.length + 1} style={{ padding: 0, height: startIndex * singleRowHeight }} />
                        </tr>
                      )}
                      
                      {/* Visible Items */}
                      {visibleRows.map((row: any, relativeIdx) => {
                        const idx = startIndex + relativeIdx;
                        const isOverdue = row.rowInboundStatus !== '全部入库' && new Date(row.deliveryDate).getTime() < new Date().getTime();
                        
                        const isFirstVisibleOfId = relativeIdx === 0 || visibleRows[relativeIdx - 1].id !== row.id;
                        
                        let rowSpanCount = 1;
                        if (isFirstVisibleOfId) {
                          let count = 1;
                          while (relativeIdx + count < visibleRows.length && visibleRows[relativeIdx + count].id === row.id) {
                            count++;
                          }
                          rowSpanCount = count;
                        }

                        // Background color varies by id block
                        const bgClass = row._bgGroup === 1 ? 'bg-[#F8FAFC]' : 'bg-white';

                        return (
                          <tr
                            key={`${row.id}-${row.code}-${idx}`}
                            style={{ height: singleRowHeight }}
                            className={`hover:bg-blue-50/30 transition-colors group cursor-pointer ${bgClass}`}
                            onMouseDownCapture={event => {
                              // 记录按下时的坐标，配合 onClick 判断是否拖选过文字
                              const target = event.currentTarget as HTMLTableRowElement & { __mouseDownX?: number; __mouseDownY?: number };
                              target.__mouseDownX = event.clientX;
                              target.__mouseDownY = event.clientY;
                            }}
                            onClick={event => {
                              // 点中链接 / 按钮 / 输入框等交互元素时不打开抽屉
                              const interactive = (event.target as HTMLElement).closest('button, a, input, select, textarea, label, .po-row-no-detail');
                              if (interactive) return;

                              // 有文本选区时不打开抽屉（让用户复制）
                              const selection = typeof window !== 'undefined' ? window.getSelection() : null;
                              if (selection && selection.toString().trim().length > 0) return;

                              // 鼠标拖动距离大于 4px 视为选区操作，不打开抽屉
                              const target = event.currentTarget as HTMLTableRowElement & { __mouseDownX?: number; __mouseDownY?: number };
                              if (
                                typeof target.__mouseDownX === 'number' &&
                                typeof target.__mouseDownY === 'number' &&
                                Math.hypot(event.clientX - target.__mouseDownX, event.clientY - target.__mouseDownY) > 4
                              ) {
                                return;
                              }

                              setDetailDrawerPOId(row.id);
                            }}
                          >
                            <td
                              style={{ width: 60, minWidth: 60, maxWidth: 60, height: singleRowHeight }}
                              className={`${getRowPaddingClass(rowHeight)} text-center sticky left-0 font-semibold text-slate-400 border-r border-[#E2E8F0] z-10 ${bgClass}`}
                            >
                              <div className="flex items-center justify-center w-full h-full">
                                {idx + 1}
                              </div>
                            </td>
                            {visibleColumns.map((col) => {
                              const isPOField = PO_LEVEL_FIELDS.has(col.field as keyof FlatLedgerRow);
                              
                              if (isPOField && !isFirstVisibleOfId) {
                                return null;
                              }

                              const colWidth = columnWidths[col.field] ?? DEFAULT_COLUMN_WIDTHS[col.field] ?? 110;
                              const isRemarkField = col.field === 'remarks' || col.field === 'remark';
                              
                              return (
                                <td
                                  key={col.field}
                                  rowSpan={isPOField ? rowSpanCount : 1}
                                  style={{
                                    width: colWidth,
                                    minWidth: colWidth,
                                    maxWidth: colWidth,
                                    height: isPOField ? singleRowHeight * rowSpanCount : singleRowHeight
                                  }}
                                  className={`${getRowPaddingClass(rowHeight)} border-r border-slate-150 align-middle truncate select-text ${
                                    isRemarkField ? 'cursor-zoom-in hover:bg-blue-50/40 transition-colors' : ''
                                  }`}
                                  title={
                                    isRemarkField 
                                      ? "💡 双击查看及一键复制完整备注内容" 
                                      : (typeof row[col.field as keyof FlatLedgerRow] === 'object' ? '' : String(row[col.field as keyof FlatLedgerRow] || ''))
                                  }
                                  onDoubleClick={() => {
                                    if (isRemarkField) {
                                      const textVal = String(row[col.field as keyof FlatLedgerRow] || '');
                                      if (textVal && textVal !== '-') {
                                        setRemarkModal({
                                          title: col.field === 'remarks' ? '单据备注详情' : '商品行备注详情',
                                          fieldName: col.name,
                                          content: textVal,
                                          poId: row.id,
                                          itemName: row.name
                                        });
                                      }
                                    }
                                  }}
                                >
                                  {renderCellContent(col.field as keyof FlatLedgerRow, row, isOverdue, starredIds, toggleStar, onNavigateToNotes, poNotesMap[row.id])}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* Bottom Spacer Row */}
                      {endIndex < totalRows && (
                        <tr style={{ height: (totalRows - endIndex) * singleRowHeight }}>
                          <td colSpan={visibleColumns.length + 1} style={{ padding: 0, height: (totalRows - endIndex) * singleRowHeight }} />
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>
      )}

      {/* Elegant Remark Detail Dialog */}
      <AnimatePresence>
        {remarkModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRemarkModal(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />
            
            {/* Dialog Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.38, bounce: 0.15 }}
              className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
            >
              <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-sans font-bold text-sm text-slate-900">
                        {remarkModal.title}
                      </h3>
                      <p className="font-sans text-[10px] text-slate-400 font-medium">
                        单据编号: <span className="font-mono text-slate-600 font-semibold">{remarkModal.poId}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setRemarkModal(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg lg:hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Info label */}
                {remarkModal.itemName && (
                  <div className="mb-3 px-3 py-1.5 bg-slate-50 border border-slate-150 rounded-lg text-[10px] text-slate-500 font-sans">
                    <span className="font-bold text-slate-650">对应商品物料:</span> {remarkModal.itemName}
                  </div>
                )}

                {/* Content Box */}
                <div className="max-h-[220px] overflow-y-auto bg-slate-50 rounded-lg p-3.5 border border-slate-200/60 text-slate-700 font-sans text-xs leading-relaxed select-text whitespace-pre-wrap break-all">
                  {remarkModal.content}
                </div>

                {/* Footer Controls */}
                <div className="mt-4 flex items-center justify-end gap-2.5">
                  <CopyButton text={remarkModal.content} />
                  <button
                    onClick={() => setRemarkModal(null)}
                    className="px-4 py-2 border border-slate-200 hover:border-slate-300 rounded-lg bg-white text-xs font-bold text-[#475569] hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PODetailDrawer
        open={detailDrawerPOId !== null}
        po={detailDrawerPO}
        onClose={() => setDetailDrawerPOId(null)}
      />
    </div>
  );
}

// Copy Button sub-component with interactive status
const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer ${
        copied 
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-600 font-semibold' 
          : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white border border-transparent shadow-sm hover:shadow-md'
      }`}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-500 animate-bounce" />
          <span>已复制</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span>复制备注</span>
        </>
      )}
    </button>
  );
};
