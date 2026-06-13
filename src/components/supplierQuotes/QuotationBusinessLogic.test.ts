import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(resolve(directory, name), 'utf8');

const app = read('SupplierQuotationApp.tsx');
const archive = read('QuotationArchive.tsx');
const review = read('QuotationReview.tsx');
const profiles = read('SupplierProfiles.tsx');
const groups = read('ProductGroups.tsx');
const comparison = read('QuotationComparison.tsx');
const allPages = [archive, review, profiles, groups, comparison].join('\n');

assert.equal(app.includes('loadQuotationWorkspace'), true, '报价模块外壳应加载统一 MongoDB 工作区');
assert.equal(app.includes('selectedQuotationId'), true, '档案选择应将报价单 ID 传递到审核页面');
assert.equal(allPages.includes('MOCK_'), false, '新版 UI 不应继续使用模拟报价业务数据');
assert.equal(archive.includes('parseQuotationFile'), true, '上传后应解析原始报价文件');
assert.equal(archive.includes('saveQuotationDraft'), true, '上传解析结果应写入报价主表和明细表');
assert.equal(review.includes('confirmQuotationDraft'), true, '审核确认应调用服务端确认接口');
assert.equal(review.includes('saveQuotationDraft'), true, '审核草稿应持久化');
assert.equal(profiles.includes('saveSupplierProfile'), true, '供应商评分和资料应持久化');
assert.equal(groups.includes('saveProductGroup'), true, '标准产品分组应持久化');
assert.equal(groups.includes('saveQuotationItem'), true, '产品匹配结果应更新报价明细');
assert.equal(comparison.includes('normalizedTaxIncludedCnyPrice'), true, '比价矩阵应使用已标准化真实价格');

console.log('quotation business logic integration tests passed');
