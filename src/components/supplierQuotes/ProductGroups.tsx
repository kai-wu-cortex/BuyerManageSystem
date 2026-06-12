import React, { useState } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Link,
  Unlink,
  ChevronRight,
  Package,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { getStatusColor, getStatusLabel } from './quotationUi';
import type { GroupMatchStatus } from '../../quotation/types';

interface ProductGroup {
  id: string;
  name: string;
  aliases: string[];
  conversions: { from: string; to: string; factor: number }[];
  confirmed: boolean;
  itemCount: number;
}

interface UnmatchedItem {
  id: string;
  productName: string;
  spec: string;
  supplier: string;
  status: GroupMatchStatus;
  suggestedGroupId?: string;
  suggestedGroupName?: string;
}

const MOCK_GROUPS: ProductGroup[] = [
  {
    id: 'pg1',
    name: 'STM32 系列 MCU',
    aliases: ['STM32', 'STM32F1', 'STM32F4'],
    conversions: [{ from: 'PCS', to: '个', factor: 1 }],
    confirmed: true,
    itemCount: 12,
  },
  {
    id: 'pg2',
    name: 'ESP32 模组',
    aliases: ['ESP32', 'ESP-WROOM'],
    conversions: [{ from: 'PCS', to: '个', factor: 1 }],
    confirmed: true,
    itemCount: 8,
  },
  {
    id: 'pg3',
    name: '贴片电阻',
    aliases: ['SMD Resistor', '0402', '0603', '0805'],
    conversions: [{ from: 'K', to: '千', factor: 1000 }],
    confirmed: false,
    itemCount: 15,
  },
];

const MOCK_UNMATCHED: UnmatchedItem[] = [
  { id: 'u1', productName: 'Industrial Microcontroller V2', spec: '44-A', supplier: 'TechCorp', status: 'suggested', suggestedGroupId: 'pg1', suggestedGroupName: 'STM32 系列 MCU' },
  { id: 'u2', productName: 'Sensor Array Module', spec: 'Standard', supplier: 'Global Parts', status: 'unmatched' },
  { id: 'u3', productName: 'Capacitor 100uF', spec: '16V', supplier: 'LCSC', status: 'suggested', suggestedGroupName: '电容器件' },
  { id: 'u4', productName: 'Power Supply Unit', spec: '500W', supplier: 'Apex', status: 'unmatched' },
];

export default function ProductGroups() {
  const [groups, setGroups] = useState<ProductGroup[]>(MOCK_GROUPS);
  const [unmatched, setUnmatched] = useState<UnmatchedItem[]>(MOCK_UNMATCHED);
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'suggested' | 'unmatched'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUnmatched = unmatched.filter(item => {
    if (filter !== 'all' && item.status !== filter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!item.productName.toLowerCase().includes(term) && !item.supplier.toLowerCase().includes(term)) return false;
    }
    return true;
  });

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">产品分组管理</h1>
          <p className="text-xs text-slate-500 mt-1">管理标准化产品分组和别名映射</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" />
          新建分组
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Product Groups */}
        <div className="col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">已定义分组 ({groups.length})</h3>
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索分组..."
                  className="w-48 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {groups.map((group) => (
                <div key={group.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                        group.confirmed ? 'bg-blue-100' : 'bg-amber-100'
                      }`}>
                        <Package className={`h-5 w-5 ${group.confirmed ? 'text-blue-600' : 'text-amber-600'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{group.name}</span>
                          {group.confirmed ? (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-semibold rounded">已确认</span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-semibold rounded">待确认</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-slate-400">别名:</span>
                          {group.aliases.map((alias, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded">
                              {alias}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                          <span>{group.itemCount} 个物料</span>
                          {group.conversions.length > 0 && (
                            <span>{group.conversions.length} 个换算规则</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Unmatched Items */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-800 mb-2">待匹配物料 ({unmatched.length})</h3>
              <div className="flex gap-1">
                {(['all', 'suggested', 'unmatched'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                      filter === f
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {f === 'all' ? '全部' : f === 'suggested' ? '已建议' : '未匹配'}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
              {filteredUnmatched.map((item) => (
                <div key={item.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {item.status === 'suggested' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        ) : (
                          <Package className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span className="text-xs font-medium text-slate-700">{item.productName}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 ml-5">
                        {item.spec} · {item.supplier}
                      </div>
                      {item.suggestedGroupName && (
                        <div className="text-[10px] text-blue-600 mt-1 ml-5">
                          建议分组: {item.suggestedGroupName}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {item.status === 'suggested' && (
                        <button className="p-1 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="确认匹配">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                      <button className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="手动匹配">
                        <Link className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredUnmatched.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-xs text-slate-500">暂无待匹配物料</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
