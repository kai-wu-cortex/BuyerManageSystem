import React, { useState } from 'react';
import {
  Building2,
  Mail,
  Phone,
  User,
  Edit3,
  Download,
  Eye,
  ChevronRight,
  Star,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { getScoreColor, getStatusColor, getStatusLabel, formatCurrency, formatDate } from './quotationUi';

interface SupplierProfile {
  id: string;
  name: string;
  normalizedName: string;
  contact: string;
  email: string;
  phone: string;
  verified: boolean;
  scores: {
    quality: number;
    delivery: number;
    service: number;
    cooperation: number;
  };
  scoreNotes: {
    quality: string;
    delivery: string;
    service: string;
    cooperation: string;
  };
  updatedAt: string;
}

interface QuotationRecord {
  id: string;
  date: string;
  items: string;
  totalAmount: number;
  status: 'active' | 'voided';
}

const MOCK_PROFILE: SupplierProfile = {
  id: 's1',
  name: '深圳市立创电子商务有限公司',
  normalizedName: 'LCSC Electronics Co., Ltd.',
  contact: '张三 (大客户经理)',
  email: 'zhangsan@lcsc.com',
  phone: '+86 138-0000-0000',
  verified: true,
  scores: {
    quality: 92,
    delivery: 85,
    service: 88,
    cooperation: 65,
  },
  scoreNotes: {
    quality: '注: 过去半年退货率低于0.5%，良品率极高，符合A级标准。',
    delivery: '注: 偶有节假日后延期情况，平均延期天数<2天。',
    service: '注: 响应速度快，技术支持团队配合度良好。',
    cooperation: '注: 账期条件苛刻，不接受月结60天以上，需沟通优化。',
  },
  updatedAt: '2023-10-25 14:30',
};

const MOCK_HISTORY: QuotationRecord[] = [
  { id: 'QT-202310-045', date: '2023-10-20', items: 'STM32F103C8T6 × 5000, 贴片电阻...', totalAmount: 45200, status: 'active' },
  { id: 'QT-202309-112', date: '2023-09-15', items: 'ESP32-WROOM-32E × 2000', totalAmount: 18500, status: 'voided' },
  { id: 'QT-202308-088', date: '2023-08-02', items: '各类连接器接插件批次采购', totalAmount: 12350.5, status: 'active' },
];

export default function SupplierProfiles() {
  const [profile] = useState<SupplierProfile>(MOCK_PROFILE);
  const [history] = useState<QuotationRecord[]>(MOCK_HISTORY);

  const scoreDimensions: Array<{ key: keyof typeof profile.scores; label: string; labelEn: string; icon: React.ReactNode }> = [
    { key: 'quality', label: '质量', labelEn: 'Quality', icon: <Star className="w-4 h-4" /> },
    { key: 'delivery', label: '交期', labelEn: 'Delivery', icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'service', label: '服务', labelEn: 'Service', icon: <Phone className="w-4 h-4" /> },
    { key: 'cooperation', label: '合作', labelEn: 'Cooperation', icon: <Building2 className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
        <span className="hover:text-blue-600 cursor-pointer">供应商资料</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slate-800 font-medium">详情: {profile.name}</span>
      </div>

      {/* Supplier Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-slate-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg font-bold text-slate-800">{profile.name}</h1>
                {profile.verified && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded">已认证</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-2">标准化名称: {profile.normalizedName}</p>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {profile.contact}
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {profile.email}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {profile.phone}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors">
              <Edit3 className="w-3.5 h-3.5" />
              编辑基本信息
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors">
              <Download className="w-3.5 h-3.5" />
              导出档案
            </button>
          </div>
        </div>
      </div>

      {/* Scores Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-800">供应商综合评分</h2>
          <span className="text-[10px] text-slate-400">最后更新: {profile.updatedAt}</span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {scoreDimensions.map(({ key, label, labelEn, icon }) => {
            const score = profile.scores[key];
            return (
              <div key={key} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-slate-400">{icon}</span>
                  <span className="text-xs font-semibold text-slate-700">
                    {label} ({labelEn})
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className={`text-3xl font-bold ${getScoreColor(score).replace('bg-', 'text-')}`}>{score}</span>
                  <span className="text-xs text-slate-400">/ 100</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full ${getScoreColor(score)}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {profile.scoreNotes[key]}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">历史报价记录</h3>
          <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">报价单号</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">日期</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">物料明细</th>
              <th className="px-4 py-2.5 text-right font-semibold text-slate-500">总金额</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">状态</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history.map((record) => (
              <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-mono font-semibold text-blue-600">{record.id}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(record.date)}</td>
                <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{record.items}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-800">{formatCurrency(record.totalAmount, 'CNY')}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${getStatusColor(record.status)}`}>
                    {record.status === 'active' ? '已采用' : '未采用'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">共 {history.length} 条记录</span>
          <button className="text-xs font-medium text-blue-600 hover:text-blue-700">查看全部</button>
        </div>
      </div>
    </div>
  );
}
