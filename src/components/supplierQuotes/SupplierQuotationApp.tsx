import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Package,
} from 'lucide-react';
import QuotationArchive from './QuotationArchive';
import QuotationReview from './QuotationReview';
import SupplierProfiles from './SupplierProfiles';
import QuotationComparison from './QuotationComparison';
import ProductGroups from './ProductGroups';
import { loadQuotationWorkspace, type QuotationWorkspace } from '../../quotation/api';

type QuotationView = 'archive' | 'review' | 'profiles' | 'comparison' | 'groups';

interface NavItem {
  id: QuotationView;
  label: string;
  icon: React.ReactNode;
}

const EMPTY_WORKSPACE: QuotationWorkspace = {
  quotations: [],
  items: [],
  suppliers: [],
  productGroups: [],
};

const NAV_ITEMS: NavItem[] = [
  { id: 'archive', label: '全部报价', icon: <Archive className="h-4 w-4" /> },
  { id: 'review', label: '待审核', icon: <Clock className="h-4 w-4" /> },
  { id: 'profiles', label: '供应商资料', icon: <Building2 className="h-4 w-4" /> },
  { id: 'comparison', label: '横向比价', icon: <CheckCircle2 className="h-4 w-4" /> },
  { id: 'groups', label: '产品分组', icon: <Package className="h-4 w-4" /> },
];

export default function SupplierQuotationApp() {
  const [activeView, setActiveView] = useState<QuotationView>('archive');
  const [workspace, setWorkspace] = useState<QuotationWorkspace>(EMPTY_WORKSPACE);
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await loadQuotationWorkspace());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedQuotation = useMemo(
    () => workspace.quotations.find(quotation => quotation.id === selectedQuotationId) ?? null,
    [selectedQuotationId, workspace.quotations],
  );
  const selectedItems = useMemo(
    () => workspace.items.filter(item => item.quotationId === selectedQuotationId && !item.deletedAt),
    [selectedQuotationId, workspace.items],
  );
  const selectedSupplier = selectedQuotation
    ? workspace.suppliers.find(supplier => supplier.id === selectedQuotation.supplierId)
    : undefined;

  const openReview = (quotationId: string) => {
    setSelectedQuotationId(quotationId);
    setActiveView('review');
  };

  const openPendingReview = () => {
    const pending = workspace.quotations.find(quotation => quotation.status === 'review_required');
    if (pending) setSelectedQuotationId(pending.id);
    setActiveView('review');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'archive':
        return (
          <QuotationArchive
            workspace={workspace}
            loading={loading}
            onRefresh={refresh}
            onSelectReview={openReview}
          />
        );
      case 'review':
        return (
          <QuotationReview
            quotation={selectedQuotation}
            items={selectedItems}
            supplier={selectedSupplier}
            productGroups={workspace.productGroups}
            onSaved={refresh}
            onBack={() => setActiveView('archive')}
          />
        );
      case 'profiles':
        return (
          <SupplierProfiles
            suppliers={workspace.suppliers}
            quotations={workspace.quotations}
            items={workspace.items}
            onSaved={refresh}
            onOpenQuotation={openReview}
          />
        );
      case 'comparison':
        return <QuotationComparison workspace={workspace} />;
      case 'groups':
        return <ProductGroups workspace={workspace} onSaved={refresh} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-120px)]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight text-slate-800">报价管理</h2>
              <p className="mt-0.5 text-[10px] text-slate-400">Management Module</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map(item => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => item.id === 'review' ? openPendingReview() : setActiveView(item.id)}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'border border-blue-200 bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <span className={isActive ? 'text-blue-600' : 'text-slate-400'}>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-blue-400" />}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 p-3">
          <div className="px-3 py-2 text-[10px] font-medium text-slate-400">
            共 {workspace.quotations.filter(quotation => !quotation.deletedAt).length} 份报价单
          </div>
        </div>
      </aside>

      <div className="flex-1 overflow-auto bg-slate-50">
        {error ? (
          <div className="m-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        ) : null}
        {renderContent()}
      </div>
    </div>
  );
}
