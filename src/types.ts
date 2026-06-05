export interface OrderItem {
  code: string;         // 商品编码
  name: string;         // 商品名称
  spec: string;         // 规格型号
  category: string;     // 商品类别
  unit: string;         // 单位
  orderedQty: number;   // 数量
  basicQty?: number;    // 基本数量
  price: number;        // 实际含税单价
  taxRate?: number;     // 增值税税率（%）
  taxAmount: number;    // 税额
  remark: string;       // 商品行备注
  receivedQty: number;  // 已到货数 (行已执行数量)
  
  // Extended row-level accounting columns requested
  rowExecutionStatus?: PurchaseExecutionStatus; // 行执行状态
  rowInboundStatus?: InboundStatus;             // 行入库状态
  executedBasicQty?: number;                    // 行已执行基本单位数量
  executedQty?: number;                         // 行已执行数量
  unexecutedBasicQty?: number;                  // 行未执行基本单位数量
  unexecutedQty?: number;                       // 行未执行数量
  executedInboundQty?: number;                  // 已执行已入库数量
  executedNotInboundQty?: number;               // 已执行未入库数量
  executionRate?: number;                       // 执行比例(%)
  daysRemaining?: number;                       // 剩余备货天数
  lastInboundDate?: string;                     // 最近入库日期
  customerName?: string;                        // 客户名称
  sourceOrderId?: string;                       // 源单单号
  inboundDate?: string;                         // 实际入库时间
}

export type POStatus = '未审核' | '已审核';
export type PurchaseExecutionStatus = '未执行' | '部分执行' | '全部执行';
export type InboundStatus = '未入库' | '部分入库' | '全部入库';

export interface PurchaseOrder {
  id: string; // 单据编号
  date: string; // 单据日期
  supplier: string; // 供应商
  status: POStatus; // 单据状态
  executionStatus: PurchaseExecutionStatus; // 执行状态
  inboundStatus: InboundStatus; // 入库状态
  discountRate: number; // 整单折扣率（%）
  discountAmount: number; // 整单折扣额
  transportMethod: string; // 运输方式
  settlementType: string; // 结算方式
  deliveryDate: string; // 交货日期
  remarks: string; // 单据备注
  items: OrderItem[];
}

export interface InventoryItem {
  code: string;
  name: string;
  spec: string;
  category: string;
  unit: string;
  currentStock: number;
  safetyStock: number;
  maxStock: number;
  reorderPoint: number;
  supplier: string;
}

export type SampleStatus = '申请中' | '寄送中' | '已收到' | '测试中' | '合格启用' | '不合格退回';

export interface SampleRecord {
  id: string;          // 样品编号
  name: string;        // 样品名称
  spec: string;        // 规格规格
  category: string;    // 类别
  supplier: string;    // 提供供应商
  requestDate: string; // 申领日期
  status: SampleStatus;// 跟踪状态
  quantity: number;    // 数量
  unit: string;        // 单位
  courierInfo: string; // 物流信息
  assignedTo: string;  // 负责跟进人
  notes: string;       // 详细备注
  imgUrl?: string;     // 样品图样 base64 / URL
  imgUrls?: string[];  // 多图支持
  poId?: string;       // 关联订单号
}

export interface SupplierSummary {
  name: string;
  totalOrders: number;
  totalAmount: number;
  onTimeDeliveries: number;
  avgLeadTime: number; // Average days to deliver
}
