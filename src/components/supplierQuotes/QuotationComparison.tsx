import React, { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import type { QuotationWorkspace } from '../../quotation/api';
import type { SupplierQuotationItem } from '../../quotation/types';
import { deriveQuotationDisplayStatus } from '../../quotation/normalization';
import { formatCurrency, formatDate, getScoreColor, getStatusColor, getStatusLabel } from './quotationUi';

interface Props {
  workspace: QuotationWorkspace;
}

export default function QuotationComparison({ workspace }: Props) {
  const [groupId, setGroupId] = useState(workspace.productGroups[0]?.id ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const quoteMap = useMemo(() => new Map(workspace.quotations.map(quotation => [quotation.id, quotation])), [workspace.quotations]);
  const supplierMap = useMemo(() => new Map(workspace.suppliers.map(supplier => [supplier.id, supplier])), [workspace.suppliers]);

  useEffect(() => {
    if (!groupId && workspace.productGroups[0]) setGroupId(workspace.productGroups[0].id);
  }, [groupId, workspace.productGroups]);

  const candidates = workspace.items.filter(item => (
    !item.deletedAt
    && item.productGroupId === groupId
    && item.normalizedTaxIncludedCnyPrice !== null
  ));
  const columns = candidates.filter(item => selectedIds.includes(item.id));
  const prices = columns.map(item => item.normalizedTaxIncludedCnyPrice as number);
  const moqs = columns.map(item => item.minimumOrderQuantity).filter((value): value is number => value !== null);
  const leadTimes = columns.map(item => item.lineLeadTimeDays ?? quoteMap.get(item.quotationId)?.leadTimeDays).filter((value): value is number => value !== null && value !== undefined);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const minMoq = moqs.length ? Math.min(...moqs) : null;
  const minLeadTime = leadTimes.length ? Math.min(...leadTimes) : null;

  const toggleColumn = (id: string) => {
    setSelectedIds(current => current.includes(id) ? current.filter(candidate => candidate !== id) : [...current, id]);
  };

  const metrics = [
    { key: 'price', label: '标准化单价', labelEn: 'Standardized Unit Price (CNY)' },
    { key: 'moq', label: '最小起订量', labelEn: 'MOQ (Units)' },
    { key: 'leadTime', label: '交货周期', labelEn: 'Lead Time (Days)' },
    { key: 'payment', label: '付款条件', labelEn: 'Payment Terms' },
    { key: 'quality', label: '质量评分', labelEn: 'Quality Score / 100' },
    { key: 'delivery', label: '交付评分', labelEn: 'Delivery Score / 100' },
    { key: 'validity', label: '报价有效期', labelEn: 'Validity Date' },
  ];

  const renderValue = (metric: typeof metrics[number], item: SupplierQuotationItem) => {
    const quotation = quoteMap.get(item.quotationId);
    const supplier = quotation ? supplierMap.get(quotation.supplierId) : undefined;
    switch (metric.key) {
      case 'price':
        return <div><div className="flex items-center gap-1"><span className="font-semibold text-slate-800">{formatCurrency(item.normalizedTaxIncludedCnyPrice ?? 0, 'CNY')}</span>{item.normalizedTaxIncludedCnyPrice === minPrice && <Star className="h-3 w-3 fill-amber-500 text-amber-500" />}</div><span className="text-[10px] text-slate-400">Orig: {quotation?.currency} {item.sourceUnitPrice ?? '-'}</span></div>;
      case 'moq':
        return <span className={`font-medium ${item.minimumOrderQuantity === minMoq ? 'text-blue-600' : 'text-slate-700'}`}>{item.minimumOrderQuantity?.toLocaleString() ?? '-'}{item.minimumOrderQuantity === minMoq && <Star className="ml-1 inline h-3 w-3 fill-amber-500 text-amber-500" />}</span>;
      case 'leadTime': {
        const days = item.lineLeadTimeDays ?? quotation?.leadTimeDays;
        return <span className={`font-medium ${days === minLeadTime ? 'text-blue-600' : 'text-slate-700'}`}>{days ?? '-'} Days{days === minLeadTime && <Star className="ml-1 inline h-3 w-3 fill-amber-500 text-amber-500" />}</span>;
      }
      case 'payment':
        return <span className="text-slate-700">{quotation?.paymentTerms || '-'}</span>;
      case 'quality': {
        const score = supplier?.qualityScore ?? 0;
        return <div className="flex items-center gap-2"><span className="font-semibold text-slate-800">{supplier?.qualityScore ?? '-'}</span><div className="flex gap-0.5">{Array.from({ length: 5 }, (_, index) => <div key={index} className={`h-2.5 w-2.5 rounded-sm ${index < Math.round(score / 20) ? getScoreColor(score) : 'bg-slate-200'}`} />)}</div></div>;
      }
      case 'delivery': {
        const score = supplier?.deliveryScore ?? 0;
        return <div className="flex items-center gap-2"><span className="font-semibold text-slate-800">{supplier?.deliveryScore ?? '-'}</span><div className="flex gap-0.5">{Array.from({ length: 5 }, (_, index) => <div key={index} className={`h-2.5 w-2.5 rounded-sm ${index < Math.round(score / 20) ? getScoreColor(score) : 'bg-slate-200'}`} />)}</div></div>;
      }
      case 'validity':
        return <span className="text-slate-700">{formatDate(quotation?.validUntil ?? null)}</span>;
      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6"><h1 className="text-xl font-bold text-slate-800">横向矩阵比价</h1><p className="mt-1 text-xs text-slate-500">按标准产品组比较不同供应商的已标准化报价</p></div>
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-6">
          <div><label className="mb-2 block text-[11px] font-semibold text-slate-500">标准产品组 (Standard Product Group)</label><select value={groupId} onChange={event => { setGroupId(event.target.value); setSelectedIds([]); }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"><option value="">选择产品组</option>{workspace.productGroups.filter(group => group.status === 'confirmed' && !group.deletedAt).map(group => <option key={group.id} value={group.id}>{group.standardName} / {group.baseUnit}</option>)}</select></div>
          <div><label className="mb-2 block text-[11px] font-semibold text-slate-500">选择报价版本 (Select Quote Versions)</label><div className="flex flex-wrap gap-2">{candidates.map(item => {
            const quotation = quoteMap.get(item.quotationId);
            const supplier = quotation ? supplierMap.get(quotation.supplierId) : undefined;
            return <label key={item.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${selectedIds.includes(item.id) ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleColumn(item.id)} /><span className="font-medium">{supplier?.name || '未知供应商'}</span><span className="text-[10px] text-slate-400">(V{quotation?.version})</span></label>;
          })}{candidates.length === 0 ? <span className="text-xs text-slate-400">该产品组暂无已确认标准价格。</span> : null}</div></div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {columns.length === 0 ? <div className="py-16 text-center text-sm text-slate-500">请选择至少一个报价版本进行比较。</div> : <table className="w-full min-w-[760px]"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="w-48 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">评估指标 (METRICS)</th>{columns.map(item => {
          const quotation = quoteMap.get(item.quotationId);
          const supplier = quotation ? supplierMap.get(quotation.supplierId) : undefined;
          const status = quotation ? deriveQuotationDisplayStatus(quotation.status, quotation.validUntil) : 'review_required';
          return <th key={item.id} className="border-l border-slate-100 px-4 py-3 text-left"><span className="text-xs font-semibold text-slate-800">{supplier?.name}</span><div className="mt-1 flex items-center gap-2"><span className="text-[10px] text-slate-400">V{quotation?.version} - {formatDate(quotation?.quotationDate ?? null)}</span><span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${getStatusColor(status)}`}>{getStatusLabel(status)}</span></div></th>;
        })}</tr></thead><tbody>{metrics.map((metric, index) => <tr key={metric.key} className={`border-b border-slate-100 ${index % 2 ? 'bg-slate-50/50' : 'bg-white'}`}><td className="px-4 py-4"><div className="text-xs font-semibold text-slate-700">{metric.label}</div><div className="mt-0.5 text-[10px] text-slate-400">{metric.labelEn}</div></td>{columns.map(item => <td key={item.id} className={`border-l border-slate-100 px-4 py-4 ${metric.key === 'price' && item.normalizedTaxIncludedCnyPrice === minPrice ? 'bg-amber-50' : ''}`}>{renderValue(metric, item)}</td>)}</tr>)}</tbody></table>}
      </div>
    </div>
  );
}
