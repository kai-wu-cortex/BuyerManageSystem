import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, Briefcase, Package, Calendar, Star } from 'lucide-react';
import { PurchaseOrder } from '../types';

interface SupplierSummaryAppProps {
  purchaseOrders: PurchaseOrder[];
}

interface MaterialQuote {
  code: string;
  name: string;
  spec: string;
  unit: string;
  /** 最近一次的采购单价 */
  lastPrice: number;
  /** 最低价格 */
  minPrice: number;
  /** 最高价格 */
  maxPrice: number;
  /** 平均价格 (按订购量加权) */
  avgPrice: number;
  /** 累计采购数量 */
  totalQty: number;
  /** 出现的订单数 */
  orderCount: number;
  /** 最近一次出现的日期 */
  lastDate: string;
}

interface SupplierSummary {
  name: string;
  orderCount: number;
  totalAmount: number;
  totalQty: number;
  earliestDate: string;
  latestDate: string;
  materials: MaterialQuote[];
}

function aggregateSuppliers(orders: PurchaseOrder[]): SupplierSummary[] {
  const map = new Map<string, {
    orders: PurchaseOrder[];
    materialMap: Map<string, MaterialQuote & { _priceSamples: { price: number; qty: number; date: string }[] }>;
  }>();

  for (const po of orders) {
    const supplier = po.supplier || '(未知供应商)';
    let bucket = map.get(supplier);
    if (!bucket) {
      bucket = { orders: [], materialMap: new Map() };
      map.set(supplier, bucket);
    }
    bucket.orders.push(po);

    for (const item of po.items) {
      const key = item.code || item.name;
      let mat = bucket.materialMap.get(key);
      if (!mat) {
        mat = {
          code: item.code,
          name: item.name,
          spec: item.spec,
          unit: item.unit,
          lastPrice: item.price,
          minPrice: item.price,
          maxPrice: item.price,
          avgPrice: item.price,
          totalQty: 0,
          orderCount: 0,
          lastDate: po.date,
          _priceSamples: [],
        };
        bucket.materialMap.set(key, mat);
      }
      mat.totalQty += item.orderedQty;
      mat.orderCount += 1;
      mat.minPrice = Math.min(mat.minPrice, item.price);
      mat.maxPrice = Math.max(mat.maxPrice, item.price);
      if (po.date.localeCompare(mat.lastDate) >= 0) {
        mat.lastDate = po.date;
        mat.lastPrice = item.price;
      }
      mat._priceSamples.push({ price: item.price, qty: item.orderedQty, date: po.date });
    }
  }

  const result: SupplierSummary[] = [];
  for (const [name, bucket] of map.entries()) {
    let totalAmount = 0;
    let totalQty = 0;
    let earliestDate = bucket.orders[0]?.date ?? '';
    let latestDate = bucket.orders[0]?.date ?? '';
    for (const po of bucket.orders) {
      for (const item of po.items) {
        totalAmount += item.orderedQty * item.price;
        totalQty += item.orderedQty;
      }
      if (!earliestDate || po.date.localeCompare(earliestDate) < 0) earliestDate = po.date;
      if (!latestDate || po.date.localeCompare(latestDate) > 0) latestDate = po.date;
    }

    const materials: MaterialQuote[] = [];
    for (const mat of bucket.materialMap.values()) {
      const totalWeighted = mat._priceSamples.reduce((sum, s) => sum + s.price * s.qty, 0);
      const totalWeight = mat._priceSamples.reduce((sum, s) => sum + s.qty, 0);
      mat.avgPrice = totalWeight > 0 ? totalWeighted / totalWeight : mat.lastPrice;
      const { _priceSamples, ...clean } = mat;
      void _priceSamples;
      materials.push(clean);
    }
    materials.sort((a, b) => b.totalQty - a.totalQty);

    result.push({
      name,
      orderCount: bucket.orders.length,
      totalAmount,
      totalQty,
      earliestDate,
      latestDate,
      materials,
    });
  }

  result.sort((a, b) => b.totalAmount - a.totalAmount);
  return result;
}

type SortField = 'totalAmount' | 'orderCount' | 'materialCount' | 'latestDate';

export default function SupplierSummaryApp({ purchaseOrders }: SupplierSummaryAppProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalAmount');
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  const allSummaries = useMemo(() => aggregateSuppliers(purchaseOrders), [purchaseOrders]);

  const filteredSummaries = useMemo(() => {
    const normalize = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      return String(value).toLowerCase().replace(/\s+/g, '');
    };
    const term = normalize(searchTerm);
    const filtered = !term
      ? allSummaries
      : allSummaries.filter(s => {
          if (normalize(s.name).includes(term)) return true;
          return s.materials.some(m =>
            normalize(m.name).includes(term) ||
            normalize(m.code).includes(term) ||
            normalize(m.spec).includes(term) ||
            normalize(m.unit).includes(term),
          );
        });

    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'orderCount':
          return b.orderCount - a.orderCount;
        case 'materialCount':
          return b.materials.length - a.materials.length;
        case 'latestDate':
          return b.latestDate.localeCompare(a.latestDate);
        case 'totalAmount':
        default:
          return b.totalAmount - a.totalAmount;
      }
    });
  }, [allSummaries, searchTerm, sortField]);

  const toggleExpand = (name: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const expandAll = () => setExpandedSuppliers(new Set(filteredSummaries.map(s => s.name)));
  const collapseAll = () => setExpandedSuppliers(new Set());

  // 当搜索词非空时，自动展开所有匹配到的供应商，方便用户直接看到物料明细
  const effectiveExpandedSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return expandedSuppliers;
    return new Set(filteredSummaries.map(s => s.name));
  }, [searchTerm, expandedSuppliers, filteredSummaries]);

  const totals = useMemo(() => {
    return filteredSummaries.reduce(
      (acc, s) => {
        acc.totalAmount += s.totalAmount;
        acc.totalOrders += s.orderCount;
        acc.totalMaterials += s.materials.length;
        return acc;
      },
      { totalAmount: 0, totalOrders: 0, totalMaterials: 0 },
    );
  }, [filteredSummaries]);

  if (purchaseOrders.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-white rounded-2xl border border-dashed border-slate-200">
        <div className="text-center px-8 py-16">
          <div className="text-5xl mb-4">📊</div>
          <h3 className="text-sm font-bold text-slate-700">尚未加载采购台账</h3>
          <p className="text-xs text-slate-500 mt-2">请先在「采购单台账」中加载 XLSX 台账，本汇总会自动按供应商分组展示</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-lg shadow-md">
            🏭
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 font-sans">供应商汇总</h2>
            <p className="text-[10px] text-slate-400 font-mono">
              共 {filteredSummaries.length} 家供应商 · {totals.totalOrders} 单 · {totals.totalMaterials} 种物料 · ¥
              {totals.totalAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 搜索 */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索供应商 / 物料编码 / 名称"
              className="text-xs bg-transparent outline-none w-48 placeholder:text-slate-400"
            />
          </div>

          {/* 排序 */}
          <select
            value={sortField}
            onChange={e => setSortField(e.target.value as SortField)}
            className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none cursor-pointer"
          >
            <option value="totalAmount">按金额排序</option>
            <option value="orderCount">按单数排序</option>
            <option value="materialCount">按物料种类排序</option>
            <option value="latestDate">按最近交易日排序</option>
          </select>

          <button
            type="button"
            onClick={expandedSuppliers.size === filteredSummaries.length ? collapseAll : expandAll}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            {expandedSuppliers.size === filteredSummaries.length ? '全部收起' : '全部展开'}
          </button>
        </div>
      </div>

      {/* 供应商卡片列表 */}
      <div className="flex-1 overflow-auto space-y-3 pr-1">
        {filteredSummaries.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
            未匹配到任何供应商
          </div>
        ) : (
          filteredSummaries.map(summary => {
            const expanded = effectiveExpandedSuppliers.has(summary.name);
            return (
              <div key={summary.name} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* 供应商头部 */}
                <button
                  type="button"
                  onClick={() => toggleExpand(summary.name)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="shrink-0">
                    {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>
                  <Briefcase className="w-4 h-4 text-blue-600 shrink-0" />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate" title={summary.name}>{summary.name}</p>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[10px] font-mono text-slate-500">
                      <span>{summary.orderCount} 单</span>
                      <span>{summary.materials.length} 种物料</span>
                      <span className="flex items-center gap-0.5">
                        <Calendar className="w-3 h-3" />
                        {summary.earliestDate} ~ {summary.latestDate}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-base font-mono font-bold text-emerald-600">
                      ¥{summary.totalAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">累计采购金额</p>
                  </div>
                </button>

                {/* 物料明细 */}
                {expanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-3">
                    {summary.materials.length === 0 ? (
                      <p className="text-[11px] text-slate-400 text-center py-4">暂无物料明细</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] font-mono">
                          <thead>
                            <tr className="text-slate-500 text-[10px] uppercase border-b border-slate-200">
                              <th className="text-left p-2 font-bold">物料</th>
                              <th className="text-right p-2 font-bold">最近单价</th>
                              <th className="text-right p-2 font-bold">均价</th>
                              <th className="text-right p-2 font-bold">最低价</th>
                              <th className="text-right p-2 font-bold">最高价</th>
                              <th className="text-right p-2 font-bold">累计数量</th>
                              <th className="text-right p-2 font-bold">订单次数</th>
                              <th className="text-right p-2 font-bold">最近日期</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.materials.map(mat => {
                              const isBestPrice = mat.lastPrice === mat.minPrice && mat.minPrice !== mat.maxPrice;
                              return (
                                <tr key={mat.code + '-' + mat.name} className="border-b border-slate-100 hover:bg-white">
                                  <td className="p-2 align-top">
                                    <div className="flex items-start gap-1.5">
                                      <Package className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />
                                      <div className="min-w-0">
                                        <p className="font-bold text-slate-700 truncate" title={mat.name}>{mat.name}</p>
                                        <p className="text-[9px] text-slate-400 truncate" title={`${mat.code} · ${mat.spec}`}>{mat.code} · {mat.spec}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className={`p-2 text-right font-bold ${isBestPrice ? 'text-emerald-600' : 'text-slate-700'}`}>
                                    {isBestPrice && <Star className="inline w-3 h-3 mr-0.5 fill-emerald-500 text-emerald-500" />}
                                    ¥{mat.lastPrice.toFixed(2)}
                                  </td>
                                  <td className="p-2 text-right text-slate-600">¥{mat.avgPrice.toFixed(2)}</td>
                                  <td className="p-2 text-right text-emerald-600">¥{mat.minPrice.toFixed(2)}</td>
                                  <td className="p-2 text-right text-rose-600">¥{mat.maxPrice.toFixed(2)}</td>
                                  <td className="p-2 text-right text-slate-700">
                                    {mat.totalQty.toLocaleString()} <span className="text-slate-400 font-sans">{mat.unit}</span>
                                  </td>
                                  <td className="p-2 text-right text-slate-500">{mat.orderCount}</td>
                                  <td className="p-2 text-right text-slate-500">{mat.lastDate}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
