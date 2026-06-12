import { PurchaseOrder, OrderItem, PurchaseExecutionStatus, InboundStatus, POStatus } from '../types';

export interface FlatLedgerRow {
  id: string;                      // 1. 单据编号
  date: string;                    // 2. 单据日期
  supplier: string;                // 3. 供应商
  status: string;                  // 4. 单据状态
  executionStatus: string;         // 5. 执行状态
  inboundStatus: string;           // 6. 入库状态
  remarks: string;                 // 7. 单据备注
  discountRate: number | string;   // 8. 整单折扣率（%）
  discountAmount: number | string; // 9. 整单折扣额
  rowExecutionStatus: string;      // 10. 行执行状态
  rowInboundStatus: string;        // 11. 行入库状态
  code: string;                    // 12. 商品编码
  name: string;                    // 13. 商品名称
  spec: string;                    // 14. 规格型号
  category: string;                // 15. 商品类别
  unit: string;                    // 16. 单位
  orderedQty: number;              // 17. 数量
  basicQty: number;                // 18. 基本数量
  price: number;                   // 19. 实际含税单价
  taxRate: number;                 // 20. 增值税税率（%）
  taxAmount: number;               // 21. 税额
  remark: string;                  // 22. 商品行备注
  executedBasicQty: number;        // 23. 行已执行基本单位数量
  executedQty: number;             // 24. 行已执行数量
  unexecutedBasicQty: number;      // 25. 行未执行基本单位数量
  unexecutedQty: number;           // 26. 行未执行数量
  executedInboundQty: number;      // 27. 已执行已入库数量
  executedNotInboundQty: number;   // 28. 已执行未入库数量
  executionRate: number;           // 29. 执行比例(%)
  daysRemaining: number | string;  // 30. 剩余备货天数
  lastInboundDate: string;         // 31. 最近入库日期
  customerName: string;            // 32. 客户名称
  sourceOrderId: string;           // 33. 源单单号
  transportMethod: string;         // 34. 运输方式
  settlementType: string;          // 35. 结算方式
  deliveryDate: string;            // 36. 交货日期
}

// Current system operating date mock baseline
const SYSTEM_TODAY = "2026-06-03";

function toFiniteNumber(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

/**
 * Computes a list of fully projected flattened line-item rows from all Purchase Orders.
 */
export function getFlatLedgerRows(purchaseOrders: PurchaseOrder[]): FlatLedgerRow[] {
  const result: FlatLedgerRow[] = [];

  purchaseOrders.forEach(po => {
    po.items.forEach(item => {
      const orderedQty = toFiniteNumber(item.orderedQty);
      const receivedQty = toFiniteNumber(item.receivedQty);
      // Determine row execution states dynamically based on delivered progress
      let rowExec: PurchaseExecutionStatus = "未执行";
      if (receivedQty >= orderedQty) {
        rowExec = "全部执行";
      } else if (receivedQty > 0) {
        rowExec = "部分执行";
      }

      let rowInb: InboundStatus = "未入库";
      if (receivedQty >= orderedQty) {
        rowInb = "全部入库";
      } else if (receivedQty > 0) {
        rowInb = "部分入库";
      }

      const basicQuantity = item.basicQty !== undefined ? item.basicQty : item.orderedQty;
      const tRate = item.taxRate !== undefined ? item.taxRate : 13; // 13% standard tax rate
      
      const executedBasic = item.executedBasicQty !== undefined ? item.executedBasicQty : item.receivedQty;
      const executedQuantity = item.executedQty !== undefined ? item.executedQty : item.receivedQty;
      
      const unexecutedQuantity = Math.max(0, orderedQty - receivedQty);
      const unexecutedBasic = Math.max(0, toFiniteNumber(basicQuantity) - toFiniteNumber(executedBasic));
      
      const executedInbound = item.executedInboundQty !== undefined ? item.executedInboundQty : item.receivedQty;
      const executedNotInbound = item.executedNotInboundQty !== undefined ? item.executedNotInboundQty : 0;
      
      const execRateVal = orderedQty > 0 ? Math.round((receivedQty / orderedQty) * 100) : 0;

      // Days remaining logic
      let dRem: number | string = "";
      if (po.deliveryDate) {
        try {
          const dlDate = new Date(po.deliveryDate);
          const cursorDate = new Date(SYSTEM_TODAY);
          const diffTime = dlDate.getTime() - cursorDate.getTime();
          dRem = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } catch {
          dRem = 0;
        }
      }

      result.push({
        id: po.id,
        date: po.date,
        supplier: po.supplier,
        status: po.status,
        executionStatus: po.executionStatus,
        inboundStatus: po.inboundStatus,
        remarks: po.remarks,
        discountRate: po.discountRate !== undefined ? po.discountRate : "",
        discountAmount: po.discountAmount !== undefined ? po.discountAmount : "",
        rowExecutionStatus: item.rowExecutionStatus ?? rowExec,
        rowInboundStatus: item.rowInboundStatus ?? rowInb,
        code: item.code,
        name: item.name,
        spec: item.spec,
        category: item.category,
        unit: item.unit,
        orderedQty: item.orderedQty,
        basicQty: basicQuantity,
        price: item.price,
        taxRate: tRate,
        taxAmount: item.taxAmount,
        remark: item.remark ?? "",
        executedBasicQty: executedBasic,
        executedQty: executedQuantity,
        unexecutedBasicQty: unexecutedBasic,
        unexecutedQty: unexecutedQuantity,
        executedInboundQty: executedInbound,
        executedNotInboundQty: executedNotInbound,
        executionRate: execRateVal,
        daysRemaining: dRem,
        lastInboundDate: item.lastInboundDate ?? item.inboundDate ?? "",
        customerName: item.customerName ?? "",
        sourceOrderId: item.sourceOrderId ?? "",
        transportMethod: po.transportMethod,
        settlementType: po.settlementType,
        deliveryDate: po.deliveryDate
      });
    });
  });

  return result;
}

/**
 * Parses tab-separated line into a set of structured ledger rows
 */
export function parseClipboardLine(line: string): { po: Partial<PurchaseOrder>, item: Partial<OrderItem> } | null {
  const parts = line.split('\t');
  if (parts.length < 3) return null;

  // Header and item positions based on User Specifications:
  // 0: 单据编号, 1: 单据日期, 2: 供应商, 3: 单据状态, 4: 执行状态, 5: 入库状态, 6: 单据备注, 7: 折扣率, 8: 折扣额
  // 9: 行执行状态, 10: 行入库状态, 11: 商品编码, 12: 商品名称, 13: 规格型号, 14: 商品类别, 15: 单位
  // 16: 数量, 17: 基本数量, 18: 实际含税单价, 19: 增值税税率, 20: 税额, 21: 商品行备注, 
  // 22: 行已执行基本单位数量, 23: 行已执行数量, 24: 行未执行基本单位数量, 25: 行未执行数量, 
  // 26: 已执行已入库数量, 27: 已执行未入库数量, 28: 执行比例, 29: 剩余备货天数, 30: 最近入库日期, 
  // 31: 客户名称, 32: 源单单号, 33: 运输方式, 34: 结算方式, 35: 交货日期

  const getValue = (idx: number, fallback: string = "") => parts[idx]?.trim() || fallback;
  const getRawNumValue = (idx: number, fallback: number | '' = 0): number | '' => {
    const raw = getValue(idx);
    if (!raw) return fallback;
    const clean = raw.replace(/,/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? fallback : val;
  };
  const getNumValue = (idx: number, fallback: number = 0): number => {
    const value = getRawNumValue(idx, fallback);
    return typeof value === 'number' ? value : fallback;
  };

  const id = getValue(0);
  const date = getValue(1);
  const supplier = getValue(2);

  if (!id || !date || !supplier) return null;

  // Reject header and title rows
  const idLower = id.toLowerCase();
  const dateStr = date.trim();
  const supplierLower = supplier.toLowerCase();

  const headerSupplierValues = new Set(["供应商", "供应商名称", "vendor", "supplier"]);

  if (
    idLower.includes("单据") || idLower.includes("编号") || idLower.includes("id") || idLower.includes("no") || idLower.includes("序号") || idLower.includes("目录") ||
    dateStr.includes("日期") || dateStr.includes("date") || dateStr.includes("time") ||
    headerSupplierValues.has(supplierLower)
  ) {
    return null;
  }

  // Verify that date is indeed a date format (contains year, e.g., starting with 2 or 1 followed by digits and delimiters)
  const isPossiblyDate = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(dateStr) || /^\d{4}年\d{1,2}月\d{1,2}日/.test(dateStr);
  if (!isPossiblyDate) {
    return null;
  }

  const statusRaw = getValue(3);
  const status = (statusRaw ? (statusRaw.includes("未") ? "未审核" : "已审核") : "") as POStatus;
  
  const execRaw = getValue(4);
  let executionStatus = "" as PurchaseExecutionStatus;
  if (execRaw.includes("全部")) executionStatus = "全部执行";
  else if (execRaw.includes("部分")) executionStatus = "部分执行";
  else if (execRaw) executionStatus = "未执行";

  const inbRaw = getValue(5);
  let inboundStatus = "" as InboundStatus;
  if (inbRaw.includes("全部")) inboundStatus = "全部入库";
  else if (inbRaw.includes("部分")) inboundStatus = "部分入库";
  else if (inbRaw) inboundStatus = "未入库";

  const remarks = getValue(6);
  const discountRate = getNumValue(7, 0);
  const discountAmount = getNumValue(8, 0);

  const rowExecutionStatus = getValue(9) as PurchaseExecutionStatus;
  const rowInboundStatus = getValue(10) as InboundStatus;
  const code = getValue(11);
  const name = getValue(12);
  const spec = getValue(13);
  const category = getValue(14);
  const unit = getValue(15);
  const orderedQty = getRawNumValue(16, '');
  const basicQty = getRawNumValue(17, '');
  const price = getRawNumValue(18, '');
  const taxRate = getRawNumValue(19, '');
  const taxAmount = getRawNumValue(20, '');
  const remark = getValue(21);

  const executedBasicQty = getRawNumValue(22, '');
  const executedQty = getRawNumValue(23, '');
  
  const numericExecutedQty = typeof executedQty === 'number' ? executedQty : 0;
  const unexecutedBasicQty = getRawNumValue(24, '');
  const unexecutedQty = getRawNumValue(25, '');
  
  const executedInboundQty = getRawNumValue(26, '');
  const executedNotInboundQty = getRawNumValue(27, '');
  const executionRate = getRawNumValue(28, '');
  const daysRemaining = getValue(29);
  const lastInboundDate = getValue(30);
  const customerName = getValue(31);
  const sourceOrderId = getValue(32);

  const transportMethod = getValue(33);
  const settlementType = getValue(34);
  const deliveryDate = getValue(35);

  return {
    po: {
      id,
      date,
      supplier,
      status,
      executionStatus,
      inboundStatus,
      discountRate,
      discountAmount,
      transportMethod,
      settlementType,
      deliveryDate,
      remarks
    },
    item: {
      code,
      name,
      spec,
      category,
      unit,
      orderedQty: Number(orderedQty) || 0,
      basicQty: Number(basicQty) || 0,
      price: Number(price) || 0,
      taxRate: Number(taxRate) || 0,
      taxAmount: Number(taxAmount) || 0,
      remark,
      receivedQty: numericExecutedQty,
      rowExecutionStatus,
      rowInboundStatus,
      executedBasicQty: Number(executedBasicQty) || 0,
      executedQty: Number(executedQty) || 0,
      unexecutedBasicQty: Number(unexecutedBasicQty) || 0,
      unexecutedQty: Number(unexecutedQty) || 0,
      executedInboundQty: Number(executedInboundQty) || 0,
      executedNotInboundQty: Number(executedNotInboundQty) || 0,
      executionRate: Number(executionRate) || 0,
      lastInboundDate,
      customerName,
      sourceOrderId
    }
  };
}
