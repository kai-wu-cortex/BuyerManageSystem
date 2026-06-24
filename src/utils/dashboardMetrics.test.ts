import assert from 'node:assert/strict';
import { PurchaseOrder } from '../types';
import {
  buildDashboardMetrics,
  buildLedgerBreakdown,
  buildSupplierComparison,
  DEFAULT_DASHBOARD_DATA_FILTERS,
  sanitizeDashboardDataFilters,
} from './dashboardMetrics';

function po(overrides: Partial<PurchaseOrder>): PurchaseOrder {
  return {
    id: 'PO-001',
    date: '2026-06-01',
    supplier: '供应商A',
    status: '已审核',
    executionStatus: '部分执行',
    inboundStatus: '部分入库',
    discountRate: 10,
    discountAmount: 15,
    transportMethod: '快递',
    settlementType: '月结',
    deliveryDate: '2026-06-10',
    remarks: '',
    items: [
      {
        code: 'MAT-1',
        name: '物料1',
        spec: '规格',
        category: '原材料',
        unit: 'PCS',
        orderedQty: 10,
        price: 10,
        taxAmount: 11.5,
        remark: '',
        receivedQty: 0,
      },
      {
        code: 'MAT-2',
        name: '物料2',
        spec: '规格',
        category: '包装物',
        unit: 'PCS',
        orderedQty: 5,
        price: 20,
        taxAmount: 11.5,
        remark: '',
        receivedQty: 0,
      },
    ],
    ...overrides,
  };
}

const discountedMetrics = buildDashboardMetrics([po({})]);

assert.equal(
  discountedMetrics.totalAmount,
  200,
  'total amount should sum every line ordered quantity times actual tax-included unit price',
);
assert.deepEqual(
  discountedMetrics.supplierSpend,
  [{ name: '供应商A', value: 200 }],
  'supplier ranking should use line gross amount without applying order-level discounts',
);
assert.deepEqual(
  discountedMetrics.categorySpend,
  [
    { name: '原材料', value: 100 },
    { name: '包装物', value: 100 },
  ],
  'category spend should group line gross amount by category',
);

const manyCategories = ['亮片', '外调', '垫片', '包装物', '标签', '瓶子', '袋子', '辅料', '玻璃', '运费'];
const manyCategoryOrders = manyCategories.map((category, index) => po({
  id: `PO-${index}`,
  discountRate: 0,
  discountAmount: 0,
  items: [{
    code: `MAT-${index}`,
    name: `物料${index}`,
    spec: '规格',
    category,
    unit: 'PCS',
    orderedQty: 1,
    price: 10 - index,
    taxAmount: 1,
    remark: '',
    receivedQty: 0,
  }],
}));

const limitedMetrics = buildDashboardMetrics(manyCategoryOrders, { categoryLimit: 4 });

assert.deepEqual(
  limitedMetrics.categorySpend.map(item => item.name),
  ['亮片', '外调', '垫片', '包装物', '其他'],
  'category chart should keep top categories and combine the long tail as 其他',
);
assert.equal(
  limitedMetrics.categorySpend.find(item => item.name === '其他')?.value,
  21,
  '其他 should equal the sum of categories outside the limit',
);

const sanitizedMetrics = buildDashboardMetrics([
  po({
    id: 'PO-SANITIZED',
    discountRate: 0,
    discountAmount: 0,
    items: [
      {
        code: 'MAT-A',
        name: '圆片实色混色 PET厚片',
        spec: '5MM',
        category: '亮片',
        unit: 'KG',
        orderedQty: 1,
        price: 100,
        taxAmount: 13,
        remark: '',
        receivedQty: 0,
      },
      {
        code: 'MAT-B',
        name: '错位规格',
        spec: '混规格',
        category: '6MM',
        unit: 'KG',
        orderedQty: 1,
        price: 50,
        taxAmount: 6.5,
        remark: '',
        receivedQty: 0,
      },
      {
        code: 'MAT-C',
        name: '错位部门',
        spec: '1*165',
        category: '烫金事业部',
        unit: 'KG',
        orderedQty: 1,
        price: 25,
        taxAmount: 3.25,
        remark: '',
        receivedQty: 0,
      },
      {
        code: 'MAT-D',
        name: '数字类别',
        spec: '普通规格',
        category: '3D亮片',
        unit: 'KG',
        orderedQty: 1,
        price: 10,
        taxAmount: 1.3,
        remark: '',
        receivedQty: 0,
      },
    ],
  }),
]);

assert.deepEqual(
  sanitizedMetrics.categorySpend,
  [
    { name: '亮片', value: 100 },
    { name: '6MM', value: 50 },
    { name: '烫金事业部', value: 25 },
    { name: '3D亮片', value: 10 },
  ],
  'dashboard should keep imported category values as-is when grouping by 商品类别',
);

const customBreakdownOrders = [
  po({
    id: 'PO-CUSTOM-1',
    supplier: '供应商A',
    items: [
      {
        code: 'MAT-A',
        name: '物料A',
        spec: '规格',
        category: '亮片',
        unit: 'KG',
        orderedQty: 2,
        price: 10,
        taxAmount: 2.6,
        remark: '',
        receivedQty: 0,
      },
      {
        code: 'MAT-B',
        name: '物料B',
        spec: '规格',
        category: '亮片',
        unit: 'KG',
        orderedQty: 3,
        price: 20,
        taxAmount: 7.8,
        remark: '',
        receivedQty: 0,
      },
    ],
  }),
  po({
    id: 'PO-CUSTOM-2',
    supplier: '供应商B',
    items: [
      {
        code: 'MAT-C',
        name: '物料C',
        spec: '规格',
        category: '包装物',
        unit: 'PCS',
        orderedQty: 4,
        price: 5,
        taxAmount: 2.6,
        remark: '',
        receivedQty: 0,
      },
    ],
  }),
];

assert.deepEqual(
  buildLedgerBreakdown(customBreakdownOrders, { groupBy: 'category', metric: 'amount', limit: 5 }),
  [
    { name: '亮片', value: 80 },
    { name: '包装物', value: 20 },
  ],
  'custom breakdown should group by selected ledger field and sum line amount',
);

assert.deepEqual(
  buildLedgerBreakdown(customBreakdownOrders, { groupBy: 'supplier', metric: 'orderCount', limit: 5 }),
  [
    { name: '供应商A', value: 1 },
    { name: '供应商B', value: 1 },
  ],
  'custom breakdown should count unique purchase orders by selected field',
);

// === 数据过滤规则 dataFilters ===

// 1) 默认过滤生效：单价 0 / 数量 0 / 赠品行不计入
const dirtyOrder = po({
  id: 'PO-DIRTY',
  items: [
    { code: 'X1', name: '正常行', spec: '', category: '原材料', unit: 'PCS', orderedQty: 10, price: 100, taxAmount: 0, remark: '', receivedQty: 0 },
    { code: 'X2', name: '价格 0', spec: '', category: '原材料', unit: 'PCS', orderedQty: 10, price: 0, taxAmount: 0, remark: '', receivedQty: 0 },
    { code: 'X3', name: '价格非数字', spec: '', category: '原材料', unit: 'PCS', orderedQty: 10, price: 'abc' as unknown as number, taxAmount: 0, remark: '', receivedQty: 0 },
    { code: 'X4', name: '数量 0', spec: '', category: '原材料', unit: 'PCS', orderedQty: 0, price: 100, taxAmount: 0, remark: '', receivedQty: 0 },
    { code: 'X5', name: '赠品', spec: '', category: '原材料', unit: 'PCS', orderedQty: 5, price: 0, taxAmount: 0, remark: '本批赠品', receivedQty: 0 },
  ],
});
const dirtyMetrics = buildDashboardMetrics([dirtyOrder]);
assert.equal(dirtyMetrics.totalAmount, 1000, '默认过滤后只剩正常行 10*100');
assert.equal(dirtyMetrics.includedLineCount, 1, '只有 1 行计入');
assert.equal(dirtyMetrics.excludedLineCount, 4, '4 行被忽略');

// 2) 关闭赠品过滤后赠品行的金额仍然 0（因 price=0 仍被另一条规则挡掉）
const noGiftFilter = buildDashboardMetrics([dirtyOrder], {
  filters: { ...DEFAULT_DASHBOARD_DATA_FILTERS, ignoreGiftItems: false },
});
assert.equal(noGiftFilter.totalAmount, 1000, '赠品 price=0 仍被价格规则挡掉');

// 3) 全部关闭过滤：脏数据全进，验证 totalAmount 至少包含正常行
const noFilters = buildDashboardMetrics([dirtyOrder], {
  filters: {
    ignoreZeroOrInvalidPrice: false,
    ignoreZeroOrInvalidQuantity: false,
    ignoreGiftItems: false,
    ignoreVoidedOrders: false,
    ignoreEmptySupplier: false,
    ignoreEmptyCategory: false,
    ignoreOtherMonth: false,
  },
});
// price=NaN(*qty)=NaN 会让 getLineGrossAmount 返 0；其他 0 价/0 量都返 0
// 所以 totalAmount 仍只有 1000，但 includedLineCount 应该 = 1（其他都是 0 金额）
assert.equal(noFilters.totalAmount, 1000);

// 4) 作废订单整单跳过
const voidedOrder = po({
  id: 'PO-VOID',
  remarks: '此单已作废',
  items: [
    { code: 'V1', name: '物料', spec: '', category: '原材料', unit: 'PCS', orderedQty: 10, price: 100, taxAmount: 0, remark: '', receivedQty: 0 },
  ],
});
const withVoid = buildDashboardMetrics([dirtyOrder, voidedOrder], {
  filters: { ...DEFAULT_DASHBOARD_DATA_FILTERS, ignoreVoidedOrders: true },
});
assert.equal(withVoid.totalAmount, 1000, '作废订单不计入');
const withoutVoidFilter = buildDashboardMetrics([dirtyOrder, voidedOrder]);
assert.equal(withoutVoidFilter.totalAmount, 2000, '默认不忽略作废，正常行 1000 + 作废订单的正常行 1000');

// 5) 空白供应商整单跳过
const noSupplier = po({
  id: 'PO-NO-VEN', supplier: '   ',
  items: [{ code: 'V1', name: '物料', spec: '', category: '原材料', unit: 'PCS', orderedQty: 10, price: 100, taxAmount: 0, remark: '', receivedQty: 0 }],
});
const withEmptySupplierFilter = buildDashboardMetrics([dirtyOrder, noSupplier], {
  filters: { ...DEFAULT_DASHBOARD_DATA_FILTERS, ignoreEmptySupplier: true },
});
assert.equal(withEmptySupplierFilter.totalAmount, 1000);

// 6) buildLedgerBreakdown 同样使用 filters
const breakdownWithFilters = buildLedgerBreakdown([dirtyOrder], {
  groupBy: 'category', metric: 'amount', limit: 5,
});
assert.deepEqual(breakdownWithFilters, [{ name: '原材料', value: 1000 }], 'breakdown 默认过滤掉脏行');

// 7) 忽略单据月份为“其他”的整单
const otherMonthOrder = po({
  id: 'PO-OTHER-MONTH',
  date: '其他',
  items: [{ code: 'OM', name: '其他月份', spec: '', category: '原材料', unit: 'PCS', orderedQty: 10, price: 100, taxAmount: 0, remark: '', receivedQty: 0 }],
});
const withOtherMonth = buildDashboardMetrics([dirtyOrder, otherMonthOrder]);
assert.equal(withOtherMonth.totalAmount, 2000, '默认不忽略其他月份');
const withoutOtherMonth = buildDashboardMetrics([dirtyOrder, otherMonthOrder], {
  filters: { ...DEFAULT_DASHBOARD_DATA_FILTERS, ignoreOtherMonth: true },
});
assert.equal(withoutOtherMonth.totalAmount, 1000, '开启后其他月份整单不计入');
assert.deepEqual(
  buildLedgerBreakdown([dirtyOrder, otherMonthOrder], { groupBy: 'month', metric: 'amount', filters: { ...DEFAULT_DASHBOARD_DATA_FILTERS, ignoreOtherMonth: true } }),
  [{ name: '2026-06', value: 1000 }],
  'breakdown 同样忽略其他月份',
);

// 8) sanitizeDashboardDataFilters：垃圾输入被规范化
const sanitized = sanitizeDashboardDataFilters({ ignoreZeroOrInvalidPrice: false, foo: 'bar', ignoreGiftItems: 'yes' });
assert.equal(sanitized.ignoreZeroOrInvalidPrice, false, '布尔字段保留');
assert.equal(sanitized.ignoreGiftItems, true, '非布尔回退到默认');
assert.equal(sanitized.ignoreEmptyCategory, false, '缺失字段使用默认值');
assert.equal(sanitized.ignoreOtherMonth, false, '新增的其他月份过滤默认关闭');

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
      { code: 'B-CUR', name: '供应商B', spec: '', category: '原材料', unit: 'PCS', orderedQty: 21, price: 50, taxAmount: 0, remark: '', receivedQty: 0 },
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

console.log('dashboard metrics tests passed');
