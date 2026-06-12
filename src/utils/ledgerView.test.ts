import assert from 'node:assert/strict';
import { getLedgerRowsForView } from './ledgerView';
import { FlatLedgerRow } from './ledgerHelper';

const baseRow: FlatLedgerRow = {
  id: 'PO-001',
  date: '2026-06-01',
  supplier: 'Supplier A',
  status: '已审核',
  executionStatus: '部分执行',
  inboundStatus: '部分入库',
  remarks: '',
  discountRate: 0,
  discountAmount: 0,
  rowExecutionStatus: '部分执行',
  rowInboundStatus: '部分入库',
  code: 'MAT-001',
  name: 'Material 1',
  spec: 'Spec',
  category: 'Category',
  unit: 'PCS',
  orderedQty: 10,
  basicQty: 10,
  price: 2,
  taxRate: 13,
  taxAmount: 2.6,
  remark: '',
  executedBasicQty: 0,
  executedQty: 0,
  unexecutedBasicQty: 10,
  unexecutedQty: 10,
  executedInboundQty: 0,
  executedNotInboundQty: 0,
  executionRate: 0,
  daysRemaining: 5,
  lastInboundDate: '',
  customerName: '',
  sourceOrderId: '',
  transportMethod: '快递',
  settlementType: '月结',
  deliveryDate: '2026-06-10',
};

function row(overrides: Partial<FlatLedgerRow>): FlatLedgerRow {
  return { ...baseRow, ...overrides };
}

const rows = [
  row({ id: 'PO-002', date: '2026-06-02', supplier: 'Supplier B', code: 'MAT-003', name: 'Material 3' }),
  row({ id: 'PO-001', date: '2026-06-01', code: 'MAT-001', name: 'Material 1' }),
  row({ id: 'PO-001', date: '2026-06-01', code: 'MAT-002', name: 'Material 2' }),
  row({ id: 'PO-002', date: '2026-06-02', supplier: 'Supplier B', code: 'MAT-004', name: 'Material 4' }),
];

const poCardRows = getLedgerRowsForView(rows, 'po-card', 'id', 'asc');
assert.deepEqual(
  poCardRows.map(item => item.id),
  ['PO-001', 'PO-002'],
  'PO card view should sort and render one representative row per purchase order',
);

const itemCardRows = getLedgerRowsForView(rows, 'item-card', 'code', 'asc');
assert.deepEqual(
  itemCardRows.map(item => item.code),
  ['MAT-001', 'MAT-002', 'MAT-003', 'MAT-004'],
  'Item card view should keep material rows and sort them normally',
);
