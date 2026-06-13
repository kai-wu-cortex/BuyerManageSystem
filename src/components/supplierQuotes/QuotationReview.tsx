import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Save,
  Settings,
  Trash2,
} from 'lucide-react';
import { confirmQuotationDraft, saveQuotationDraft } from '../../quotation/api';
import { validateParsedQuotation } from '../../quotation/quotationParser';
import type {
  CustomColumn,
  SupplierProductGroup,
  SupplierProfile,
  SupplierQuotation,
  SupplierQuotationItem,
} from '../../quotation/types';

interface Props {
  quotation: SupplierQuotation | null;
  items: SupplierQuotationItem[];
  supplier?: SupplierProfile;
  productGroups: SupplierProductGroup[];
  onSaved: () => Promise<void>;
  onBack: () => void;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const MAPPABLE_FIELDS: { field: keyof SupplierQuotationItem; label: string }[] = [
  { field: 'sourceProductCode', label: '产品编码' },
  { field: 'sourceProductName', label: '产品名称' },
  { field: 'sourceSpecification', label: '规格' },
  { field: 'sourceUnit', label: '单位' },
  { field: 'sourcePackageDescription', label: '包装说明' },
  { field: 'sourcePackageQuantity', label: '包装数' },
  { field: 'sourceUnitPrice', label: '单价' },
  { field: 'minimumOrderQuantity', label: 'MOQ' },
  { field: 'lineLeadTimeDays', label: '交期' },
];

const NUMERIC_FIELDS = new Set(['sourcePackageQuantity', 'sourceUnitPrice', 'minimumOrderQuantity', 'lineLeadTimeDays']);

function ExcelPreview({ pathname }: { pathname: string }) {
  const [rows, setRows] = useState<unknown[][]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/quotation/file?pathname=${encodeURIComponent(pathname)}`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('无法读取报价原文件。');
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
        return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], {
          header: 1,
          raw: false,
          blankrows: false,
        }).slice(0, 300);
      })
      .then(nextRows => {
        if (!cancelled) setRows(nextRows);
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (error) return <div className="flex h-full items-center justify-center p-6 text-xs text-red-600">{error}</div>;
  if (!rows.length) return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  const columnCount = Math.min(30, rows.reduce((maximum, row) => Math.max(maximum, row.length), 0));
  return (
    <div className="h-full overflow-auto bg-white">
      <table className="min-w-full border-collapse text-[10px]">
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{Array.from({ length: columnCount }, (_, columnIndex) => <td key={columnIndex} className={`max-w-52 whitespace-pre-wrap border border-slate-200 px-2 py-1.5 align-top ${rowIndex === 0 ? 'bg-slate-100 font-bold' : ''}`}>{String(row[columnIndex] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function QuotationReview({ quotation, items, supplier, productGroups, onSaved, onBack }: Props) {
  const [draftQuotation, setDraftQuotation] = useState<SupplierQuotation | null>(quotation);
  const [draftItems, setDraftItems] = useState<SupplierQuotationItem[]>(items);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>(quotation?.customColumns ?? []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [newColumnField, setNewColumnField] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchTargetField, setBatchTargetField] = useState('');
  const [batchValue, setBatchValue] = useState('');

  useEffect(() => {
    setDraftQuotation(quotation);
    setDraftItems(items);
    setCustomColumns(quotation?.customColumns ?? []);
    setMessage('');
    setSelectedIds(new Set());
  }, [quotation, items]);

  if (!draftQuotation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <FileText className="h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">请选择一张待审核报价单。</p>
        <button type="button" onClick={onBack} className="text-xs font-semibold text-blue-600">返回报价归档</button>
      </div>
    );
  }

  const validation = validateParsedQuotation({
    supplierName: supplier?.name ?? '',
    quotationNumber: draftQuotation.quotationNumber,
    quotationDate: draftQuotation.quotationDate,
    validUntil: draftQuotation.validUntil ?? '',
    currency: draftQuotation.currency,
    exchangeRateToCny: draftQuotation.exchangeRateToCny,
    taxRate: draftQuotation.taxRate,
    priceTaxMode: draftQuotation.priceTaxMode,
    paymentTerms: draftQuotation.paymentTerms,
    leadTimeDays: draftQuotation.leadTimeDays,
    items: draftItems,
  });
  const missingGroups = draftItems.filter(item => !item.productGroupId || item.groupMatchStatus !== 'confirmed');
  const blockingCount = validation.issues.length + missingGroups.length;
  const confidence = Math.max(0, Math.round(100 - blockingCount * 8));

  const updateItem = (index: number, patch: Partial<SupplierQuotationItem>) => {
    setDraftItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const updateCustomColumnValue = (columnId: string, itemId: string, value: string) => {
    setCustomColumns(cols => cols.map(col => {
      if (col.id !== columnId) return col;
      const sourceField = col.sourceField;
      const numeric = sourceField ? NUMERIC_FIELDS.has(sourceField) : false;
      return { ...col, values: { ...col.values, [itemId]: numeric ? (value === '' ? null : Number(value)) : value } };
    }));
  };

  const addRow = () => {
    const now = new Date().toISOString();
    setDraftItems(current => [...current, {
      id: id('quote_item'),
      quotationId: draftQuotation.id,
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

  const addColumn = () => {
    if (!newColumnLabel.trim()) return;
    const field = newColumnField || null;
    setCustomColumns(cols => [...cols, {
      id: id('col'),
      label: newColumnLabel.trim(),
      sourceField: field as keyof SupplierQuotationItem | null,
      values: {},
    }]);
    setNewColumnLabel('');
    setNewColumnField('');
  };

  const removeColumn = (colId: string) => {
    setCustomColumns(cols => cols.filter(col => col.id !== colId));
  };

  const getCustomCellValue = (col: CustomColumn, itemId: string): string | number | null => {
    if (col.sourceField) {
      const item = draftItems.find(i => i.id === itemId);
      if (item) return item[col.sourceField] as string | number | null;
    }
    return col.values[itemId] ?? '';
  };

  const applyBatchEdit = () => {
    if (!batchTargetField || selectedIds.size === 0) return;
    if (batchTargetField.startsWith('__custom__')) {
      const colId = batchTargetField.replace('__custom__', '');
      setCustomColumns(cols => cols.map(col => {
        if (col.id !== colId) return col;
        const numeric = col.sourceField ? NUMERIC_FIELDS.has(col.sourceField) : false;
        const newVal = numeric ? (batchValue === '' ? null : Number(batchValue)) : batchValue;
        const newValues = { ...col.values };
        for (const itemId of selectedIds) {
          newValues[itemId] = newVal;
        }
        return { ...col, values: newValues };
      }));
    } else {
      const field = batchTargetField as keyof SupplierQuotationItem;
      const numeric = NUMERIC_FIELDS.has(field);
      const newVal = numeric ? (batchValue === '' ? null : Number(batchValue)) : batchValue;
      setDraftItems(current => current.map(item => {
        if (!selectedIds.has(item.id)) return item;
        return { ...item, [field]: newVal };
      }));
    }
    setBatchValue('');
  };

  const save = async (confirm: boolean) => {
    setSaving(true);
    setMessage('');
    try {
      const now = new Date().toISOString();
      const draft = {
        quotation: { ...draftQuotation, customColumns, updatedAt: now },
        items: draftItems.map(item => ({ ...item, updatedAt: now })),
      };
      if (confirm) {
        if (blockingCount > 0) throw new Error(`仍有 ${blockingCount} 项问题需要处理。`);
        await confirmQuotationDraft(draft);
      } else {
        await saveQuotationDraft(draft);
      }
      setMessage(confirm ? '报价单已确认生效。' : '草稿已保存。');
      await onSaved();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const isExcel = draftQuotation.sourceFile.mimeType.includes('spreadsheet') || draftQuotation.sourceFile.mimeType === 'application/vnd.ms-excel';
  const allSelected = selectedIds.size === draftItems.length && draftItems.length > 0;

  return (
    <div className="flex h-full min-h-[760px]">
      <div className="flex w-[45%] flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /><span className="text-xs font-semibold text-slate-700">ORIGINAL DOCUMENT</span><span className="truncate rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">{draftQuotation.sourceFile.fileName}</span></div>
          <a href={`/api/quotation/file?pathname=${encodeURIComponent(draftQuotation.sourceFile.pathname)}`} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-blue-600">新窗口</a>
        </div>
        <div className="flex-1 overflow-hidden bg-slate-50 p-5">
          <div className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {isExcel ? <ExcelPreview pathname={draftQuotation.sourceFile.pathname} /> : <iframe title="报价原文件" src={`/api/quotation/file?pathname=${encodeURIComponent(draftQuotation.sourceFile.pathname)}`} className="h-full w-full bg-white" />}
          </div>
        </div>
      </div>

      <div className="flex w-[55%] flex-col bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div><button type="button" onClick={onBack} className="mb-2 flex items-center gap-1 text-[10px] font-semibold text-slate-500"><ArrowLeft className="h-3 w-3" /> 返回归档</button><h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">解析校对页 <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Audit &amp; Proofing</span></h2></div>
            <div className="flex items-center gap-3"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${confidence}%` }} /></div><span className="text-xs font-semibold text-slate-700">{confidence}%</span></div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4">
          <label className="text-[11px] font-semibold text-slate-500">供应商<input value={supplier?.name ?? ''} readOnly className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700" /></label>
          <label className="text-[11px] font-semibold text-slate-500">报价单号<input value={draftQuotation.quotationNumber} onChange={event => setDraftQuotation(current => current ? { ...current, quotationNumber: event.target.value } : current)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
          <label className="text-[11px] font-semibold text-slate-500">日期<input type="date" value={draftQuotation.quotationDate} onChange={event => setDraftQuotation(current => current ? { ...current, quotationDate: event.target.value } : current)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
          <label className="text-[11px] font-semibold text-slate-500">币种<input value={draftQuotation.currency} onChange={event => setDraftQuotation(current => current ? { ...current, currency: event.target.value.toUpperCase() } : current)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
          <label className="text-[11px] font-semibold text-slate-500">汇率<input type="number" value={draftQuotation.exchangeRateToCny} onChange={event => setDraftQuotation(current => current ? { ...current, exchangeRateToCny: Number(event.target.value) } : current)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
          <label className="text-[11px] font-semibold text-slate-500">税率 %<input type="number" value={draftQuotation.taxRate} onChange={event => setDraftQuotation(current => current ? { ...current, taxRate: Number(event.target.value) } : current)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">明细数据 (Line Items)</h3>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowColumnManager(!showColumnManager)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"><Settings className="h-3.5 w-3.5" /> 管理列</button>
              <button type="button" onClick={addRow} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" /> 添加行</button>
            </div>
          </div>

          {showColumnManager && (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">自定义列管理</p>
              {customColumns.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {customColumns.map(col => (
                    <span key={col.id} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600">
                      {col.label}{col.sourceField ? <span className="text-slate-400">({MAPPABLE_FIELDS.find(f => f.field === col.sourceField)?.label ?? col.sourceField})</span> : null}
                      <button type="button" onClick={() => removeColumn(col.id)} className="ml-0.5 text-slate-400 hover:text-red-500">&times;</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input value={newColumnLabel} onChange={e => setNewColumnLabel(e.target.value)} placeholder="列名" className="w-32 rounded border border-slate-200 px-2 py-1 text-xs" />
                <select value={newColumnField} onChange={e => setNewColumnField(e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-xs">
                  <option value="">自定义值</option>
                  {MAPPABLE_FIELDS.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                </select>
                <button type="button" onClick={addColumn} className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">添加</button>
              </div>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
              <span className="text-xs font-semibold text-blue-700">已选 {selectedIds.size} 行</span>
              <select value={batchTargetField} onChange={e => setBatchTargetField(e.target.value)} className="rounded border border-blue-200 px-2 py-1 text-xs">
                <option value="">选择字段...</option>
                {MAPPABLE_FIELDS.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                {customColumns.map(col => <option key={col.id} value={`__custom__${col.id}`}>{col.label}</option>)}
              </select>
              <input value={batchValue} onChange={e => setBatchValue(e.target.value)} placeholder="新值" className="w-24 rounded border border-blue-200 px-2 py-1 text-xs" />
              <button type="button" onClick={applyBatchEdit} className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">应用</button>
              <button type="button" onClick={() => { setSelectedIds(new Set()); setBatchValue(''); setBatchTargetField(''); }} className="text-xs text-blue-600 underline">清除选择</button>
            </div>
          )}

          <table className="w-full min-w-[760px] text-xs">
            <thead><tr className="border-b border-slate-200">
              <th className="px-2 py-2"><input type="checkbox" checked={allSelected} onChange={e => setSelectedIds(e.target.checked ? new Set(draftItems.map(i => i.id)) : new Set())} className="accent-blue-600" /></th>
              {['#', '产品名称', '规格', '单位', '包装数', '单价', '产品组', ...customColumns.map(c => c.label), ''].map(label => <th key={label} className="px-2 py-2 text-left font-semibold text-slate-500">{label}</th>)}
            </tr></thead>
            <tbody>{draftItems.map((item, index) => <tr key={item.id} className={`border-b border-slate-100 ${item.reviewIssues.length ? 'bg-amber-50' : ''}`}>
              <td className="px-2 py-2"><input type="checkbox" checked={selectedIds.has(item.id)} onChange={e => setSelectedIds(current => { const next = new Set(current); e.target.checked ? next.add(item.id) : next.delete(item.id); return next; })} className="accent-blue-600" /></td>
              <td className="px-2 py-2 text-slate-500">{index + 1}</td>
              <td className="px-1 py-2"><input value={item.sourceProductName} onChange={event => updateItem(index, { sourceProductName: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1.5" /></td>
              <td className="px-1 py-2"><input value={item.sourceSpecification} onChange={event => updateItem(index, { sourceSpecification: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1.5" /></td>
              <td className="px-1 py-2"><input value={item.sourceUnit} onChange={event => updateItem(index, { sourceUnit: event.target.value })} className="w-16 rounded border border-slate-200 px-2 py-1.5" /></td>
              <td className="px-1 py-2"><input type="number" value={item.sourcePackageQuantity ?? ''} onChange={event => updateItem(index, { sourcePackageQuantity: event.target.value === '' ? null : Number(event.target.value) })} className="w-20 rounded border border-slate-200 px-2 py-1.5" /></td>
              <td className="px-1 py-2"><input type="number" value={item.sourceUnitPrice ?? ''} onChange={event => updateItem(index, { sourceUnitPrice: event.target.value === '' ? null : Number(event.target.value) })} className="w-24 rounded border border-slate-200 px-2 py-1.5" /></td>
              <td className="px-1 py-2"><select value={item.productGroupId ?? ''} onChange={event => updateItem(index, { productGroupId: event.target.value || null, groupMatchStatus: event.target.value ? 'confirmed' : 'unmatched' })} className="w-36 rounded border border-slate-200 px-2 py-1.5"><option value="">待分组</option>{productGroups.filter(group => group.status === 'confirmed').map(group => <option key={group.id} value={group.id}>{group.standardName}</option>)}</select></td>
              {customColumns.map(col => {
                const val = getCustomCellValue(col, item.id);
                return <td key={col.id} className="px-1 py-2"><input value={val ?? ''} onChange={e => updateCustomColumnValue(col.id, item.id, e.target.value)} className="w-24 rounded border border-slate-200 px-2 py-1.5" /></td>;
              })}
              <td className="px-1 py-2"><button type="button" onClick={() => setDraftItems(current => current.filter(candidate => candidate.id !== item.id))} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
            </tr>)}</tbody>
          </table>
        </div>

        {(blockingCount > 0 || message) && (
          <div className="mx-6 mb-4 rounded-lg border border-red-300 bg-red-50 p-4">
            {blockingCount > 0 && (
              <>
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  {blockingCount} 项验证问题阻止报价确认
                </div>
                <ul className="list-disc space-y-1 pl-5 text-xs text-red-600">
                  {validation.issues.map((issue, i) => (
                    <li key={i}>{issue.message}</li>
                  ))}
                  {missingGroups.map((item, i) => (
                    <li key={`group-${i}`}>第 {item.lineNumber} 行未分配产品组</li>
                  ))}
                </ul>
              </>
            )}
            {message && (
              <div className={`mt-2 text-xs ${message.includes('失败') || message.includes('错误') ? 'text-red-600' : 'text-emerald-600'}`}>{message}</div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className={`flex items-center gap-2 text-xs font-medium ${blockingCount ? 'text-red-600' : 'text-emerald-600'}`}>{blockingCount ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{blockingCount ? `存在 ${blockingCount} 项问题阻止生效` : '数据已满足确认条件'}</div>
          <div className="flex gap-3"><button type="button" disabled={saving} onClick={() => void save(false)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-white"><Save className="h-4 w-4" /> 保存草稿</button><button type="button" disabled={saving || blockingCount > 0} onClick={() => void save(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> 确认并保存</button></div>
        </div>
      </div>
    </div>
  );
}
