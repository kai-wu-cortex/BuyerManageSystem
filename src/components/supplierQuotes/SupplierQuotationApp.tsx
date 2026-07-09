import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  Building2,
} from 'lucide-react';
import QuotationArchive from './QuotationArchive';
import SupplierProfiles from './SupplierProfiles';
import FilePreview from './FilePreview';
import { loadQuotationItems, loadQuotationWorkspace, type QuotationWorkspace } from '../../quotation/api';
import type { SupplierQuotationItem } from '../../quotation/types';

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
  const [loadingItems, setLoadingItems] = useState(false);
  const [allItemsLoaded, setAllItemsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewQuotationId, setPreviewQuotationId] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<{ pathname: string; fileName: string; mimeType: string } | null>(null);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await loadQuotationWorkspace({ force }));
      setAllItemsLoaded(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mergeItems = useCallback((items: SupplierQuotationItem[]) => {
    setWorkspace(current => {
      const byId = new Map(current.items.map(item => [item.id, item]));
      items.forEach(item => byId.set(item.id, item));
      return { ...current, items: Array.from(byId.values()) };
    });
  }, []);

  const ensureQuotationItems = useCallback(async (quotationId: string): Promise<SupplierQuotationItem[]> => {
    const existing = workspace.items.filter(item => item.quotationId === quotationId);
    if (allItemsLoaded || existing.length > 0) return existing;
    setLoadingItems(true);
    setError(null);
    try {
      const items = await loadQuotationItems(quotationId);
      mergeItems(items);
      return items;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return [];
    } finally {
      setLoadingItems(false);
    }
  }, [allItemsLoaded, mergeItems, workspace.items]);

  const ensureAllItems = useCallback(async () => {
    if (allItemsLoaded) return;
    setLoadingItems(true);
    setError(null);
    try {
      setWorkspace(current => ({ ...current, items: [] }));
      mergeItems(await loadQuotationItems());
      setAllItemsLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingItems(false);
    }
  }, [allItemsLoaded, mergeItems]);

  const handlePreviewFromProfiles = (quotationId: string) => {
    setPreviewQuotationId(quotationId);
    setActiveView('archive');
    void ensureQuotationItems(quotationId);
  };

  useEffect(() => {
    if (activeView === 'profiles') {
      void ensureAllItems();
    }
  }, [activeView, ensureAllItems]);

  const renderContent = () => {
    switch (activeView) {
      case 'archive':
        return (
          <QuotationArchive
            workspace={workspace}
            loading={loading}
            loadingItems={loadingItems}
            allItemsLoaded={allItemsLoaded}
            onRefresh={() => refresh(true)}
            onLoadQuotationItems={ensureQuotationItems}
            onLoadAllItems={ensureAllItems}
            initialPreviewId={previewQuotationId}
            onPreviewClosed={() => setPreviewQuotationId(null)}
            onFilePreview={setFilePreview}
          />
        );
      case 'profiles':
        return (
          <SupplierProfiles
            suppliers={workspace.suppliers}
            quotations={workspace.quotations}
            items={workspace.items}
            onSaved={() => refresh(true)}
            onOpenQuotation={() => {}}
            onPreviewQuotation={handlePreviewFromProfiles}
            onFilePreview={setFilePreview}
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
            <p className="text-[10px] text-slate-400">共 {workspace.quotations.filter(q => !q.deletedAt).length} 份报价单，{workspace.suppliers.filter(s => !s.deletedAt).length} 个供应商</p>
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

      {/* File preview overlay */}
      {filePreview && (
        <div className="fixed inset-0 z-50 bg-white">
          <FilePreview
            pathname={filePreview.pathname}
            fileName={filePreview.fileName}
            mimeType={filePreview.mimeType}
            onClose={() => setFilePreview(null)}
          />
        </div>
      )}
    </div>
  );
}
