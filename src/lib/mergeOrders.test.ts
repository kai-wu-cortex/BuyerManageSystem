import assert from 'node:assert/strict';
import { mergePurchaseOrdersById, mergeSampleRecordsById } from '../App';
import type { PurchaseOrder, SampleRecord } from '../types';

function makeOrder(id: string, supplier = 'A', deliveryDate = '2026-06-15'): PurchaseOrder {
  return {
    id,
    date: '2026-06-01',
    supplier,
    status: '已审核',
    executionStatus: '未执行',
    inboundStatus: '未入库',
    discountRate: 0,
    discountAmount: 0,
    transportMethod: '快递',
    settlementType: '月结',
    deliveryDate,
    remarks: '',
    items: [],
  };
}

// ===== 合并采购订单 =====

// 1. 完全新台账（旧空）
{
  const result = mergePurchaseOrdersById([], [makeOrder('CGDD-001'), makeOrder('CGDD-002')]);
  assert.equal(result.merged.length, 2);
  assert.deepEqual(result.stats, { added: 2, updated: 0, retained: 0, unchanged: 0 });
}

// 2. 新台账完全等于旧台账
{
  const old = [makeOrder('CGDD-001'), makeOrder('CGDD-002')];
  const result = mergePurchaseOrdersById(old, old);
  assert.equal(result.merged.length, 2);
  assert.deepEqual(result.stats, { added: 0, updated: 0, retained: 0, unchanged: 2 });
}

// 3. 新台账更新了一条 + 新增一条；旧台账里有一条新台账没出现 → 保留
{
  const old = [makeOrder('CGDD-001', '供应商A'), makeOrder('CGDD-002')];
  const incoming = [
    makeOrder('CGDD-001', '供应商B'), // updated
    makeOrder('CGDD-003'), // added
  ];
  const result = mergePurchaseOrdersById(old, incoming);
  assert.equal(result.merged.length, 3);
  assert.deepEqual(result.stats, { added: 1, updated: 1, retained: 1, unchanged: 0 });
  // 顺序：新台账中的 (001 更新 + 003 新增) 在前，旧台账独有的 (002) 在后
  assert.deepEqual(result.merged.map(po => po.id), ['CGDD-001', 'CGDD-003', 'CGDD-002']);
  assert.equal(result.merged[0].supplier, '供应商B');
  assert.equal(result.merged[2].supplier, 'A'); // 002 保留旧的
}

// 4. 完全无重叠
{
  const old = [makeOrder('CGDD-A')];
  const incoming = [makeOrder('CGDD-B')];
  const result = mergePurchaseOrdersById(old, incoming);
  assert.deepEqual(result.stats, { added: 1, updated: 0, retained: 1, unchanged: 0 });
  assert.deepEqual(result.merged.map(po => po.id), ['CGDD-B', 'CGDD-A']);
}

// ===== 合并样品记录 =====

function makeSample(id: string, status: SampleRecord['status'] = '申请中'): SampleRecord {
  return {
    id,
    name: 'name-' + id,
    spec: '',
    category: '',
    supplier: '',
    requestDate: '2026-06-01',
    status,
    quantity: 1,
    unit: 'KG',
    courierInfo: '',
    assignedTo: '',
    notes: '',
  };
}

{
  const old = [makeSample('SMP-001'), makeSample('SMP-002', '测试中')];
  const incoming = [makeSample('SMP-001'), makeSample('SMP-003')];
  const result = mergeSampleRecordsById(old, incoming);
  assert.equal(result.merged.length, 3);
  assert.deepEqual(result.stats, { added: 1, updated: 0, retained: 1, unchanged: 1 });
  assert.deepEqual(result.merged.map(s => s.id), ['SMP-001', 'SMP-003', 'SMP-002']);
}

console.log('mergePurchaseOrdersById / mergeSampleRecordsById tests passed ✅');
