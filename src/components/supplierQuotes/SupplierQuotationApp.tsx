import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  Building2,
} from 'lucide-react';
import QuotationArchive from './QuotationArchive';
import SupplierProfiles from './SupplierProfiles';
import { loadQuotationWorkspace, type QuotationWorkspace } from '../../quotation/api';

type QuotationView = 'archive' | 'profiles';

interface NavItem {
  id: QuotationView;
  label: string;
  icon: React.ReactNode;
}

const EMPTY_WORKSPACE: QuotationWorkspace = {
  quotations: [],
  items: [],
  suppliers: [],
};

const NAV_ITEMS: NavItem[] = [
  { id: 'archive', label: '全部报价', icon: <Archive className="h-4 w-4" /> },
  { id: 'profiles', label: '供应商', icon: <Building2 className="h-4 w-4" /> },
];

export default function SupplierQuotationApp() {
  const [activeView, setActiveView] = useState<QuotationView>('archive');
  const [workspace, setWorkspace] = useState<QuotationWorkspace>(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewQuotationId, setPreviewQuotationId] = useState<string | null>(null);

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

  const handlePreviewFromProfiles = (quotationId: string) => {
    setPreviewQuotationId(quotationId);
    setActiveView('archive');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'archive':
        return (
          <QuotationArchive
            workspace={workspace}
            loading={loading}
            onRefresh={refresh}
            initialPreviewId={previewQuotationId}
            onPreviewClosed={() => setPreviewQuotationId(null)}
          />
        );
      case 'profiles':
        return (
          <SupplierProfiles
            suppliers={workspace.suppliers}
            quotations={workspace.quotations}
            items={workspace.items}
            onSaved={refresh}
            onOpenQuotation={() => {}}
            onPreviewQuotation={handlePreviewFromProfiles}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-120px)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Building2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">报价管理</h2>
            <p className="text-[10px] text-slate-400">共 {workspace.quotations.filter(q => !q.deletedAt).length} 份报价单</p>
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600">{error}</div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-slate-50">
        {renderContent()}
      </div>

      {/* Bottom Tab Bar */}
      <nav className="flex border-t border-slate-200 bg-white">
        {NAV_ITEMS.map(item => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? 'text-blue-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <span className={isActive ? 'text-blue-600' : 'text-slate-400'}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
