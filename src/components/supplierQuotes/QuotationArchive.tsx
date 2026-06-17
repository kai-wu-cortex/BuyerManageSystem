import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FileSpreadsheet,
  FileText,
  Image,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { deriveQuotationDisplayStatus } from '../../quotation/normalization';
import { rowsToQuotationDraft, validateParsedQuotation } from '../../quotation/quotationParser';
import type { ParsedQuotationItem } from '../../quotation/quotationParser';
import {
  deleteQuotation,
  parseQuotationFile,
  saveQuotationDraft,
  saveSupplierProfile,
  type QuotationWorkspace,
} from '../../quotation/api';
import type {
  QuotationDraft,
  SourceFileRef,
  SupplierProfile,
  SupplierQuotation,
  SupplierQuotationItem,
} from '../../quotation/types';
import { formatDate, getStatusColor, getStatusLabel } from './quotationUi';

interface Props {
  workspace: QuotationWorkspace;
  loading: boolean;
  onRefresh: () => Promise<void>;
  initialPreviewId?: string | null;
  onPreviewClosed?: () => void;
  onFilePreview?: (file: { pathname: string; fileName: string; mimeType: string }) => void;
}

const MAX_SIZE = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['xlsx', 'xls', 'pdf', 'png', 'jpg', 'jpeg', 'webp'];

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizedSupplierName(name: string): string {
  return name.toLowerCase().replace(/[\s()（）\-_.]/g, '');
}

function getFileIcon(mimeType: string) {
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
  if (mimeType.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
  if (mimeType.includes('image')) return <Image className="h-5 w-5 text-blue-500" />;
  return <FileText className="h-5 w-5 text-slate-400" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function makeDraft(
  parsed: ReturnType<typeof validateParsedQuotation>['value'],
  sourceFile: SourceFileRef,
  existingSupplier?: SupplierProfile,
): { draft: QuotationDraft; supplier: SupplierProfile } {
  const now = new Date().toISOString();
  const supplier: SupplierProfile = existingSupplier ?? {
    id: id('supplier'),
    name: parsed.supplierName || '待确认供应商',
    normalizedName: normalizedSupplierName(parsed.supplierName || '待确认供应商'),
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    qualityScore: null,
    deliveryScore: null,
    serviceScore: null,
    cooperationScore: null,
    scoreNote: '',
    scoreUpdatedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const quotationId = id('quote');
  const quotation: SupplierQuotation = {
    id: quotationId,
    supplierId: supplier.id,
    quotationNumber: parsed.quotationNumber || '',
    quotationDate: parsed.quotationDate || now.slice(0, 10),
    validUntil: parsed.validUntil || null,
    currency: parsed.currency || 'CNY',
    exchangeRateToCny: parsed.exchangeRateToCny || (parsed.currency === 'CNY' ? 1 : 0),
    taxRate: parsed.taxRate,
    priceTaxMode: parsed.priceTaxMode,
    paymentTerms: parsed.paymentTerms || '',
    leadTimeDays: parsed.leadTimeDays ?? null,
    status: 'review_required',
    sourceFile,
    parseJobId: null,
    version: 1,
    confirmedBy: null,
    confirmedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const items: SupplierQuotationItem[] = parsed.items.map((item, index) => ({
    id: id('quote_item'),
    quotationId,
    lineNumber: index + 1,
    ...item,
    productGroupId: null,
    groupMatchStatus: 'unmatched',
    normalizedQuantity: null,
    normalizedUnit: null,
    normalizedTaxIncludedCnyPrice: null,
    normalizationDetails: null,
    reviewIssues: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
  return { draft: { quotation, items }, supplier };
}

// ====== 手动模式辅助 ======

interface ManualItemDraft {
  id: string;
  sourceProductCode: string;
  sourceProductName: string;
  sourceSpecification: string;
  sourceUnit: string;
  sourcePackageDescription: string;
  sourcePackageQuantity: string;
  sourceUnitPrice: string;
  minimumOrderQuantity: string;
  lineLeadTimeDays: string;
  note: string;
}

function emptyManualItem(): ManualItemDraft {
  return {
    id: id('manual_item'),
    sourceProductCode: '',
    sourceProductName: '',
    sourceSpecification: '',
    sourceUnit: '',
    sourcePackageDescription: '',
    sourcePackageQuantity: '',
    sourceUnitPrice: '',
    minimumOrderQuantity: '',
    lineLeadTimeDays: '',
    note: '',
  };
}

/**
 * 从剪贴板/聊天记录文本中尝试解析报价行。
 * 支持分隔符: Tab、连续空格、|、,、；、:。
 * 同时支持 “产品名 规格 单价/单位” 等常见聊天格式，提取数字作为单价。
 */
function parseClipboardText(text: string): ManualItemDraft[] {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const items: ManualItemDraft[] = [];
  const priceRegex = /([0-9]+(?:[.,][0-9]+)?)\s*(?:元|￥|¥|RMB|CNY|USD|\$|EUR|€)?\s*\/?\s*([a-zA-Z一-鿿]+)?/;

  for (const rawLine of lines) {
    // 去除前导编号（如 "1." / "1、" / "- "）
    const line = rawLine.replace(/^(?:[0-9]+\s*[、.．)]\s*|[-*•]\s+)/, '').trim();
    if (!line) continue;
    // 跳过明显的标题/分隔行
    if (/^[=\-—]{3,}$/.test(line)) continue;

    // 尝试用 Tab / | / 多空格 / ， / ； 分列
    const cols = line.split(/\t|\s*\|\s*|\s{2,}|，|；|;/).map(s => s.trim()).filter(Boolean);
    const item = emptyManualItem();

    if (cols.length >= 4) {
      // 列模式：编号? 名称 规格 单价 单位 数量 备注 …
      // 优先按位置：[名称, 规格, 数量?, 单价, 单位?]
      const [first, second, third, fourth, fifth, ...rest] = cols;
      item.sourceProductName = first;
      item.sourceSpecification = second;
      const numericThird = Number(third.replace(/[,，]/g, ''));
      const numericFourth = Number(fourth.replace(/[,，]/g, ''));
      if (Number.isFinite(numericThird) && Number.isFinite(numericFourth)) {
        item.sourcePackageQuantity = String(numericThird);
        item.sourceUnitPrice = String(numericFourth);
        if (fifth) item.sourceUnit = fifth.replace(/^\/+/, '');
      } else if (Number.isFinite(numericFourth)) {
        item.sourceUnitPrice = String(numericFourth);
        item.sourceSpecification = [second, third].filter(Boolean).join(' ').trim();
        if (fifth) item.sourceUnit = fifth.replace(/^\/+/, '');
      } else {
        const priceMatch = line.match(priceRegex);
        if (priceMatch) {
          item.sourceUnitPrice = priceMatch[1].replace(/,/g, '');
          if (priceMatch[2]) item.sourceUnit = priceMatch[2];
        }
      }
      if (rest.length) item.note = rest.join(' ');
    } else if (cols.length === 3) {
      // [名称, 规格, 单价] 或 [名称, 单价, 单位]
      item.sourceProductName = cols[0];
      const middleNumber = Number(cols[1].replace(/[,，]/g, ''));
      const lastNumber = Number(cols[2].replace(/[,，]/g, ''));
      if (Number.isFinite(middleNumber) && !Number.isFinite(lastNumber)) {
        item.sourceUnitPrice = String(middleNumber);
        item.sourceUnit = cols[2].replace(/^\/+/, '');
      } else {
        item.sourceSpecification = cols[1];
        const m = cols[2].match(priceRegex);
        if (m) {
          item.sourceUnitPrice = m[1].replace(/,/g, '');
          if (m[2]) item.sourceUnit = m[2];
        } else {
          item.note = cols[2];
        }
      }
    } else if (cols.length === 2) {
      // [名称, 单价/单位]
      item.sourceProductName = cols[0];
      const m = cols[1].match(priceRegex);
      if (m) {
        item.sourceUnitPrice = m[1].replace(/,/g, '');
        if (m[2]) item.sourceUnit = m[2];
      } else {
        item.sourceSpecification = cols[1];
      }
    } else {
      // 单列模式：用正则提取 “价格 / 单位”，名称取价格之前的部分
      const m = line.match(priceRegex);
      if (m && m.index !== undefined) {
        item.sourceProductName = line.slice(0, m.index).replace(/[:：\-]+$/, '').trim() || line;
        item.sourceUnitPrice = m[1].replace(/,/g, '');
        if (m[2]) item.sourceUnit = m[2];
      } else {
        item.sourceProductName = line;
      }
    }

    if (item.sourceProductName) items.push(item);
  }
  return items;
}

function buildManualParsedQuotation(input: {
  supplierName: string;
  quotationNumber: string;
  quotationDate: string;
  validUntil: string;
  currency: string;
  exchangeRateToCny: string;
  taxRate: string;
  priceTaxMode: 'tax_included' | 'tax_excluded';
  paymentTerms: string;
  leadTimeDays: string;
  items: ManualItemDraft[];
}) {
  const parsedItems: ParsedQuotationItem[] = input.items
    .filter(item => item.sourceProductName.trim())
    .map(item => {
      const number = (value: string) => {
        if (!value || !value.trim()) return null;
        const normalized = Number(value.replace(/[,，%￥¥$]/g, ''));
        return Number.isFinite(normalized) ? normalized : null;
      };
      return {
        sourceProductCode: item.sourceProductCode.trim(),
        sourceProductName: item.sourceProductName.trim(),
        sourceSpecification: item.sourceSpecification.trim(),
        sourceUnit: item.sourceUnit.trim() || '件',
        sourcePackageDescription: [item.sourcePackageDescription, item.note].filter(s => s && s.trim()).join(' / ').trim(),
        sourcePackageQuantity: number(item.sourcePackageQuantity) ?? 1,
        sourceUnitPrice: number(item.sourceUnitPrice),
        minimumOrderQuantity: number(item.minimumOrderQuantity),
        lineLeadTimeDays: number(item.lineLeadTimeDays),
        fieldConfidence: { manual: 1 },
      };
    });

  return validateParsedQuotation({
    supplierName: input.supplierName.trim(),
    quotationNumber: input.quotationNumber.trim(),
    quotationDate: input.quotationDate || new Date().toISOString().slice(0, 10),
    validUntil: input.validUntil || '',
    currency: (input.currency || 'CNY').toUpperCase(),
    exchangeRateToCny: Number(input.exchangeRateToCny) || (input.currency.toUpperCase() === 'CNY' ? 1 : 0),
    taxRate: Number(input.taxRate) || 0,
    priceTaxMode: input.priceTaxMode,
    paymentTerms: input.paymentTerms.trim(),
    leadTimeDays: input.leadTimeDays ? Number(input.leadTimeDays) : null,
    items: parsedItems,
  });
}

function EditableHeaderText({ name, onRename }: { name: string; onRename: (old: string, new_: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  if (editing) {
    return (
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onRename(name, value); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
        onBlur={() => { onRename(name, value); setEditing(false); }}
        className="w-full bg-transparent text-[11px] font-semibold text-purple-600 outline-none"
        autoFocus
      />
    );
  }

  return <button type="button" onClick={() => setEditing(true)} className="hover:underline cursor-pointer">{name}</button>;
}

function SmartColumnTag({ name, onRename, onRemove }: { name: string; onRename: (old: string, new_: string) => void; onRemove: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  if (editing) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-purple-300 bg-white px-2 py-0.5">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onRename(name, value); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
          onBlur={() => { onRename(name, value); setEditing(false); }}
          className="w-24 bg-transparent text-[10px] font-medium text-purple-700 outline-none"
          autoFocus
        />
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">
      <Sparkles className="h-2.5 w-2.5" />
      <button type="button" onClick={() => setEditing(true)} className="hover:underline">{name}</button>
      <button type="button" onClick={() => onRemove(name)} className="ml-0.5 text-purple-400 hover:text-purple-600">&times;</button>
    </span>
  );
}

function PreviewPanel({
  quotation,
  items,
  supplier,
  onClose,
  onSaved,
}: {
  quotation: SupplierQuotation;
  items: SupplierQuotationItem[];
  supplier?: SupplierProfile;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [editNumber, setEditNumber] = useState(quotation.quotationNumber);
  const [editCurrency, setEditCurrency] = useState(quotation.currency);
  const [editTaxRate, setEditTaxRate] = useState(quotation.taxRate);
  const [editStatus, setEditStatus] = useState(quotation.status);
  const [editSummary, setEditSummary] = useState(quotation.summary ?? '');
  const [customColumns, setCustomColumns] = useState<Record<string, string[]>>(quotation.smartFields ?? {});
  const [editItems, setEditItems] = useState<SupplierQuotationItem[]>(items);
  const [smartPrompt, setSmartPrompt] = useState('');
  const [smartColName, setSmartColName] = useState('');
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState('');
  const [reparsePrompt, setReparsePrompt] = useState('');
  const [reparseLoading, setReparseLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const isExcel = quotation.sourceFile.mimeType.includes('spreadsheet') || quotation.sourceFile.mimeType === 'application/vnd.ms-excel';

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const now = new Date().toISOString();
      const updatedQuotation = {
        ...quotation,
        quotationNumber: editNumber,
        currency: editCurrency.toUpperCase(),
        taxRate: editTaxRate,
        status: editStatus,
        summary: editSummary,
        smartFields: customColumns,
        updatedAt: now,
      };
      await saveQuotationDraft(
        {
          quotation: updatedQuotation,
          items: editItems.map(item => ({ ...item, updatedAt: now, deletedAt: null })),
        },
        items,
      );
      setMessage('已保存');
      await onSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSmartExtract = async () => {
    if (!smartPrompt.trim()) return;
    setSmartLoading(true);
    setSmartError('');
    try {
      const res = await fetch('/api/quotation/smart-field', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathname: quotation.sourceFile.pathname,
          mimeType: quotation.sourceFile.mimeType,
          prompt: smartPrompt.trim(),
          itemCount: items.length,
          productNames: items.map(i => i.sourceProductName),
        }),
      });
      const payload = await res.json() as { success?: boolean; data?: { values: string[] }; message?: string };
      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.message ?? '智能字段提取失败。');
      }
      const colName = smartColName.trim() || smartPrompt.trim().slice(0, 20);
      setCustomColumns(prev => ({ ...prev, [colName]: payload.data!.values }));
      setSmartPrompt('');
      setSmartColName('');
    } catch (err) {
      setSmartError(err instanceof Error ? err.message : String(err));
    } finally {
      setSmartLoading(false);
    }
  };

  const removeSmartColumn = (colName: string) => {
    setCustomColumns(prev => {
      const next = { ...prev };
      delete next[colName];
      return next;
    });
  };

  const renameSmartColumn = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;
    setCustomColumns(prev => {
      const next = { ...prev };
      const values = next[oldName];
      delete next[oldName];
      next[newName.trim()] = values;
      return next;
    });
  };

  const updateSmartCellValue = (colName: string, index: number, value: string) => {
    setCustomColumns(prev => {
      const values = [...(prev[colName] ?? [])];
      while (values.length <= index) values.push('');
      values[index] = value;
      return { ...prev, [colName]: values };
    });
  };

  const handleReparse = async () => {
    if (!reparsePrompt.trim()) return;
    setReparseLoading(true);
    const isExcelSource = quotation.sourceFile.mimeType.includes('spreadsheet') || quotation.sourceFile.mimeType.includes('ms-excel');
    setMessage(isExcelSource ? '正在重新解析报价单（行数较多时会自动分批，可能耗时数十秒）...' : '正在重新解析报价单...');
    try {
      const res = await fetch('/api/quotation/parse', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pathname: quotation.sourceFile.pathname,
          mimeType: quotation.sourceFile.mimeType,
          customPrompt: reparsePrompt.trim(),
        }),
      });
      const payload = await res.json() as { success?: boolean; data?: { value?: { items?: Array<Record<string, unknown>> }; issues?: unknown[] }; message?: string };
      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.message ?? '重新解析失败。');
      }
      const parsed = payload.data.value;
      if (!parsed?.items?.length) throw new Error('重新解析未获取到产品数据。');
      const now = new Date().toISOString();
      const newItems: SupplierQuotationItem[] = parsed.items.map((item, index) => ({
        id: editItems[index]?.id ?? `quote_item_${Date.now()}_${index}`,
        quotationId: quotation.id,
        lineNumber: index + 1,
        sourceProductCode: String(item.sourceProductCode ?? ''),
        sourceProductName: String(item.sourceProductName ?? ''),
        sourceSpecification: String(item.sourceSpecification ?? ''),
        sourceUnit: String(item.sourceUnit ?? ''),
        sourcePackageDescription: String(item.sourcePackageDescription ?? ''),
        sourcePackageQuantity: item.sourcePackageQuantity != null ? Number(item.sourcePackageQuantity) : null,
        sourceUnitPrice: item.sourceUnitPrice != null ? Number(item.sourceUnitPrice) : null,
        minimumOrderQuantity: item.minimumOrderQuantity != null ? Number(item.minimumOrderQuantity) : null,
        lineLeadTimeDays: item.lineLeadTimeDays != null ? Number(item.lineLeadTimeDays) : null,
        sourceRawText: typeof item.sourceRawText === 'string' && item.sourceRawText ? item.sourceRawText : undefined,
        productGroupId: null,
        groupMatchStatus: 'unmatched',
        normalizedQuantity: null,
        normalizedUnit: null,
        normalizedTaxIncludedCnyPrice: null,
        normalizationDetails: null,
        fieldConfidence: {},
        reviewIssues: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }));
      setEditItems(newItems);
      setReparsePrompt('');
      setMessage(`重新解析完成，共 ${newItems.length} 项产品。`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setReparseLoading(false);
    }
  };

  const updateItemField = (index: number, field: keyof SupplierQuotationItem, value: string | number | null) => {
    setEditItems(current => current.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const addRow = () => {
    const now = new Date().toISOString();
    setEditItems(current => [...current, {
      id: `quote_item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      quotationId: quotation.id,
      lineNumber: current.length + 1,
      sourceProductCode: '',
      sourceProductName: '',
      sourceSpecification: '',
      sourceUnit: '',
      sourcePackageDescription: '',
      sourcePackageQuantity: null,
      sourceUnitPrice: null,
      minimumOrderQuantity: null,
      lineLeadTimeDays: null,
      productGroupId: null,
      groupMatchStatus: 'unmatched',
      normalizedQuantity: null,
      normalizedUnit: null,
      normalizedTaxIncludedCnyPrice: null,
      normalizationDetails: null,
      fieldConfidence: {},
      reviewIssues: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }]);
  };

  const removeRow = (index: number) => {
    setEditItems(current => current.filter((_, i) => i !== index));
  };

  const customColNames = Object.keys(customColumns);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 lg:flex-row">
      {/* Left: file preview */}
      <div className="flex h-[40vh] flex-col border-b border-slate-700 bg-white lg:h-auto lg:w-[45%] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {getFileIcon(quotation.sourceFile.mimeType)}
            <span className="truncate text-xs font-semibold text-slate-700">{quotation.sourceFile.fileName}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/api/quotation/file?pathname=${encodeURIComponent(quotation.sourceFile.pathname)}`} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-blue-600">新窗口</a>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-slate-50 p-2 lg:p-4">
          <div className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {isExcel ? (
              <ExcelPreview pathname={quotation.sourceFile.pathname} />
            ) : (
              <iframe title="报价预览" src={`/api/quotation/file?pathname=${encodeURIComponent(quotation.sourceFile.pathname)}`} className="h-full w-full bg-white" />
            )}
          </div>
        </div>
      </div>

      {/* Right: info + items */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 lg:px-6">
          <h3 className="text-sm font-bold text-slate-800">报价单详情</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4 lg:px-6">
          {/* Editable fields */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:gap-4">
            <label className="text-[11px] font-semibold text-slate-500">
              报价单号
              <input value={editNumber} onChange={e => setEditNumber(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-[11px] font-semibold text-slate-500">
              供应商
              <input value={supplier?.name ?? ''} readOnly className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700" />
            </label>
            <label className="text-[11px] font-semibold text-slate-500">
              日期
              <input value={quotation.quotationDate} readOnly className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700" />
            </label>
            <label className="text-[11px] font-semibold text-slate-500">
              币种
              <input value={editCurrency} onChange={e => setEditCurrency(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase" />
            </label>
            <label className="text-[11px] font-semibold text-slate-500">
              税率 %
              <input type="number" value={editTaxRate} onChange={e => setEditTaxRate(Number(e.target.value))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-[11px] font-semibold text-slate-500">
              状态
              <select value={editStatus} onChange={e => setEditStatus(e.target.value as typeof editStatus)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="review_required">待审核</option>
                <option value="active">已生效</option>
                <option value="voided">已作废</option>
              </select>
            </label>
            <label className="col-span-2 text-[11px] font-semibold text-slate-500">
              报价简述
              <textarea value={editSummary} onChange={e => setEditSummary(e.target.value)} rows={2} placeholder="添加备注或摘要..." className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </label>
          </div>

          {/* Items table */}
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-700">产品明细 ({editItems.length} 项)</div>
            <div className="flex items-center gap-2">
              {customColNames.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {customColNames.map(name => (
                    <span key={name}>
                      <SmartColumnTag name={name} onRename={renameSmartColumn} onRemove={removeSmartColumn} />
                    </span>
                  ))}
                </div>
              )}
              <button type="button" onClick={addRow} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50">
                <Plus className="h-3 w-3" /> 添加行
              </button>
            </div>
          </div>

          {/* Re-parse with custom prompt */}
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-[10px] font-semibold text-amber-700">重新解析（自定义提示词）</p>
            <div className="flex items-start gap-2">
              <input
                value={reparsePrompt}
                onChange={e => setReparsePrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !reparseLoading) void handleReparse(); }}
                placeholder="输入提示词重新解析报价单（如：请仔细识别图片中的表格，提取所有产品信息...）"
                className="flex-1 rounded-lg border border-amber-200 px-3 py-2 text-xs outline-none focus:border-amber-400"
                disabled={reparseLoading}
              />
              <button
                type="button"
                disabled={reparseLoading || !reparsePrompt.trim()}
                onClick={() => void handleReparse()}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {reparseLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} 重新解析
              </button>
            </div>
          </div>

          {/* Smart field input */}
          <div className="mb-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                value={smartColName}
                onChange={e => setSmartColName(e.target.value)}
                placeholder="列名（如：交货周期）"
                className="w-36 rounded-lg border border-purple-200 px-3 py-2 text-xs outline-none focus:border-purple-400"
                disabled={smartLoading}
              />
              <input
                value={smartPrompt}
                onChange={e => setSmartPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !smartLoading) void handleSmartExtract(); }}
                placeholder="输入提示词提取智能字段（如：提取每个产品的交货周期、最小起订量、包装方式...）"
                className="flex-1 rounded-lg border border-purple-200 px-3 py-2 text-xs outline-none focus:border-purple-400"
                disabled={smartLoading}
              />
              <button
                type="button"
                disabled={smartLoading || !smartPrompt.trim()}
                onClick={() => void handleSmartExtract()}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {smartLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} 提取
              </button>
            </div>
            <p className="text-[10px] text-slate-400">输入列名和提示词，Gemini 会从原始报价单中提取每个产品对应的数据</p>
          </div>
          {smartError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{smartError}</div>}
          <div className="overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-[700px] w-full text-xs">
              <thead><tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-2 py-2 text-left font-semibold text-slate-500 w-8">#</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-500">产品名称</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-500">规格</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-500">单位</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-500">包装数</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-500">单价</th>
                {customColNames.map(name => <th key={name} className="px-2 py-2 text-left font-semibold text-purple-600"><EditableHeaderText name={name} onRename={renameSmartColumn} /></th>)}
                <th className="px-2 py-2 w-8"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {editItems.map((item, index) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                    <td className="px-1 py-1"><input value={item.sourceProductName} onChange={e => updateItemField(index, 'sourceProductName', e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" /></td>
                    <td className="px-1 py-1"><input value={item.sourceSpecification} onChange={e => updateItemField(index, 'sourceSpecification', e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" /></td>
                    <td className="px-1 py-1"><input value={item.sourceUnit} onChange={e => updateItemField(index, 'sourceUnit', e.target.value)} className="w-16 rounded border border-slate-200 px-2 py-1 text-xs" /></td>
                    <td className="px-1 py-1"><input type="number" value={item.sourcePackageQuantity ?? ''} onChange={e => updateItemField(index, 'sourcePackageQuantity', e.target.value === '' ? null : Number(e.target.value))} className="w-20 rounded border border-slate-200 px-2 py-1 text-xs" /></td>
                    <td className="px-1 py-1"><input type="number" value={item.sourceUnitPrice ?? ''} onChange={e => updateItemField(index, 'sourceUnitPrice', e.target.value === '' ? null : Number(e.target.value))} className="w-24 rounded border border-slate-200 px-2 py-1 text-xs" /></td>
                    {customColNames.map(name => <td key={name} className="px-1 py-1"><input value={customColumns[name]?.[index] ?? ''} onChange={e => updateSmartCellValue(name, index, e.target.value)} className="w-24 rounded border border-purple-200 px-2 py-1 text-xs text-purple-700" /></td>)}
                    <td className="px-1 py-1"><button type="button" onClick={() => removeRow(index)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Save bar */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3">
          <span className="text-xs text-slate-500">{message}</span>
          <button type="button" disabled={saving} onClick={() => void handleSave()} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 保存修改
          </button>
        </div>
      </div>
    </div>
  );
}

function ExcelPreview({ pathname }: { pathname: string }) {
  const [rows, setRows] = useState<unknown[][]>([]);
  const [error, setError] = useState('');

  React.useEffect(() => {
    let cancelled = false;
    void fetch(`/api/quotation/file?pathname=${encodeURIComponent(pathname)}`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('无法读取报价原文件。');
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
        return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], {
          header: 1, raw: false, blankrows: false,
        }).slice(0, 300);
      })
      .then(nextRows => { if (!cancelled) setRows(nextRows); })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; };
  }, [pathname]);

  if (error) return <div className="flex h-full items-center justify-center p-6 text-xs text-red-600">{error}</div>;
  if (!rows.length) return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  const columnCount = Math.min(30, rows.reduce((max, row) => Math.max(max, row.length), 0));
  return (
    <div className="h-full overflow-auto bg-white">
      <table className="min-w-full border-collapse text-[10px]">
        <tbody>{rows.map((row, ri) => <tr key={ri}>{Array.from({ length: columnCount }, (_, ci) => <td key={ci} className={`max-w-48 whitespace-pre-wrap border border-slate-200 px-2 py-1.5 align-top ${ri === 0 ? 'bg-slate-100 font-bold' : ''}`}>{String(row[ci] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/**
 * 卡片中的报价单 mini 预览器：
 * - 图片：缩略图
 * - PDF：iframe 缩放显示首页
 * - Excel：渲染前 8 行 4 列简表
 * - 手动录入 / 无文件：用解析后的明细前几行作为预览
 */
function MiniFilePreview({
  pathname, fileName, mimeType,
  fallbackItems,
}: {
  pathname: string;
  fileName: string;
  mimeType: string;
  fallbackItems: SupplierQuotationItem[];
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [excelRows, setExcelRows] = useState<unknown[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';
  const isExcel = mimeType.includes('spreadsheet') || mimeType.includes('ms-excel')
    || fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
  const hasRealFile = Boolean(pathname);

  useEffect(() => {
    if (!hasRealFile) { setLoading(false); return; }
    let cancelled = false;
    let createdUrl: string | null = null;
    const url = `/api/quotation/file?pathname=${encodeURIComponent(pathname)}`;

    if (isExcel) {
      fetch(url, { cache: 'no-store' })
        .then(async res => {
          if (!res.ok) throw new Error('load fail');
          const XLSX = await import('xlsx');
          const wb = XLSX.read(await res.arrayBuffer(), { type: 'array' });
          const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
            header: 1, raw: false, blankrows: false,
          }).slice(0, 8);
          if (!cancelled) { setExcelRows(rows); setLoading(false); }
        })
        .catch(() => { if (!cancelled) { setErrored(true); setLoading(false); } });
    } else if (isImage || isPdf) {
      fetch(url, { cache: 'no-store' })
        .then(async res => {
          if (!res.ok) throw new Error('load fail');
          const blob = await res.blob();
          createdUrl = URL.createObjectURL(blob);
          if (!cancelled) { setBlobUrl(createdUrl); setLoading(false); }
        })
        .catch(() => { if (!cancelled) { setErrored(true); setLoading(false); } });
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [pathname, isExcel, isImage, isPdf, hasRealFile]);

  // 没有真实文件，或加载失败：用结构化明细做兜底预览
  if (!hasRealFile || errored) {
    const previewItems = fallbackItems.slice(0, 5);
    if (previewItems.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 bg-slate-50 text-slate-400">
          <FileText className="h-6 w-6" />
          <span className="text-[10px]">无预览</span>
        </div>
      );
    }
    return (
      <div className="h-full overflow-hidden bg-white p-2">
        <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase text-slate-400">
          <ClipboardList className="h-3 w-3" /> 明细预览
        </div>
        <table className="w-full text-[9px]">
          <tbody>
            {previewItems.map(item => (
              <tr key={item.id} className="border-b border-slate-50 last:border-0">
                <td className="py-0.5 pr-1 text-slate-700 truncate max-w-[120px]">{item.sourceProductName || '-'}</td>
                <td className="py-0.5 text-right font-mono font-semibold text-blue-600">
                  {item.sourceUnitPrice !== null ? Number(item.sourceUnitPrice).toFixed(2) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
      </div>
    );
  }

  if (isImage && blobUrl) {
    return (
      <div className="h-full w-full overflow-hidden bg-slate-100">
        <img src={blobUrl} alt={fileName} className="h-full w-full object-cover" loading="lazy" />
      </div>
    );
  }

  if (isPdf && blobUrl) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-slate-100">
        <iframe
          src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          title={fileName}
          className="pointer-events-none h-[280%] w-[280%] origin-top-left scale-[0.36] border-0"
        />
        <div className="absolute right-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 shadow-sm">PDF</div>
      </div>
    );
  }

  if (isExcel && excelRows) {
    const columnCount = Math.min(4, excelRows.reduce((max, row) => Math.max(max, row.length), 0));
    return (
      <div className="h-full overflow-hidden bg-white p-1">
        <table className="w-full border-collapse text-[8px]">
          <tbody>
            {excelRows.map((row, ri) => (
              <tr key={ri}>
                {Array.from({ length: columnCount }, (_, ci) => (
                  <td key={ci} className={`max-w-[60px] truncate border border-slate-100 px-1 py-0.5 align-top ${ri === 0 ? 'bg-slate-50 font-bold text-slate-700' : 'text-slate-500'}`}>
                    {String(row[ci] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 bg-slate-50 text-slate-400">
      <FileText className="h-6 w-6" />
      <span className="text-[10px]">{fileName.split('.').pop()?.toUpperCase() || '文件'}</span>
    </div>
  );
}

export default function QuotationArchive({ workspace, loading, onRefresh, initialPreviewId, onPreviewClosed, onFilePreview }: Props) {
  const [status, setStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parseMode, setParseMode] = useState<'internal' | 'gemini' | 'display'>('internal');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewQuotationId, setPreviewQuotationId] = useState<string | null>(initialPreviewId ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  // ===== 手动录入模式状态 =====
  const [uploadMode, setUploadMode] = useState<'file' | 'manual'>('file');
  const [manualSupplierName, setManualSupplierName] = useState('');
  const [manualQuotationNumber, setManualQuotationNumber] = useState('');
  const [manualQuotationDate, setManualQuotationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualValidUntil, setManualValidUntil] = useState('');
  const [manualCurrency, setManualCurrency] = useState('CNY');
  const [manualTaxRate, setManualTaxRate] = useState('');
  const [manualPasteText, setManualPasteText] = useState('');
  const [manualDraftItems, setManualDraftItems] = useState<ManualItemDraft[]>([]);
  const [manualSaving, setManualSaving] = useState(false);

  const resetManualMode = () => {
    setManualSupplierName('');
    setManualQuotationNumber('');
    setManualQuotationDate(new Date().toISOString().slice(0, 10));
    setManualValidUntil('');
    setManualCurrency('CNY');
    setManualTaxRate('');
    setManualPasteText('');
    setManualDraftItems([]);
  };

  const appendPastedItems = () => {
    const parsed = parseClipboardText(manualPasteText);
    if (parsed.length === 0) {
      setError('未识别到任何报价行，请检查文本格式（建议每行一条：产品 规格 数量 单价 单位）。');
      return;
    }
    setManualDraftItems(current => [...current, ...parsed]);
    setManualPasteText('');
    setError(null);
  };

  const importFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        setError('当前浏览器不支持读取剪贴板，请手动粘贴。');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { setError('剪贴板为空，无法导入。'); return; }
      setManualPasteText(text);
      const parsed = parseClipboardText(text);
      if (parsed.length > 0) {
        setManualDraftItems(current => [...current, ...parsed]);
        setManualPasteText('');
        setError(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const updateManualItem = (id: string, patch: Partial<ManualItemDraft>) => {
    setManualDraftItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const removeManualItem = (id: string) => {
    setManualDraftItems(current => current.filter(item => item.id !== id));
  };

  const submitManualQuotation = async () => {
    if (!manualSupplierName.trim()) { setError('请填写供应商名称。'); return; }
    if (manualDraftItems.length === 0) { setError('至少需要一条报价明细。'); return; }
    setManualSaving(true);
    setError(null);
    try {
      const validation = buildManualParsedQuotation({
        supplierName: manualSupplierName,
        quotationNumber: manualQuotationNumber,
        quotationDate: manualQuotationDate,
        validUntil: manualValidUntil,
        currency: manualCurrency,
        exchangeRateToCny: '',
        taxRate: manualTaxRate,
        priceTaxMode: 'tax_included',
        paymentTerms: '',
        leadTimeDays: '',
        items: manualDraftItems,
      });
      if (validation.value.items.length === 0) throw new Error('没有有效的报价明细。');

      // 手动模式没有真实文件，使用占位 SourceFileRef
      const now = new Date().toISOString();
      const sourceFile: SourceFileRef = {
        id: id('file'),
        pathname: '',
        fileName: `手动录入_${manualSupplierName}_${now.slice(0, 10)}.txt`,
        mimeType: 'text/plain',
        size: 0,
        checksum: '',
      };
      const existingSupplier = workspace.suppliers.find(s => !s.deletedAt && s.normalizedName === normalizedSupplierName(validation.value.supplierName));
      const { draft, supplier } = makeDraft(validation.value, sourceFile, existingSupplier);
      draft.quotation.summary = `手动录入 ${manualDraftItems.length} 条报价`;
      draft.items = draft.items.map((item, index) => ({ ...item, reviewIssues: validation.issues.filter(i => i.field.startsWith(`items.${index}.`)) }));
      await Promise.all([saveSupplierProfile(supplier), saveQuotationDraft(draft)]);
      await onRefresh();
      setShowUpload(false);
      resetManualMode();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setManualSaving(false);
    }
  };

  const handleDelete = async (quotationId: string) => {
    if (!window.confirm('确定要删除这份报价单吗？')) return;
    setDeletingId(quotationId);
    try {
      const items = workspace.items.filter(item => item.quotationId === quotationId);
      await deleteQuotation(quotationId, items);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  const supplierMap = useMemo(
    () => new Map(workspace.suppliers.map(s => [s.id, s])),
    [workspace.suppliers],
  );

  const quotations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return workspace.quotations
      .filter(q => !q.deletedAt)
      .filter(q => status === 'all' || deriveQuotationDisplayStatus(q.status, q.validUntil) === status)
      .filter(q => {
        if (!term) return true;
        const name = supplierMap.get(q.supplierId)?.name ?? '';
        if (`${q.quotationNumber} ${name} ${q.sourceFile.fileName} ${q.summary ?? ''}`.toLowerCase().includes(term)) return true;
        const qItems = workspace.items.filter(i => i.quotationId === q.id && !i.deletedAt);
        return qItems.some(i =>
          i.sourceProductName.toLowerCase().includes(term) ||
          i.sourceSpecification.toLowerCase().includes(term) ||
          (i.sourceUnitPrice !== null && String(i.sourceUnitPrice).includes(term))
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [searchTerm, status, supplierMap, workspace.quotations, workspace.items]);

  const previewQuotation = previewQuotationId
    ? workspace.quotations.find(q => q.id === previewQuotationId) ?? null
    : null;
  const previewItems = previewQuotationId
    ? workspace.items.filter(i => i.quotationId === previewQuotationId && !i.deletedAt)
    : [];
  const previewSupplier = previewQuotation
    ? supplierMap.get(previewQuotation.supplierId)
    : undefined;

  const handleFileUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_EXTENSIONS.includes(ext)) { setError('仅支持 Excel、PDF、PNG、JPG 和 WebP 报价单。'); return; }
    if (file.size > MAX_SIZE) { setError('报价文件不能超过 25 MB。'); return; }
    setUploading(true);
    setError(null);
    /** 解析阶段失败时记录原因，最终仍把原始报价单建档保留，等用户在归档页里手动补录 */
    let parseFailureReason: string | null = null;
    /** 上传到 Blob 后的源文件元数据；仅当 Blob 上传成功才赋值 */
    let sourceFile: SourceFileRef | null = null;
    try {
      setUploadProgress('正在上传原始报价文件...');
      const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_');
      const pathname = `supplier-quotes/${new Date().toISOString().slice(0, 7)}/${safeName}`;
      const { upload } = await import('@vercel/blob/client');
      const blob = await upload(pathname, file, {
        access: 'private', handleUploadUrl: '/api/quotation/upload',
        multipart: file.size > 5 * 1024 * 1024,
      });
      const checksumBytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const checksum = Array.from(new Uint8Array(checksumBytes), b => b.toString(16).padStart(2, '0')).join('');
      sourceFile = { id: id('file'), pathname: blob.pathname, fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, checksum };

      setUploadProgress('正在解析产品、价格和报价信息...');
      let validation;
      try {
        if (parseMode === 'display') {
          validation = { valid: true, value: { supplierName: '', quotationNumber: '', quotationDate: new Date().toISOString().slice(0, 10), currency: 'CNY', exchangeRateToCny: 1, taxRate: 0, priceTaxMode: 'tax_included' as const, items: [] }, issues: [] };
        } else if (ext === 'xlsx' || ext === 'xls') {
          if (parseMode === 'gemini') {
            validation = await parseQuotationFile(blob.pathname, file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          } else {
            const XLSX = await import('xlsx');
            const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            validation = wb.SheetNames.map(sn => validateParsedQuotation(rowsToQuotationDraft(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: false, blankrows: false })))).sort((a, b) => b.value.items.length - a.value.items.length)[0];
          }
        } else {
          validation = await parseQuotationFile(blob.pathname, sourceFile.mimeType);
        }
        if (!validation || validation.value.items.length === 0) {
          parseFailureReason = '文件中没有读取到产品和价格数据，已保留原始文件，请在归档列表中手动补录明细。';
        }
      } catch (parseError) {
        parseFailureReason = parseError instanceof Error ? parseError.message : String(parseError);
      }

      if (parseFailureReason || !validation) {
        // 解析失败兜底：仍建档保留原始文件，summary 写入失败原因，items 留空
        const fallbackParsed = {
          supplierName: '',
          quotationNumber: '',
          quotationDate: new Date().toISOString().slice(0, 10),
          currency: 'CNY',
          exchangeRateToCny: 1,
          taxRate: 0,
          priceTaxMode: 'tax_included' as const,
          items: [],
        };
        const { draft, supplier } = makeDraft(fallbackParsed, sourceFile, undefined);
        draft.quotation.summary = `自动解析失败：${parseFailureReason ?? '未知原因'}`;
        setUploadProgress('解析未成功，正在保留原始文件...');
        await Promise.all([saveSupplierProfile(supplier), saveQuotationDraft(draft)]);
        await onRefresh();
        setShowUpload(false);
        setError(`已成功上传报价单原文件，但解析未完成：${parseFailureReason ?? '未知原因'}。可在报价归档中找到该记录并手动录入明细。`);
        return;
      }

      const existingSupplier = workspace.suppliers.find(s => !s.deletedAt && s.normalizedName === normalizedSupplierName(validation.value.supplierName));
      const { draft, supplier } = makeDraft(validation.value, sourceFile, existingSupplier);
      draft.items = draft.items.map((item, index) => ({ ...item, reviewIssues: validation.issues.filter(i => i.field.startsWith(`items.${index}.`)) }));

      setUploadProgress('正在更新供应商和报价数据库...');
      await Promise.all([saveSupplierProfile(supplier), saveQuotationDraft(draft)]);
      await onRefresh();
      setShowUpload(false);
    } catch (cause) {
      // 走到这里说明 Blob 上传或保存阶段就抛错；尽力告知用户实际状态
      const message = cause instanceof Error ? cause.message : String(cause);
      if (sourceFile) {
        // Blob 已上传成功但保存草稿失败：尝试再做一次"仅保留原文件"的兜底建档
        try {
          const fallbackParsed = {
            supplierName: '',
            quotationNumber: '',
            quotationDate: new Date().toISOString().slice(0, 10),
            currency: 'CNY',
            exchangeRateToCny: 1,
            taxRate: 0,
            priceTaxMode: 'tax_included' as const,
            items: [],
          };
          const { draft, supplier } = makeDraft(fallbackParsed, sourceFile, undefined);
          draft.quotation.summary = `保存草稿失败，原始文件已保留：${message}`;
          await Promise.all([saveSupplierProfile(supplier), saveQuotationDraft(draft)]);
          await onRefresh();
          setShowUpload(false);
          setError(`已成功上传报价单原文件，但首次保存出错（${message}），已保留原文件供后续手动补录。`);
          return;
        } catch (fallbackErr) {
          setError(`原文件已上传，但保存记录失败：${message}。建议刷新后重试。详情：${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
          return;
        }
      }
      setError(message);
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">报价归档</h1>
          <p className="mt-1 text-xs text-slate-500">管理所有供应商报价单</p>
        </div>
        <button type="button" onClick={() => setShowUpload(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">
          <Upload className="h-4 w-4" /> 上传报价单
        </button>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="搜索供应商、报价单号、产品名称、价格..." className="w-80 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
          </div>
          <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none">
            <option value="all">全部状态</option>
            <option value="review_required">待审核</option>
            <option value="active">已生效</option>
            <option value="expired">已过期</option>
            <option value="voided">已作废</option>
          </select>
          {/* 视图切换 */}
          <div className="ml-auto flex overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-3 py-2 text-[11px] font-semibold transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              title="列表视图"
            >
              <List className="h-3.5 w-3.5" /> 列表
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`flex items-center gap-1 px-3 py-2 text-[11px] font-semibold transition-colors ${viewMode === 'card' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              title="卡片视图"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> 卡片
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          <AlertCircle className="h-4 w-4" /> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X className="h-3 w-3" /></button>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /><p className="text-xs text-slate-500">加载中...</p></div>
          ) : (
            <table className="min-w-[800px] w-full">
              <thead><tr className="border-b border-slate-200 bg-slate-50">
                {['报价单号', '供应商', '源文件', '日期', '状态', '简述', '操作'].map(label => <th key={label} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 last:text-right">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {quotations.map(quotation => {
                  const displayStatus = deriveQuotationDisplayStatus(quotation.status, quotation.validUntil);
                  return (
                    <tr key={quotation.id} className="cursor-pointer hover:bg-blue-50/50" onClick={() => setPreviewQuotationId(quotation.id)}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">{quotation.quotationNumber || quotation.id}</td>
                      <td className="px-4 py-3"><span className="flex items-center gap-2 text-xs font-medium text-slate-700"><Building2 className="h-4 w-4 text-slate-400" />{supplierMap.get(quotation.supplierId)?.name || '-'}</span></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2">{getFileIcon(quotation.sourceFile.mimeType)}<div><p className="max-w-[160px] truncate text-xs text-slate-700">{quotation.sourceFile.fileName}</p><p className="text-[10px] text-slate-400">{formatFileSize(quotation.sourceFile.size)}</p></div></div></td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatDate(quotation.quotationDate)}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusColor(displayStatus)}`}>{getStatusLabel(displayStatus)}</span></td>
                      <td className="px-4 py-3 max-w-[200px]"><p className="truncate text-xs text-slate-500">{quotation.summary || '-'}</p></td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => onFilePreview?.({ pathname: quotation.sourceFile.pathname, fileName: quotation.sourceFile.fileName, mimeType: quotation.sourceFile.mimeType })} className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Eye className="h-4 w-4" /></button>
                          <button type="button" onClick={() => void handleDelete(quotation.id)} disabled={deletingId === quotation.id} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                            {deletingId === quotation.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!loading && quotations.length === 0 && <div className="py-16 text-center text-sm text-slate-500">暂无报价单数据</div>}
        </div>
      )}

      {viewMode === 'card' && (
        loading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" /><p className="text-xs text-slate-500">加载中...</p>
          </div>
        ) : quotations.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">暂无报价单数据</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {quotations.map(quotation => {
              const displayStatus = deriveQuotationDisplayStatus(quotation.status, quotation.validUntil);
              const cardItems = workspace.items.filter(i => i.quotationId === quotation.id && !i.deletedAt);
              const supplier = supplierMap.get(quotation.supplierId);
              return (
                <div
                  key={quotation.id}
                  onClick={() => setPreviewQuotationId(quotation.id)}
                  className="group cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                  {/* Mini preview */}
                  <div className="relative h-40 w-full overflow-hidden border-b border-slate-100 bg-slate-50">
                    <MiniFilePreview
                      pathname={quotation.sourceFile.pathname}
                      fileName={quotation.sourceFile.fileName}
                      mimeType={quotation.sourceFile.mimeType}
                      fallbackItems={cardItems}
                    />
                    <span className={`absolute left-2 top-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${getStatusColor(displayStatus)}`}>
                      {getStatusLabel(displayStatus)}
                    </span>
                    {quotation.sourceFile.pathname && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onFilePreview?.({ pathname: quotation.sourceFile.pathname, fileName: quotation.sourceFile.fileName, mimeType: quotation.sourceFile.mimeType }); }}
                        className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-[10px] font-semibold text-slate-600 opacity-0 shadow-sm transition-opacity hover:bg-white group-hover:opacity-100"
                      >
                        <Eye className="h-3 w-3" /> 全屏
                      </button>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="font-mono text-[11px] font-semibold text-blue-600 truncate">{quotation.quotationNumber || quotation.id}</p>
                      <span className="text-[10px] text-slate-400 shrink-0">{quotation.currency}</span>
                    </div>
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{supplier?.name || '-'}</span>
                    </div>
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Calendar className="h-3 w-3 shrink-0 text-slate-400" />
                      <span>{formatDate(quotation.quotationDate)}</span>
                      <span className="ml-auto flex items-center gap-1">
                        {getFileIcon(quotation.sourceFile.mimeType)}
                        <span className="text-[10px]">{cardItems.length} 条</span>
                      </span>
                    </div>
                    {quotation.summary && (
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-500">{quotation.summary}</p>
                    )}
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-3 py-2" onClick={e => e.stopPropagation()}>
                    <span className="text-[10px] text-slate-400 truncate" title={quotation.sourceFile.fileName}>
                      {quotation.sourceFile.fileName}
                    </span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setPreviewQuotationId(quotation.id)} className="rounded p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="查看明细">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => void handleDelete(quotation.id)} disabled={deletingId === quotation.id} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" title="删除">
                        {deletingId === quotation.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">上传报价单</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {uploadMode === 'file' ? '支持 Excel、PDF 和图片，最大 25MB' : '从剪贴板或聊天记录手动录入报价信息，支持批量粘贴'}
                </p>
              </div>
              <button type="button" disabled={uploading || manualSaving} onClick={() => { setShowUpload(false); resetManualMode(); }}><X className="h-5 w-5 text-slate-400" /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6">
              <button
                type="button"
                disabled={uploading || manualSaving}
                onClick={() => setUploadMode('file')}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-colors ${uploadMode === 'file' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Upload className="h-3.5 w-3.5" /> 文件上传
              </button>
              <button
                type="button"
                disabled={uploading || manualSaving}
                onClick={() => setUploadMode('manual')}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-colors ${uploadMode === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <ClipboardList className="h-3.5 w-3.5" /> 手动模式
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {uploadMode === 'file' && (
                <>
                  <div className="mb-4 flex flex-wrap items-center gap-4">
                    <span className="text-xs font-semibold text-slate-500">解析模式:</span>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="radio" name="parseMode" checked={parseMode === 'internal'} onChange={() => setParseMode('internal')} disabled={uploading} className="accent-blue-600" />内部算法</label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="radio" name="parseMode" checked={parseMode === 'gemini'} onChange={() => setParseMode('gemini')} disabled={uploading} className="accent-blue-600" />Gemini AI</label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="radio" name="parseMode" checked={parseMode === 'display'} onChange={() => setParseMode('display')} disabled={uploading} className="accent-blue-600" />不解析</label>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); }} />
                  {uploading ? (
                    <div className="py-10 text-center"><Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-blue-500" /><p className="text-sm font-medium text-slate-700">{uploadProgress}</p></div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-slate-200 p-10 text-center hover:border-blue-400 hover:bg-slate-50">
                      <Upload className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                      <p className="text-sm font-medium text-slate-700">点击选择报价文件</p>
                      <p className="mt-2 text-xs text-slate-400">.xlsx / .xls / .pdf / .png / .jpg / .webp</p>
                    </button>
                  )}
                </>
              )}

              {uploadMode === 'manual' && (
                <div className="space-y-4">
                  {/* Header info */}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">供应商名称 *</span>
                      <input value={manualSupplierName} onChange={e => setManualSupplierName(e.target.value)} placeholder="例如：上海某某有限公司" disabled={manualSaving} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">报价单号</span>
                      <input value={manualQuotationNumber} onChange={e => setManualQuotationNumber(e.target.value)} placeholder="可选" disabled={manualSaving} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">报价日期</span>
                      <input type="date" value={manualQuotationDate} onChange={e => setManualQuotationDate(e.target.value)} disabled={manualSaving} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">有效期至</span>
                      <input type="date" value={manualValidUntil} onChange={e => setManualValidUntil(e.target.value)} disabled={manualSaving} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">币种</span>
                      <select value={manualCurrency} onChange={e => setManualCurrency(e.target.value)} disabled={manualSaving} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400">
                        <option value="CNY">CNY 人民币</option>
                        <option value="USD">USD 美元</option>
                        <option value="EUR">EUR 欧元</option>
                        <option value="HKD">HKD 港币</option>
                        <option value="JPY">JPY 日元</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-500">税率 (%)</span>
                      <input value={manualTaxRate} onChange={e => setManualTaxRate(e.target.value)} placeholder="如 13" disabled={manualSaving} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </label>
                  </div>

                  {/* Paste / clipboard */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-600">从剪贴板或聊天记录添加</span>
                      <div className="flex gap-2">
                        <button type="button" disabled={manualSaving} onClick={() => void importFromClipboard()} className="flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                          <ClipboardList className="h-3 w-3" /> 读取剪贴板
                        </button>
                        <button type="button" disabled={manualSaving || !manualPasteText.trim()} onClick={appendPastedItems} className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                          <Plus className="h-3 w-3" /> 解析并添加
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={manualPasteText}
                      onChange={e => setManualPasteText(e.target.value)}
                      disabled={manualSaving}
                      rows={4}
                      placeholder={"在此粘贴聊天/邮件文本，每行一条报价。例如：\nA4 复印纸\t规格 70g\t100\t25.5\t包\nA3 复印纸 70g 50 35 包\n回形针 100/盒  3.5/盒"}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">支持 Tab、空格、竖线、逗号、分号分列。识别失败的行会忽略。</p>
                  </div>

                  {/* Items table */}
                  <div className="rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="text-[11px] font-semibold text-slate-600">报价明细汇总（{manualDraftItems.length} 条）</span>
                      <button type="button" disabled={manualSaving} onClick={() => setManualDraftItems(current => [...current, emptyManualItem()])} className="flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                        <Plus className="h-3 w-3" /> 新增空白行
                      </button>
                    </div>
                    {manualDraftItems.length === 0 ? (
                      <div className="px-3 py-8 text-center text-[11px] text-slate-400">尚未添加报价行，可粘贴文本或点击“新增空白行”。</div>
                    ) : (
                      <div className="max-h-[280px] overflow-auto">
                        <table className="min-w-full text-[11px]">
                          <thead className="sticky top-0 bg-slate-100">
                            <tr>
                              {['#', '产品名称', '规格', '单位', '包装数量', '单价', 'MOQ', '交期(天)', '备注', ''].map(h => (
                                <th key={h} className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-500">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {manualDraftItems.map((item, index) => (
                              <tr key={item.id} className="hover:bg-slate-50">
                                <td className="border-b border-slate-100 px-2 py-1 text-slate-400">{index + 1}</td>
                                <td className="border-b border-slate-100 px-1 py-1"><input value={item.sourceProductName} onChange={e => updateManualItem(item.id, { sourceProductName: e.target.value })} className="w-32 rounded border border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-blue-300 focus:bg-white" /></td>
                                <td className="border-b border-slate-100 px-1 py-1"><input value={item.sourceSpecification} onChange={e => updateManualItem(item.id, { sourceSpecification: e.target.value })} className="w-28 rounded border border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-blue-300 focus:bg-white" /></td>
                                <td className="border-b border-slate-100 px-1 py-1"><input value={item.sourceUnit} onChange={e => updateManualItem(item.id, { sourceUnit: e.target.value })} className="w-16 rounded border border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-blue-300 focus:bg-white" /></td>
                                <td className="border-b border-slate-100 px-1 py-1"><input value={item.sourcePackageQuantity} onChange={e => updateManualItem(item.id, { sourcePackageQuantity: e.target.value })} className="w-16 rounded border border-transparent bg-transparent px-1.5 py-1 text-right outline-none focus:border-blue-300 focus:bg-white" /></td>
                                <td className="border-b border-slate-100 px-1 py-1"><input value={item.sourceUnitPrice} onChange={e => updateManualItem(item.id, { sourceUnitPrice: e.target.value })} className="w-20 rounded border border-transparent bg-transparent px-1.5 py-1 text-right font-semibold text-blue-600 outline-none focus:border-blue-300 focus:bg-white" /></td>
                                <td className="border-b border-slate-100 px-1 py-1"><input value={item.minimumOrderQuantity} onChange={e => updateManualItem(item.id, { minimumOrderQuantity: e.target.value })} className="w-14 rounded border border-transparent bg-transparent px-1.5 py-1 text-right outline-none focus:border-blue-300 focus:bg-white" /></td>
                                <td className="border-b border-slate-100 px-1 py-1"><input value={item.lineLeadTimeDays} onChange={e => updateManualItem(item.id, { lineLeadTimeDays: e.target.value })} className="w-12 rounded border border-transparent bg-transparent px-1.5 py-1 text-right outline-none focus:border-blue-300 focus:bg-white" /></td>
                                <td className="border-b border-slate-100 px-1 py-1"><input value={item.note} onChange={e => updateManualItem(item.id, { note: e.target.value })} className="w-28 rounded border border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-blue-300 focus:bg-white" /></td>
                                <td className="border-b border-slate-100 px-1 py-1"><button type="button" onClick={() => removeManualItem(item.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3 w-3" /></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Submit */}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button type="button" disabled={manualSaving} onClick={resetManualMode} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">清空</button>
                    <button type="button" disabled={manualSaving || manualDraftItems.length === 0 || !manualSupplierName.trim()} onClick={() => void submitManualQuotation()} className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
                      {manualSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {manualSaving ? '保存中...' : `保存报价单（${manualDraftItems.length} 条）`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview panel */}
      {previewQuotation && (
        <PreviewPanel
          quotation={previewQuotation}
          items={previewItems}
          supplier={previewSupplier}
          onClose={() => { setPreviewQuotationId(null); onPreviewClosed?.(); }}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}
