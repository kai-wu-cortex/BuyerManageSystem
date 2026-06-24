# Supplier Purchase Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable supplier comparison module to the procurement dashboard with purchase amount and quantity month-over-month and year-over-year comparisons.

**Architecture:** Keep period math in `src/utils/dashboardMetrics.ts` as pure functions covered by tests. Keep `src/components/Dashboard.tsx` responsible for UI state, module placement, controls, and chart rendering only.

**Tech Stack:** React 19, TypeScript, Recharts, existing dashboard localStorage settings, existing `PurchaseOrder` data model.

## Global Constraints

- Add dashboard module id `supplierComparison`.
- Default placement: after `kpis`, before `trend`.
- Default width: 2 columns.
- Use existing dashboard data filters for all supplier comparison calculations.
- Metrics: purchase amount, purchase quantity, unique purchase order count, material line count.
- MoM compares selected month against previous calendar month.
- YoY compares selected month against the same calendar month in the previous year.
- If comparison value is 0 or missing, mark comparison unavailable and display `无可比数据`.
- No new runtime dependencies.

---

### Task 1: Supplier Comparison Calculation Helpers

**Files:**
- Modify: `src/utils/dashboardMetrics.ts`
- Modify: `src/utils/dashboardMetrics.test.ts`

**Interfaces:**
- Consumes: `PurchaseOrder`, `DashboardDataFilters`, existing line filtering behavior in `dashboardMetrics.ts`.
- Produces:
  - `SupplierComparisonPeriodMetric`
  - `SupplierComparisonPeriodSummary`
  - `SupplierComparisonResult`
  - `buildSupplierComparison(purchaseOrders: PurchaseOrder[], options?: SupplierComparisonOptions): SupplierComparisonResult`

- [ ] **Step 1: Write failing tests**

Add this import in `src/utils/dashboardMetrics.test.ts`:

```ts
import {
  buildDashboardMetrics,
  buildLedgerBreakdown,
  buildSupplierComparison,
  DEFAULT_DASHBOARD_DATA_FILTERS,
  sanitizeDashboardDataFilters,
} from './dashboardMetrics';
```

Add focused fixtures and assertions near the end of the file before the final `console.log`:

```ts
const supplierComparisonOrders = [
  po({
    id: 'SC-A-2025-06',
    date: '2025-06-12',
    supplier: '供应商A',
    items: [
      { code: 'A-OLD', name: '去年同月', spec: '', category: '原材料', unit: 'PCS', orderedQty: 4, price: 50, taxAmount: 0, remark: '', receivedQty: 0 },
    ],
  }),
  po({
    id: 'SC-A-2026-05',
    date: '2026-05-08',
    supplier: '供应商A',
    items: [
      { code: 'A-PREV', name: '上月', spec: '', category: '原材料', unit: 'PCS', orderedQty: 5, price: 40, taxAmount: 0, remark: '', receivedQty: 0 },
    ],
  }),
  po({
    id: 'SC-A-2026-06-1',
    date: '2026-06-02',
    supplier: '供应商A',
    items: [
      { code: 'A-CUR-1', name: '本月1', spec: '', category: '原材料', unit: 'PCS', orderedQty: 6, price: 50, taxAmount: 0, remark: '', receivedQty: 0 },
      { code: 'A-CUR-2', name: '本月2', spec: '', category: '原材料', unit: 'PCS', orderedQty: 4, price: 25, taxAmount: 0, remark: '', receivedQty: 0 },
      { code: 'A-GIFT', name: '赠品', spec: '', category: '原材料', unit: 'PCS', orderedQty: 100, price: 1, taxAmount: 0, remark: '赠品', receivedQty: 0 },
    ],
  }),
  po({
    id: 'SC-A-2026-06-2',
    date: '2026-06-18',
    supplier: '供应商A',
    items: [
      { code: 'A-CUR-3', name: '本月3', spec: '', category: '包装物', unit: 'PCS', orderedQty: 2, price: 100, taxAmount: 0, remark: '', receivedQty: 0 },
    ],
  }),
  po({
    id: 'SC-B-2026-06',
    date: '2026-06-05',
    supplier: '供应商B',
    items: [
      { code: 'B-CUR', name: '供应商B', spec: '', category: '原材料', unit: 'PCS', orderedQty: 20, price: 50, taxAmount: 0, remark: '', receivedQty: 0 },
    ],
  }),
];

const supplierComparison = buildSupplierComparison(supplierComparisonOrders, {
  supplier: '供应商A',
  month: '2026-06',
});

assert.equal(supplierComparison.selectedSupplier, '供应商A');
assert.equal(supplierComparison.selectedMonth, '2026-06');
assert.deepEqual(supplierComparison.supplierOptions.map(option => option.name), ['供应商B', '供应商A']);
assert.deepEqual(supplierComparison.monthOptions, ['2026-06', '2026-05', '2025-06']);
assert.deepEqual(
  {
    amount: supplierComparison.current.amount,
    quantity: supplierComparison.current.quantity,
    orderCount: supplierComparison.current.orderCount,
    lineCount: supplierComparison.current.lineCount,
  },
  { amount: 600, quantity: 12, orderCount: 2, lineCount: 3 },
  'current supplier month should summarize amount, quantity, unique order count, and included line count',
);
assert.equal(supplierComparison.mom.amount.available, true);
assert.equal(supplierComparison.mom.amount.previousValue, 200);
assert.equal(supplierComparison.mom.amount.delta, 400);
assert.equal(supplierComparison.mom.amount.percentChange, 200);
assert.equal(supplierComparison.mom.quantity.previousValue, 5);
assert.equal(supplierComparison.mom.quantity.percentChange, 140);
assert.equal(supplierComparison.yoy.amount.previousValue, 200);
assert.equal(supplierComparison.yoy.amount.percentChange, 200);
assert.deepEqual(
  supplierComparison.series.map(point => ({ month: point.month, amount: point.amount, quantity: point.quantity })),
  [
    { month: '2025-06', amount: 200, quantity: 4 },
    { month: '2026-05', amount: 200, quantity: 5 },
    { month: '2026-06', amount: 600, quantity: 12 },
  ],
  'series should include selected supplier monthly amount and quantity in chronological order',
);

const missingComparison = buildSupplierComparison(supplierComparisonOrders, {
  supplier: '供应商B',
  month: '2026-06',
});
assert.equal(missingComparison.mom.amount.available, false);
assert.equal(missingComparison.yoy.quantity.available, false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/utils/dashboardMetrics.test.ts`

Expected: FAIL because `buildSupplierComparison` is not exported.

- [ ] **Step 3: Implement calculation types and helper**

Add these exported types and helper in `src/utils/dashboardMetrics.ts` after `BuildDashboardMetricsOptions`:

```ts
export interface SupplierComparisonOptions {
  supplier?: string;
  month?: string;
  filters?: DashboardDataFilters;
  seriesLimit?: number;
}

export interface SupplierComparisonSupplierOption {
  name: string;
  amount: number;
}

export interface SupplierComparisonPeriodSummary {
  amount: number;
  quantity: number;
  orderCount: number;
  lineCount: number;
}

export interface SupplierComparisonPeriodMetric {
  currentValue: number;
  previousValue: number;
  delta: number;
  percentChange: number | null;
  direction: 'up' | 'down' | 'flat';
  available: boolean;
}

export interface SupplierComparisonPoint extends SupplierComparisonPeriodSummary {
  month: string;
}

export interface SupplierComparisonResult {
  supplierOptions: SupplierComparisonSupplierOption[];
  monthOptions: string[];
  selectedSupplier: string | null;
  selectedMonth: string | null;
  previousMonth: string | null;
  previousYearMonth: string | null;
  current: SupplierComparisonPeriodSummary;
  mom: {
    amount: SupplierComparisonPeriodMetric;
    quantity: SupplierComparisonPeriodMetric;
  };
  yoy: {
    amount: SupplierComparisonPeriodMetric;
    quantity: SupplierComparisonPeriodMetric;
  };
  series: SupplierComparisonPoint[];
}
```

Add the implementation below existing helper functions:

```ts
const EMPTY_SUPPLIER_COMPARISON_SUMMARY: SupplierComparisonPeriodSummary = {
  amount: 0,
  quantity: 0,
  orderCount: 0,
  lineCount: 0,
};

function addMonths(month: string, delta: number): string | null {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) return null;
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function createComparisonMetric(currentValue: number, previousValue: number): SupplierComparisonPeriodMetric {
  const current = roundCurrency(currentValue);
  const previous = roundCurrency(previousValue);
  const delta = roundCurrency(current - previous);
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  if (previous <= 0) {
    return { currentValue: current, previousValue: previous, delta, percentChange: null, direction, available: false };
  }
  return {
    currentValue: current,
    previousValue: previous,
    delta,
    percentChange: Math.round((delta / previous) * 10000) / 100,
    direction,
    available: true,
  };
}
```

Add exported `buildSupplierComparison`:

```ts
export function buildSupplierComparison(
  purchaseOrders: PurchaseOrder[],
  options: SupplierComparisonOptions = {},
): SupplierComparisonResult {
  const filters = options.filters ?? DEFAULT_DASHBOARD_DATA_FILTERS;
  const seriesLimit = options.seriesLimit ?? 12;
  const bySupplierMonth = new Map<string, Map<string, SupplierComparisonPeriodSummary & { orderIds: Set<string> }>>();
  const supplierAmounts = new Map<string, number>();
  const months = new Set<string>();

  const ensureSummary = (supplier: string, month: string) => {
    let supplierMap = bySupplierMonth.get(supplier);
    if (!supplierMap) {
      supplierMap = new Map();
      bySupplierMonth.set(supplier, supplierMap);
    }
    let summary = supplierMap.get(month);
    if (!summary) {
      summary = { amount: 0, quantity: 0, orderCount: 0, lineCount: 0, orderIds: new Set<string>() };
      supplierMap.set(month, summary);
    }
    return summary;
  };

  for (const po of purchaseOrders) {
    if (filters.ignoreVoidedOrders && isOrderVoided(po)) continue;
    if (filters.ignoreOtherMonth && isOtherMonthOrder(po)) continue;
    const supplier = String(po.supplier || '').trim() || '未知供应商';
    if (filters.ignoreEmptySupplier && supplier === '未知供应商') continue;
    const month = getOrderMonth(po);
    if (month === '其他') continue;

    for (const item of po.items) {
      if (isLineExcluded(item, po.remarks, filters)) continue;
      const category = String(item.category || '').trim();
      if (filters.ignoreEmptyCategory && !category) continue;
      const amount = getLineGrossAmount(item.orderedQty, item.price);
      const quantity = Math.max(0, toFiniteNumber(item.orderedQty));
      if (amount <= 0 || quantity <= 0) continue;

      const summary = ensureSummary(supplier, month);
      summary.amount += amount;
      summary.quantity += quantity;
      summary.lineCount += 1;
      summary.orderIds.add(po.id);
      supplierAmounts.set(supplier, (supplierAmounts.get(supplier) ?? 0) + amount);
      months.add(month);
    }
  }

  for (const supplierMap of bySupplierMonth.values()) {
    for (const summary of supplierMap.values()) {
      summary.orderCount = summary.orderIds.size;
      summary.amount = roundCurrency(summary.amount);
      summary.quantity = roundCurrency(summary.quantity);
    }
  }

  const supplierOptions = Array.from(supplierAmounts.entries())
    .map(([name, amount]) => ({ name, amount: roundCurrency(amount) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const monthOptions = Array.from(months).sort((a, b) => b.localeCompare(a));
  const selectedSupplier = supplierOptions.some(option => option.name === options.supplier)
    ? options.supplier!
    : supplierOptions[0]?.name ?? null;
  const selectedMonth = monthOptions.includes(options.month ?? '')
    ? options.month!
    : monthOptions[0] ?? null;
  const previousMonth = selectedMonth ? addMonths(selectedMonth, -1) : null;
  const previousYearMonth = selectedMonth ? addMonths(selectedMonth, -12) : null;

  const supplierMap = selectedSupplier ? bySupplierMonth.get(selectedSupplier) : undefined;
  const getSummary = (month: string | null): SupplierComparisonPeriodSummary => {
    if (!month) return { ...EMPTY_SUPPLIER_COMPARISON_SUMMARY };
    const summary = supplierMap?.get(month);
    if (!summary) return { ...EMPTY_SUPPLIER_COMPARISON_SUMMARY };
    return {
      amount: roundCurrency(summary.amount),
      quantity: roundCurrency(summary.quantity),
      orderCount: summary.orderCount,
      lineCount: summary.lineCount,
    };
  };

  const current = getSummary(selectedMonth);
  const momBase = getSummary(previousMonth);
  const yoyBase = getSummary(previousYearMonth);
  const series = selectedSupplier && supplierMap
    ? Array.from(supplierMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-seriesLimit)
      .map(([month, summary]) => ({
        month,
        amount: roundCurrency(summary.amount),
        quantity: roundCurrency(summary.quantity),
        orderCount: summary.orderCount,
        lineCount: summary.lineCount,
      }))
    : [];

  return {
    supplierOptions,
    monthOptions,
    selectedSupplier,
    selectedMonth,
    previousMonth,
    previousYearMonth,
    current,
    mom: {
      amount: createComparisonMetric(current.amount, momBase.amount),
      quantity: createComparisonMetric(current.quantity, momBase.quantity),
    },
    yoy: {
      amount: createComparisonMetric(current.amount, yoyBase.amount),
      quantity: createComparisonMetric(current.quantity, yoyBase.quantity),
    },
    series,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/utils/dashboardMetrics.test.ts`

Expected: PASS with `dashboard metrics tests passed`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/dashboardMetrics.ts src/utils/dashboardMetrics.test.ts
git commit -m "feat: add supplier comparison metrics"
```

---

### Task 2: Dashboard Supplier Comparison Module

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Test: `src/utils/dashboardMetrics.test.ts` from Task 1 remains the behavioral safety net.

**Interfaces:**
- Consumes: `buildSupplierComparison(...)` from Task 1.
- Produces: visible dashboard module `supplierComparison` with supplier and month selectors.

- [ ] **Step 1: Import new helper and types**

Update the `src/components/Dashboard.tsx` import from `../utils/dashboardMetrics`:

```ts
import {
  buildDashboardMetrics,
  buildLedgerBreakdown,
  buildSupplierComparison,
  DEFAULT_DASHBOARD_DATA_FILTERS,
  sanitizeDashboardDataFilters,
  type DashboardDataFilters,
  type LedgerBreakdownField,
  type LedgerBreakdownMetric,
  type SupplierComparisonPeriodMetric,
} from '../utils/dashboardMetrics';
```

- [ ] **Step 2: Register the module**

Change `DEFAULT_MODULE_ORDER`:

```ts
const DEFAULT_MODULE_ORDER = [
  'kpis',
  'supplierComparison',
  'trend',
  'supplier',
  'category',
  'gantt',
  'warnings'
];
```

Change `DEFAULT_MODULE_WIDTHS`:

```ts
const DEFAULT_MODULE_WIDTHS: DashboardViewSettings['moduleWidths'] = {
  kpis: 3,
  supplierComparison: 2,
  trend: 2,
  supplier: 1,
  category: 1,
  gantt: 2,
  warnings: 3,
  custom: 1
};
```

- [ ] **Step 3: Add state and derived comparison data**

Add state after the existing dashboard metrics destructuring:

```ts
const [selectedComparisonSupplier, setSelectedComparisonSupplier] = useState('');
const [selectedComparisonMonth, setSelectedComparisonMonth] = useState('');
const supplierComparison = useMemo(
  () => buildSupplierComparison(purchaseOrders, {
    supplier: selectedComparisonSupplier || undefined,
    month: selectedComparisonMonth || undefined,
    filters: dataFilters,
  }),
  [purchaseOrders, selectedComparisonSupplier, selectedComparisonMonth, dataFilters],
);

useEffect(() => {
  if (supplierComparison.selectedSupplier && supplierComparison.selectedSupplier !== selectedComparisonSupplier) {
    setSelectedComparisonSupplier(supplierComparison.selectedSupplier);
  }
}, [supplierComparison.selectedSupplier, selectedComparisonSupplier]);

useEffect(() => {
  if (supplierComparison.selectedMonth && supplierComparison.selectedMonth !== selectedComparisonMonth) {
    setSelectedComparisonMonth(supplierComparison.selectedMonth);
  }
}, [supplierComparison.selectedMonth, selectedComparisonMonth]);
```

- [ ] **Step 4: Add formatting helpers inside the component**

Add these functions before `renderAnalysisChart`:

```tsx
const formatComparisonNumber = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

const formatComparisonAmount = (value: number) => `¥${value.toLocaleString('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const renderDeltaBadge = (metric: SupplierComparisonPeriodMetric) => {
  if (!metric.available || metric.percentChange === null) {
    return <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">无可比数据</span>;
  }
  const colorClass = metric.direction === 'up'
    ? 'bg-emerald-50 text-emerald-700'
    : metric.direction === 'down'
      ? 'bg-rose-50 text-rose-700'
      : 'bg-slate-100 text-slate-600';
  const prefix = metric.direction === 'up' ? '+' : '';
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${colorClass}`}>
      {prefix}{metric.percentChange.toFixed(2)}%
    </span>
  );
};
```

- [ ] **Step 5: Add `renderSupplierComparisonModule`**

Add this function before `modulesMap`:

```tsx
const renderSupplierComparisonModule = () => {
  if (supplierComparison.supplierOptions.length === 0) {
    return (
      <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm h-full pointer-events-auto">
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
          当前过滤条件下暂无供应商数据
        </div>
      </div>
    );
  }

  const statCards = [
    { label: '本月采购金额', value: formatComparisonAmount(supplierComparison.current.amount) },
    { label: '本月采购数量', value: formatComparisonNumber(supplierComparison.current.quantity) },
    { label: '订单数', value: `${supplierComparison.current.orderCount} 笔` },
    { label: '物料行', value: `${supplierComparison.current.lineCount} 行` },
  ];

  return (
    <div className="bg-white p-5 border border-slate-200 rounded-xl shadow-sm h-full space-y-4 pointer-events-auto">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-0.5 min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-tight text-slate-850">供应商采购对比</h3>
          <p className="text-[10px] font-mono text-slate-500 uppercase">采购金额 / 采购数量 环比与同比</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-w-[360px]">
          <select
            value={supplierComparison.selectedSupplier ?? ''}
            onChange={event => setSelectedComparisonSupplier(event.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700"
          >
            {supplierComparison.supplierOptions.map(option => (
              <option key={option.name} value={option.name}>{option.name}</option>
            ))}
          </select>
          <select
            value={supplierComparison.selectedMonth ?? ''}
            onChange={event => setSelectedComparisonMonth(event.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700"
          >
            {supplierComparison.monthOptions.map(month => (
              <option key={month} value={month}>{month}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(card => (
          <div key={card.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">{card.label}</p>
            <p className="mt-1 truncate font-mono text-base font-black text-slate-800">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {[
          { title: '环比上月', amount: supplierComparison.mom.amount, quantity: supplierComparison.mom.quantity },
          { title: '同比去年', amount: supplierComparison.yoy.amount, quantity: supplierComparison.yoy.quantity },
        ].map(group => (
          <div key={group.title} className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs font-black text-slate-700">{group.title}</p>
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">采购金额</span>
                {renderDeltaBadge(group.amount)}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">采购数量</span>
                {renderDeltaBadge(group.quantity)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="h-64 w-full">
        {supplierComparison.series.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
            暂无采购数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <LineChart data={supplierComparison.series} margin={{ top: 8, right: 20, left: 0, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis yAxisId="amount" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#2563EB' }} width={76} tickFormatter={(val) => `¥${(Number(val) / 10000).toFixed(1)}w`} />
              <YAxis yAxisId="quantity" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#F97316' }} width={48} />
              <RechartsTooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                formatter={(value: number, name: string) => name === 'amount' ? [formatComparisonAmount(value), '采购金额'] : [formatComparisonNumber(value), '采购数量']}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} formatter={(value) => value === 'amount' ? '采购金额' : '采购数量'} />
              <Line yAxisId="amount" type="monotone" dataKey="amount" stroke="#2563EB" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line yAxisId="quantity" type="monotone" dataKey="quantity" stroke="#F97316" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 6: Register in `modulesMap`**

Add the entry after `kpis`:

```tsx
'supplierComparison': {
  colSpan: 'col-span-1 lg:col-span-2 xl:col-span-2 transition-transform duration-300',
  content: renderSupplierComparisonModule()
},
```

- [ ] **Step 7: Run targeted validation**

Run:

```bash
npx tsx src/utils/dashboardMetrics.test.ts
npm run lint
npm run build
```

Expected:

- Dashboard metrics test passes.
- TypeScript passes.
- Production build passes.

- [ ] **Step 8: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: add supplier purchase comparison module"
```
