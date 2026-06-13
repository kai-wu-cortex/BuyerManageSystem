import React, { useMemo, useState } from 'react';
import { CheckCircle2, Package, Plus, Save, Search } from 'lucide-react';
import { saveProductGroup, saveQuotationItem, type QuotationWorkspace } from '../../quotation/api';
import type { SupplierProductGroup } from '../../quotation/types';

interface Props {
  workspace: QuotationWorkspace;
  onSaved: () => Promise<void>;
}

function id(): string {
  return `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function ProductGroups({ workspace, onSaved }: Props) {
  const [name, setName] = useState('');
  const [specification, setSpecification] = useState('');
  const [unit, setUnit] = useState('个');
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const supplierMap = useMemo(() => new Map(workspace.suppliers.map(supplier => [supplier.id, supplier])), [workspace.suppliers]);
  const quoteMap = useMemo(() => new Map(workspace.quotations.map(quotation => [quotation.id, quotation])), [workspace.quotations]);
  const unmatched = workspace.items.filter(item => !item.deletedAt && item.groupMatchStatus !== 'confirmed');
  const groups = workspace.productGroups.filter(group => !group.deletedAt && group.standardName.toLowerCase().includes(searchTerm.toLowerCase()));

  const createGroup = async () => {
    if (!name.trim() || !unit.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const group: SupplierProductGroup = {
        id: id(),
        standardName: name.trim(),
        standardSpecification: specification.trim(),
        baseUnit: unit.trim(),
        conversionRules: {},
        aliases: [],
        status: 'confirmed',
        confirmedBy: 'caigou',
        confirmedAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await saveProductGroup(group);
      setName('');
      setSpecification('');
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const matchItem = async (itemId: string, groupId: string) => {
    const item = workspace.items.find(candidate => candidate.id === itemId);
    if (!item || !groupId) return;
    await saveQuotationItem({ ...item, productGroupId: groupId, groupMatchStatus: 'confirmed', updatedAt: new Date().toISOString() });
    await onSaved();
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between"><div><h1 className="text-xl font-bold text-slate-800">产品分组管理</h1><p className="mt-1 text-xs text-slate-500">管理标准化产品分组和报价明细匹配</p></div></div>
      <div className="mb-6 grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-white p-4"><input value={name} onChange={event => setName(event.target.value)} placeholder="标准产品名称" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><input value={specification} onChange={event => setSpecification(event.target.value)} placeholder="标准规格" className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><div className="flex gap-2"><input value={unit} onChange={event => setUnit(event.target.value)} placeholder="基准单位" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" /><button type="button" disabled={saving} onClick={() => void createGroup()} className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"><Plus className="h-4 w-4" /> 新建分组</button></div></div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-bold text-slate-800">已定义分组 ({groups.length})</h3><div className="flex items-center gap-2"><Search className="h-4 w-4 text-slate-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="搜索分组..." className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-xs" /></div></div><div className="divide-y divide-slate-100">{groups.map(group => <div key={group.id} className="flex items-start gap-3 px-4 py-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100"><Package className="h-5 w-5 text-blue-600" /></div><div><div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-800">{group.standardName}</span><span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">已确认</span></div><p className="mt-1 text-[10px] text-slate-400">{group.standardSpecification || '无标准规格'} · 基准单位 {group.baseUnit} · {workspace.items.filter(item => item.productGroupId === group.id).length} 个物料</p></div></div>)}</div></div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-bold text-slate-800">待匹配物料 ({unmatched.length})</h3></div><div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">{unmatched.map(item => {
          const quotation = quoteMap.get(item.quotationId);
          return <div key={item.id} className="px-4 py-3"><div className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-slate-400" /><span className="text-xs font-medium text-slate-700">{item.sourceProductName || '未命名产品'}</span></div><div className="ml-5 mt-1 text-[10px] text-slate-400">{item.sourceSpecification || '-'} · {quotation ? supplierMap.get(quotation.supplierId)?.name : '-'}</div><div className="ml-5 mt-2 flex gap-2"><select defaultValue="" onChange={event => void matchItem(item.id, event.target.value)} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-[10px]"><option value="">选择产品组</option>{workspace.productGroups.filter(group => group.status === 'confirmed' && !group.deletedAt).map(group => <option key={group.id} value={group.id}>{group.standardName}</option>)}</select><Save className="h-4 w-4 text-blue-500" /></div></div>;
        })}{unmatched.length === 0 ? <div className="py-10 text-center text-xs text-slate-500"><CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />全部物料已匹配</div> : null}</div></div>
      </div>
    </div>
  );
}
