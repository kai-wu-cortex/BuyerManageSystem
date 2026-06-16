import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Search, Briefcase, Package, Calendar, Star, X } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PurchaseOrder } from '../types';

interface SupplierSummaryAppProps {
  purchaseOrders: PurchaseOrder[];
}

/** 价格趋势中的一个数据点（来自一笔非赠品订单行）。 */
interface PricePoint {
  date: string;       // YYYY-MM-DD
  price: number;      // 单价
  qty: number;        // 数量
  orderId: string;    // 单据编号
  remark: string;     // 行备注
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
  /** 该物料的所有非赠品价格历史（按日期升序） */
  priceHistory: PricePoint[];
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

/**
 * 判断当前 OrderItem 是否是赠品。
 *
 * 系统里目前没有显式的"赠品"字段，所以只靠现有字段里的文字标志识别：
 * - item.remark / item.category / po.remarks 里包含"赠品" / "赠送" / "赠"
 *
 * 如果某行没有任何这类标志，**不会**被当作赠品（即按用户要求"如果字段
 * 中没有赠品字段，则忽略，不要修改"，保持现有聚合行为）。
 */
function isGiftItem(
  item: PurchaseOrder['items'][number],
  poRemarks: string,
): boolean {
  const haystacks = [
    typeof item.remark === 'string' ? item.remark : '',
    typeof item.category === 'string' ? item.category : '',
    typeof poRemarks === 'string' ? poRemarks : '',
  ].join(' ');
  return /赠品|赠送|^赠|\s赠/.test(haystacks);
}

function aggregateSuppliers(orders: PurchaseOrder[]): SupplierSummary[] {
  const map = new Map<string, {
    orders: PurchaseOrder[];
    materialMap: Map<string, MaterialQuote & {
      _priceSamples: { price: number; qty: number; date: string }[];
      // 用于判定"该物料是否曾出现过非赠品行"——若全是赠品，价格统计退化为 0
      _hasNonGiftSample: boolean;
    }>;
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
      const itemPrice = Number(item.price) || 0;
      const isGift = isGiftItem(item, po.remarks);
      let mat = bucket.materialMap.get(key);
      if (!mat) {
        mat = {
          code: item.code,
          name: item.name,
          spec: item.spec,
          unit: item.unit,
          // 首次出现就是赠品时，价格初始化为 0；后续有非赠品行会覆盖
          lastPrice: isGift ? 0 : itemPrice,
          minPrice: isGift ? Number.POSITIVE_INFINITY : itemPrice,
          maxPrice: isGift ? 0 : itemPrice,
          avgPrice: isGift ? 0 : itemPrice,
          totalQty: 0,
          orderCount: 0,
          lastDate: po.date,
          priceHistory: [],
          _priceSamples: [],
          _hasNonGiftSample: !isGift,
        };
        bucket.materialMap.set(key, mat);
      }
      // 累计数量与订单数：赠品也算（用户能看到出现次数）
      mat.totalQty += Number(item.orderedQty) || 0;
      mat.orderCount += 1;

      if (!isGift) {
        // 仅非赠品参与价格统计（最低价 / 最近单价的绿色高亮基于 minPrice）
        mat._hasNonGiftSample = true;
        mat.minPrice = Math.min(mat.minPrice, itemPrice);
        mat.maxPrice = Math.max(mat.maxPrice, itemPrice);
        if (po.date.localeCompare(mat.lastDate) >= 0) {
          mat.lastDate = po.date;
          mat.lastPrice = itemPrice;
        }
        mat._priceSamples.push({ price: itemPrice, qty: Number(item.orderedQty) || 0, date: po.date });
        mat.priceHistory.push({
          date: po.date,
          price: itemPrice,
          qty: Number(item.orderedQty) || 0,
          orderId: po.id,
          remark: typeof item.remark === 'string' ? item.remark : '',
        });
      } else {
        // 赠品行只更新最近日期（不更新 lastPrice），让"最近日期"列仍能反映用户最近一次拿到这个物料
        if (po.date.localeCompare(mat.lastDate) >= 0) {
          mat.lastDate = po.date;
        }
      }
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
        totalAmount += (Number(item.orderedQty) || 0) * (Number(item.price) || 0);
        totalQty += Number(item.orderedQty) || 0;
      }
      if (!earliestDate || po.date.localeCompare(earliestDate) < 0) earliestDate = po.date;
      if (!latestDate || po.date.localeCompare(latestDate) > 0) latestDate = po.date;
    }

    const materials: MaterialQuote[] = [];
    for (const mat of bucket.materialMap.values()) {
      const totalWeighted = mat._priceSamples.reduce((sum, s) => sum + s.price * s.qty, 0);
      const totalWeight = mat._priceSamples.reduce((sum, s) => sum + s.qty, 0);
      mat.avgPrice = totalWeight > 0 ? totalWeighted / totalWeight : mat.lastPrice;
      // 极端情况：该物料从未有过非赠品行 → minPrice 仍是 Infinity，归零展示
      if (!mat._hasNonGiftSample) {
        mat.minPrice = 0;
        mat.lastPrice = 0;
        mat.maxPrice = 0;
        mat.avgPrice = 0;
      }
      // 价格历史按日期升序排序，方便折线图直接渲染
      mat.priceHistory.sort((a, b) => a.date.localeCompare(b.date));
      const { _priceSamples, _hasNonGiftSample, ...clean } = mat;
      void _priceSamples;
      void _hasNonGiftSample;
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

/**
 * 股票折线风格的迷你价格走势图（纯 SVG，无 recharts，无 ResizeObserver）。
 *
 * 性能要点：
 * - 直接生成 path，零依赖 → 单个组件渲染成本 ~50× 低于 recharts AreaChart
 * - React.memo + 引用稳定的 history 数组（aggregator 只生成一次）确保不会无谓重渲
 * - IntersectionObserver 仅在进入视窗 100px 内时才挂载真实 SVG，
 *   屏幕外行只占位等价的 div，列表 1000+ 行滚动不卡
 *
 * 涨红跌绿（A 股配色）：history 首尾价比较决定整体色调。
 */
const PriceSparkline = memo(function PriceSparkline({
  history,
  width = 140,
  height = 36,
}: {
  history: PricePoint[];
  width?: number;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || visible) return;
    // 进入视窗（含 100px 缓冲）后挂载，挂载后立刻 disconnect 避免后续抖动
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
          return;
        }
      }
    }, { rootMargin: '100px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  if (history.length === 0) {
    return <span className="text-[10px] text-slate-300">—</span>;
  }

  // 占位（屏幕外）：保持等高，避免延迟挂载时行高跳动
  if (!visible) {
    return <div ref={containerRef} style={{ width, height }} className="bg-slate-50 rounded" />;
  }

  const isUp = history[history.length - 1].price >= history[0].price;
  const stroke = isUp ? '#dc2626' : '#16a34a';
  const fillId = `spark-${isUp ? 'u' : 'd'}`;

  // 计算折线 path
  const padX = 4;
  const padY = 3;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const prices = history.map(h => h.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const n = history.length;
  // 单点情况：复制成两点画一条横线
  const points = (n === 1 ? [history[0], history[0]] : history).map((h, i, arr) => {
    const x = padX + (arr.length === 1 ? innerW / 2 : (i / (arr.length - 1)) * innerW);
    const y = padY + innerH - ((h.price - minP) / range) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M${points.join(' L')}`;
  const lastX = points[points.length - 1].split(',')[0];
  const baseY = (padY + innerH).toFixed(1);
  const firstX = points[0].split(',')[0];
  const areaPath = `${linePath} L${lastX},${baseY} L${firstX},${baseY} Z`;
  const lastPoint = points[points.length - 1].split(',');

  return (
    <div ref={containerRef} style={{ width, height }} className="pointer-events-none">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${fillId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastPoint[0]} cy={lastPoint[1]} r={1.8} fill={stroke} />
      </svg>
    </div>
  );
});

/**
 * 价格趋势详情抽屉（点击折线图触发）。
 * 顶部大图 + 涨跌摘要，下部时间倒序订单列表。
 */
function PriceTrendDrawer({ supplier, material, onClose }: {
  supplier: string;
  material: MaterialQuote;
  onClose: () => void;
}) {
  const history = material.priceHistory;
  const first = history[0]?.price ?? 0;
  const last = history.at(-1)?.price ?? 0;
  const change = last - first;
  const changePct = first > 0 ? (change / first) * 100 : 0;
  const isUp = change >= 0;
  const stroke = isUp ? '#dc2626' : '#16a34a';
  const sortedDesc = [...history].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
              <Briefcase className="h-3 w-3" /> {supplier}
            </div>
            <h2 className="mt-1 truncate text-base font-bold text-slate-900" title={material.name}>{material.name}</h2>
            <p className="mt-0.5 truncate text-[11px] font-mono text-slate-500" title={`${material.code} · ${material.spec}`}>
              {material.code} · {material.spec} · {material.unit}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        {/* 摘要数字 */}
        <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-center">
          <div>
            <p className="text-[10px] text-slate-400">最新</p>
            <p className="font-mono text-base font-bold text-slate-800">¥{last.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">区间涨跌</p>
            <p className="font-mono text-base font-bold" style={{ color: stroke }}>
              {isUp ? '+' : ''}{change.toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(1)}%)
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">最低 / 最高</p>
            <p className="font-mono text-xs font-bold text-slate-700">
              <span className="text-emerald-600">¥{material.minPrice.toFixed(2)}</span>
              <span className="px-1 text-slate-300">|</span>
              <span className="text-rose-600">¥{material.maxPrice.toFixed(2)}</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">订单次数</p>
            <p className="font-mono text-base font-bold text-slate-800">{material.orderCount}</p>
          </div>
        </div>

        {/* 大图 */}
        <div className="border-b border-slate-200 bg-white px-2 py-3" style={{ height: 240 }}>
          {history.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">该物料暂无非赠品价格历史。</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history.map((h, i) => ({ ...h, idx: i }))} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
                <defs>
                  <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={['dataMin', 'dataMax']} width={48} tickFormatter={v => `¥${Number(v).toFixed(2)}`} />
                <Tooltip
                  formatter={(value: number) => [`¥${Number(value).toFixed(2)}`, '单价']}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as PricePoint | undefined;
                    return p ? `${p.date} · ${p.orderId}` : '';
                  }}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Area type="monotone" dataKey="price" stroke={stroke} strokeWidth={2} fill="url(#trend-fill)" dot={{ r: 3, fill: stroke }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 订单列表 */}
        <div className="flex-1 overflow-auto px-5 py-3">
          <p className="mb-2 text-[10px] font-bold uppercase text-slate-400">订单列表（按日期倒序）</p>
          {sortedDesc.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">暂无订单</p>
          ) : (
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <th className="py-1.5 text-left font-bold">日期</th>
                  <th className="py-1.5 text-left font-bold">单据编号</th>
                  <th className="py-1.5 text-right font-bold">单价</th>
                  <th className="py-1.5 text-right font-bold">数量</th>
                  <th className="py-1.5 text-right font-bold">金额</th>
                  <th className="py-1.5 text-left font-bold">备注</th>
                </tr>
              </thead>
              <tbody>
                {sortedDesc.map((p, idx) => (
                  <tr key={p.orderId + idx} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-1.5 text-slate-600">{p.date}</td>
                    <td className="py-1.5 text-blue-600">{p.orderId}</td>
                    <td className="py-1.5 text-right font-bold text-slate-800">¥{p.price.toFixed(2)}</td>
                    <td className="py-1.5 text-right text-slate-600">{p.qty.toLocaleString()}</td>
                    <td className="py-1.5 text-right text-slate-700">¥{(p.price * p.qty).toFixed(2)}</td>
                    <td className="py-1.5 max-w-[160px] truncate text-slate-500" title={p.remark}>{p.remark || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SupplierSummaryApp({ purchaseOrders }: SupplierSummaryAppProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalAmount');
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [trendTarget, setTrendTarget] = useState<{ supplier: string; material: MaterialQuote } | null>(null);

  const allSummaries = useMemo(() => aggregateSuppliers(purchaseOrders), [purchaseOrders]);

  const filteredSummaries = useMemo(() => {
    const normalize = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      return String(value).toLowerCase().replace(/\s+/g, '');
    };
    const term = normalize(searchTerm);
    if (!term) {
      // 无搜索词：按 sort 排序后返回全部
      return [...allSummaries].sort(sortComparator);
    }

    const result: SupplierSummary[] = [];
    for (const s of allSummaries) {
      const supplierNameHit = normalize(s.name).includes(term);
      // 物料过滤：只保留命中的（除非供应商名命中，则保留所有物料供概览）
      const matchedMaterials = supplierNameHit
        ? s.materials
        : s.materials.filter(m =>
            normalize(m.name).includes(term) ||
            normalize(m.code).includes(term) ||
            normalize(m.spec).includes(term) ||
            normalize(m.unit).includes(term),
          );

      if (supplierNameHit || matchedMaterials.length > 0) {
        result.push({ ...s, materials: matchedMaterials });
      }
    }
    return result.sort(sortComparator);

    function sortComparator(a: SupplierSummary, b: SupplierSummary): number {
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
    }
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

  // 搜索词变化时自动展开所有命中的供应商（一次性写入 state，不再派生屏蔽用户操作）
  useEffect(() => {
    if (!searchTerm.trim()) return;
    setExpandedSuppliers(new Set(filteredSummaries.map(s => s.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

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
            const expanded = expandedSuppliers.has(summary.name);
            return (
              <div
                key={summary.name}
                className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
                /* content-visibility: auto 让浏览器跳过屏幕外卡片的布局/绘制；
                   contain-intrinsic-size 提供占位高度，避免滚动条跳动 */
                style={{
                  contentVisibility: 'auto' as CSSProperties['contentVisibility'],
                  containIntrinsicSize: expandedSuppliers.has(summary.name) ? 'auto 800px' : 'auto 80px',
                }}
              >
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
                              <th className="text-center p-2 font-bold">价格趋势</th>
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
                              const isBestPrice = mat.minPrice > 0 && mat.lastPrice === mat.minPrice && mat.minPrice !== mat.maxPrice;
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
                                  <td className="p-2 align-middle">
                                    <button
                                      type="button"
                                      onClick={() => setTrendTarget({ supplier: summary.name, material: mat })}
                                      className="group inline-flex items-center justify-center rounded hover:bg-slate-50 cursor-pointer disabled:cursor-default disabled:opacity-40"
                                      disabled={mat.priceHistory.length === 0}
                                      title={mat.priceHistory.length === 0 ? '暂无价格历史' : '点击查看价格趋势详情'}
                                    >
                                      <PriceSparkline history={mat.priceHistory} />
                                    </button>
                                  </td>
                                  <td className={`p-2 text-right font-bold ${isBestPrice ? 'text-emerald-600' : 'text-slate-700'}`}>
                                    {isBestPrice && <Star className="inline w-3 h-3 mr-0.5 fill-emerald-500 text-emerald-500" />}
                                    ¥{mat.lastPrice.toFixed(2)}
                                  </td>
                                  <td className="p-2 text-right text-slate-600">¥{mat.avgPrice.toFixed(2)}</td>
                                  <td className="p-2 text-right text-emerald-600">
                                    {mat.minPrice > 0 ? `¥${mat.minPrice.toFixed(2)}` : <span className="text-slate-300">—</span>}
                                  </td>
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

      {/* 价格趋势抽屉 */}
      {trendTarget && (
        <PriceTrendDrawer
          supplier={trendTarget.supplier}
          material={trendTarget.material}
          onClose={() => setTrendTarget(null)}
        />
      )}
    </div>
  );
}
