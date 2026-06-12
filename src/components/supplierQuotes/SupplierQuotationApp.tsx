import React, { useState } from 'react';
import {
  Archive,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Building2,
  Package,
  ChevronRight,
} from 'lucide-react';
import QuotationArchive from './QuotationArchive';
import QuotationReview from './QuotationReview';
import SupplierProfiles from './SupplierProfiles';
import QuotationComparison from './QuotationComparison';
import ProductGroups from './ProductGroups';
import type { QuotationWorkflowStatus } from '../../quotation/types';

type QuotationView = 'archive' | 'review' | 'profiles' | 'comparison' | 'groups';

interface NavItem {
  id: QuotationView;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'archive', label: '全部报价', icon: <Archive className="w-4 h-4" /> },
  { id: 'review', label: '待审核', icon: <Clock className="w-4 h-4" /> },
  { id: 'profiles', label: '供应商资料', icon: <Building2 className="w-4 h-4" /> },
  { id: 'comparison', label: '横向比价', icon: <CheckCircle2 className="w-4 h-4" /> },
  { id: 'groups', label: '产品分组', icon: <Package className="w-4 h-4" /> },
];

export default function SupplierQuotationApp() {
  const [activeView, setActiveView] = useState<QuotationView>('archive');

  const renderContent = () => {
    switch (activeView) {
      case 'archive':
        return <QuotationArchive onSelectReview={(id) => setActiveView('review')} />;
      case 'review':
        return <QuotationReview />;
      case 'profiles':
        return <SupplierProfiles />;
      case 'comparison':
        return <QuotationComparison />;
      case 'groups':
        return <ProductGroups />;
      default:
        return <QuotationArchive onSelectReview={(id) => setActiveView('review')} />;
    }
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-120px)]">
      {/* Left Sidebar Navigation */}
      <aside className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        {/* Module Header */}
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 leading-tight">报价管理</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Management Module</p>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <span className={isActive ? 'text-blue-600' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span className="flex-1 text-left">{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-400" />}
              </button>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="p-3 border-t border-slate-100">
          <div className="px-3 py-2 text-[10px] text-slate-400 font-medium">
            共 24 份报价单
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto bg-slate-50">
        {renderContent()}
      </div>
    </div>
  );
}
