import React, { useState, useEffect, useRef } from 'react';
import { PurchaseOrder, InventoryItem, OrderItem, SampleRecord, StickyNote } from './types';
import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
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
  StickyNote as StickyNoteIcon
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

  const applyingSamplesCount = samples.filter(s => s.status === '申请中').length;

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col font-sans text-slate-900 selection:bg-blue-100">
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
                  <p className="text-[10px] text-slate-400 font-semibold italic whitespace-nowrap">Ignite Your Ideas</p>
                  <div className="text-[10px] text-slate-400 mt-1 uppercase font-semibold whitespace-nowrap">
                    ProcureTrack PRO v4.2
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
              导航菜单 / SYSTEM CONTROL
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

          {/* Diagnostics Section */}
          {!isSidebarMinimized && (
            <div className="mt-auto p-4 border-t border-slate-800 bg-[#0b1120] text-[11px] leading-relaxed overflow-hidden lg:rounded-b-2xl">
              <div className="text-slate-400 font-medium text-xs mb-1.5 uppercase font-mono tracking-wider whitespace-nowrap">SYSTEM DIAGNOSTICS:</div>
              <div className="bg-[#0F172A] p-2.5 rounded border border-slate-800 font-mono text-[10px] space-y-1.5 text-slate-300">
                <div className="flex items-center justify-between gap-4">
                  <span>VAULT_SYNC:</span>
                  <span className="text-emerald-400 font-bold">LIVE</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>MEM_STORAGE:</span>
                  <span className="text-emerald-400 font-bold">SECURE</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>THRESHOLD_ROP:</span>
                  <span className="text-emerald-400 font-bold">ACTIVE</span>
                </div>
              </div>
            </div>
          )}
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
              <button 
                onClick={handleClearAllData}
                className={`px-3 py-1.5 border rounded text-xs font-bold transition-all ${
                  isConfirmingClear 
                    ? 'bg-red-600 text-white border-red-600 hover:bg-red-700 shadow-md shadow-red-500/20' 
                    : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                }`}
                title="清除所有本地缓存数据，恢复初始状态"
              >
                {isConfirmingClear ? '再次点击确认清除' : '清除所有缓存'}
              </button>
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
    </div>
  );
}
