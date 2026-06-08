import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PurchaseOrder, InventoryItem, OrderItem, SampleRecord, StickyNote, POStatus, PurchaseExecutionStatus } from './types';
import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { parseClipboardLine } from './utils/ledgerHelper';
import { SUPPLIER_MATERIAL_MAPPING } from './components/POList';
import Dashboard from './components/Dashboard';
import POList from './components/POList';
import SampleTracker from './components/SampleTracker';
import SkeuomorphicNotes from './components/SkeuomorphicNotes';
import { useStarredPOs } from './lib/hooks';
import { 
  BarChart3, 
  BookOpen, 
  Warehouse, 
  PlusCircle, 
  RotateCw, 
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
  Menu,
  X,
  ChevronDown,
  StickyNote as StickyNoteIcon,
  UploadCloud,
  Cloud,
  Download,
  RefreshCw,
  FileJson,
  Loader2
} from 'lucide-react';

// Helper for chunked batch writes to avoid 500 operation limit
const batchWriteDocs = async (
  dbRef: any,
  updates: { ref: any; data?: any; type: 'set' | 'delete' }[]
) => {
  const CHUNK_SIZE = 450;
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const batch = writeBatch(dbRef);
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    for (const op of chunk) {
      if (op.type === 'set') batch.set(op.ref, op.data);
      if (op.type === 'delete') batch.delete(op.ref);
    }
    await batch.commit();
  }
};

export default function App() {
  const { starredIds } = useStarredPOs();
  
  // Navigation tabs: 'dashboard' | 'ledger' | 'inventory' | 'notes'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ledger' | 'inventory' | 'notes'>('dashboard');
  const [targetSearchTerm, setTargetSearchTerm] = useState('');
  const [autoAddNotePOId, setAutoAddNotePOId] = useState<string | null>(null);
  
  const mainScrollRef = useRef<HTMLElement>(null);
  const tabScrollPositions = useRef<Record<string, number>>({});

  const handleTabChange = (newTab: 'dashboard' | 'ledger' | 'inventory' | 'notes') => {
    if (mainScrollRef.current) {
      tabScrollPositions.current[activeTab] = mainScrollRef.current.scrollTop;
    }
    setActiveTab(newTab);
  };

  useEffect(() => {
    if (mainScrollRef.current) {
      // Use setTimeout to ensure DOM has updated before restoring scroll
      setTimeout(() => {
        if (mainScrollRef.current) {
          mainScrollRef.current.scrollTop = tabScrollPositions.current[activeTab] || 0;
        }
      }, 0);
    }
  }, [activeTab]);
  
  // Responsive sidebar menu state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);

  // Procurement Datasets with Firebase Synchronization
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [samples, setSamples] = useState<SampleRecord[]>([]);
  const [notes, setNotes] = useState<Record<string, StickyNote>>({});

  // Time Tracker state
  const [currentTime, setCurrentTime] = useState('');
  
  // Clear Data state
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  // Success toast message
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Historical ledger modal states
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyBackups, setHistoryBackups] = useState<{
    id: string;
    name: string;
    timeCreated: string;
    rawTime: number;
    size: number;
    orders: PurchaseOrder[];
  }[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);

  const cleanUndefined = <T extends any>(obj: T): T => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(cleanUndefined).filter(v => v !== undefined) as unknown as T;
    }
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = cleanUndefined(value);
      }
    }
    return result as T;
  };

  // Initial load & Real-time Firebase Sync
  useEffect(() => {
    // 1. Sync Purchase Orders from localStorage
    const savedPO = localStorage.getItem("purchase_orders");
    if (savedPO) {
      try {
        const parsed = JSON.parse(savedPO) as PurchaseOrder[];
        const sorted = parsed.sort((a, b) => b.date.localeCompare(a.date));
        setPurchaseOrders(sorted);
      } catch (e) {
        console.error("Failed to parse POs from localStorage:", e);
      }
    }

    // 2. Sync Inventory Stock
    const unsubscribeInv = onSnapshot(collection(db, "inventory_stock"), async (snapshot) => {
      if (snapshot.empty) {
        const savedInv = localStorage.getItem("inventory_stock");
        if (savedInv) {
          try {
            const parsed = JSON.parse(savedInv) as InventoryItem[];
            const updates = [];
            for (const item of parsed) {
              updates.push({ ref: doc(db, "inventory_stock", item.code), data: cleanUndefined(item), type: 'set' as const });
            }
            await batchWriteDocs(db, updates);
          } catch (e) {
            console.error("Failed to seed inventory stock to Firebase:", e);
          }
        }
      } else {
        const liveInv: InventoryItem[] = [];
        snapshot.forEach(doc => {
          liveInv.push(doc.data() as InventoryItem);
        });
        setInventory(liveInv);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "inventory_stock");
    });

    // 3. Sync Sample Records
    const unsubscribeSamples = onSnapshot(collection(db, "sample_records"), async (snapshot) => {
      if (snapshot.empty) {
        const savedSamples = localStorage.getItem("sample_records");
        const parsedSamples = savedSamples ? JSON.parse(savedSamples) : [
          {
            id: "SMP-2026-0001",
            name: "稀释剂改进样品",
            spec: "102# 改性型",
            category: "原材料",
            supplier: "东莞市丰彩新材料有限公司",
            requestDate: "2026-05-10",
            status: "合格启用",
            quantity: 2,
            unit: "KG",
            courierInfo: "顺丰速运: SF1428571428",
            assignedTo: "李工",
            notes: "粘度以及干燥速度符合打样标准，已经在3001批次试用。"
          },
          {
            id: "SMP-2026-0002",
            name: "高粘结粘合剂",
            spec: "BHG-7501升级款",
            category: "包装物",
            supplier: "广东邦固化学科技有限公司",
            requestDate: "2026-05-25",
            status: "测试中",
            quantity: 1,
            unit: "KG",
            courierInfo: "中通快递: ZT88992211",
            assignedTo: "王工",
            notes: "正在进行抗剥离强度测试，初步表现良好。"
          }
        ];
        try {
          const updates = [];
          for (const s of parsedSamples) {
            try {
              const size = new Blob([JSON.stringify(s)]).size;
              if (size > 900000) {
                console.warn(`Sample ${s.id} is too large (${size} bytes). Obscuring images to fit inside limits.`);
                delete s.imgUrl;
                delete s.imgUrls;
                s.notes = s.notes + "\n(⚠️由于图片体积超过云端容量限制，历史原图未同步上云，请重新上传压缩图片)";
              }
              updates.push({ ref: doc(db, "sample_records", s.id), data: cleanUndefined(s), type: 'set' as const });
            } catch (err) {
              console.error(`Failed to prepare individual sample ${s.id} to Firebase:`, err);
            }
          }
          await batchWriteDocs(db, updates);
        } catch (e) {
          console.error("Failed to seed samples to Firebase:", e);
        }
      } else {
        const liveSamples: SampleRecord[] = [];
        snapshot.forEach(doc => {
          liveSamples.push(doc.data() as SampleRecord);
        });
        setSamples(liveSamples);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "sample_records");
    });

    // 4. Sync Order Sticky Notes
    const unsubscribeNotes = onSnapshot(collection(db, "order_sticky_notes"), async (snapshot) => {
      if (snapshot.empty) {
        const savedNotes = localStorage.getItem("order_sticky_notes");
        if (savedNotes) {
          try {
            const parsed = JSON.parse(savedNotes) as Record<string, StickyNote>;
            const updates = [];
            for (const poId of Object.keys(parsed)) {
              updates.push({ ref: doc(db, "order_sticky_notes", poId), data: cleanUndefined(parsed[poId]), type: 'set' as const });
            }
            await batchWriteDocs(db, updates);
          } catch (e) {
            console.error("Failed to seed sticky notes to Firebase:", e);
          }
        }
      } else {
        const liveNotes: Record<string, StickyNote> = {};
        snapshot.forEach(doc => {
          liveNotes[doc.id] = doc.data() as StickyNote;
        });
        setNotes(liveNotes);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "order_sticky_notes");
    });

    // Clock tracker
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleString('zh-CN', { hour12: false }) + ' (UTC)');
    };
    updateTime();
    const clockInterval = setInterval(updateTime, 1000);

    return () => {
      unsubscribeInv();
      unsubscribeSamples();
      unsubscribeNotes();
      clearInterval(clockInterval);
    };
  }, []);

  // Sync state values on changes directly to Firebase
  const handleUpdateOrders = (updatedOrders: PurchaseOrder[]) => {
    try {
      localStorage.setItem("purchase_orders", JSON.stringify(updatedOrders));
      setPurchaseOrders(updatedOrders);
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdateInventory = async (updatedInventory: InventoryItem[]) => {
    try {
      const updates = [];
      for (const item of updatedInventory) {
        updates.push({ ref: doc(db, "inventory_stock", item.code), data: cleanUndefined(item), type: 'set' as const });
      }
      const updatedCodes = new Set(updatedInventory.map(i => i.code));
      for (const item of inventory) {
        if (!updatedCodes.has(item.code)) {
          updates.push({ ref: doc(db, "inventory_stock", item.code), type: 'delete' as const });
        }
      }
      await batchWriteDocs(db, updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "inventory_stock");
    }
  };

  const handleUpdateSamples = async (updatedSamples: SampleRecord[]) => {
    try {
      const updates = [];
      for (const s of updatedSamples) {
        const size = new Blob([JSON.stringify(s)]).size;
        if (size > 900000) {
          console.warn(`Sample ${s.id} is too large (${size} bytes). Truncating images to sync.`);
          delete s.imgUrl;
          delete s.imgUrls;
          if (!s.notes.includes("超出限制")) {
            s.notes = s.notes + "\n(⚠️由于图片体积超过云端容量限制，历史原图未同步上云，请重新上传压缩图片)";
          }
        }
        updates.push({ ref: doc(db, "sample_records", s.id), data: cleanUndefined(s), type: 'set' as const });
      }
      const updatedIds = new Set(updatedSamples.map(x => x.id));
      for (const s of samples) {
        if (!updatedIds.has(s.id)) {
          updates.push({ ref: doc(db, "sample_records", s.id), type: 'delete' as const });
        }
      }
      await batchWriteDocs(db, updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "sample_records");
    }
  };

  const handleUpdateNotes = async (updatedNotes: Record<string, StickyNote>) => {
    try {
      const updates = [];
      for (const poId of Object.keys(updatedNotes)) {
        updates.push({ ref: doc(db, "order_sticky_notes", poId), data: cleanUndefined(updatedNotes[poId]), type: 'set' as const });
      }
      const updatedIds = new Set(Object.keys(updatedNotes));
      for (const poId of Object.keys(notes)) {
        if (!updatedIds.has(poId)) {
          updates.push({ ref: doc(db, "order_sticky_notes", poId), type: 'delete' as const });
        }
      }
      await batchWriteDocs(db, updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "order_sticky_notes");
    }
  };

  // Add individual orders
  const handleAddProcessedOrders = (newOrders: PurchaseOrder[]) => {
    const merged = [...newOrders, ...purchaseOrders];
    handleUpdateOrders(merged);

    // Update inventory balance levels if order items were already marked as inbound/completed
    const updatedInventory = [...inventory];
    newOrders.forEach(po => {
      if (po.inboundStatus === '全部入库' || po.inboundStatus === '部分入库') {
        po.items.forEach(item => {
          const matchedIndex = updatedInventory.findIndex(inv => inv.code === item.code);
          if (matchedIndex !== -1) {
            updatedInventory[matchedIndex] = {
              ...updatedInventory[matchedIndex],
              currentStock: Math.min(
                updatedInventory[matchedIndex].maxStock,
                updatedInventory[matchedIndex].currentStock + item.receivedQty
              )
            };
          }
        });
      }
    });
    handleUpdateInventory(updatedInventory);
  };

  // Delete an order
  const handleDeletePO = (id: string) => {
    const filtered = purchaseOrders.filter(po => po.id !== id);
    handleUpdateOrders(filtered);
  };

  // Update single order
  const handleUpdateSinglePO = (updatedPO: PurchaseOrder) => {
    const originalPO = purchaseOrders.find(po => po.id === updatedPO.id);
    const differenceMap: Record<string, number> = {};

    // Calculate inbound item volume diff to adjust stock totals matching exact inbound shifts
    updatedPO.items.forEach(newItem => {
      const oldItem = originalPO?.items.find(i => i.code === newItem.code);
      const oldRec = oldItem?.receivedQty || 0;
      differenceMap[newItem.code] = newItem.receivedQty - oldRec;
    });

    const updatedOrders = purchaseOrders.map(po => po.id === updatedPO.id ? updatedPO : po);
    handleUpdateOrders(updatedOrders);

    // Modify inventory actual levels in stock
    const updatedInventory = inventory.map(item => {
      const diff = differenceMap[item.code] || 0;
      if (diff !== 0) {
        return {
          ...item,
          currentStock: Math.min(item.maxStock, Math.max(0, item.currentStock + diff))
        };
      }
      return item;
    });
    handleUpdateInventory(updatedInventory);
  };

  // Trigger Instant PO Creation preset mapped relative to current out-of-stock items (加急/一键预填)
  const handleGenerateQuickPO = (item: InventoryItem) => {
    const deficit = item.safetyStock - item.currentStock;
    const orderQty = Math.max(deficit, item.reorderPoint);

    // Create unique PO ID
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '').slice(2);
    const poSerial = Math.floor(100 + Math.random() * 900); // 3 digit serial
    const generatedPoId = `CGDD-${todayStr}-${poSerial}`;

    const newPO: PurchaseOrder = {
      id: generatedPoId,
      date: new Date().toISOString().split('T')[0],
      supplier: item.supplier,
      status: "未审核",
      executionStatus: "未执行",
      inboundStatus: "未入库",
      discountRate: 0,
      discountAmount: 0,
      transportMethod: "快递",
      settlementType: "月结",
      deliveryDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 5);
        return d.toISOString().split('T')[0];
      })(),
      remarks: `低于水位线，缺料加急补货自荐单`,
      items: [
        {
          code: item.code,
          name: item.name,
          spec: item.spec,
          category: item.category,
          unit: item.unit,
          orderedQty: orderQty,
          price: 5.00, // proxy default
          taxAmount: Math.round(orderQty * 5.00 * 0.08),
          remark: "智能低水位加急补充采购方案",
          receivedQty: 0
        }
      ]
    };

    // Append and focus
    handleUpdateOrders([newPO, ...purchaseOrders]);
    handleTabChange('ledger');
    alert(`🎉 成功为您依据再订货点，自动编制了全新的在途采购单 ${newPO.id}！\n现在已经在待审核列表中生成，您可以直接修改价格及货期。`);
  };

  const handleClearAllData = async () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      setTimeout(() => setIsConfirmingClear(false), 3000); // reset if not confirmed in 3s
      return;
    }
    
    // Clean all collections from Firestore but leave purchase_orders alone
    try {
      const batchDelete = async (colPath: string) => {
        const querySnapshot = await getDocs(collection(db, colPath));
        const updates = [];
        for (const d of querySnapshot.docs) {
          updates.push({ ref: doc(db, colPath, d.id), type: 'delete' as const });
        }
        await batchWriteDocs(db, updates);
      };
      
      await batchDelete("inventory_stock");
      await batchDelete("sample_records");
      await batchDelete("order_sticky_notes");
    } catch (error) {
      console.error("Failed to clear Firebase collections:", error);
    }

    // Clean all data locally
    localStorage.clear();
    sessionStorage.clear();
    setPurchaseOrders([]);
    setInventory([]);
    setSamples([]);
    setNotes({});
    setIsConfirmingClear(false);
    
    // Force page reload to ensure any other cached state like samples is also fully reset
    window.location.reload();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const backupToFirebase = async (orders: PurchaseOrder[]) => {
    try {
      const now = new Date();
      const readableTimeStr = now.toLocaleString('zh-CN', { hour12: false });
      const rawTime = now.getTime();
      const id = `ledger_backup_${rawTime}`;
      const name = `ledger_backup_${now.toISOString().split('T')[0]}_${now.toTimeString().split(' ')[0].replace(/:/g, '-')}`;
      
      const sizeList = new Blob([JSON.stringify(orders)]).size;
      
      const backupData = {
        id,
        name,
        timeCreated: readableTimeStr,
        rawTime,
        size: sizeList,
        orders
      };

      try {
        await setDoc(doc(db, "ledger_backups", id), cleanUndefined(backupData));
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `ledger_backups/${id}`);
      }
      console.log(`Successfully backed up ledger to Firestore: ${id}`);

      // Auto-delete backups that are older than 5 days in the background
      try {
        const querySnapshot = await getDocs(collection(db, "ledger_backups"));
        const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;
        const nowMs = Date.now();
        querySnapshot.forEach(async (docSnap) => {
          const data = docSnap.data();
          if (data) {
            const bRawTime = data.rawTime || 0;
            const bId = data.id || docSnap.id;
            if (bRawTime > 0 && (nowMs - bRawTime > fiveDaysInMs)) {
              try {
                await deleteDoc(doc(db, "ledger_backups", bId));
                console.log(`Background cleanup: auto-deleted expired backup ${bId}`);
              } catch (deleteErr) {
                console.warn(`Failed to auto-delete expired backup ${bId}:`, deleteErr);
              }
            }
          }
        });
      } catch (cleanupErr) {
        console.warn("Background ledger backup auto-cleanup failed:", cleanupErr);
      }
    } catch (e: any) {
      console.error("Failed to backup ledger to Firebase Firestore:", e);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let parsedOrders: PurchaseOrder[] = [];

      if (extension === 'xlsx') {
        let finalRows: any[][] = [];
        try {
          const workbook = new ExcelJS.Workbook();
          const buffer = await file.arrayBuffer();
          await workbook.xlsx.load(buffer);
          const worksheet = workbook.worksheets[0];
          worksheet.eachRow((row) => {
            // ExcelJS index 0 is empty, so we slice
            const rowValues = (row.values as any[]).slice(1);
            finalRows.push(rowValues);
          });
        } catch (exceljsErr: any) {
          console.warn('ExcelJS parser failed in App.tsx, falling back to SheetJS XLSX:', exceljsErr.message);
          let workbook;
          try {
            const data = await file.arrayBuffer();
            workbook = XLSX.read(data, { type: 'array' });
          } catch (initialErr: any) {
            console.warn('Standard arrayBuffer parse failed in App.tsx. Attempting text-based fallback.', initialErr.message);
            // Fallback for ERP-generated Excel (often XML/HTML disguised as XLSX which fails ZIP inflation)
            const textData = await file.text();
            workbook = XLSX.read(textData, { type: 'string' });
          }

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          finalRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        }

        // Detect and remove header row
        if (finalRows.length > 0) {
          const firstRow = finalRows[0];
          const headerKeywords = [
            '编号', '单据', '日期', '供应商', '状态', '备注', '编码', '名称', '规格', '类别', 
            '单位', '数量', '比例', '天数', '客户', '方式', '交货', 'ID', 'Date', 'Supplier', 
            'Status', 'Qty', 'Price', 'Tax', 'Amount', 'Remark', 'Days', 'Rate', 'No', 'Code'
          ];
          
          let matchCount = 0;
          firstRow.forEach(cell => {
            const text = String(cell || '').trim();
            if (!text) return;
            const isKeyword = headerKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
            if (isKeyword) {
              matchCount++;
            }
          });

          const firstCellText = String(firstRow[0] || '').trim().toLowerCase();
          const firstIsHeader = ['单据', '单号', '编号', '序号', 'id', 'po', 'no', 'code', 'order'].some(k => firstCellText.includes(k));
          
          if (matchCount >= 3 || (firstRow.length >= 1 && firstIsHeader)) {
            finalRows = finalRows.slice(1);
          }
        }

        const lines = finalRows.map(row => row.map(cell => {
          if (cell === null || cell === undefined) return '';
          if (cell instanceof Date) return cell.toISOString().split('T')[0];
          return cell.toString().replace(/\t|\n/g, ' ');
        }).join('\t'));

        // Process lines into purchase orders using the parsed ledger helpers
        const poMap: Record<string, PurchaseOrder> = {};
        lines.forEach((line) => {
          const trimmed = line.trim();
          if (trimmed === '') return;

          if (trimmed.includes("单据编号") || trimmed.includes("单据日期") || trimmed.includes("商品编码") || trimmed.includes("商品名称")) {
            return;
          }

          const parsed = parseClipboardLine(line);
          if (!parsed) {
            const cols = trimmed.split(/[,\t]|\s{2,}/);
            if (cols.length >= 3) {
              const id = cols[0]?.trim();
              const rawDate = cols[1]?.trim();
              const supplier = cols[2]?.trim();
              const isDatePattern = /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(rawDate);
              if (!id || !rawDate || !supplier || !isDatePattern) return;

              const statusRaw = cols[3]?.trim() || "已审核";
              const status: POStatus = statusRaw.includes("未") ? "未审核" : "已审核";
              const execRaw = cols[4]?.trim() || "未执行";
              let executionStatus: PurchaseExecutionStatus = "未执行";
              if (execRaw.includes("全部")) executionStatus = "全部执行";
              else if (execRaw.includes("部分")) executionStatus = "部分执行";

              const typicalMat = SUPPLIER_MATERIAL_MAPPING[supplier] || {
                code: "GENERIC-01", name: "常规系统自配辅料", spec: "标准", category: "辅料", unit: "PCS", price: 5.0
              };

              const expectedDelivery = new Date(rawDate);
              expectedDelivery.setDate(expectedDelivery.getDate() + 5);

              const fallbackItem: OrderItem = {
                code: typicalMat.code || "GENERIC-01", name: typicalMat.name || "常规采购物料", spec: typicalMat.spec || "公制",
                category: typicalMat.category || "原材料", unit: typicalMat.unit || "PCS", orderedQty: 1000, basicQty: 1000,
                price: typicalMat.price || 1.0, taxRate: 13, taxAmount: Math.round(1000 * (typicalMat.price || 1.0) * 0.08),
                receivedQty: executionStatus === '全部执行' ? 1000 : 0, remark: "导入补全",
                inboundDate: executionStatus === '全部执行' ? rawDate : undefined
              };

              const fallbackPO: PurchaseOrder = {
                id, date: rawDate, supplier, status, executionStatus,
                inboundStatus: executionStatus === '全部执行' ? '全部入库' : executionStatus === '部分执行' ? '部分入库' : '未入库',
                discountRate: 0, discountAmount: 0, transportMethod: "快递", settlementType: "月结",
                deliveryDate: expectedDelivery.toISOString().split('T')[0], remarks: "自动导入",
                items: [fallbackItem]
              };

              if (!poMap[id]) poMap[id] = fallbackPO;
              else poMap[id].items.push(fallbackItem);
            }
            return;
          }

          const poId = parsed.po.id!;
          if (!poMap[poId]) {
            poMap[poId] = {
              ...parsed.po,
              executionStatus: parsed.po.executionStatus || "未执行",
              inboundStatus: parsed.po.inboundStatus || "未入库",
              items: [parsed.item as OrderItem]
            } as PurchaseOrder;
          } else {
            poMap[poId].items.push(parsed.item as OrderItem);
          }
        });

        parsedOrders = Object.values(poMap);
      } else {
        // Fallback or import from previous backup files (JSON)
        const text = await file.text();
        try {
          parsedOrders = JSON.parse(text);
        } catch (e) {
          throw new Error("文件格式无法识别，请确保您上传的是标准的 36 列采购合规台账 (XLSX) 文件或备份 JSON 文件。");
        }
      }

      if (Array.isArray(parsedOrders) && parsedOrders.length > 0) {
        // Complete replacement of orders
        handleUpdateOrders(parsedOrders);
        alert(`🎉 成功解析并加载本地台账，共配准了 ${parsedOrders.length} 笔订单！\n即将把当前新台账自动备份至云端 Firestore 数据库...`);
        
        // Save to Firebase Firestore as backup
        await backupToFirebase(parsedOrders);
      } else {
        alert("未能在文件中解析出任何有效的订单账目。请检查列分录是否和标准 36 列采购合规台账兼容。");
      }
    } catch (e: any) {
      console.error(e);
      alert("加载台账失败: " + e.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const loadHistoryBackups = async () => {
    setIsLoadingHistory(true);
    setHistoryLoadError(null);
    try {
      let querySnapshot;
      try {
        querySnapshot = await getDocs(collection(db, "ledger_backups"));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, "ledger_backups");
        throw err;
      }

      const nowMs = Date.now();
      const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;
      const items: any[] = [];
      const expiredDocIds: string[] = [];

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data) {
          const rawTime = data.rawTime || 0;
          const id = data.id || docSnap.id;
          
          if (rawTime > 0 && (nowMs - rawTime > fiveDaysInMs)) {
            expiredDocIds.push(id);
          } else {
            items.push({
              id,
              name: data.name || docSnap.id,
              timeCreated: data.timeCreated || '未知时间',
              rawTime,
              size: data.size || 0,
              orders: data.orders || []
            });
          }
        }
      });

      // Automatically prune expired documents in the database
      if (expiredDocIds.length > 0) {
        console.log(`Auto-deleting ${expiredDocIds.length} expired backups that are older than 5 days...`);
        for (const expId of expiredDocIds) {
          try {
            await deleteDoc(doc(db, "ledger_backups", expId));
          } catch (deleteErr) {
            console.warn(`Failed to delete expired backup ${expId}:`, deleteErr);
          }
        }
      }

      // Sort newest first
      items.sort((a, b) => b.rawTime - a.rawTime);
      setHistoryBackups(items);
    } catch (err: any) {
      console.error("Failed to list historical backups from Firebase Firestore:", err);
      try {
        const parsed = JSON.parse(err.message);
        setHistoryLoadError(parsed.error || err.message);
      } catch {
        setHistoryLoadError(err.message || String(err));
      }
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSelectHistoryBackup = async (backup: typeof historyBackups[0]) => {
    setIsUploading(true);
    try {
      const parsedOrders = backup.orders;
      if (Array.isArray(parsedOrders)) {
        handleUpdateOrders(parsedOrders);
        
        // Show success reminder via animated toast notice
        setSuccessToast(`🎉 成功载入历史台账 [${backup.timeCreated}]，共 ${parsedOrders.length} 笔订单！`);
        
        setIsHistoryModalOpen(false);
        // We do NOT call backupToFirebase(parsedOrders) here to prevent creating duplicate/redundant backup entries in the cloud
      } else {
        alert("台账备份文件格式不正确，期望是一个有效的采购单数组。");
      }
    } catch (err: any) {
      console.error("Failed to load select ledger:", err);
      alert(`无法载入选定的历史台账: ${err.message || String(err)}`);
    } finally {
      setIsUploading(false);
    }
  };

  const applyingSamplesCount = samples.filter(s => s.status === '申请中').length;

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col font-sans text-slate-900 selection:bg-blue-100">
      
      {/* Animated custom Toast feedback */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-6 left-1/2 z-[9999] bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-500/35 max-w-md w-full sm:w-auto"
          >
            <div className="flex items-center justify-center bg-white/20 p-2 rounded-xl shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="text-xs font-bold leading-relaxed flex-1">
              {successToast}
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="hover:bg-white/10 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-[1600px] mx-auto min-h-screen lg:h-screen lg:overflow-hidden flex flex-col lg:flex-row bg-[#F1F5F9]">
        
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Navigation Tab Panel */}
        <aside className={`fixed lg:sticky inset-y-0 left-0 z-40 bg-[#0F172A] text-slate-300 flex flex-col shrink-0 border-r border-[#1e293b]/70 lg:border-none transition-all duration-350 lg:m-4 lg:mr-2 lg:h-[calc(100vh-2rem)] lg:rounded-2xl lg:shadow-2xl lg:sticky lg:top-4 lg:overflow-hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${isSidebarMinimized ? 'lg:w-20' : 'w-64'}`}>
          {/* Brand/Logo Section */}
          <div className="p-6 border-b border-slate-800 bg-[#0b1120] flex items-center justify-between gap-1 overflow-hidden h-24 shrink-0 lg:rounded-t-2xl">
            <div className={`flex flex-col gap-1 ${isSidebarMinimized ? 'items-center w-full' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 shrink-0 rounded-full bg-[#2563EB] ring-4 ring-[#2563EB]/30 animate-pulse"></span>
                {!isSidebarMinimized && (
                  <h1 className="text-xl font-bold tracking-tight text-white uppercase font-sans whitespace-nowrap">
                    NovaSpark
                  </h1>
                )}
              </div>
              {!isSidebarMinimized && (
                <>
                  <p className="text-[10px] text-slate-400 font-semibold italic whitespace-nowrap">点燃你的创意</p>
                  <div className="text-[10px] text-slate-400 mt-1 uppercase font-semibold whitespace-nowrap">
                    采购追踪专业版 v4.2
                  </div>
                </>
              )}
            </div>
            
            {/* Desktop Minimize Toggle */}
            <button 
              onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
              className="hidden lg:flex items-center justify-center w-6 h-6 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              {isSidebarMinimized ? <Menu className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 rotate-90" />}
            </button>
          </div>

          {/* Navigation Items */}
          {!isSidebarMinimized && (
            <div className="px-4 py-3 text-slate-500 font-mono text-[10px] tracking-wider uppercase font-bold whitespace-nowrap overflow-hidden">
              导航菜单
            </div>
          )}
          
          <nav className="p-4 pt-1 space-y-2 flex flex-col overflow-y-auto">
            {[
              { id: 'dashboard', label: '采购物料大屏', icon: <BarChart3 className="w-5 h-5 shrink-0" /> },
              { id: 'ledger', label: '采购单台账', icon: <BookOpen className="w-5 h-5 shrink-0" /> },
              { id: 'inventory', label: '样品获取与打样追踪', icon: <Layers className="w-5 h-5 shrink-0" /> },
              { id: 'notes', label: '订单便签与流转', icon: <StickyNoteIcon className="w-5 h-5 shrink-0" /> }
            ].map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    handleTabChange(tab.id as any);
                    setIsSidebarOpen(false);
                  }}
                  title={isSidebarMinimized ? tab.label : undefined}
                  className={`w-full flex items-center ${isSidebarMinimized ? 'justify-center p-3.5' : 'gap-3 px-4 py-3'} text-xs font-semibold uppercase transition-all duration-200 rounded-xl cursor-pointer shrink-0 ${
                    isActive 
                      ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/25 font-bold scale-[1.01]' 
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <span className={`relative ${isActive ? 'text-white' : 'text-slate-400'}`}>
                    {tab.icon}
                    {tab.id === 'inventory' && applyingSamplesCount > 0 && isSidebarMinimized && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                      </span>
                    )}
                  </span>
                  {!isSidebarMinimized && <span className="whitespace-nowrap">{tab.label}</span>}
                  {!isSidebarMinimized && tab.id === 'inventory' && applyingSamplesCount > 0 && (
                    <span className="ml-auto flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-rose-500 rounded-full h-4 min-w-4 shadow-sm group-hover:scale-105 transition-transform">
                      {applyingSamplesCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right workspace core */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#F8FAFC] lg:m-4 lg:ml-2 lg:h-[calc(100vh-2rem)] lg:rounded-2xl lg:shadow-xl lg:border lg:border-slate-200/80">
          
          {/* Top Header */}
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-4 bg-white border-b border-slate-200 gap-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-lg font-bold tracking-tight text-slate-800">
                  {purchaseOrders.length === 0 ? '系统初始配准与数据流验证' : (
                    <>
                      {activeTab === 'dashboard' && '采购分析与库存态势大屏'}
                      {activeTab === 'ledger' && '采购合规与期账审计台账'}
                      {activeTab === 'inventory' && '新样获取与打样跟进跟踪'}
                      {activeTab === 'notes' && '订单富文本便签与协同留言板'}
                    </>
                  )}
                </h2>
                <span className="px-2.5 py-1 w-fit rounded bg-slate-100 text-slate-600 text-[10px] font-mono font-medium">
                  UTC CLOCK: {currentTime || 'Loading...'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-6 self-end sm:self-auto">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => {
                    setIsHistoryModalOpen(true);
                    loadHistoryBackups();
                  }}
                  disabled={isUploading}
                  className="px-3 py-1.5 border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-xs font-bold transition-all flex items-center gap-1.5 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="选择云端历史存储的台账文件并加载"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  {isUploading ? '正在加载...' : '加载台账'}
                </button>
                <button 
                  onClick={handleClearAllData}
                  className={`px-3 py-1.5 border rounded text-xs font-bold transition-all ${
                    isConfirmingClear 
                      ? 'bg-red-600 text-white border-red-600 hover:bg-red-700 shadow-md shadow-red-500/20' 
                      : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  }`}
                  title="清除所有本地缓存数据，恢复初始状态"
                >
                  {isConfirmingClear ? '再次点击确认' : '清除缓存'}
                </button>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-semibold text-slate-400 font-mono tracking-wider">缺料预警 / ALERTS</span>
                <span className={`font-mono text-sm md:text-base font-bold ${inventory.filter(item => item.currentStock < item.safetyStock).length > 0 ? 'text-[#EF4444] animate-pulse font-extrabold' : 'text-[#22C55E]'}`}>
                  {inventory.filter(item => item.currentStock < item.safetyStock).length} SKUs CRITICAL
                </span>
              </div>
              <div className="h-8 w-px bg-slate-200"></div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-semibold text-slate-400 font-mono tracking-wider">星标订单 / STARRED</span>
                <span className="font-mono text-sm md:text-base font-bold text-slate-800">
                  {starredIds.size} 笔
                </span>
              </div>
            </div>
          </header>

          {/* Central content container */}
          <main ref={mainScrollRef} className="flex-1 p-6 md:p-8 overflow-y-auto bg-[#F8FAFC]">
            {purchaseOrders.length === 0 ? (
              <POList 
                purchaseOrders={purchaseOrders}
                onReplaceOrders={handleUpdateOrders}
                onNavigateToNotes={(poId, autoAdd = false) => {
                  if (autoAdd) {
                    setAutoAddNotePOId(poId);
                  } else {
                    setAutoAddNotePOId(null);
                  }
                  setTargetSearchTerm(poId);
                  handleTabChange('notes');
                }}
                notes={notes}
              />
            ) : (
              <>
                <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
                  <Dashboard 
                    purchaseOrders={purchaseOrders} 
                    inventory={inventory}
                    onNavigateToPOS={(poId?: string) => {
                      if (poId) setTargetSearchTerm(poId);
                      handleTabChange('ledger');
                    }}
                    onNavigateToMaterials={() => handleTabChange('inventory')}
                    onGenerateQuickPO={handleGenerateQuickPO}
                  />
                </div>

                <div className={activeTab === 'ledger' ? 'block' : 'hidden'}>
                  <POList 
                    purchaseOrders={purchaseOrders}
                    onReplaceOrders={handleUpdateOrders}
                    targetSearchTerm={targetSearchTerm}
                    onClearTargetSearchTerm={() => setTargetSearchTerm('')}
                    onNavigateToNotes={(poId, autoAdd = false) => {
                      if (autoAdd) {
                        setAutoAddNotePOId(poId);
                      } else {
                        setAutoAddNotePOId(null);
                      }
                      setTargetSearchTerm(poId);
                      handleTabChange('notes');
                    }}
                    notes={notes}
                  />
                </div>

                <div className={activeTab === 'inventory' ? 'block' : 'hidden'}>
                  <SampleTracker 
                    purchaseOrders={purchaseOrders}
                    onNavigateToPOS={(poId?: string) => {
                      if (poId) setTargetSearchTerm(poId);
                      handleTabChange('ledger');
                    }}
                    samples={samples}
                    onSamplesChange={handleUpdateSamples}
                  />
                </div>

                <div className={activeTab === 'notes' ? 'block' : 'hidden'}>
                  <SkeuomorphicNotes 
                    purchaseOrders={purchaseOrders}
                    activePOId={targetSearchTerm || null}
                    onNavigateToPO={(poId) => {
                      setTargetSearchTerm(poId);
                      handleTabChange('ledger');
                    }}
                    autoAddNote={autoAddNotePOId}
                    onClearAutoAddNote={() => setAutoAddNotePOId(null)}
                    notes={notes}
                    onNotesChange={handleUpdateNotes}
                  />
                </div>
              </>
            )}
          </main>


        </div>

      </div>

      {/* Historical Ledgers Popup Modal Dialog */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all animation-fade-in animate-duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <Cloud className="w-5 h-5 text-blue-500 stroke-[2]" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">选择云端历史台账</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">从已保存的历史备份中恢复或导入新台账</p>
                </div>
              </div>
              <button 
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Main Area */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Optional Error Alert */}
              {historyLoadError && (
                <div className="p-3.5 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs flex items-start gap-2.5">
                  <div className="bg-red-100 p-1 rounded-md text-red-700 shrink-0 mt-0.5">⚠️</div>
                  <div className="space-y-1">
                    <p className="font-semibold">获取云端列表失败</p>
                    <p className="font-mono text-[10px] leading-relaxed break-all text-red-500">{historyLoadError}</p>
                  </div>
                </div>
              )}

              {/* Status / List View */}
              {isLoadingHistory ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <p className="text-xs text-slate-500 font-medium">正在拉取云端 Firestore 备份列表...</p>
                </div>
              ) : historyBackups.length === 0 ? (
                <div className="py-10 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 bg-slate-25/50">
                  <FileJson className="w-10 h-10 text-slate-300 stroke-[1.5]" />
                  <div className="text-center space-y-1 px-4">
                    <p className="text-xs font-bold text-slate-600">云端暂无备份文件</p>
                    <p className="text-[10.5px] text-slate-450 leading-relaxed">系统每次加载台账或者手动备份时，会自动备份至云端 Firestore 数据库中。</p>
                  </div>
                  <button
                    onClick={loadHistoryBackups}
                    className="mt-2.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 text-[10.5px] font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    刷新列表
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 font-mono tracking-wider">
                    <span>备份时间 & 名称 ({historyBackups.length})</span>
                    <button
                      onClick={loadHistoryBackups}
                      className="text-blue-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      刷新
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {historyBackups.map((backup, idx) => (
                      <div 
                        key={idx}
                        className="p-3 border border-slate-150 hover:border-blue-300 rounded-xl hover:bg-blue-25/30 transition-all flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <FileJson className="w-5 h-5 text-blue-500 stroke-[1.5] mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 font-mono leading-tight truncate group-hover:text-blue-600">{backup.name}</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-1">
                              备份时间: <strong className="text-slate-600">{backup.timeCreated}</strong> • 大小: <span className="font-mono text-[9px] bg-slate-100 px-1 py-0.5 rounded text-slate-600">{backup.size ? `${(backup.size / 1024).toFixed(1)} KB` : '未知'}</span>
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleSelectHistoryBackup(backup)}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10.5px] font-bold shadow-xs transition-transform transform active:scale-95 flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          载入台账
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer containing local browse options */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs w-full">
              <span className="text-[10px] text-slate-400 leading-relaxed text-center sm:text-left">
                提示: 备份将会长期在 Firestore 的 <code>ledger_backups</code> 集合中安全留存。
              </span>
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setIsHistoryModalOpen(false);
                }}
                className="w-full sm:w-auto px-3 py-1.5 border border-slate-200 text-slate-650 hover:bg-white hover:border-slate-350 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                本地 XLSX / JSON 导入
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
