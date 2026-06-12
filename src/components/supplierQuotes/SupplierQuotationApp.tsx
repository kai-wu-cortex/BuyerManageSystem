import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  BadgeDollarSign,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Search,
  Star,
  UploadCloud,
  Users,
} from 'lucide-react';
import { deriveQuotationDisplayStatus } from '../../quotation/normalization';
import { rowsToQuotationDraft, validateParsedQuotation, type ParsedQuotation } from '../../quotation/quotationParser';
import {
  confirmQuotationDraft,
  loadQuotationWorkspace,
  parseQuotationFile,
  saveProductGroup,
  saveQuotationDraft,
  saveQuotationItem,
  saveSupplierProfile,
} from '../../quotation/api';
import type {
  QuotationDraft,
  SourceFileRef,
  SupplierProductGroup,
  SupplierProfile,
  SupplierQuotation,
  SupplierQuotationItem,
} from '../../quotation/types';

type View = 'archive' | 'review' | 'groups' | 'suppliers' | 'compare';
const emptyWorkspace = { quotations: [], items: [], suppliers: [], productGroups: [] };

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizedSupplierName(name: string): string {
  return name.toLowerCase().replace(/[\s()（）\-_.]/g, '');
}

function makeDraft(parsed: ParsedQuotation, sourceFile: SourceFileRef, existingSupplier?: SupplierProfile): {
  draft: QuotationDraft;
  supplier: SupplierProfile;
} {
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

function Field({
  label,
  value,
  type = 'text',
  onChange,
}: {
  label: string;
  value: string | number;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function ExcelQuotationPreview({ pathname }: { pathname: string }) {
  const [sheets, setSheets] = useState<Array<{ name: string; rows: unknown[][] }>>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewError(null);
    setSheets([]);
    void fetch(`/api/quotation/file?pathname=${encodeURIComponent(pathname)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async response => {
        if (!response.ok) throw new Error('无法读取报价原文件。');
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
        return workbook.SheetNames.map(name => ({
          name,
          rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
            header: 1,
            raw: false,
            blankrows: false,
          }).slice(0, 300),
        }));
      })
      .then(nextSheets => {
        if (!cancelled) {
          setSheets(nextSheets);
          setActiveSheet(0);
        }
      })
      .catch(cause => {
        if (!cancelled) setPreviewError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (previewError) {
    return <div className="flex h-[610px] items-center justify-center p-6 text-center text-xs font-bold text-red-600">{previewError}</div>;
  }
  if (!sheets.length) {
    return <div className="flex h-[610px] items-center justify-center text-xs font-bold text-slate-500">正在生成 Excel 预览...</div>;
  }

  const rows = sheets[activeSheet]?.rows ?? [];
  const columnCount = Math.min(30, rows.reduce((maximum, row) => Math.max(maximum, row.length), 0));
  return (
    <div className="h-[610px] bg-white text-slate-900">
      {sheets.length > 1 ? (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 p-2">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              type="button"
              onClick={() => setActiveSheet(index)}
              className={`shrink-0 rounded px-3 py-1 text-[10px] font-black ${
                activeSheet === index ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="h-full overflow-auto pb-10">
        <table className="min-w-full border-collapse text-[10px]">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columnCount }, (_, columnIndex) => (
                  <td
                    key={columnIndex}
                    className={`max-w-52 whitespace-pre-wrap border border-slate-200 px-2 py-1.5 align-top ${
                      rowIndex === 0 ? 'bg-slate-100 font-black' : ''
                    }`}
                  >
                    {String(row[columnIndex] ?? '')}
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

export default function SupplierQuotationApp() {
  const [view, setView] = useState<View>('archive');
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await loadQuotationWorkspace());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const supplierMap = useMemo(
    () => new Map(workspace.suppliers.map(supplier => [supplier.id, supplier])),
    [workspace.suppliers],
  );
  const selectedQuotation = workspace.quotations.find(quote => quote.id === selectedQuoteId) ?? null;
  const selectedItems = workspace.items.filter(item => item.quotationId === selectedQuoteId && !item.deletedAt);

  const filteredQuotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return workspace.quotations
      .filter(quote => !quote.deletedAt)
      .filter(quote => statusFilter === 'all' || deriveQuotationDisplayStatus(quote.status, quote.validUntil) === statusFilter)
      .filter(quote => {
        if (!term) return true;
        const supplier = supplierMap.get(quote.supplierId)?.name ?? '';
        const itemText = workspace.items
          .filter(item => item.quotationId === quote.id)
          .map(item => `${item.sourceProductName} ${item.sourceProductCode} ${item.sourceSpecification}`)
          .join(' ');
        return `${supplier} ${quote.quotationNumber} ${itemText}`.toLowerCase().includes(term);
      })
      .sort((a, b) => b.quotationDate.localeCompare(a.quotationDate));
  }, [searchTerm, statusFilter, supplierMap, workspace.items, workspace.quotations]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const allowed = ['xlsx', 'xls', 'pdf', 'png', 'jpg', 'jpeg', 'webp'];
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!allowed.includes(extension)) throw new Error('仅支持 Excel、PDF、PNG、JPG 和 WebP 报价单。');
      if (file.size > 25 * 1024 * 1024) throw new Error('报价文件不能超过 25 MB。');

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

      let validation;
      if (extension === 'xlsx' || extension === 'xls') {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        validation = workbook.SheetNames
          .map(sheetName => {
            const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
              header: 1,
              raw: false,
              blankrows: false,
            });
            return validateParsedQuotation(rowsToQuotationDraft(rows));
          })
          .sort((left, right) => right.value.items.length - left.value.items.length)[0];
      } else {
        validation = await parseQuotationFile(blob.pathname, sourceFile.mimeType);
      }
      if (!validation || validation.value.items.length === 0) {
        throw new Error('文件中没有可读取的产品文字和价格数据。请确认 Excel 单元格内包含产品名称与价格，而不是仅有图片或空白模板。');
      }

      const existingSupplier = workspace.suppliers.find(
        supplier => supplier.normalizedName === normalizedSupplierName(validation.value.supplierName),
      );
      const { draft, supplier } = makeDraft(validation.value, sourceFile, existingSupplier);
      draft.items = draft.items.map((item, index) => ({
        ...item,
        reviewIssues: validation.issues.filter(issue => issue.field.startsWith(`items.${index}.`)),
      }));
      await Promise.all([
        saveSupplierProfile(supplier),
        saveQuotationDraft(draft),
      ]);
      await refresh();
      setSelectedQuoteId(draft.quotation.id);
      setView('review');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openReview = (quoteId: string) => {
    setSelectedQuoteId(quoteId);
    setView('review');
  };

  const navigation = [
    { id: 'archive' as const, label: '报价档案', icon: Archive },
    { id: 'groups' as const, label: '产品分组', icon: Scale },
    { id: 'suppliers' as const, label: '供应商评分', icon: Users },
    { id: 'compare' as const, label: '产品比价', icon: BadgeDollarSign },
  ];

  return (
    <div className="min-h-[70vh] bg-slate-50/70">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <main className="min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Procurement intelligence</p>
              <h2 className="mt-1 text-xl font-black text-slate-900">
                {view === 'archive' && '报价单档案'}
                {view === 'review' && '解析校对'}
                {view === 'groups' && '标准产品分组'}
                {view === 'suppliers' && '供应商评分'}
                {view === 'compare' && '横向价格比较'}
              </h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
                title="刷新"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                上传报价单
              </button>
            </div>
          </div>

          <nav
            role="tablist"
            aria-label="供应商报价单功能"
            className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200"
          >
            {navigation.map(item => {
              const Icon = item.icon;
              const active = view === item.id || (view === 'review' && item.id === 'archive');
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(item.id)}
                  className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-xs font-black transition ${
                    active
                      ? 'text-blue-700 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-blue-600'
                      : 'text-slate-500 hover:bg-white/70 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</div>
          ) : null}

          {view === 'archive' ? (
            <ArchiveView
              loading={loading}
              quotes={filteredQuotes}
              items={workspace.items}
              supplierMap={supplierMap}
              searchTerm={searchTerm}
              statusFilter={statusFilter}
              onSearch={setSearchTerm}
              onStatus={setStatusFilter}
              onOpen={openReview}
            />
          ) : null}
          {view === 'review' && selectedQuotation ? (
            <ReviewView
              quotation={selectedQuotation}
              items={selectedItems}
              supplier={supplierMap.get(selectedQuotation.supplierId)}
              productGroups={workspace.productGroups}
              onBack={() => setView('archive')}
              onSaved={refresh}
            />
          ) : null}
          {view === 'review' && !selectedQuotation ? (
            <EmptyState text="请选择一张报价单进行校对。" />
          ) : null}
          {view === 'groups' ? (
            <GroupsView
              groups={workspace.productGroups}
              items={workspace.items}
              onSaved={refresh}
            />
          ) : null}
          {view === 'suppliers' ? (
            <SuppliersView suppliers={workspace.suppliers} onSaved={refresh} />
          ) : null}
          {view === 'compare' ? (
            <ComparisonView
              groups={workspace.productGroups}
              quotations={workspace.quotations}
              items={workspace.items}
              suppliers={workspace.suppliers}
            />
          ) : null}
      </main>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-80 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 text-xs font-bold text-slate-400">
      {text}
    </div>
  );
}

function ArchiveView({
  loading,
  quotes,
  items,
  supplierMap,
  searchTerm,
  statusFilter,
  onSearch,
  onStatus,
  onOpen,
}: {
  loading: boolean;
  quotes: SupplierQuotation[];
  items: SupplierQuotationItem[];
  supplierMap: Map<string, SupplierProfile>;
  searchTerm: string;
  statusFilter: string;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={event => onSearch(event.target.value)}
            placeholder="搜索供应商、报价单号、产品名称或编码"
            className="min-w-52 flex-1 bg-transparent text-xs outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={event => onStatus(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold"
        >
          <option value="all">全部状态</option>
          <option value="review_required">待校对</option>
          <option value="active">有效报价</option>
          <option value="expired">已过期</option>
          <option value="voided">已作废</option>
        </select>
      </div>
      {loading ? <EmptyState text="正在读取报价档案..." /> : null}
      {!loading && quotes.length === 0 ? <EmptyState text="暂无报价单，请从右上角上传原始报价文件。" /> : null}
      {!loading && quotes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">供应商 / 报价单</th>
                <th className="px-4 py-3">报价日期</th>
                <th className="px-4 py-3">币种</th>
                <th className="px-4 py-3">产品行</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map(quote => {
                const status = deriveQuotationDisplayStatus(quote.status, quote.validUntil);
                return (
                  <tr key={quote.id} className="border-t border-slate-100 hover:bg-amber-50/40">
                    <td className="px-4 py-3">
                      <p className="font-black text-slate-900">{supplierMap.get(quote.supplierId)?.name ?? '未知供应商'}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{quote.quotationNumber || quote.id}</p>
                    </td>
                    <td className="px-4 py-3 font-mono">{quote.quotationDate}</td>
                    <td className="px-4 py-3 font-bold">{quote.currency}</td>
                    <td className="px-4 py-3">{items.filter(item => item.quotationId === quote.id).length}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                        status === 'active' ? 'bg-emerald-100 text-emerald-700'
                          : status === 'review_required' ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {{ active: '有效', review_required: '待校对', expired: '已过期', voided: '已作废', parsing: '解析中' }[status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => onOpen(quote.id)} className="font-black text-blue-700 hover:underline">
                        查看校对
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ReviewView({
  quotation,
  items,
  supplier,
  productGroups,
  onBack,
  onSaved,
}: {
  quotation: SupplierQuotation;
  items: SupplierQuotationItem[];
  supplier?: SupplierProfile;
  productGroups: SupplierProductGroup[];
  onBack: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draftQuote, setDraftQuote] = useState(quotation);
  const [draftItems, setDraftItems] = useState(items);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDraftQuote(quotation);
    setDraftItems(items);
  }, [quotation, items]);

  const blockingIssues = validateParsedQuotation({
    supplierName: supplier?.name ?? '',
    quotationNumber: draftQuote.quotationNumber,
    quotationDate: draftQuote.quotationDate,
    validUntil: draftQuote.validUntil ?? '',
    currency: draftQuote.currency,
    exchangeRateToCny: draftQuote.exchangeRateToCny,
    taxRate: draftQuote.taxRate,
    priceTaxMode: draftQuote.priceTaxMode,
    paymentTerms: draftQuote.paymentTerms,
    leadTimeDays: draftQuote.leadTimeDays,
    items: draftItems,
  }).issues;
  const missingGroups = draftItems.filter(item => item.groupMatchStatus !== 'confirmed' || !item.productGroupId);

  const save = async (activate: boolean) => {
    setSaving(true);
    setMessage('');
    try {
      if (activate && (blockingIssues.length > 0 || missingGroups.length > 0)) {
        throw new Error(`仍有 ${blockingIssues.length} 项字段问题和 ${missingGroups.length} 行未确认产品组。`);
      }
      const now = new Date().toISOString();
      const nextDraft = {
        quotation: {
          ...draftQuote,
          updatedAt: now,
        },
        items: draftItems,
      };
      if (activate) {
        await confirmQuotationDraft(nextDraft);
      } else {
        await saveQuotationDraft(nextDraft);
      }
      setMessage(activate ? '报价单已确认生效。' : '校对草稿已保存。');
      await onSaved();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1 text-xs font-black text-slate-600">
        <ArrowLeft className="h-4 w-4" /> 返回档案
      </button>
      <div className="grid gap-4 xl:grid-cols-[42%_58%]">
        <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-sm">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
            <span className="text-xs font-black">原始报价文件</span>
            <a
              href={`/api/quotation/file?pathname=${encodeURIComponent(quotation.sourceFile.pathname)}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-amber-300 hover:underline"
            >
              新窗口打开
            </a>
          </div>
          {quotation.sourceFile.mimeType.includes('spreadsheet') || quotation.sourceFile.mimeType === 'application/vnd.ms-excel' ? (
            <ExcelQuotationPreview pathname={quotation.sourceFile.pathname} />
          ) : (
            <iframe
              title="报价原文件"
              src={`/api/quotation/file?pathname=${encodeURIComponent(quotation.sourceFile.pathname)}`}
              className="h-[610px] w-full bg-white"
            />
          )}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="报价日期" type="date" value={draftQuote.quotationDate} onChange={value => setDraftQuote(current => ({ ...current, quotationDate: value }))} />
            <Field label="有效期" type="date" value={draftQuote.validUntil ?? ''} onChange={value => setDraftQuote(current => ({ ...current, validUntil: value || null }))} />
            <Field label="币种" value={draftQuote.currency} onChange={value => setDraftQuote(current => ({ ...current, currency: value.toUpperCase() }))} />
            <Field label="固定汇率" type="number" value={draftQuote.exchangeRateToCny} onChange={value => setDraftQuote(current => ({ ...current, exchangeRateToCny: Number(value) }))} />
            <Field label="税率 %" type="number" value={draftQuote.taxRate} onChange={value => setDraftQuote(current => ({ ...current, taxRate: Number(value) }))} />
            <Field label="付款方式" value={draftQuote.paymentTerms} onChange={value => setDraftQuote(current => ({ ...current, paymentTerms: value }))} />
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[900px] w-full text-xs">
              <thead className="bg-slate-100 text-[10px] text-slate-500">
                <tr>
                  <th className="p-2">产品</th><th className="p-2">规格</th><th className="p-2">单位</th>
                  <th className="p-2">包装数</th><th className="p-2">单价</th><th className="p-2">MOQ</th><th className="p-2">产品组</th>
                </tr>
              </thead>
              <tbody>
                {draftItems.map((item, index) => (
                  <tr key={item.id} className={item.reviewIssues.length ? 'bg-amber-50' : 'border-t border-slate-100'}>
                    {[
                      ['sourceProductName', item.sourceProductName],
                      ['sourceSpecification', item.sourceSpecification],
                      ['sourceUnit', item.sourceUnit],
                      ['sourcePackageQuantity', item.sourcePackageQuantity ?? ''],
                      ['sourceUnitPrice', item.sourceUnitPrice ?? ''],
                      ['minimumOrderQuantity', item.minimumOrderQuantity ?? ''],
                    ].map(([field, value]) => (
                      <td key={field} className="p-1">
                        <input
                          value={value}
                          onChange={event => setDraftItems(current => current.map((candidate, candidateIndex) => (
                            candidateIndex === index
                              ? {
                                  ...candidate,
                                  [field]: field.includes('Quantity') || field.includes('Price')
                                    ? (event.target.value === '' ? null : Number(event.target.value))
                                    : event.target.value,
                                }
                              : candidate
                          )))}
                          className="w-full rounded border border-slate-200 px-2 py-1.5"
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <select
                        value={item.productGroupId ?? ''}
                        onChange={event => setDraftItems(current => current.map((candidate, candidateIndex) => (
                          candidateIndex === index
                            ? { ...candidate, productGroupId: event.target.value || null, groupMatchStatus: event.target.value ? 'confirmed' : 'unmatched' }
                            : candidate
                        )))}
                        className="w-full rounded border border-slate-200 px-2 py-1.5"
                      >
                        <option value="">待分组</option>
                        {productGroups.filter(group => group.status === 'confirmed').map(group => (
                          <option key={group.id} value={group.id}>{group.standardName} / {group.baseUnit}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] font-bold text-slate-500">
              字段问题 {blockingIssues.length} 项 · 未确认产品组 {missingGroups.length} 行
              {message ? <span className="ml-3 text-blue-700">{message}</span> : null}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={() => void save(false)} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-black">
                <Save className="h-4 w-4" /> 保存草稿
              </button>
              <button type="button" disabled={saving || blockingIssues.length > 0 || missingGroups.length > 0} onClick={() => void save(true)} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:bg-slate-300">
                <CheckCircle2 className="h-4 w-4" /> 确认生效
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function GroupsView({ groups, items, onSaved }: { groups: SupplierProductGroup[]; items: SupplierQuotationItem[]; onSaved: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [unit, setUnit] = useState('个');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || !unit.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    await saveProductGroup({
      id: id('group'),
      standardName: name.trim(),
      standardSpecification: spec.trim(),
      baseUnit: unit.trim(),
      conversionRules: {},
      aliases: [],
      status: 'confirmed',
      confirmedBy: 'caigou',
      confirmedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    setName(''); setSpec('');
    await onSaved();
    setSaving(false);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-black">新建标准产品组</h3>
        <div className="mt-4 space-y-3">
          <Field label="标准产品名称" value={name} onChange={setName} />
          <Field label="标准规格" value={spec} onChange={setSpec} />
          <Field label="基准单位" value={unit} onChange={setUnit} />
          <button type="button" disabled={saving} onClick={() => void create()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2 text-xs font-black text-white">
            <Plus className="h-4 w-4" /> 创建并确认
          </button>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4 text-sm font-black">已确认产品组</div>
        {groups.length === 0 ? <EmptyState text="尚未建立产品组。" /> : (
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {groups.map(group => (
              <div key={group.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between">
                  <div><p className="font-black">{group.standardName}</p><p className="text-[10px] text-slate-400">{group.standardSpecification || '无标准规格'}</p></div>
                  <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">{group.baseUnit}</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">{items.filter(item => item.productGroupId === group.id).length} 条报价明细</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SuppliersView({ suppliers, onSaved }: { suppliers: SupplierProfile[]; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState<Record<string, SupplierProfile>>({});
  const update = (supplier: SupplierProfile, field: keyof SupplierProfile, value: string) => {
    setEditing(current => ({
      ...current,
      [supplier.id]: {
        ...(current[supplier.id] ?? supplier),
        [field]: field.endsWith('Score') ? (value === '' ? null : Math.min(100, Math.max(0, Number(value)))) : value,
      },
    }));
  };
  const save = async (supplier: SupplierProfile) => {
    const next = editing[supplier.id] ?? supplier;
    await saveSupplierProfile({ ...next, scoreUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await onSaved();
  };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {suppliers.length === 0 ? <EmptyState text="上传报价单后会自动建立供应商档案。" /> : suppliers.map(supplier => {
        const value = editing[supplier.id] ?? supplier;
        return (
          <section key={supplier.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-black">{supplier.name}</h3><Star className="h-4 w-4 text-amber-500" /></div>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['qualityScore', '质量'],
                ['deliveryScore', '交期'],
                ['serviceScore', '服务'],
                ['cooperationScore', '配合度'],
              ] as const).map(([field, label]) => (
                <div key={field}>
                  <Field
                    label={`${label}评分（0-100）`}
                    type="number"
                    value={value[field] ?? ''}
                    onChange={score => update(supplier, field, score)}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3"><Field label="评分备注" value={value.scoreNote} onChange={note => update(supplier, 'scoreNote', note)} /></div>
            <button type="button" onClick={() => void save(supplier)} className="mt-3 flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white"><Save className="h-4 w-4" /> 保存评分</button>
          </section>
        );
      })}
    </div>
  );
}

function ComparisonView({
  groups,
  quotations,
  items,
  suppliers,
}: {
  groups: SupplierProductGroup[];
  quotations: SupplierQuotation[];
  items: SupplierQuotationItem[];
  suppliers: SupplierProfile[];
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const candidates = items.filter(item => item.productGroupId === groupId && item.normalizedTaxIncludedCnyPrice !== null);
  const selected = candidates.filter(item => selectedIds.has(item.id));
  const quoteMap = new Map(quotations.map(quote => [quote.id, quote]));
  const supplierMap = new Map(suppliers.map(supplier => [supplier.id, supplier]));
  const prices = selected.map(item => item.normalizedTaxIncludedCnyPrice as number);
  const minPrice = prices.length ? Math.min(...prices) : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
        <select value={groupId} onChange={event => { setGroupId(event.target.value); setSelectedIds(new Set()); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black">
          <option value="">选择标准产品组</option>
          {groups.map(group => <option key={group.id} value={group.id}>{group.standardName} / {group.baseUnit}</option>)}
        </select>
        <span className="self-center text-[10px] font-bold text-slate-400">勾选具体历史报价版本后比较</span>
      </div>
      {candidates.length === 0 ? <EmptyState text="该产品组暂无已生效且已标准化的报价。" /> : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
            {candidates.map(item => {
              const quote = quoteMap.get(item.quotationId);
              const supplier = quote ? supplierMap.get(quote.supplierId) : undefined;
              return (
                <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <input type="checkbox" checked={selectedIds.has(item.id)} onChange={event => setSelectedIds(current => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(item.id); else next.delete(item.id);
                    return next;
                  })} />
                  <span className="font-black">{supplier?.name}</span>
                  <span className="text-slate-400">{quote?.quotationDate}</span>
                </label>
              );
            })}
          </div>
          {selected.length === 0 ? <EmptyState text="请至少勾选一个报价版本。" /> : (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="sticky left-0 z-10 w-40 bg-slate-100 p-3 text-left">比较项</th>
                    {selected.map(item => {
                      const quote = quoteMap.get(item.quotationId);
                      return <th key={item.id} className="min-w-48 p-3 text-left">{quote ? supplierMap.get(quote.supplierId)?.name : ''}<br /><span className="font-normal text-slate-400">{quote?.quotationDate}</span></th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['标准含税单价', (item: SupplierQuotationItem) => `¥${item.normalizedTaxIncludedCnyPrice?.toFixed(4)}`, (item: SupplierQuotationItem) => item.normalizedTaxIncludedCnyPrice === minPrice],
                    ['原始单价', (item: SupplierQuotationItem) => `${quoteMap.get(item.quotationId)?.currency} ${item.sourceUnitPrice}`, () => false],
                    ['MOQ', (item: SupplierQuotationItem) => item.minimumOrderQuantity ?? '-', () => false],
                    ['交期', (item: SupplierQuotationItem) => `${item.lineLeadTimeDays ?? quoteMap.get(item.quotationId)?.leadTimeDays ?? '-'} 天`, () => false],
                    ['付款方式', (item: SupplierQuotationItem) => quoteMap.get(item.quotationId)?.paymentTerms || '-', () => false],
                    ['有效期', (item: SupplierQuotationItem) => quoteMap.get(item.quotationId)?.validUntil || '-', () => false],
                    ['质量 / 交期', (item: SupplierQuotationItem) => {
                      const quote = quoteMap.get(item.quotationId); const supplier = quote ? supplierMap.get(quote.supplierId) : undefined;
                      return `${supplier?.qualityScore ?? '-'} / ${supplier?.deliveryScore ?? '-'}`;
                    }, () => false],
                    ['服务 / 配合', (item: SupplierQuotationItem) => {
                      const quote = quoteMap.get(item.quotationId); const supplier = quote ? supplierMap.get(quote.supplierId) : undefined;
                      return `${supplier?.serviceScore ?? '-'} / ${supplier?.cooperationScore ?? '-'}`;
                    }, () => false],
                  ].map(([label, render, highlight]) => (
                    <tr key={label as string} className="border-t border-slate-100">
                      <th className="sticky left-0 bg-white p-3 text-left text-slate-500">{label as string}</th>
                      {selected.map(item => (
                        <td key={item.id} className={`p-3 font-semibold ${(highlight as (value: SupplierQuotationItem) => boolean)(item) ? 'bg-emerald-50 font-black text-emerald-700' : ''}`}>
                          {(render as (value: SupplierQuotationItem) => string | number)(item)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
