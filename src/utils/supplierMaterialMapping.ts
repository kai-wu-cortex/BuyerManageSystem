import { OrderItem } from '../types';

export const SUPPLIER_MATERIAL_MAPPING: Record<string, Partial<OrderItem>> = {
  "广东邦固化学科技有限公司": { code: "NHJBHG7501", name: "粘合剂BHG-20KG/件", spec: "20KG/件", category: "包装物", unit: "KG", price: 50.00 },
  "厦门联盛智能包装科技有限公司": { code: "PBQRFID741", name: "沃尔玛RFID", spec: "7.4*1.8CM", category: "标签", unit: "PCS", price: 0.23 },
  "广州市新稀冶金化工有限公司": { code: "HXCXHCGSI", name: "活性超细合成铝", spec: "SHGL-101-4", category: "原材料", unit: "KG", price: 22.50 },
  "深圳祥泰兴包装制品有限公司": { code: "RFHDFZX15", name: "复合袋 仿真雪", spec: "10*15+4CM 7c", category: "袋子", unit: "PCS", price: 0.165 },
  "东莞市凌宇颜料有限公司": { code: "RLY12000400", name: "LY120/110", spec: "100目", category: "珠光粉", unit: "KG", price: 27.00 },
  "致业": { code: "WLSM", name: "拉伸膜", spec: "1000m,五卷", category: "原材料", unit: "卷", price: 24.1667 },
  "东莞市丰彩新材料有限公司": { code: "XSJ102165", name: "102#稀释剂", spec: "1*165", category: "原材料", unit: "KG", price: 8.80 }
};
