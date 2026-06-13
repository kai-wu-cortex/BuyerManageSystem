import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Eye,
  FileSpreadsheet,
  FileText,
  Image,
  Loader2,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { deriveQuotationDisplayStatus } from '../../quotation/normalization';
import { rowsToQuotationDraft, validateParsedQuotation } from '../../quotation/quotationParser';
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
  onSelectReview: (id: string) => void;
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

export default function QuotationArchive({ workspace, loading, onRefresh, onSelectReview }: Props) {
  const [status, setStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parseMode, setParseMode] = useState<'internal' | 'gemini'>('internal');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    () => new Map(workspace.suppliers.map(supplier => [supplier.id, supplier])),
    [workspace.suppliers],
  );
  const quotations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return workspace.quotations
      .filter(quotation => !quotation.deletedAt)
      .filter(quotation => status === 'all' || deriveQuotationDisplayStatus(quotation.status, quotation.validUntil) === status)
      .filter(quotation => {
        if (!term) return true;
        const supplierName = supplierMap.get(quotation.supplierId)?.name ?? '';
        return `${quotation.quotationNumber} ${supplierName} ${quotation.sourceFile.fileName}`.toLowerCase().includes(term);
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [searchTerm, status, supplierMap, workspace.quotations]);

  const handleFileUpload = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError('仅支持 Excel、PDF、PNG、JPG 和 WebP 报价单。');
      return;
    }
    if (file.size > MAX_SIZE) {
      setError('报价文件不能超过 25 MB。');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      setUploadProgress('正在上传原始报价文件...');
      const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_');
      const pathname = `supplier-quotes/${new Date().toISOString().slice(0, 7)}/${safeName}`;
      const { upload } = await import('@vercel/blob/client');
      const blob = await upload(pathname, file, {
        access: 'private',
        handleUploadUrl: '/api/quotation/upload',
        multipart: file.size > 5 * 1024 * 1024,
      });
      const checksumBytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const checksum = Array.from(new Uint8Array(checksumBytes), byte => byte.toString(16).padStart(2, '0')).join('');
      const sourceFile: SourceFileRef = {
        id: id('file'),
        pathname: blob.pathname,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        checksum,
      };

      setUploadProgress('正在解析产品、价格和报价信息...');
      let validation;
      if (extension === 'xlsx' || extension === 'xls') {
        if (parseMode === 'gemini') {
          validation = await parseQuotationFile(blob.pathname, file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        } else {
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
          validation = workbook.SheetNames
            .map(sheetName => validateParsedQuotation(rowsToQuotationDraft(
              XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
                header: 1,
                raw: false,
                blankrows: false,
              }),
            )))
            .sort((left, right) => right.value.items.length - left.value.items.length)[0];
        }
      } else {
        if (parseMode === 'internal') {
          validation = await parseQuotationFile(blob.pathname, sourceFile.mimeType);
        } else {
          validation = await parseQuotationFile(blob.pathname, sourceFile.mimeType);
        }
      }
      if (!validation || validation.value.items.length === 0) {
        throw new Error('文件中没有读取到产品和价格数据。');
      }

      const existingSupplier = workspace.suppliers.find(
        supplier => supplier.normalizedName === normalizedSupplierName(validation.value.supplierName),
      );
      const { draft, supplier } = makeDraft(validation.value, sourceFile, existingSupplier);
      draft.items = draft.items.map((item, index) => ({
        ...item,
        reviewIssues: validation.issues.filter(issue => issue.field.startsWith(`items.${index}.`)),
      }));

      setUploadProgress('正在更新供应商和报价数据库...');
      await Promise.all([saveSupplierProfile(supplier), saveQuotationDraft(draft)]);
      await onRefresh();
      setShowUpload(false);
      onSelectReview(draft.quotation.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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
            <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="搜索供应商、报价单号或文件名..." className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
          </div>
          <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none">
            <option value="all">全部状态</option>
            <option value="review_required">待审核</option>
            <option value="active">已生效</option>
            <option value="expired">已过期</option>
            <option value="voided">已作废</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          <AlertCircle className="h-4 w-4" /> {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X className="h-3 w-3" /></button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /><p className="text-xs text-slate-500">加载中...</p></div>
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-200 bg-slate-50">
              {['报价单号', '供应商', '源文件', '日期', '版本', '状态', '操作'].map(label => <th key={label} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 last:text-right">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {quotations.map(quotation => {
                const displayStatus = deriveQuotationDisplayStatus(quotation.status, quotation.validUntil);
                return (
                  <tr key={quotation.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">{quotation.quotationNumber || quotation.id}</td>
                    <td className="px-4 py-3"><span className="flex items-center gap-2 text-xs font-medium text-slate-700"><Building2 className="h-4 w-4 text-slate-400" />{supplierMap.get(quotation.supplierId)?.name || '-'}</span></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2">{getFileIcon(quotation.sourceFile.mimeType)}<div><p className="max-w-[180px] truncate text-xs text-slate-700">{quotation.sourceFile.fileName}</p><p className="text-[10px] text-slate-400">{formatFileSize(quotation.sourceFile.size)}</p></div></div></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(quotation.quotationDate)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">V{quotation.version}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusColor(displayStatus)}`}>{getStatusLabel(displayStatus)}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => onSelectReview(quotation.id)} className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Eye className="h-4 w-4" /></button>
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
        {!loading && quotations.length === 0 ? <div className="py-16 text-center text-sm text-slate-500">暂无报价单数据</div> : null}
      </div>

      {showUpload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4"><div><h3 className="text-lg font-bold text-slate-800">上传报价单</h3><p className="mt-1 text-xs text-slate-500">支持 Excel、PDF 和图片，最大 25MB</p></div><button type="button" disabled={uploading} onClick={() => setShowUpload(false)}><X className="h-5 w-5 text-slate-400" /></button></div>
            <div className="p-6">
              <div className="mb-4 flex items-center gap-6">
                <span className="text-xs font-semibold text-slate-500">解析模式:</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input type="radio" name="parseMode" value="internal" checked={parseMode === 'internal'} onChange={() => setParseMode('internal')} disabled={uploading} className="accent-blue-600" />
                  内部算法解析
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input type="radio" name="parseMode" value="gemini" checked={parseMode === 'gemini'} onChange={() => setParseMode('gemini')} disabled={uploading} className="accent-blue-600" />
                  Gemini AI 解析
                </label>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void handleFileUpload(file); }} />
              {uploading ? <div className="py-10 text-center"><Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-blue-500" /><p className="text-sm font-medium text-slate-700">{uploadProgress}</p></div> : <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-slate-200 p-10 text-center hover:border-blue-400 hover:bg-slate-50"><Upload className="mx-auto mb-4 h-10 w-10 text-slate-400" /><p className="text-sm font-medium text-slate-700">点击选择报价文件</p><p className="mt-2 text-xs text-slate-400">.xlsx / .xls / .pdf / .png / .jpg / .webp</p></button>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
