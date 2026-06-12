import assert from 'node:assert/strict';
import { PurchaseOrder } from '../types';
import { buildDashboardMetrics } from './dashboardMetrics';

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
  165,
  'total amount should use net purchase amount after rate discount and order discount amount',
);
assert.deepEqual(
  discountedMetrics.supplierSpend,
  [{ name: '供应商A', value: 165 }],
  'supplier ranking should use the same net amount as the dashboard total',
);
assert.deepEqual(
  discountedMetrics.categorySpend,
  [
    { name: '原材料', value: 82.5 },
    { name: '包装物', value: 82.5 },
  ],
  'category spend should distribute order-level discounts proportionally to material lines',
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
    { name: '其他', value: 75 },
    { name: '3D亮片', value: 10 },
  ],
  'dashboard should keep real 商品类别 values and only fold spec/department-like polluted values into 其他',
);
