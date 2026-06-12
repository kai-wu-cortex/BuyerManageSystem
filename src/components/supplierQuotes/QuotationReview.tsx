import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  FileText,
  Image,
  Table,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ReviewItem {
  id: string;
  productName: string;
  spec: string;
  unit: string;
  quantity: number | null;
  unitPrice: number;
  currency: string;
  normalizedPrice: number;
  hasIssue: boolean;
  issueMessage?: string;
}

const MOCK_ITEMS: ReviewItem[] = [
  { id: '1', productName: 'Industrial Microcontroller V2', spec: '44-A', unit: 'EA', quantity: 500, unitPrice: 45.0, currency: 'USD', normalizedPrice: 320.66, hasIssue: false },
  { id: '2', productName: 'Sensor Array Module (Standard)', spec: 'Missing', unit: 'SET', quantity: null, unitPrice: 12.5, currency: 'USD', normalizedPrice: 89.05, hasIssue: true, issueMessage: 'Missing data from document' },
  { id: '3', productName: 'Power Supply Unit 500W', spec: 'Standard', unit: 'EA', quantity: 150, unitPrice: 85.2, currency: 'USD', normalizedPrice: 607.01, hasIssue: false },
];

export default function QuotationReview() {
  const [items, setItems] = useState<ReviewItem[]>(MOCK_ITEMS);
  const [supplierName, setSupplierName] = useState('TechCorp Industries Ltd.');
  const [quoteNo, setQuoteNo] = useState('TC-99120-X');
  const [date, setDate] = useState('2023-10-24');
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('7.1245');
  const [taxRate, setTaxRate] = useState('');
  const [confidence] = useState(85);

  const blockingIssues = items.filter(i => i.hasIssue);

  return (
    <div className="flex h-full">
      {/* Left Panel - Original Document */}
      <div className="w-[45%] border-r border-slate-200 bg-white flex flex-col">
        {/* Document Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">ORIGINAL DOCUMENT</span>
            <span className="px-2 py-0.5 bg-slate-100 text-[10px] font-mono text-slate-600 rounded">Q-2023-441.pdf</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
              <ChevronDown className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-500">100%</span>
            <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Document Preview */}
        <div className="flex-1 p-6 overflow-auto bg-slate-50">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 max-w-2xl mx-auto">
            {/* Quotation Header */}
            <div className="mb-6 pb-4 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-2">Official Quotation</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-500">Vendor:</span>
                  <span className="ml-2 font-medium text-slate-700">TechCorp Industries Ltd.</span>
                </div>
                <div>
                  <span className="text-slate-500">Quote Ref:</span>
                  <span className="ml-2 font-medium text-slate-700">TC-99120-X</span>
                </div>
                <div>
                  <span className="text-slate-500">Date:</span>
                  <span className="ml-2 font-medium text-slate-700">2023-10-24</span>
                </div>
                <div>
                  <span className="text-slate-500">Currency:</span>
                  <span className="ml-2 font-medium text-slate-700">USD</span>
                </div>
              </div>
            </div>

            {/* Quotation Table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 text-left font-semibold text-slate-600">Description</th>
                  <th className="py-2 text-right font-semibold text-slate-600">Qty</th>
                  <th className="py-2 text-right font-semibold text-slate-600">Unit Price</th>
                  <th className="py-2 text-right font-semibold text-slate-600">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 bg-amber-50">
                  <td className="py-2 text-slate-700">Industrial Microcontroller V2 (Spec: 44-A)</td>
                  <td className="py-2 text-right text-slate-700">500</td>
                  <td className="py-2 text-right text-slate-700">$45.00</td>
                  <td className="py-2 text-right text-slate-700">$22,500.00</td>
                </tr>
                <tr className="border-b border-slate-100 bg-amber-50">
                  <td className="py-2 text-slate-700">Sensor Array Module (Standard)</td>
                  <td className="py-2 text-right text-slate-700">??</td>
                  <td className="py-2 text-right text-slate-700">$12.50</td>
                  <td className="py-2 text-right text-slate-700">--</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 text-slate-700">Power Supply Unit 500W</td>
                  <td className="py-2 text-right text-slate-700">150</td>
                  <td className="py-2 text-right text-slate-700">$85.20</td>
                  <td className="py-2 text-right text-slate-700">$12,780.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right Panel - Editable Form */}
      <div className="w-[55%] flex flex-col bg-white">
        {/* Review Header */}
        <div className="px-6 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                解析校对页
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded">Audit & Proofing</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">Review extracted data against original document.</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Confidence Bar */}
              <div className="flex items-center gap-3">
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${confidence}%` }} />
                </div>
                <span className="text-xs font-semibold text-slate-700">{confidence}%</span>
                <span className="text-[10px] text-slate-400 uppercase">CONFIDENCE</span>
              </div>
              <button className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors">
                重置<br/>(RESET)
              </button>
            </div>
          </div>
        </div>

        {/* Header Fields */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                供应商 (Supplier Info)
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                报价单号 (Quote No)
              </label>
              <input
                type="text"
                value={quoteNo}
                onChange={(e) => setQuoteNo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                日期 (Date)
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                币种 (Currency)
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              >
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                汇率 (Exchange Rate)
              </label>
              <input
                type="text"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-amber-600 mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                税率 (Tax Rate)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  placeholder="Enter rate..."
                  className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 pr-6"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
              </div>
              <p className="text-[10px] text-amber-600 mt-1">Missing data from document</p>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">明细数据 (Line Items)</h3>
            <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" />
              添加行 (Add Row)
            </button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2 px-2 text-left font-semibold text-slate-500 w-8">#</th>
                <th className="py-2 px-2 text-left font-semibold text-slate-500">产品名称 (Product)</th>
                <th className="py-2 px-2 text-left font-semibold text-slate-500 w-20">规格 (Specs)</th>
                <th className="py-2 px-2 text-left font-semibold text-slate-500 w-16">单位 (Unit)</th>
                <th className="py-2 px-2 text-right font-semibold text-slate-500 w-20">数量 (Qty)</th>
                <th className="py-2 px-2 text-right font-semibold text-slate-500 w-24">单价 (Price)</th>
                <th className="py-2 px-2 text-right font-semibold text-slate-500 w-28">归一价 (Norm)</th>
                <th className="py-2 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} className={`border-b border-slate-100 ${item.hasIssue ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                  <td className="py-2 px-2 text-slate-500">{idx + 1}</td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      {item.hasIssue && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                      <span className="text-slate-700 font-medium">{item.productName}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    {item.hasIssue ? (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded">{item.spec}</span>
                    ) : (
                      <span className="text-slate-600">{item.spec}</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-slate-600">{item.unit}</td>
                  <td className="py-2 px-2 text-right">
                    {item.quantity === null ? (
                      <span className="px-2 py-1 border border-red-300 bg-red-50 text-red-600 text-[10px] font-semibold rounded">?</span>
                    ) : (
                      <span className="text-slate-700">{item.quantity.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-700">${item.unitPrice}</td>
                  <td className="py-2 px-2 text-right font-medium text-slate-800">¥ {item.normalizedPrice.toFixed(2)}</td>
                  <td className="py-2 px-2">
                    <button className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Action Bar */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-red-600 font-medium">
            <AlertTriangle className="w-4 h-4" />
            存在未解决的低置信度数据项或缺失值 ({blockingIssues.length} issues blocking save)
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-white transition-colors">
              稍后完成 (SAVE DRAFT)
            </button>
            <button
              disabled={blockingIssues.length > 0}
              className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              确认并保存 (CONFIRM & SAVE)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
