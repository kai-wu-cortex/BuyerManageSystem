import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { confirmQuotationDraft, saveQuotationDraft } from '../../quotation/api';
import { validateParsedQuotation } from '../../quotation/quotationParser';
import type {
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDraftQuotation(quotation);
    setDraftItems(items);
    setMessage('');
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

  const save = async (confirm: boolean) => {
    setSaving(true);
    setMessage('');
    try {
      const now = new Date().toISOString();
      const draft = {
        quotation: { ...draftQuotation, updatedAt: now },
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
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-700">明细数据 (Line Items)</h3><button type="button" onClick={addRow} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" /> 添加行</button></div>
          <table className="w-full min-w-[760px] text-xs">
            <thead><tr className="border-b border-slate-200">{['#', '产品名称', '规格', '单位', '包装数', '单价', '产品组', ''].map(label => <th key={label} className="px-2 py-2 text-left font-semibold text-slate-500">{label}</th>)}</tr></thead>
            <tbody>{draftItems.map((item, index) => <tr key={item.id} className={`border-b border-slate-100 ${item.reviewIssues.length ? 'bg-amber-50' : ''}`}>
              <td className="px-2 py-2 text-slate-500">{index + 1}</td>
              <td className="px-1 py-2"><input value={item.sourceProductName} onChange={event => updateItem(index, { sourceProductName: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1.5" /></td>
              <td className="px-1 py-2"><input value={item.sourceSpecification} onChange={event => updateItem(index, { sourceSpecification: event.target.value })} className="w-full rounded border border-slate-200 px-2 py-1.5" /></td>
              <td className="px-1 py-2"><input value={item.sourceUnit} onChange={event => updateItem(index, { sourceUnit: event.target.value })} className="w-16 rounded border border-slate-200 px-2 py-1.5" /></td>
              <td className="px-1 py-2"><input type="number" value={item.sourcePackageQuantity ?? ''} onChange={event => updateItem(index, { sourcePackageQuantity: event.target.value === '' ? null : Number(event.target.value) })} className="w-20 rounded border border-slate-200 px-2 py-1.5" /></td>
              <td className="px-1 py-2"><input type="number" value={item.sourceUnitPrice ?? ''} onChange={event => updateItem(index, { sourceUnitPrice: event.target.value === '' ? null : Number(event.target.value) })} className="w-24 rounded border border-slate-200 px-2 py-1.5" /></td>
              <td className="px-1 py-2"><select value={item.productGroupId ?? ''} onChange={event => updateItem(index, { productGroupId: event.target.value || null, groupMatchStatus: event.target.value ? 'confirmed' : 'unmatched' })} className="w-36 rounded border border-slate-200 px-2 py-1.5"><option value="">待分组</option>{productGroups.filter(group => group.status === 'confirmed').map(group => <option key={group.id} value={group.id}>{group.standardName}</option>)}</select></td>
              <td className="px-1 py-2"><button type="button" onClick={() => setDraftItems(current => current.filter(candidate => candidate.id !== item.id))} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
            </tr>)}</tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className={`flex items-center gap-2 text-xs font-medium ${blockingCount ? 'text-red-600' : 'text-emerald-600'}`}>{blockingCount ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{blockingCount ? `存在 ${blockingCount} 项问题阻止生效` : '数据已满足确认条件'}{message ? <span className="ml-2 text-blue-600">{message}</span> : null}</div>
          <div className="flex gap-3"><button type="button" disabled={saving} onClick={() => void save(false)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-white"><Save className="h-4 w-4" /> 保存草稿</button><button type="button" disabled={saving || blockingCount > 0} onClick={() => void save(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> 确认并保存</button></div>
        </div>
      </div>
    </div>
  );
}
