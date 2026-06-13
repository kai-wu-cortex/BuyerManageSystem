import React, { useEffect, useState } from 'react';
import { Building2, Eye, Mail, Phone, Save, Star, Trash2, TrendingUp, User } from 'lucide-react';
import { deleteSupplier, saveSupplierProfile } from '../../quotation/api';
import { deriveQuotationDisplayStatus } from '../../quotation/normalization';
import type { SupplierProfile, SupplierQuotation, SupplierQuotationItem } from '../../quotation/types';
import { formatDate, getScoreColor, getStatusColor, getStatusLabel } from './quotationUi';

interface Props {
  suppliers: SupplierProfile[];
  quotations: SupplierQuotation[];
  items: SupplierQuotationItem[];
  onSaved: () => Promise<void>;
  onOpenQuotation: (id: string) => void;
}

export default function SupplierProfiles({ suppliers, quotations, items, onSaved, onOpenQuotation }: Props) {
  const [selectedId, setSelectedId] = useState(suppliers[0]?.id ?? '');
  const selected = suppliers.find(supplier => supplier.id === selectedId) ?? suppliers[0];
  const [draft, setDraft] = useState<SupplierProfile | null>(selected ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedId && suppliers[0]) setSelectedId(suppliers[0].id);
  }, [selectedId, suppliers]);
  useEffect(() => {
    setDraft(selected ?? null);
  }, [selected]);

  if (!draft) return <div className="p-12 text-center text-sm text-slate-500">上传报价单后会自动建立供应商档案。</div>;

  const history = quotations
    .filter(quotation => quotation.supplierId === draft.id && !quotation.deletedAt)
    .sort((left, right) => right.quotationDate.localeCompare(left.quotationDate));
  const scoreDimensions = [
    ['qualityScore', '质量', 'Quality', <Star className="h-4 w-4" />],
    ['deliveryScore', '交期', 'Delivery', <TrendingUp className="h-4 w-4" />],
    ['serviceScore', '服务', 'Service', <Phone className="h-4 w-4" />],
    ['cooperationScore', '合作', 'Cooperation', <Building2 className="h-4 w-4" />],
  ] as const;

  const save = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await saveSupplierProfile({ ...draft, scoreUpdatedAt: now, updatedAt: now });
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (supplierId: string) => {
    if (!window.confirm('确定要删除这个供应商吗？')) return;
    try {
      await deleteSupplier(supplierId);
      if (selectedId === supplierId) {
        const next = suppliers.find(s => s.id !== supplierId);
        setSelectedId(next?.id ?? '');
      }
      await onSaved();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {suppliers.map(supplier => (
          <div key={supplier.id} className="flex items-center gap-1">
            <button type="button" onClick={() => setSelectedId(supplier.id)} className={`rounded-lg border px-3 py-2 text-xs font-medium ${supplier.id === draft.id ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>{supplier.name}</button>
            <button type="button" onClick={() => void handleDelete(supplier.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-slate-200 bg-slate-100"><Building2 className="h-8 w-8 text-slate-400" /></div>
            <div><div className="mb-1 flex items-center gap-2"><h1 className="text-lg font-bold text-slate-800">{draft.name}</h1><span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">已建档</span></div><p className="mb-3 text-xs text-slate-500">标准化名称: {draft.normalizedName}</p><div className="grid gap-2 text-xs text-slate-600 md:grid-cols-3">
              <label className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-slate-400" /><input value={draft.contactName} onChange={event => setDraft(current => current ? { ...current, contactName: event.target.value } : current)} placeholder="联系人" className="border-b border-slate-200 bg-transparent outline-none" /></label>
              <label className="flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-slate-400" /><input value={draft.contactEmail} onChange={event => setDraft(current => current ? { ...current, contactEmail: event.target.value } : current)} placeholder="邮箱" className="border-b border-slate-200 bg-transparent outline-none" /></label>
              <label className="flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-slate-400" /><input value={draft.contactPhone} onChange={event => setDraft(current => current ? { ...current, contactPhone: event.target.value } : current)} placeholder="电话" className="border-b border-slate-200 bg-transparent outline-none" /></label>
            </div></div>
          </div>
          <button type="button" disabled={saving} onClick={() => void save()} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Save className="h-3.5 w-3.5" /> 保存资料</button>
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-800">供应商综合评分</h2><span className="text-[10px] text-slate-400">最后更新: {draft.scoreUpdatedAt ? draft.scoreUpdatedAt.slice(0, 16).replace('T', ' ') : '尚未评分'}</span></div>
        <div className="grid grid-cols-4 gap-4">{scoreDimensions.map(([key, label, labelEn, icon]) => {
          const score = draft[key] ?? 0;
          return <div key={key} className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center gap-2"><span className="text-slate-400">{icon}</span><span className="text-xs font-semibold text-slate-700">{label} ({labelEn})</span></div><div className="mb-2 flex items-baseline gap-1"><input type="number" min="0" max="100" value={draft[key] ?? ''} onChange={event => setDraft(current => current ? { ...current, [key]: event.target.value === '' ? null : Math.min(100, Math.max(0, Number(event.target.value))) } : current)} className="w-20 bg-transparent text-3xl font-bold text-slate-800 outline-none" /><span className="text-xs text-slate-400">/ 100</span></div><div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${getScoreColor(score)}`} style={{ width: `${score}%` }} /></div><p className="text-[10px] leading-relaxed text-slate-500">根据历史报价与采购履约表现综合评定。</p></div>;
        })}</div>
        <textarea value={draft.scoreNote} onChange={event => setDraft(current => current ? { ...current, scoreNote: event.target.value } : current)} placeholder="评分备注" className="mt-4 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-bold text-slate-800">历史报价记录</h3></div>
        <table className="w-full text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50">{['报价单号', '日期', '物料明细', '币种', '状态', '操作'].map(label => <th key={label} className="px-4 py-2.5 text-left font-semibold text-slate-500">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{history.map(quotation => {
          const quoteItems = items.filter(item => item.quotationId === quotation.id && !item.deletedAt);
          const status = deriveQuotationDisplayStatus(quotation.status, quotation.validUntil);
          return <tr key={quotation.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-mono font-semibold text-blue-600">{quotation.quotationNumber || quotation.id}</td><td className="px-4 py-3 text-slate-600">{formatDate(quotation.quotationDate)}</td><td className="max-w-xs truncate px-4 py-3 text-slate-600">{quoteItems.map(item => item.sourceProductName).filter(Boolean).slice(0, 3).join('、') || '-'}</td><td className="px-4 py-3">{quotation.currency}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusColor(status)}`}>{getStatusLabel(status)}</span></td><td className="px-4 py-3"><button type="button" onClick={() => onOpenQuotation(quotation.id)} className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Eye className="h-4 w-4" /></button></td></tr>;
        })}</tbody></table>
        {history.length === 0 ? <div className="p-10 text-center text-xs text-slate-500">暂无历史报价。</div> : null}
      </div>
    </div>
  );
}
