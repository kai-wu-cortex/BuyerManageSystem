import assert from 'node:assert/strict';
import { rowsToLedgerLines } from './ledgerImport';
import { parseClipboardLine } from './ledgerHelper';

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

const legacyLine = 'CGDD-TEST-02\t2026-06-12\t供应商B\t已审核\t未执行\t未入库\t\t0\t0\t未执行\t未入库\tMAT-002\t测试物料\t规格\t包装物\tPCS\t1\t1\t10\t13\t1.3\t\t0\t0\t1\t1\t0\t0\t0\t5\t\t\t\t快递\t月结\t2026-06-20';
assert.deepEqual(rowsToLedgerLines([legacyLine.split('\t')]), [legacyLine], 'rows without a header should preserve legacy fixed-column input');
