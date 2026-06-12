import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit3,
  Trash2,
  Upload,
  Calendar,
  Building2,
} from 'lucide-react';
import {
  getStatusLabel,
  getStatusColor,
  formatCurrency,
  formatDate,
  type FilterState,
} from './quotationUi';
import type { SupplierQuotation, QuotationWorkflowStatus } from '../../quotation/types';

interface Props {
  onSelectReview: (id: string) => void;
}

const MOCK_QUOTES: SupplierQuotation[] = [
  {
    id: 'QT-202310-045',
    version: 1,
    supplierId: 's1',
    supplierName: '深圳市立创电子商务有限公司',
    status: 'active',
    quotationDate: '2023-10-20',
    sourceFile: { blobPath: 'quotes/2023/10/doc.pdf', originalName: 'Q-2023-441.pdf', mimeType: 'application/pdf', sizeBytes: 102400, uploadedAt: '2023-10-20T10:00:00Z' },
    items: [],
    reviewIssues: [],
    parseJobId: null,
    confirmedAt: '2023-10-21T09:00:00Z',
    confirmedBy: '张三',
    createdAt: '2023-10-20T10:00:00Z',
    updatedAt: '2023-10-21T09:00:00Z',
  },
  {
    id: 'QT-202309-112',
    version: 1,
    supplierId: 's2',
    supplierName: 'TechCorp Industries Ltd.',
    status: 'review_required',
    quotationDate: '2023-09-15',
    sourceFile: { blobPath: 'quotes/2023/09/doc.xlsx', originalName: 'TC-Quote.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sizeBytes: 51200, uploadedAt: '2023-09-15T14:00:00Z' },
    items: [],
    reviewIssues: [],
    parseJobId: null,
    confirmedAt: null,
    confirmedBy: null,
    createdAt: '2023-09-15T14:00:00Z',
    updatedAt: '2023-09-15T14:00:00Z',
  },
  {
    id: 'QT-202308-088',
    version: 2,
    supplierId: 's3',
    supplierName: 'Global Parts Inc.',
    status: 'voided',
    quotationDate: '2023-08-02',
    sourceFile: { blobPath: 'quotes/2023/08/doc.pdf', originalName: 'GP-Quote.pdf', mimeType: 'application/pdf', sizeBytes: 81920, uploadedAt: '2023-08-02T11:00:00Z' },
    items: [],
    reviewIssues: [],
    parseJobId: null,
    confirmedAt: '2023-08-03T10:00:00Z',
    confirmedBy: '李四',
    createdAt: '2023-08-02T11:00:00Z',
    updatedAt: '2023-08-03T10:00:00Z',
  },
];

export default function QuotationArchive({ onSelectReview }: Props) {
  const [filter, setFilter] = useState<FilterState>({
    status: 'all',
    searchTerm: '',
    dateFrom: '',
    dateTo: '',
  });
  const [showUpload, setShowUpload] = useState(false);

  const filteredQuotes = MOCK_QUOTES.filter(q => {
    if (filter.status !== 'all' && q.status !== filter.status) return false;
    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase();
      if (!q.supplierName.toLowerCase().includes(term) && !q.id.toLowerCase().includes(term)) return false;
    }
    return true;
  });

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">报价归档</h1>
          <p className="text-xs text-slate-500 mt-1">管理所有供应商报价单</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Upload className="w-4 h-4" />
          上传报价单
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索供应商或报价单号..."
              value={filter.searchTerm}
              onChange={(e) => setFilter({ ...filter, searchTerm: e.target.value })}
              className="w-64 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <select
            value={filter.status}
            onChange={(e) => setFilter({ ...filter, status: e.target.value as QuotationWorkflowStatus | 'all' })}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          >
            <option value="all">全部状态</option>
            <option value="parsing">解析中</option>
            <option value="review_required">待审核</option>
            <option value="active">已生效</option>
            <option value="voided">已作废</option>
          </select>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={filter.dateFrom}
              onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={filter.dateTo}
              onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      {/* Quotation Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">报价单号</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">供应商</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">日期</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">版本</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredQuotes.map((quote) => (
              <tr key={quote.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs font-mono font-semibold text-blue-600">{quote.id}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-medium text-slate-700">{quote.supplierName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-slate-600">{formatDate(quote.quotationDate)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-slate-600">V{quote.version}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${getStatusColor(quote.status)}`}>
                    {getStatusLabel(quote.status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onSelectReview(quote.id)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="查看详情"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                      title="编辑"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredQuotes.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-500">暂无报价单数据</p>
          </div>
        )}
      </div>

      {/* Upload Modal Placeholder */}
      {showUpload && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">上传报价单</h3>
            <p className="text-sm text-slate-500 mb-4">支持 Excel (.xlsx)、PDF、图片格式，最大 25MB</p>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer">
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-slate-600">点击或拖拽文件到此处</p>
              <p className="text-xs text-slate-400 mt-1">支持 .xlsx, .pdf, .png, .jpg</p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                确认上传
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
