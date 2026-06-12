import assert from 'node:assert/strict';
import { rowsToLedgerLines } from './ledgerImport';
import { getFlatLedgerRows, parseClipboardLine } from './ledgerHelper';

const rows = [
  [
    '商品类别',
    '单据编号',
    '单据日期',
    '供应商',
    '商品编码',
    '商品名称',
    '规格型号',
    '单位',
    '数量',
    '实际含税单价',
    '税额',
    '单据状态',
    '执行状态',
    '入库状态',
    '交货日期',
  ],
  [
    '亮片',
    'CGDD-TEST-01',
    '2026-06-12',
    '供应商A',
    'MAT-001',
    '圆片实色混色 PET厚片',
    '5MM',
    'KG',
    250,
    30,
    975,
    '已审核',
    '部分执行',
    '部分入库',
    '2026-06-20',
  ],
];

const [line] = rowsToLedgerLines(rows);
const fields = line.split('\t');

assert.equal(fields[14], '亮片', '商品类别 should be read by header name, not fixed column index');
assert.equal(fields[13], '5MM', '规格型号 should stay in spec');
assert.equal(fields[12], '圆片实色混色 PET厚片', '商品名称 should stay in name');

const parsed = parseClipboardLine(line);
assert.equal(parsed?.po.supplier, '供应商A', 'supplier names containing 供应商 should not be treated as headers');
assert.equal(parsed?.item.category, '亮片', 'parsed item category should come from 商品类别');

const emptyFieldRows = [
  [
    '单据编号',
    '单据日期',
    '供应商',
    '商品编码',
    '商品名称',
    '规格型号',
    '商品类别',
    '单位',
    '数量',
    '实际含税单价',
    '税额',
    '单据备注',
    '行执行状态',
    '行入库状态',
    '运输方式',
    '结算方式',
    '交货日期',
  ],
  [
    'CGDD-EMPTY-01',
    '2026-06-12',
    '真实供应商',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
];

const [emptyLine] = rowsToLedgerLines(emptyFieldRows);
const emptyParsed = parseClipboardLine(emptyLine);
assert.equal(emptyParsed?.po.remarks, '', 'empty 单据备注 should stay empty');
assert.equal(emptyParsed?.po.status, '', 'empty 单据状态 should stay empty');
assert.equal(emptyParsed?.po.executionStatus, '', 'empty 执行状态 should stay empty');
assert.equal(emptyParsed?.po.inboundStatus, '', 'empty 入库状态 should stay empty');
assert.equal(emptyParsed?.po.transportMethod, '', 'empty 运输方式 should stay empty');
assert.equal(emptyParsed?.po.settlementType, '', 'empty 结算方式 should stay empty');
assert.equal(emptyParsed?.po.deliveryDate, '', 'empty 交货日期 should stay empty');
assert.equal(emptyParsed?.item.code, '', 'empty 商品编码 should stay empty');
assert.equal(emptyParsed?.item.name, '', 'empty 商品名称 should stay empty');
assert.equal(emptyParsed?.item.spec, '', 'empty 规格型号 should stay empty');
assert.equal(emptyParsed?.item.category, '', 'empty 商品类别 should stay empty');
assert.equal(emptyParsed?.item.unit, '', 'empty 单位 should stay empty');
assert.equal(emptyParsed?.item.orderedQty, '', 'empty 数量 should stay empty');
assert.equal(emptyParsed?.item.price, '', 'empty 实际含税单价 should stay empty');
assert.equal(emptyParsed?.item.taxAmount, '', 'empty 税额 should stay empty');
assert.equal(emptyParsed?.item.rowExecutionStatus, '', 'empty 行执行状态 should stay empty');
assert.equal(emptyParsed?.item.rowInboundStatus, '', 'empty 行入库状态 should stay empty');

const [emptyFlatRow] = getFlatLedgerRows([{
  ...(emptyParsed?.po as any),
  items: [emptyParsed?.item as any],
}]);
assert.equal(emptyFlatRow.price, '', 'flat ledger row should keep empty price empty');
assert.equal(emptyFlatRow.orderedQty, '', 'flat ledger row should keep empty quantity empty');
assert.equal(Number.isNaN(emptyFlatRow.unexecutedQty), false, 'flat ledger row should not produce NaN when quantities are empty');

const legacyLine = 'CGDD-TEST-02\t2026-06-12\t供应商B\t已审核\t未执行\t未入库\t\t0\t0\t未执行\t未入库\tMAT-002\t测试物料\t规格\t包装物\tPCS\t1\t1\t10\t13\t1.3\t\t0\t0\t1\t1\t0\t0\t0\t5\t\t\t\t快递\t月结\t2026-06-20';
assert.deepEqual(rowsToLedgerLines([legacyLine.split('\t')]), [legacyLine], 'rows without a header should preserve legacy fixed-column input');
