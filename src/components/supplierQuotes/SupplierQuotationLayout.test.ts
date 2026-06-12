import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(testDir, 'SupplierQuotationApp.tsx'), 'utf8');

assert.equal(
  source.includes('<aside'),
  false,
  '供应商报价单 App 不应在系统主侧栏内再次渲染侧栏',
);

assert.equal(
  source.includes('bg-[#182329]'),
  false,
  '供应商报价单 App 不应保留独立的深色导航外壳',
);

assert.equal(
  source.includes('role="tablist"'),
  true,
  '供应商报价单功能导航应使用内容区顶部标签列表',
);

assert.equal(
  source.match(/role="tab"/g)?.length,
  1,
  '供应商报价单应通过复用导航数据渲染一组标签按钮',
);

assert.equal(
  source.includes('aria-selected={active}'),
  true,
  '供应商报价单标签应暴露当前选中状态',
);

assert.equal(
  source.includes('<ExcelQuotationPreview'),
  true,
  'Excel 报价原文件应使用应用内表格预览，而不是交给 iframe',
);

console.log('supplier quotation integrated navigation tests passed');
