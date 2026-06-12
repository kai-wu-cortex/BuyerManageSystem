import React, { useState } from 'react';
import {
  Download,
  Check,
  Star,
  AlertTriangle,
} from 'lucide-react';
import { formatCurrency, formatDate, getScoreColor } from './quotationUi';

interface ComparisonColumn {
  id: string;
  supplierName: string;
  version: string;
  date: string;
  status: 'active' | 'archived' | 'pending';
  standardizedPrice: number;
  originalPrice: string;
  moq: number;
  leadTime: number;
  paymentTerms: string;
  qualityScore: number;
  deliveryScore: number;
  validityDate: string;
  isMinPrice: boolean;
  isMinMoq: boolean;
  isMinLeadTime: boolean;
}

const MOCK_COLUMNS: ComparisonColumn[] = [
  {
    id: 'c1',
    supplierName: 'TechCorp Manufacturing',
    version: 'V2',
    date: 'Oct 24, 2023',
    status: 'active',
    standardizedPrice: 45.20,
    originalPrice: '$6.25 (USD)',
    moq: 1000,
    leadTime: 14,
    paymentTerms: 'Net 30',
    qualityScore: 96,
    deliveryScore: 98,
    validityDate: 'Dec 31, 2023',
    isMinPrice: false,
    isMinMoq: false,
    isMinLeadTime: true,
  },
  {
    id: 'c2',
    supplierName: 'Global Parts Inc.',
    version: 'V1',
    date: 'Oct 20, 2023',
    status: 'archived',
    standardizedPrice: 42.80,
    originalPrice: '€5.50 (EUR)',
    moq: 5000,
    leadTime: 30,
    paymentTerms: 'Net 60',
    qualityScore: 85,
    deliveryScore: 78,
    validityDate: 'Nov 30, 2023',
    isMinPrice: true,
    isMinMoq: false,
    isMinLeadTime: false,
  },
  {
    id: 'c3',
    supplierName: 'Apex Industrial',
    version: 'V3',
    date: 'Nov 02, 2023',
    status: 'pending',
    standardizedPrice: 48.50,
    originalPrice: '¥48.50 (CNY)',
    moq: 500,
    leadTime: 21,
    paymentTerms: '30% Advance, 70% Ship',
    qualityScore: 92,
    deliveryScore: 88,
    validityDate: 'Jan 15, 2024',
    isMinPrice: false,
    isMinMoq: true,
    isMinLeadTime: false,
  },
];

const STATUS_MAP = {
  active: { label: 'ACTIVE', color: 'bg-emerald-100 text-emerald-700' },
  archived: { label: 'ARCHIVED', color: 'bg-slate-100 text-slate-600' },
  pending: { label: 'PENDING', color: 'bg-amber-100 text-amber-700' },
};

export default function QuotationComparison() {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(['c1', 'c2', 'c3']);
  const [productGroup, setProductGroup] = useState('工业级轴承组件 (Industrial Bearing Assembly)');

  const metrics = [
    { key: 'price', label: '标准化单价', labelEn: 'Standardized Unit Price (CNY)' },
    { key: 'moq', label: '最小起订量', labelEn: 'MOQ (Units)' },
    { key: 'leadTime', label: '交货周期', labelEn: 'Lead Time (Days)' },
    { key: 'payment', label: '付款条件', labelEn: 'Payment Terms' },
    { key: 'quality', label: '质量评分', labelEn: 'Quality Score / 100' },
    { key: 'delivery', label: '交付评分', labelEn: 'Delivery Score / 100' },
    { key: 'validity', label: '报价有效期', labelEn: 'Validity Date' },
  ];

  const toggleColumn = (id: string) => {
    setSelectedColumns(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const columns = MOCK_COLUMNS.filter(c => selectedColumns.includes(c.id));

  const renderValue = (metric: typeof metrics[0], col: ComparisonColumn) => {
    switch (metric.key) {
      case 'price':
        return (
          <div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-slate-800">{formatCurrency(col.standardizedPrice, 'CNY')}</span>
              {col.isMinPrice && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
            </div>
            <span className="text-[10px] text-slate-400">Orig: {col.originalPrice}</span>
          </div>
        );
      case 'moq':
        return (
          <span className={`font-medium ${col.isMinMoq ? 'text-blue-600' : 'text-slate-700'}`}>
            {col.moq.toLocaleString()}
            {col.isMinMoq && <Star className="w-3 h-3 text-amber-500 fill-amber-500 inline ml-1" />}
          </span>
        );
      case 'leadTime':
        return (
          <span className={`font-medium ${col.isMinLeadTime ? 'text-blue-600' : 'text-slate-700'}`}>
            {col.leadTime} Days
            {col.isMinLeadTime && <Star className="w-3 h-3 text-amber-500 fill-amber-500 inline ml-1" />}
          </span>
        );
      case 'payment':
        return <span className="text-slate-700">{col.paymentTerms}</span>;
      case 'quality':
        return (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{col.qualityScore}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-sm ${
                    i < Math.round(col.qualityScore / 20) ? getScoreColor(col.qualityScore) : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>
        );
      case 'delivery':
        return (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{col.deliveryScore}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-sm ${
                    i < Math.round(col.deliveryScore / 20) ? getScoreColor(col.deliveryScore) : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>
        );
      case 'validity':
        return <span className="text-slate-700">{formatDate(col.validityDate)}</span>;
      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">横向矩阵比价</h1>
        <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors">
          <Download className="w-4 h-4" />
          导出
        </button>
      </div>

      {/* Selection Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-2 gap-6">
          {/* Product Group */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-2">
              标准产品组 (Standard Product Group)
            </label>
            <input
              type="text"
              value={productGroup}
              onChange={(e) => setProductGroup(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          {/* Version Selection */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-2">
              选择报价版本 (Select Quote Versions)
            </label>
            <div className="flex flex-wrap gap-2">
              {MOCK_COLUMNS.map((col) => (
                <label
                  key={col.id}
                  className={`flex items-center gap-2 px-3 py-2 text-xs border rounded-lg cursor-pointer transition-colors ${
                    selectedColumns.includes(col.id)
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(col.id)}
                    onChange={() => toggleColumn(col.id)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-medium">{col.supplierName}</span>
                  <span className="text-[10px] text-slate-400">({col.version})</span>
                  {selectedColumns.includes(col.id) && (
                    <span className="text-[10px] text-blue-500">- 已选</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Matrix */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-48">
                评估指标 (METRICS)
              </th>
              {columns.map((col) => (
                <th key={col.id} className="px-4 py-3 text-left border-l border-slate-100">
                  <div>
                    <span className="text-xs font-semibold text-slate-800">{col.supplierName}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-slate-400">{col.version} - {col.date}</span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${STATUS_MAP[col.status].color}`}>
                        {STATUS_MAP[col.status].label}
                      </span>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, idx) => (
              <tr key={metric.key} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="px-4 py-4">
                  <div className="text-xs font-semibold text-slate-700">{metric.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{metric.labelEn}</div>
                </td>
                {columns.map((col) => (
                  <td key={col.id} className="px-4 py-4 border-l border-slate-100">
                    {renderValue(metric, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
