import React, { useState, useMemo, useEffect, useRef } from 'react';
import { PurchaseOrder, InventoryItem } from '../types';
import { 
  TrendingUp, 
  Package, 
  Clock, 
  Truck, 
  Briefcase,
  Calendar,
  Settings,
  AlignJustify,
  X,
  Sliders,
  Star,
  GripHorizontal,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { useStarredPOs } from '../lib/hooks';
import { motion, AnimatePresence } from 'motion/react';
import {
  loadBuyerSystemViewSettings,
  saveBuyerSystemViewSettings,
  type CloudbaseAuthUser,
  type DashboardViewSettings,
} from '../lib/cloudbaseData';
import {
  DEFAULT_ITEM_FIELDS,
  ITEM_FIELD_LABELS,
  formatItemFieldValue,
  useStoredItemFields,
  type ItemFieldKey,
} from './PODetailDrawer';

interface DashboardProps {
  purchaseOrders: PurchaseOrder[];
  inventory: InventoryItem[];
  onNavigateToPOS: (poId?: string) => void;
  onNavigateToMaterials: () => void;
  onGenerateQuickPO: (item: InventoryItem) => void;
  authUser?: CloudbaseAuthUser | null;
}

const COLORS = ['#2563EB', '#F97316', '#10B981', '#6366F1', '#8B5CF6', '#EC4899'];
const DEFAULT_VISIBLE_FIELDS: DashboardViewSettings['visibleFields'] = {
  supplier: true,
  dates: true,
  materials: true,
  progress: true
};
const DEFAULT_DRAWER_FIELDS: DashboardViewSettings['drawerFields'] = {
  supplier: true,
  status: true,
  dates: true,
  items: true,
  amount: true,
  progress: true
};
const DEFAULT_GANTT_FIELDS: DashboardViewSettings['ganttFields'] = {
  supplier: true,
  dates: true,
  executionStatus: false,
  amount: false,
  itemSummary: false
};
const DEFAULT_MODULE_ORDER = [
  'kpis',
  'trend',
  'supplier',
  'category',
  'gantt',
  'warnings'
];
const DEFAULT_MODULE_WIDTHS: DashboardViewSettings['moduleWidths'] = {
  kpis: 3,
  trend: 2,
  supplier: 1,
  category: 1,
  gantt: 2,
  warnings: 3
};

function isDashboardCols(value: unknown): value is 1 | 2 | 3 | 4 {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isDrawerCols(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function sanitizeBooleanFlags(value: unknown, fallback: Record<string, boolean>): Record<string, boolean> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const next = { ...fallback };
  for (const [key, flag] of Object.entries(value)) {
    if (typeof flag === 'boolean') {
      next[key] = flag;
    }
  }
  return next;
}

function sanitizeModuleWidths(value: unknown): Record<string, number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_MODULE_WIDTHS;
  }

  const next = { ...DEFAULT_MODULE_WIDTHS };
  for (const [key, width] of Object.entries(value)) {
    if (typeof width === 'number' && Number.isFinite(width)) {
      next[key] = Math.max(1, Math.min(3, Math.round(width)));
    }
  }
  return next;
}

function sanitizeModuleOrder(value: unknown): string[] {
  if (!isStringList(value)) {
    return DEFAULT_MODULE_ORDER;
  }

  const knownModules = new Set(DEFAULT_MODULE_ORDER);
  const ordered = value.filter(moduleId => knownModules.has(moduleId));
  const missing = DEFAULT_MODULE_ORDER.filter(moduleId => !ordered.includes(moduleId));
  return [...ordered, ...missing];
}

const CustomYAxisTick = (props: any) => {
  const { x, y, payload } = props;
  const value = payload.value;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-8}
        y={4}
        textAnchor="end"
        fill="#475569"
        fontSize={11}
        fontWeight={600}
        className="cursor-help"
      >
        <title>{value}</title>
        {value}
      </text>
    </g>
  );
};

export default function Dashboard({ 
  purchaseOrders, 
  onNavigateToPOS, 
  authUser = null,
}: DashboardProps) {
  const [timelineCols, setTimelineCols] = useState<1 | 2 | 3 | 4>((() => {
    const saved = localStorage.getItem('dashboard_timeline_cols');
    return saved ? JSON.parse(saved) : 2;
  })());
  const [showConfig, setShowConfig] = useState(false);
  const [visibleFields, setVisibleFields] = useState((() => {
    const saved = localStorage.getItem('dashboard_visible_fields');
    return saved ? JSON.parse(saved) : DEFAULT_VISIBLE_FIELDS;
  })());
  
  const { starredIds } = useStarredPOs();
  const [modalView, setModalView] = useState<'none' | 'starred' | 'transit' | 'warning'>('none');
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null);
  
  // Custom sidebar/drawer view options
  const [drawerCols, setDrawerCols] = useState<1 | 2>((() => {
    const saved = localStorage.getItem('dashboard_drawer_cols');
    return saved ? JSON.parse(saved) : 1;
  })());
  const [drawerFields, setDrawerFields] = useState((() => {
    const saved = localStorage.getItem('dashboard_drawer_fields');
    return saved ? JSON.parse(saved) : DEFAULT_DRAWER_FIELDS;
  })());
  const [itemFields, setItemFields] = useStoredItemFields();
  const [showDrawerConfig, setShowDrawerConfig] = useState(false);
  const activeItemFieldKeys = (Object.keys(ITEM_FIELD_LABELS) as ItemFieldKey[]).filter(key => itemFields[key]);
  
  useEffect(() => { localStorage.setItem('dashboard_timeline_cols', JSON.stringify(timelineCols)); }, [timelineCols]);
  useEffect(() => { localStorage.setItem('dashboard_visible_fields', JSON.stringify(visibleFields)); }, [visibleFields]);
  useEffect(() => { localStorage.setItem('dashboard_drawer_cols', JSON.stringify(drawerCols)); }, [drawerCols]);
  useEffect(() => { localStorage.setItem('dashboard_drawer_fields', JSON.stringify(drawerFields)); }, [drawerFields]);
  
  // Calculate general statistics
  const totalOrders = purchaseOrders.length;
  
  const dateRange = useMemo(() => {
    if (purchaseOrders.length === 0) return null;
    const dates = purchaseOrders.map(po => new Date(po.date).getTime()).filter(t => !isNaN(t));
    if (dates.length === 0) return null;
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    return {
      start: minDate.toISOString().split('T')[0],
      end: maxDate.toISOString().split('T')[0]
    };
  }, [purchaseOrders]);

  const totalAmount = purchaseOrders.reduce((sum, po) => {
    const poSum = po.items.reduce((itemSum, item) => itemSum + (item.orderedQty * item.price), 0);
    return sum + poSum;
  }, 0);

  const pendingInboundCount = purchaseOrders.filter(po => po.inboundStatus !== '全部入库').length;
  // 未审核通常指待签发，但在途订单定义为正在执行且未全部入库
  const inTransitCount = purchaseOrders.filter(po => po.executionStatus !== '未执行' && po.inboundStatus !== '全部入库').length;

  // Chart Data: Monthly Spend (Line Chart)
  const monthlySpend = useMemo(() => {
    const data: Record<string, number> = {};
    purchaseOrders.forEach(po => {
      const month = po.date.substring(0, 7); 
      if (!data[month]) data[month] = 0;
      data[month] += po.items.reduce((s, item) => s + (item.orderedQty * item.price), 0);
    });
    return Object.entries(data)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value }));
  }, [purchaseOrders]);

  // Chart Data: Top Suppliers (Bar Chart)
  const supplierSpend = useMemo(() => {
    const data: Record<string, number> = {};
    purchaseOrders.forEach(po => {
      if (!data[po.supplier]) data[po.supplier] = 0;
      data[po.supplier] += po.items.reduce((s, item) => s + (item.orderedQty * item.price), 0);
    });
    return Object.entries(data)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [purchaseOrders]);

  // Chart Data: Category Spend (Pie Chart)
  const categorySpend = useMemo(() => {
    const data: Record<string, number> = {};
    purchaseOrders.forEach(po => {
      po.items.forEach(item => {
        if (!data[item.category]) data[item.category] = 0;
        data[item.category] += item.orderedQty * item.price;
      });
    });
    return Object.entries(data)
      .sort(([,a], [,b]) => b - a)
      .map(([name, value]) => ({ name, value }));
  }, [purchaseOrders]);

  const [ganttFilter, setGanttFilter] = useState<'all' | 'starred'>('all');
  const [showGanttConfig, setShowGanttConfig] = useState(false);
  const [ganttFields, setGanttFields] = useState((() => {
    const saved = localStorage.getItem('dashboard_gantt_fields');
    return saved ? JSON.parse(saved) : DEFAULT_GANTT_FIELDS;
  })());

  useEffect(() => { localStorage.setItem('dashboard_gantt_fields', JSON.stringify(ganttFields)); }, [ganttFields]);

  // Gantt Chart logic natively rendering HTML elements
  const ganttData = useMemo(() => {
    const now = new Date().getTime();
    return purchaseOrders
      .filter(po => po.inboundStatus !== '全部入库' || starredIds.has(po.id))
      .filter(po => ganttFilter === 'all' || starredIds.has(po.id))
      .slice(0, 8)
      .map(po => {
        const start = new Date(po.date).getTime();
        const end = new Date(po.deliveryDate).getTime();
        const duration = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
        const elapsed = Math.max(0, (now - start) / (1000 * 60 * 60 * 24));
        const progress = Math.min(100, Math.round((elapsed / duration) * 100));
        const isOverdue = now > end;
        return { po, progress, duration, isOverdue };
      });
  }, [purchaseOrders, ganttFilter, starredIds]);

  // Lead warning PO list (Show "交期预警" flag if expected delivery is soon/passed and execution is partial/none)
  const deliveryWarnings = purchaseOrders.filter(po => {
    if (po.inboundStatus === '全部入库') return false;
    const diffDays = Math.round((new Date(po.deliveryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  });

  // Draggable Grid State
  const [draggedModule, setDraggedModule] = useState<string | null>(null);
  const [moduleOrder, setModuleOrder] = useState<string[]>((() => {
    const saved = localStorage.getItem('dashboard_module_order');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 6) return parsed;
      } catch (e) {}
    }
    return DEFAULT_MODULE_ORDER;
  })());

  const [moduleWidths, setModuleWidths] = useState<Record<string, number>>((() => {
    const saved = localStorage.getItem('dashboard_module_widths');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return DEFAULT_MODULE_WIDTHS;
  })());

  useEffect(() => { localStorage.setItem('dashboard_module_order', JSON.stringify(moduleOrder)); }, [moduleOrder]);
  useEffect(() => { localStorage.setItem('dashboard_module_widths', JSON.stringify(moduleWidths)); }, [moduleWidths]);

  const cloudSettingsLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    cloudSettingsLoadedRef.current = false;

    if (!authUser) {
      return () => {
        cancelled = true;
      };
    }

    void loadBuyerSystemViewSettings(authUser)
      .then(record => {
        if (cancelled || !record?.dashboard) return;
        const settings = record.dashboard;

        if (isDashboardCols(settings.timelineCols)) {
          setTimelineCols(settings.timelineCols);
        }
        if (isDrawerCols(settings.drawerCols)) {
          setDrawerCols(settings.drawerCols);
        }
        setVisibleFields(sanitizeBooleanFlags(settings.visibleFields, DEFAULT_VISIBLE_FIELDS));
        setDrawerFields(sanitizeBooleanFlags(settings.drawerFields, DEFAULT_DRAWER_FIELDS));
        setGanttFields(sanitizeBooleanFlags(settings.ganttFields, DEFAULT_GANTT_FIELDS));
        setModuleOrder(sanitizeModuleOrder(settings.moduleOrder));
        setModuleWidths(sanitizeModuleWidths(settings.moduleWidths));
      })
      .catch(error => {
        console.warn('Failed to load dashboard settings from CloudBase:', error);
      })
      .finally(() => {
        if (!cancelled) {
          cloudSettingsLoadedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !cloudSettingsLoadedRef.current) {
      return;
    }

    const settings: DashboardViewSettings = {
      timelineCols,
      visibleFields,
      drawerCols,
      drawerFields,
      ganttFields,
      moduleOrder,
      moduleWidths,
    };

    const timer = window.setTimeout(() => {
      void saveBuyerSystemViewSettings(authUser, 'dashboard', settings).catch(error => {
        console.warn('Failed to save dashboard settings to CloudBase:', error);
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [authUser, timelineCols, visibleFields, drawerCols, drawerFields, ganttFields, moduleOrder, moduleWidths]);

  const adjustWidth = (id: string, delta: number) => {
    setModuleWidths(prev => {
      const current = prev[id] || 1;
      const newWidth = Math.max(1, Math.min(3, current + delta));
      return { ...prev, [id]: newWidth };
    });
  };

  const getColSpanClass = (width: number) => {
    if (width === 1) return 'col-span-1';
    if (width === 2) return 'col-span-1 lg:col-span-2';
    if (width === 3) return 'col-span-1 lg:col-span-2 xl:col-span-3';
    return 'col-span-1';
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedModule(id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
  };

  const handleDragEnter = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedModule || draggedModule === targetId) return;
    setModuleOrder(prev => {
      const draggedIdx = prev.indexOf(draggedModule);
      const targetIdx = prev.indexOf(targetId);
      if (draggedIdx === targetIdx) return prev;
      const newOrder = [...prev];
      newOrder.splice(draggedIdx, 1);
      newOrder.splice(targetIdx, 0, draggedModule);
      return newOrder;
    });
  };

  const modulesMap = {
    'kpis': {
      colSpan: 'col-span-1 lg:col-span-2 xl:col-span-3 transition-transform duration-300',
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 h-full pointer-events-auto">
        <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-md flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-slate-400 text-[10px] uppercase font-bold font-mono tracking-wider">采购总金额 / PO TOTAL VALUE</span>
            <div className="text-2xl font-bold font-mono text-slate-900">
              ¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-slate-500 text-[10px] font-mono flex items-center gap-1 uppercase">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              累计 {totalOrders} 笔订单
            </p>
          </div>
          <div className="p-3 bg-[#2563EB]/10 text-[#2563EB] rounded-lg">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-md flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-slate-400 text-[10px] uppercase font-bold font-mono tracking-wider">执行中订单 / UNDER INBOUND</span>
            <div className="text-2xl font-bold font-mono text-[#F97316]">
              {pendingInboundCount} <span className="text-xs font-normal">笔</span>
            </div>
            <p className="text-slate-500 text-[10px] font-mono flex items-center gap-1 uppercase">
              <Truck className="w-3.5 h-3.5 text-[#F97316]" />
              占比例 {totalOrders ? Math.round((pendingInboundCount/totalOrders)*100) : 0}%
            </p>
          </div>
          <div className="p-3 bg-orange-100 text-[#F97316] rounded-lg">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div onClick={() => { setModalView('transit'); setSelectedPOId(null); }} className="bg-white p-6 border border-slate-200 rounded-xl shadow-md hover:shadow-lg transition-all hover:translate-y-[-2px] duration-150 flex items-center justify-between cursor-pointer">
          <div className="space-y-1">
            <span className="text-slate-400 text-[10px] uppercase font-bold font-mono tracking-wider">在途订单 / ORDERS IN TRANSIT</span>
            <div className="text-2xl font-bold font-mono text-[#10B981]">
              {inTransitCount} <span className="text-xs font-normal">笔</span>
            </div>
            <p className="text-slate-500 text-[10px] font-mono flex items-center gap-1 uppercase">
              <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
              未完结的交货
            </p>
          </div>
          <div className="p-3 bg-emerald-100 text-[#10B981] rounded-lg">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div onClick={() => { setModalView('starred'); setSelectedPOId(null); }} className="bg-white p-6 border border-slate-200 rounded-xl shadow-md hover:shadow-lg transition-all hover:translate-y-[-2px] duration-150 flex items-center justify-between cursor-pointer">
          <div className="space-y-1">
            <span className="text-slate-400 text-[10px] uppercase font-bold font-mono tracking-wider">星标订单 / STARRED ORDERS</span>
            <div className="text-2xl font-bold font-mono text-slate-800">
              {starredIds.size} <span className="text-xs font-normal">笔</span>
            </div>
            <p className="text-slate-500 text-[10px] font-mono flex items-center gap-1 uppercase">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              人工标星锁定
            </p>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          </div>
        </div>
        </div>
      )
    },
    'trend': {
      colSpan: 'col-span-1 lg:col-span-2 xl:col-span-2 transition-transform duration-300',
      content: (
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm h-full space-y-4 pointer-events-auto">
          <div className="space-y-0.5 border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold uppercase tracking-tight text-slate-850">采购金额趋势分析 / PURCHASING TREND</h3>
            <p className="text-[10px] font-mono text-slate-500 uppercase">月度总计开销走势</p>
          </div>
          <div className="h-64 mt-4 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <LineChart data={monthlySpend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} width={80} tickFormatter={(val) => `¥${(val/10000).toFixed(1)}w`} />
                <RechartsTooltip 
                  cursor={{ stroke: '#94A3B8', strokeWidth: 1, strokeDasharray: '4 4' }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                  formatter={(value: number) => [`¥${value.toLocaleString()}`, '金额']}
                />
                <Line type="monotone" dataKey="value" stroke="#2563EB" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    },
    'supplier': {
      colSpan: 'col-span-1 transition-transform duration-300',
      content: (
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm h-full space-y-4 pointer-events-auto">
          <div className="space-y-0.5 border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold uppercase tracking-tight text-slate-850">核心供应商排行 / TOP SUPPLIERS</h3>
            <p className="text-[10px] font-mono text-slate-500 uppercase">依采购规模排序前5名</p>
          </div>
          <div className="h-64 mt-4 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart data={supplierSpend} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={<CustomYAxisTick />} width={150} interval={0} />
                <RechartsTooltip 
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                  formatter={(value: number) => [`¥${value.toLocaleString()}`, '金额']}
                />
                <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={24}>
                  {supplierSpend.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    },
    'category': {
      colSpan: 'col-span-1 transition-transform duration-300',
      content: (
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm h-full space-y-4 pointer-events-auto">
          <div className="space-y-0.5 border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold uppercase tracking-tight text-slate-850">物料种类占比 / SPEND BY CATEGORY</h3>
            <p className="text-[10px] font-mono text-slate-500 uppercase">投入资金的物料结构</p>
          </div>
          <div className="h-64 mt-4 w-full relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <PieChart>
                <Pie
                  data={categorySpend}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {categorySpend.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                  formatter={(value: number) => [`¥${value.toLocaleString()}`, '金额']}
                />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    },
    'gantt': {
      colSpan: 'col-span-1 lg:col-span-2 xl:col-span-2 transition-transform duration-300',
      content: (
        <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm h-full space-y-4 pointer-events-auto">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold uppercase tracking-tight text-slate-850">关键在途订单甘特图 / FULFILLMENT GANTT</h3>
              <p className="text-[10px] font-mono text-slate-500 uppercase">监控采购下单至交期的履约进度</p>
            </div>
            <div className="flex items-center gap-2 relative">
              {/* Field config dropdown */}
              <button
                onClick={() => setShowGanttConfig(!showGanttConfig)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                title="显示字段配置"
              >
                <Sliders className="w-4 h-4" />
              </button>
              
              {showGanttConfig && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2">
                  <div className="text-[10px] font-bold text-slate-400 mb-2 px-2 uppercase">显示字段</div>
                  <div className="space-y-1">
                    {[
                      { key: 'supplier', label: '供应商' },
                      { key: 'dates', label: '下单与交期' },
                      { key: 'executionStatus', label: '开票与入库状态' },
                      { key: 'amount', label: '订单总额' },
                      { key: 'itemSummary', label: '物料摘要' }
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ganttFields[key as keyof typeof ganttFields]}
                          onChange={(e) => setGanttFields(prev => ({ ...prev, [key]: e.target.checked }))}
                          className="w-3 h-3 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                        />
                        <span className="text-xs font-semibold text-slate-600">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Gantt Filter Dropdown/Toggle */}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => setGanttFilter('all')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${ganttFilter === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  所有订单
                </button>
                <button 
                  onClick={() => setGanttFilter('starred')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors flex items-center gap-1 ${ganttFilter === 'starred' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Star className={`w-3 h-3 ${ganttFilter === 'starred' ? 'fill-amber-500 text-amber-500' : ''}`} />
                  星标订单
                </button>
              </div>
            </div>
          </div>
          
          <div className="space-y-4 mt-6">
            {ganttData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm font-mono border-2 border-dashed border-slate-100 rounded-lg">
                暂无活在途订单
              </div>
            ) : ganttData.map(({ po, progress, duration, isOverdue }) => (
              <div key={po.id} className="group cursor-pointer" onClick={() => onNavigateToPOS(po.id)}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs mb-1 gap-1 sm:gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold font-mono text-slate-700 underline group-hover:text-blue-600 transition-colors uppercase">{po.id}</span>
                    {ganttFields.supplier && <span className="text-[10px] font-medium text-slate-500 truncate max-w-[150px]">{po.supplier}</span>}
                    {ganttFields.executionStatus && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">{po.executionStatus} / {po.inboundStatus}</span>
                    )}
                    {ganttFields.amount && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-mono font-bold">
                        ¥{po.items.reduce((sum, item) => sum + (item.orderedQty * item.price), 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {ganttFields.dates && (
                    <div className="font-mono text-slate-500">
                      {po.date.substring(5)} <span className="opacity-50 mx-1">-&gt;</span> {po.deliveryDate.substring(5)}
                    </div>
                  )}
                </div>
                {ganttFields.itemSummary && (
                  <div className="text-[10px] text-slate-400 mb-1.5 truncate pr-4">
                    {po.items.map(item => item.name).join(', ')}
                  </div>
                )}
                <div className="relative w-full h-4 bg-slate-100 rounded overflow-hidden">
                  <div 
                    className={`absolute top-0 bottom-0 left-0 transition-all duration-500 ${isOverdue ? 'bg-[#EF4444]' : 'bg-[#2563EB]'}`}
                    style={{ width: `${progress}%` }}
                  >
                    <div className="w-full h-full opacity-20 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem]"></div>
                  </div>
                  {/* Now marker */}
                  <div className="absolute top-0 bottom-0 border-r border-slate-800 z-10" style={{ left: `${progress}%` }} title="Current Status" />
                </div>
                <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-0.5">
                  <span>下单</span>
                  {isOverdue ? <span className="text-red-500 font-bold animate-pulse">延期预警</span> : <span>履约中 ({Math.round(progress)}%)</span>}
                  <span>预期到货</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    'warnings': {
      colSpan: 'col-span-1 lg:col-span-2 xl:col-span-3 transition-transform duration-300',
      content: (
        <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-md h-full space-y-4 pointer-events-auto">
        <div className="flex items-start sm:items-center justify-between border-b border-slate-200 pb-3 flex-col sm:flex-row gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold uppercase tracking-tight text-slate-850 flex items-center gap-2">
              <span>⏰ 订单履约到期预警 / ESTIMATED TIMELINE</span>
              <span className="bg-[#0F172A] text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">{deliveryWarnings.length} POs</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400 uppercase">未来7天时间窗 (7-DAY WINDOW)</span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 shadow-inner">
              <button onClick={() => setTimelineCols(1)} className={`p-1.5 rounded-md transition-all ${timelineCols === 1 ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'}`} title="单列模式"><AlignJustify className="w-4 h-4" /></button>
              <button onClick={() => setTimelineCols(2)} className={`p-1.5 rounded-md transition-all font-mono text-xs font-bold w-7 ${timelineCols === 2 ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'}`} title="双列模式">2</button>
              <button onClick={() => setTimelineCols(3)} className={`p-1.5 rounded-md transition-all font-mono text-xs font-bold w-7 ${timelineCols === 3 ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'}`} title="三列模式">3</button>
              <button onClick={() => setTimelineCols(4)} className={`p-1.5 rounded-md transition-all font-mono text-xs font-bold w-7 ${timelineCols === 4 ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-800'}`} title="四列模式">4</button>
            </div>
            
            <div className="relative">
              <button onClick={() => setShowConfig(!showConfig)} className={`p-1.5 rounded-md transition-colors ${showConfig ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                <Settings className="w-5 h-5" />
              </button>
              
              {/* Field config dropdown */}
              {showConfig && (
                <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 shadow-xl rounded-lg p-3 z-20 w-48 font-sans">
                  <h4 className="text-xs font-bold text-slate-700 mb-3 border-b border-slate-100 pb-2">显示字段设置</h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={visibleFields.supplier} onChange={e => setVisibleFields(prev => ({...prev, supplier: e.target.checked}))} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"/>
                      供应商
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={visibleFields.dates} onChange={e => setVisibleFields(prev => ({...prev, dates: e.target.checked}))} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"/>
                      日期信息
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={visibleFields.materials} onChange={e => setVisibleFields(prev => ({...prev, materials: e.target.checked}))} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"/>
                      核心物料
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={visibleFields.progress} onChange={e => setVisibleFields(prev => ({...prev, progress: e.target.checked}))} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"/>
                      入库进度
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {deliveryWarnings.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-center space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50">
            <div className="w-10 h-10 rounded-full bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center font-bold text-lg">
              ✓
            </div>
            <p className="text-xs font-bold uppercase text-slate-700">近期履约时序正常 / TIMELINE OK</p>
            <p className="text-[10px] text-slate-400">没有检测到7天内将到期或已延误的单据</p>
          </div>
        ) : (
          <div 
            className="grid gap-4 mt-6"
            style={{ 
              gridTemplateColumns: `repeat(${timelineCols}, minmax(0, 1fr))` 
            }}
          >
            {deliveryWarnings.map(po => {
              const isOverdue = new Date(po.deliveryDate).getTime() < new Date().getTime();
              
              return (
                <div 
                  key={po.id} 
                  onClick={() => {
                    setSelectedPOId(po.id);
                    setModalView('warning');
                  }}
                  className={`p-5 border rounded-xl flex flex-col justify-between gap-4 font-mono shadow-sm transition-all hover:shadow-md cursor-pointer hover:border-[#2563EB] hover:scale-[1.01] active:scale-95 duration-100 ${
                  isOverdue ? 'border-red-200 bg-red-50/50 hover:border-red-300' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className="text-sm font-bold text-slate-900 block border-b border-dashed border-slate-300 pb-1 w-max">{po.id}</span>
                        {visibleFields.supplier && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-sans mt-2">
                            <Briefcase className="w-3.5 h-3.5" />
                            <span className="truncate" title={po.supplier}>{po.supplier}</span>
                          </div>
                        )}
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap ${
                        isOverdue ? 'bg-[#EF4444] text-white animate-pulse shadow-sm shadow-red-500/20' : 'bg-amber-100 text-[#B45309]'
                      }`}>
                        {isOverdue ? '⚠️ 已延误' : '即将到期'}
                      </span>
                    </div>

                    {visibleFields.dates && (
                      <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50/50 p-2 rounded border border-slate-100">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-400 uppercase font-sans">下单日期</span>
                          <strong className="text-slate-700 flex items-center gap-1"><Calendar className="w-3 h-3 opacity-50"/>{po.date}</strong>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-400 uppercase font-sans">协议交期</span>
                          <strong className={`flex items-center gap-1 ${isOverdue ? 'text-red-600' : 'text-slate-800'}`}><Clock className="w-3 h-3 opacity-50"/>{po.deliveryDate}</strong>
                        </div>
                      </div>
                    )}
                    
                    {visibleFields.materials && (
                      <div className="text-[11px] text-slate-600 flex flex-col gap-1.5 font-sans">
                        <span className="font-semibold px-2 py-1 bg-slate-100 rounded text-slate-700 truncate">
                          物料 ({po.items.length}): {po.items[0]?.name || '无'}
                          {po.items.length > 1 && ` 等`}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-150 flex items-center justify-between gap-3">
                    {visibleFields.progress ? (
                      <div className="text-[11px] font-bold text-slate-500">
                        进度: {po.inboundStatus}
                      </div>
                    ) : <div />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )
    }
  };

  return (
    <div className="space-y-6 pb-12">
      
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-slate-800">采购综合分析</h2>
        {dateRange && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg shadow-sm">
            <Calendar className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold font-mono tracking-tight uppercase">
              当前数据范围: {dateRange.start} <span className="text-indigo-400 font-sans mx-0.5">至</span> {dateRange.end}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {moduleOrder.map(id => {
          const mod = modulesMap[id as keyof typeof modulesMap];
          const widthInfo = moduleWidths[id] || 1;
          const colSpanClass = getColSpanClass(widthInfo);
          return (
            <div 
              key={id}
              draggable
              onDragStart={(e) => handleDragStart(e, id)}
              onDragEnd={() => setDraggedModule(null)}
              onDragEnter={(e) => handleDragEnter(e, id)}
              onDragOver={(e) => e.preventDefault()}
              className={`${colSpanClass} ${draggedModule === id ? 'opacity-30 scale-[0.98]' : 'opacity-100'} transition-all duration-300 transform relative group cursor-move`}
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 z-10 p-1 bg-slate-900/60 backdrop-blur rounded-lg text-slate-100 transition-opacity duration-200 flex items-center gap-1 shadow-sm">
                <button 
                  onClick={(e) => { e.stopPropagation(); adjustWidth(id, -1); }} 
                  disabled={widthInfo <= 1}
                  className="p-1 hover:bg-white/20 rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors" 
                  title="缩小宽度"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="p-1 cursor-move" title="拖拽排序">
                  <GripHorizontal className="w-4 h-4 text-white" />
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); adjustWidth(id, 1); }} 
                  disabled={widthInfo >= 3}
                  className="p-1 hover:bg-white/20 rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors" 
                  title="放大宽度"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              {mod.content}
            </div>
          );
        })}
      </div>

      {/* Sliding Drawer on the Right */}
      <AnimatePresence>
        {modalView !== 'none' && (
          <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setModalView('none'); setSelectedPOId(null); }}
              className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm"
            />

            {/* Sliding Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="relative w-full max-w-2xl bg-slate-50 shadow-2xl border-l border-slate-200 h-full flex flex-col z-10"
            >
              {/* Drawer Header */}
              <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
                {selectedPOId !== null ? (
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      {modalView !== 'none' && (
                        <button 
                          onClick={() => setSelectedPOId(null)}
                          className="flex items-center gap-1 text-[10px] font-bold text-[#2563EB] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded transition-all font-sans"
                        >
                          ← 返回列表
                        </button>
                      )}
                      <span className="font-mono font-bold text-slate-400 text-[10px] uppercase">
                        单据详情 / ORDER DETAIL
                      </span>
                    </div>
                    <h2 className="text-sm font-extrabold text-slate-900 font-mono mt-1">
                      PO ID: {selectedPOId}
                    </h2>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      {modalView === 'starred' ? (
                        <><Star className="w-4 h-4 text-amber-500 fill-amber-500" /> 星标订单列表 / STARRED ORDERS</>
                      ) : modalView === 'warning' ? (
                        <><Clock className="w-4 h-4 text-[#EF4444]" /> 履约到期预警 / TIMELINE WARNINGS</>
                      ) : (
                        <><Truck className="w-4 h-4 text-[#2563EB]" /> 在途订单明细 / IN TRANSIT DETAIL</>
                      )}
                    </h2>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                      {modalView === 'starred' 
                        ? '已标记为重要关注的采购订单' 
                        : modalView === 'warning'
                        ? '临近或已超过协议交期的在途到期订单'
                        : '未完全入库且有执行进度的在途大账'}
                    </p>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowDrawerConfig(!showDrawerConfig)}
                    className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 text-[10px] uppercase font-bold ${
                      showDrawerConfig 
                        ? 'bg-blue-50 border-blue-200 text-blue-600' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                    title="显示与布局设置"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>显示与布局</span>
                  </button>
                  <button 
                    onClick={() => { setModalView('none'); setSelectedPOId(null); }}
                    className="p-1 px-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-transparent"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Drawer Config Panel */}
              {showDrawerConfig && (
                <div className="bg-white p-4 border-b border-slate-200 shadow-inner space-y-4 animate-in slide-in-from-top-2 duration-150">
                  {/* Columns Settings */}
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5 font-mono">每行显示数量 / COLS</span>
                    <div className="flex bg-slate-100 p-1 rounded-lg w-max">
                      <button
                        onClick={() => setDrawerCols(1)}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${
                          drawerCols === 1 ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        单列 (一列)
                      </button>
                      <button
                        onClick={() => setDrawerCols(2)}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${
                          drawerCols === 2 ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        双列 (二列并排)
                      </button>
                    </div>
                  </div>

                  {/* Fields Settings */}
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 block mb-1.5 font-mono">自定义展示字段 / FIELDS</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <label className="flex items-center gap-1.5 hover:bg-slate-55 rounded cursor-pointer text-[11px] font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={drawerFields.supplier}
                          onChange={(e) => setDrawerFields(prev => ({ ...prev, supplier: e.target.checked }))}
                          className="w-3.5 h-3.5 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                        />
                        供应商 VEN
                      </label>
                      <label className="flex items-center gap-1.5 hover:bg-slate-55 rounded cursor-pointer text-[11px] font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={drawerFields.status}
                          onChange={(e) => setDrawerFields(prev => ({ ...prev, status: e.target.checked }))}
                          className="w-3.5 h-3.5 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                        />
                        单据状态 STATUS
                      </label>
                      <label className="flex items-center gap-1.5 hover:bg-slate-55 rounded cursor-pointer text-[11px] font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={drawerFields.dates}
                          onChange={(e) => setDrawerFields(prev => ({ ...prev, dates: e.target.checked }))}
                          className="w-3.5 h-3.5 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                        />
                        协议交期 TIME
                      </label>
                      <label className="flex items-center gap-1.5 hover:bg-slate-55 rounded cursor-pointer text-[11px] font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={drawerFields.items}
                          onChange={(e) => setDrawerFields(prev => ({ ...prev, items: e.target.checked }))}
                          className="w-3.5 h-3.5 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                        />
                        物料条目 ITEMS
                      </label>
                      <label className="flex items-center gap-1.5 hover:bg-slate-55 rounded cursor-pointer text-[11px] font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={drawerFields.amount}
                          onChange={(e) => setDrawerFields(prev => ({ ...prev, amount: e.target.checked }))}
                          className="w-3.5 h-3.5 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                        />
                        订单总金额 AMNT
                      </label>
                      <label className="flex items-center gap-1.5 hover:bg-slate-55 rounded cursor-pointer text-[11px] font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={drawerFields.progress}
                          onChange={(e) => setDrawerFields(prev => ({ ...prev, progress: e.target.checked }))}
                          className="w-3.5 h-3.5 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                        />
                        入库与履约 PROGRESS
                      </label>
                    </div>
                  </div>

                  {/* 物料行字段配置（与采购单台账抽屉共享 localStorage） */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 block font-mono">
                        物料行展示字段 / ITEM FIELDS
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setItemFields({ ...DEFAULT_ITEM_FIELDS })}
                          className="px-2 py-0.5 text-[9px] font-bold rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                        >
                          重置默认
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setItemFields(prev => {
                              const next = { ...prev };
                              for (const key of Object.keys(next) as ItemFieldKey[]) next[key] = true;
                              return next;
                            })
                          }
                          className="px-2 py-0.5 text-[9px] font-bold rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                        >
                          全选
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(Object.keys(ITEM_FIELD_LABELS) as ItemFieldKey[]).map(key => (
                        <label key={key} className="flex items-center gap-1.5 rounded cursor-pointer text-[11px] font-bold text-slate-600">
                          <input
                            type="checkbox"
                            checked={itemFields[key]}
                            onChange={event => setItemFields(prev => ({ ...prev, [key]: event.target.checked }))}
                            className="w-3.5 h-3.5 text-[#2563EB] rounded border-slate-300 focus:ring-[#2563EB]"
                          />
                          {ITEM_FIELD_LABELS[key]}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-4 content-start">
                {selectedPOId !== null ? (
                  // Single PO detailed view inside drawer
                  (() => {
                    const selectedPO = purchaseOrders.find(po => po.id === selectedPOId);
                    if (!selectedPO) {
                      return (
                        <div className="text-center py-16 text-slate-400 font-mono text-xs border-2 border-dashed border-slate-200 bg-white rounded-xl">
                          未找到该订单的详细信息 / INFO NOT FOUND
                        </div>
                      );
                    }
                    const totalPOAmount = selectedPO.items.reduce((sum, item) => sum + (item.orderedQty * item.price), 0);
                    return (
                      <div className="space-y-6 animate-in fade-in duration-200">
                        {/* Meta Grid displaying fields according to columns selected */}
                        <div className={`grid gap-4 ${drawerCols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {drawerFields.supplier && (
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block mb-1">
                                供应商 / SUPPLIER
                              </span>
                              <span className="text-xs font-bold text-slate-700 font-sans flex items-center gap-1.5 mt-1">
                                <Briefcase className="w-4 h-4 text-[#2563EB] shrink-0" />
                                <span className="truncate" title={selectedPO.supplier}>{selectedPO.supplier}</span>
                              </span>
                            </div>
                          )}

                          {drawerFields.status && (
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block mb-1">
                                单据与执行状态 / STATUS
                              </span>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                                  selectedPO.status === '已审核' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-[#B45309] border border-amber-200'
                                }`}>
                                  {selectedPO.status}
                                </span>
                                <span className="text-[10px] bg-slate-100 text-slate-650 px-2 py-0.5 rounded font-bold border border-slate-200 font-mono">
                                  {selectedPO.executionStatus}
                                </span>
                              </div>
                            </div>
                          )}

                          {drawerFields.dates && (
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                              <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block mb-2">
                                周期节点信息 / MILESTONES
                              </span>
                              <div className="space-y-1.5 text-[11px] font-mono text-slate-605 font-medium">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-slate-400 font-sans text-[10px]">下单日期:</span>
                                  <span className="text-slate-800 font-bold flex items-center gap-1">
                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                    {selectedPO.date}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-slate-400 font-sans text-[10px]">交期承诺:</span>
                                  <span className="text-slate-800 font-bold flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    {selectedPO.deliveryDate}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {drawerFields.amount && (
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block mb-1">
                                采购明细总价 / TOTAL BUDGET
                              </span>
                              <div className="mt-1">
                                <span className="text-[16px] font-mono font-bold text-emerald-600">
                                  ¥{totalPOAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          )}

                          {drawerFields.progress && (
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block mb-1.5 font-sans">
                                入库执行进度 / INBOUND PROGRESS
                              </span>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                                  <span>{selectedPO.inboundStatus}</span>
                                  <span className="font-mono text-[#2563EB]">
                                    {selectedPO.inboundStatus === '全部入库' ? '100%' : selectedPO.inboundStatus === '部分入库' ? '50%' : '0%'}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden bg-opacity-70">
                                  <div 
                                    className="bg-[#2563EB] h-2 transition-all duration-300"
                                    style={{
                                      width: selectedPO.inboundStatus === '全部入库' ? '100%' : selectedPO.inboundStatus === '部分入库' ? '50%' : '0%'
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* List of items inside this PO */}
                        {drawerFields.items && selectedPO.items && selectedPO.items.length > 0 && (
                          <div className="space-y-3 mt-4">
                            <div className="border-b border-slate-200 pb-1.5">
                              <h3 className="text-xs font-bold text-slate-700 font-sans uppercase tracking-wider">
                                订作物料明细清单 / PO ITEMS ({selectedPO.items.length})
                              </h3>
                            </div>
                            
                            <div className={`grid gap-3 ${drawerCols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                              {selectedPO.items.map((item, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                  <div>
                                    <div className="flex items-start justify-between gap-1 border-b border-slate-105 pb-2 mb-2">
                                      <div className="min-w-0">
                                        <span className="font-bold text-slate-800 text-xs block truncate" title={item.name}>
                                          {item.name}
                                        </span>
                                        <span className="text-[10px] font-mono text-slate-400 block truncate" title={item.spec}>
                                          规格: {item.spec}
                                        </span>
                                      </div>
                                      <span className="text-[9px] bg-slate-100 text-slate-500 font-mono px-1.5 py-0.5 rounded font-bold shrink-0">
                                        #{idx + 1}
                                      </span>
                                    </div>

                                    {activeItemFieldKeys.length === 0 ? (
                                      <p className="text-[10px] text-slate-400 font-mono">在「显示与布局 → 物料行展示字段」勾选要显示的字段</p>
                                    ) : (
                                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono text-slate-500">
                                        {activeItemFieldKeys.map(key => {
                                          const display = formatItemFieldValue(item, key);
                                          if (display === null) return null;
                                          return (
                                            <div key={key} className="flex items-baseline justify-between gap-2 min-w-0">
                                              <span className="text-slate-400 font-sans text-[9px] shrink-0">{ITEM_FIELD_LABELS[key]}</span>
                                              <strong className="text-slate-700 truncate text-right" title={display}>{display}</strong>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Anchor redirect box */}
                        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between gap-3 items-center bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300 mt-4">
                          <div className="text-left">
                            <h4 className="text-[11px] font-bold text-slate-700">在主台账中编辑管理？</h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">点击右侧按钮跳转到专用管理面板，可直接修改、删除或进行采购入库流程。</p>
                          </div>
                          <button 
                            onClick={() => {
                              setModalView('none');
                              setSelectedPOId(null);
                              onNavigateToPOS(selectedPO.id);
                            }}
                            className="px-3.5 py-1.5 text-[11px] font-bold bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all font-mono whitespace-nowrap shrink-0"
                          >
                            前往管理台账 →
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  // Lists of matching POs in drawer
                  <div className={`grid gap-4 ${drawerCols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {purchaseOrders
                      .filter(po => {
                        if (modalView === 'starred') {
                          return starredIds.has(po.id);
                        } else if (modalView === 'warning') {
                          if (po.inboundStatus === '全部入库') return false;
                          const diffDays = Math.round((new Date(po.deliveryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                          return diffDays <= 7;
                        } else {
                          return po.executionStatus !== '未执行' && po.inboundStatus !== '全部入库';
                        }
                      })
                      .map(po => {
                        const totalPOAmount = po.items.reduce((sum, item) => sum + (item.orderedQty * item.price), 0);
                        return (
                          <div 
                            key={po.id} 
                            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between cursor-pointer hover:border-[#2563EB] hover:shadow-md transition-all duration-155" 
                            onClick={() => { setSelectedPOId(po.id); }}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono font-bold text-slate-800 text-[11px] hover:underline">{po.id}</span>
                                  {drawerFields.status && (
                                    <span className={`text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                      po.status === '已审核' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-[#B45309] border border-amber-200'
                                    }`}>
                                      {po.status}
                                    </span>
                                  )}
                                </div>
                                {drawerFields.amount && (
                                  <div className="text-right">
                                    <span className="text-[11px] font-mono font-bold text-emerald-600">
                                      ¥{totalPOAmount.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {(drawerFields.supplier || drawerFields.dates) && (
                                <div className="space-y-1 text-[10px] text-slate-500 font-mono mb-2">
                                  {drawerFields.supplier && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-400">VEN:</span>
                                      <span className="text-slate-705 truncate max-w-[170px]" title={po.supplier}>{po.supplier}</span>
                                    </div>
                                  )}
                                  {drawerFields.dates && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-400">DUE:</span>
                                      <span className="text-slate-705">{po.deliveryDate}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {drawerFields.items && po.items.length > 0 && (
                                <div className="border border-slate-100 rounded-lg bg-slate-50/50 divide-y divide-slate-100 mb-2 overflow-hidden">
                                  {po.items.map((item, idx) => (
                                    <div key={idx} className="py-1.5 px-2 text-[10px]">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex flex-col flex-1 min-w-0 pr-2">
                                          <span className="font-semibold text-slate-700 truncate">{item.name}</span>
                                          <span className="text-[9px] font-mono text-slate-400 truncate">{item.spec}</span>
                                        </div>
                                        <div className="font-bold text-slate-600 font-mono shrink-0">
                                          {item.orderedQty} <span className="font-normal font-sans text-slate-400">{item.unit}</span>
                                        </div>
                                      </div>
                                      {activeItemFieldKeys.length > 0 && (
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-[9px] font-mono text-slate-500">
                                          {activeItemFieldKeys
                                            .filter(key => key !== 'orderedQty')
                                            .map(key => {
                                              const display = formatItemFieldValue(item, key);
                                              if (display === null) return null;
                                              return (
                                                <div key={key} className="flex items-baseline justify-between gap-2 min-w-0">
                                                  <span className="text-slate-400 font-sans text-[9px] shrink-0">{ITEM_FIELD_LABELS[key]}</span>
                                                  <strong className="text-slate-700 truncate text-right" title={display}>{display}</strong>
                                                </div>
                                              );
                                            })}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {drawerFields.progress && (
                              <div className="pt-2 border-t border-slate-100 mt-2 flex items-center justify-between gap-1 text-[10px]">
                                <span className="text-slate-400">履约 / PROGRESS:</span>
                                <span className="font-bold text-[#2563EB] font-mono">{po.inboundStatus}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}

                {selectedPOId === null && purchaseOrders.filter(po => {
                  if (modalView === 'starred') {
                    return starredIds.has(po.id);
                  } else if (modalView === 'warning') {
                    if (po.inboundStatus === '全部入库') return false;
                    const diffDays = Math.round((new Date(po.deliveryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    return diffDays <= 7;
                  } else {
                    return po.executionStatus !== '未执行' && po.inboundStatus !== '全部入库';
                  }
                }).length === 0 && (
                  <div className="text-center py-16 text-slate-400 font-mono text-xs border-2 border-dashed border-slate-250 bg-white rounded-xl">
                    列表中没有对应的单据记录
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
                <button
                  onClick={() => { setModalView('none'); setSelectedPOId(null); }}
                  className="px-4 py-2 font-mono text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                >
                  关闭页面
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
