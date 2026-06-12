import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Eye,
  Edit3,
  Trash2,
  Upload,
  Calendar,
  Building2,
  Loader2,
  X,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  Image,
} from 'lucide-react';
import {
  getStatusLabel,
  getStatusColor,
  formatDate,
} from './quotationUi';
import type { SupplierQuotation, QuotationWorkflowStatus } from '../../quotation/types';
import { listQuotations, uploadQuotationFile, createQuotationDraft } from '../../quotation/api';

interface Props {
  onSelectReview: (id: string) => void;
}

const ACCEPTED_TYPES = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};
const MAX_SIZE = 25 * 1024 * 1024;

function getFileIcon(mimeType: string) {
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
  if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
  if (mimeType.includes('image')) return <Image className="w-5 h-5 text-blue-500" />;
  return <FileText className="w-5 h-5 text-slate-400" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function QuotationArchive({ onSelectReview }: Props) {
  const [quotations, setQuotations] = useState<SupplierQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({
    status: 'all' as QuotationWorkflowStatus | 'all',
    searchTerm: '',
  });

  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchQuotations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listQuotations({
        status: filter.status,
        searchTerm: filter.searchTerm,
      });
      setQuotations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载报价单失败');
    } finally {
      setLoading(false);
    }
  }, [filter.status, filter.searchTerm]);

  useEffect(() => {
    void fetchQuotations();
  }, [fetchQuotations]);

  const handleFileUpload = async (file: File) => {
    if (!Object.keys(ACCEPTED_TYPES).includes(file.type)) {
      alert(`不支持的文件格式: ${file.type || file.name}`);
      return;
    }
    if (file.size > MAX_SIZE) {
      alert(`文件大小超过限制: ${formatFileSize(file.size)} > 25MB`);
      return;
    }

    try {
      setUploading(true);
      setUploadProgress('正在获取上传凭证...');

      const { clientToken, blobPath, metadata } = await uploadQuotationFile(file);

      setUploadProgress('正在上传文件到云端...');

      const { upload } = await import('@vercel/blob/client');
      await upload(file.name, file, {
        access: 'private',
        handleUploadUrl: `/api/quotation/files/upload`,
        headers: {
          'x-blob-path': blobPath,
        },
      });

      setUploadProgress('正在创建报价单记录...');

      const supplierName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

      const quotation = await createQuotationDraft({
        supplierName,
        quotationDate: new Date().toISOString().split('T')[0],
        currency: 'CNY',
        exchangeRateToCny: 1,
        priceTaxMode: 'tax_included',
        taxRate: 13,
        sourceFile: {
          blobPath,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          uploadedAt: new Date().toISOString(),
        },
        items: [],
      });

      setShowUpload(false);
      await fetchQuotations();
      onSelectReview(quotation.id);
    } catch (err) {
      console.error('Upload error:', err);
      alert(`上传失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

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
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-100 rounded">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Quotation Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-500">加载中...</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">报价单号</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">供应商</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">源文件</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">日期</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">版本</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">状态</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotations.map((quote) => (
                  <tr key={quote.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono font-semibold text-blue-600">{quote.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-700">{quote.supplierName || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getFileIcon(quote.sourceFile.mimeType)}
                        <div className="min-w-0">
                          <p className="text-xs text-slate-700 truncate max-w-[180px]">{quote.sourceFile.originalName}</p>
                          <p className="text-[10px] text-slate-400">{formatFileSize(quote.sourceFile.sizeBytes)}</p>
                        </div>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {quotations.length === 0 && (
              <div className="py-16 text-center">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">暂无报价单数据</p>
                <p className="text-xs text-slate-400 mt-1">点击「上传报价单」开始添加</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">上传报价单</h3>
                <p className="text-xs text-slate-500 mt-1">支持 Excel (.xlsx)、PDF、图片格式，最大 25MB</p>
              </div>
              <button
                onClick={() => !uploading && setShowUpload(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <input
                ref={fileInputRef}
                type="file"
                accept={Object.values(ACCEPTED_TYPES).join(',')}
                className="hidden"
                onChange={handleFileInput}
                disabled={uploading}
              />

              {uploading ? (
                <div className="py-8 text-center">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
                  <p className="text-sm font-medium text-slate-700">{uploadProgress}</p>
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'
                  }`}
                >
                  <Upload className={`w-10 h-10 mx-auto mb-4 ${dragOver ? 'text-blue-500' : 'text-slate-400'}`} />
                  <p className="text-sm font-medium text-slate-700">
                    {dragOver ? '松开鼠标上传' : '点击或拖拽文件到此处'}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    支持 .xlsx, .xls, .pdf, .png, .jpg, .webp
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => !uploading && setShowUpload(false)}
                disabled={uploading}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
