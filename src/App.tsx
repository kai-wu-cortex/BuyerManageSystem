import React, { Suspense, useState, useEffect, useRef } from 'react';
import { PurchaseOrder, InventoryItem, OrderItem, SampleRecord, StickyNote, POStatus, PurchaseExecutionStatus } from './types';
// xlsx + exceljs 体积大且仅在文件上传时使用，改为函数内 dynamic import 按需加载
import { parseClipboardLine } from './utils/ledgerHelper';
import { rowsToLedgerLines } from './utils/ledgerImport';
import SystemLogin from './components/SystemLogin';
import {
  Dashboard,
  NoteboardCanvas,
  POList,
  SampleTracker,
  SkeuomorphicNotes,
  SupplierSummaryApp,
  preloadAppModule,
  type AppTab,
} from './appModules';
import { SUPPLIER_MATERIAL_MAPPING } from './utils/supplierMaterialMapping';
import { useStarredPOs } from './lib/hooks';
import {
  clearCloudbaseCollections,
  cloudbaseCollections,
  formatLedgerBackupSize,
  getCurrentCloudbaseUser,
  getBuyerSystemAccess,
  getDocument,
  getLatestLedgerBackup,
  handleCloudbaseError,
  isLedgerBackupNewerThanLoaded,
  isCloudbaseConfigured,
  listDocuments,
  OperationType,
  prepareSampleForCloudbaseSync,
  replaceCollection,
  replaceRecordCollection,
  saveLedgerBackup,
  signInToCloudbase,
  signOutFromCloudbase,
  type CloudbaseAuthUser,
  type LedgerBackup,
} from './lib/cloudbaseData';
import {
  BarChart3,
  BookOpen,
  Layers,
  LayoutGrid,
  Briefcase,
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
  Loader2,
  LogOut,
} from 'lucide-react';
type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

const navigationTabs: { id: AppTab; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: '采购物料大屏', icon: <BarChart3 className="w-5 h-5 shrink-0" /> },
  { id: 'ledger', label: '采购单台账', icon: <BookOpen className="w-5 h-5 shrink-0" /> },
  { id: 'inventory', label: '样品获取与打样追踪', icon: <Layers className="w-5 h-5 shrink-0" /> },
  { id: 'notes', label: '订单便签与流转', icon: <StickyNoteIcon className="w-5 h-5 shrink-0" /> },
];

const miniAppTabs: { id: AppTab; label: string; icon: React.ReactNode }[] = [
  { id: 'noteboard', label: '便签画板', icon: <LayoutGrid className="w-5 h-5 shrink-0" /> },
  { id: 'supplier-summary', label: '供应商汇总', icon: <Briefcase className="w-5 h-5 shrink-0" /> },
];

const MODULE_FALLBACK_LABELS: Record<AppTab, string> = {
  dashboard: '采购物料大屏',
  ledger: '采购单台账',
  inventory: '样品获取与打样追踪',
  notes: '订单便签与流转',
  noteboard: '便签画板',
  'supplier-summary': '供应商汇总',
};

function ModuleLoadingFallback({ label }: { label: string }) {
  return (
    <div className="min-h-[55vh] flex items-center justify-center">
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        <div>
          <p className="text-xs font-black text-slate-800">正在加载模块</p>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error !== null && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return String(error);
}

const LEDGER_LOADED_BACKUP_TIME_KEY = 'purchase_orders_cloudbase_backup_time';

function readStoredLedgerBackupTime(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const value = window.localStorage.getItem(LEDGER_LOADED_BACKUP_TIME_KEY);
  const rawTime = value ? Number(value) : 0;
  return Number.isFinite(rawTime) && rawTime > 0 ? rawTime : 0;
}

function writeStoredLedgerBackupTime(rawTime: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (Number.isFinite(rawTime) && rawTime > 0) {
    window.localStorage.setItem(LEDGER_LOADED_BACKUP_TIME_KEY, String(rawTime));
  }
}

export interface MergeStats {
  added: number;     // 新增的订单数
  updated: number;   // 已存在但内容有变化的订单数
  retained: number;  // 旧台账里存在，新台账没出现的订单数（不会被删，仅保留）
  unchanged: number; // 内容完全相同
}

/**
 * 按订单编号 (id, 形如 CGDD-xxxxx) 合并新旧订单：
 * - 新台账里有的订单：以新版本为准（覆盖）
 * - 新台账里没有但旧台账里有的：保留旧的（不删）
 * - 顺序保持「新台账中的顺序在前，旧台账独有的在后」
 */
export function mergePurchaseOrdersById(
  previousOrders: PurchaseOrder[],
  incomingOrders: PurchaseOrder[],
): { merged: PurchaseOrder[]; stats: MergeStats } {
  const previousMap = new Map(previousOrders.map(po => [po.id, po]));
  const incomingIds = new Set(incomingOrders.map(po => po.id));

  let added = 0;
  let updated = 0;
  let unchanged = 0;

  const merged: PurchaseOrder[] = [];

  for (const incoming of incomingOrders) {
    const prev = previousMap.get(incoming.id);
    if (!prev) {
      added += 1;
    } else if (JSON.stringify(prev) !== JSON.stringify(incoming)) {
      updated += 1;
    } else {
      unchanged += 1;
    }
    merged.push(incoming);
  }

  // 旧的、但新台账中没出现的订单，保留追加
  let retained = 0;
  for (const prev of previousOrders) {
    if (!incomingIds.has(prev.id)) {
      merged.push(prev);
      retained += 1;
    }
  }

  return { merged, stats: { added, updated, retained, unchanged } };
}

export function preparePurchaseOrdersForState(orders: PurchaseOrder[]): PurchaseOrder[] {
  return orders
    .map(order => ({
      ...order,
      items: Array.isArray(order.items) ? order.items.map(item => ({ ...item })) : [],
    }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export interface SampleMergeStats {
  added: number;
  updated: number;
  retained: number;
  unchanged: number;
}

/**
 * 按 id (SMP-xxxxx) 合并样品记录：与订单同样的逻辑
 */
export function mergeSampleRecordsById(
  previousSamples: SampleRecord[],
  incomingSamples: SampleRecord[],
): { merged: SampleRecord[]; stats: SampleMergeStats } {
  const previousMap = new Map(previousSamples.map(s => [s.id, s]));
  const incomingIds = new Set(incomingSamples.map(s => s.id));

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const merged: SampleRecord[] = [];

  for (const incoming of incomingSamples) {
    const prev = previousMap.get(incoming.id);
    if (!prev) {
      added += 1;
    } else if (JSON.stringify(prev) !== JSON.stringify(incoming)) {
      updated += 1;
    } else {
      unchanged += 1;
    }
    merged.push(incoming);
  }

  let retained = 0;
  for (const prev of previousSamples) {
    if (!incomingIds.has(prev.id)) {
      merged.push(prev);
      retained += 1;
    }
  }

  return { merged, stats: { added, updated, retained, unchanged } };
}

export default function App() {
  const { starredIds } = useStarredPOs();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authUser, setAuthUser] = useState<CloudbaseAuthUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const userAccess = getBuyerSystemAccess(authUser);

  // ref：跟踪云端初始数据是否已加载完，避免「用户改了 → 云端拉回又覆盖回去」
  const cloudDataInitializedRef = useRef({
    inventory: false,
    samples: false,
    notes: false,
  });
  // ref：跟踪本地是否有未与云端同步的修改（写入云端期间也算 dirty）
  const localDirtyRef = useRef({
    inventory: false,
    samples: false,
    notes: false,
  });
  
  // Navigation tabs: 'dashboard' | 'ledger' | 'inventory' | 'notes'
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [targetSearchTerm, setTargetSearchTerm] = useState('');
  const [autoAddNotePOId, setAutoAddNotePOId] = useState<string | null>(null);
  
  const mainScrollRef = useRef<HTMLElement>(null);
  const tabScrollPositions = useRef<Record<string, number>>({});

  const handleModuleIntent = (tabId: AppTab) => {
    void preloadAppModule(tabId).catch(error => {
      console.warn(`Failed to preload ${tabId} module:`, error);
    });
  };

  const handleTabChange = (newTab: AppTab) => {
    if (mainScrollRef.current) {
      tabScrollPositions.current[activeTab] = mainScrollRef.current.scrollTop;
    }
    handleModuleIntent(newTab);
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

  // Procurement Datasets with CloudBase synchronization
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [ledgerRevision, setLedgerRevision] = useState(0);
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
  const [historyBackups, setHistoryBackups] = useState<LedgerBackup[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [loadedLedgerBackupRawTime, setLoadedLedgerBackupRawTime] = useState(readStoredLedgerBackupTime);
  const [latestRemoteLedgerBackup, setLatestRemoteLedgerBackup] = useState<LedgerBackup | null>(null);

  const markLedgerBackupLoaded = (rawTime: number) => {
    if (!Number.isFinite(rawTime) || rawTime <= 0) {
      return;
    }

    setLoadedLedgerBackupRawTime(rawTime);
    writeStoredLedgerBackupTime(rawTime);
  };

  useEffect(() => {
    let isMounted = true;

    if (!isCloudbaseConfigured()) {
      setAuthStatus('unauthenticated');
      setAuthError('请先配置 VITE_CLOUDBASE_ENV_ID 和 VITE_CLOUDBASE_ACCESS_KEY。');
      return () => {
        isMounted = false;
      };
    }

    void getCurrentCloudbaseUser()
      .then(user => {
        if (!isMounted) return;
        setAuthUser(user);
        setAuthStatus(user ? 'authenticated' : 'unauthenticated');
      })
      .catch(error => {
        if (!isMounted) return;
        setAuthUser(null);
        setAuthStatus('unauthenticated');
        setAuthError(getErrorMessage(error));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Initial load & real-time CloudBase sync
  useEffect(() => {
    if (authStatus !== 'authenticated' || userAccess.mode !== 'full') {
      return undefined;
    }

    // 1. Sync Purchase Orders from localStorage
    const savedPO = localStorage.getItem("purchase_orders");
    if (savedPO) {
      try {
        setPurchaseOrders(preparePurchaseOrdersForState(JSON.parse(savedPO) as PurchaseOrder[]));
        setLedgerRevision(revision => revision + 1);
      } catch (e) {
        console.error("Failed to parse POs from localStorage:", e);
      }
    }

    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleString('zh-CN', { hour12: false }) + ' (UTC)');
    };
    updateTime();
    const clockInterval = setInterval(updateTime, 1000);

    if (!isCloudbaseConfigured()) {
      return () => clearInterval(clockInterval);
    }

    void listDocuments<InventoryItem>(cloudbaseCollections.inventory)
      .then(records => {
        // 云端拉回时如果本地已有用户修改，按 code 合并：本地为主，云端仅补充本地没有的
        setInventory(current => {
          if (localDirtyRef.current.inventory && current.length > 0) {
            const localCodes = new Set(current.map(item => item.code));
            const merged = [...current];
            for (const cloud of records) {
              if (!localCodes.has(cloud.code)) merged.push(cloud);
            }
            return merged;
          }
          return records;
        });
        cloudDataInitializedRef.current.inventory = true;
      })
      .catch(error => {
        try {
          handleCloudbaseError(error, OperationType.LIST, cloudbaseCollections.inventory);
        } catch (handledError) {
          console.error(handledError);
        }
      });

    void listDocuments<SampleRecord>(cloudbaseCollections.samples)
      .then(records => {
        setSamples(current => {
          if (localDirtyRef.current.samples && current.length > 0) {
            const localIds = new Set(current.map(item => item.id));
            const merged = [...current];
            for (const cloud of records) {
              if (!localIds.has(cloud.id)) merged.push(cloud);
            }
            return merged;
          }
          return records;
        });
        cloudDataInitializedRef.current.samples = true;
      })
      .catch(error => {
        try {
          handleCloudbaseError(error, OperationType.LIST, cloudbaseCollections.samples);
        } catch (handledError) {
          console.error(handledError);
        }
      });

    void listDocuments<StickyNote>(cloudbaseCollections.notes)
      .then(records => {
        const liveNotes: Record<string, StickyNote> = {};
        records.forEach(record => {
          liveNotes[record.poId] = record;
        });
        setNotes(current => {
          if (localDirtyRef.current.notes && Object.keys(current).length > 0) {
            // 合并：本地修改为主，云端独有的 poId 补充进来
            const merged: Record<string, StickyNote> = { ...liveNotes };
            for (const poId of Object.keys(current)) {
              const note = current[poId];
              if (note) merged[poId] = note; // 本地覆盖
            }
            return merged;
          }
          return liveNotes;
        });
        cloudDataInitializedRef.current.notes = true;
      })
      .catch(error => {
        try {
          handleCloudbaseError(error, OperationType.LIST, cloudbaseCollections.notes);
        } catch (handledError) {
          console.error(handledError);
        }
      });

    void listDocuments<LedgerBackup>(cloudbaseCollections.ledgerBackups, { sizeFields: ['orders'] })
      .then(records => {
        setLatestRemoteLedgerBackup(getLatestLedgerBackup(records));
      })
      .catch(error => {
        try {
          handleCloudbaseError(error, OperationType.LIST, cloudbaseCollections.ledgerBackups);
        } catch (handledError) {
          console.error(handledError);
        }
      });

    return () => {
      clearInterval(clockInterval);
    };
  }, [authStatus, userAccess.mode]);

  // Sync state values on changes directly to CloudBase
  const handleUpdateOrders = (updatedOrders: PurchaseOrder[]) => {
    try {
      const preparedOrders = preparePurchaseOrdersForState(updatedOrders);
      localStorage.setItem("purchase_orders", JSON.stringify(preparedOrders));
      setPurchaseOrders(preparedOrders);
      setLedgerRevision(revision => revision + 1);
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdateInventory = async (updatedInventory: InventoryItem[]) => {
    try {
      // 标 dirty：如果云端拉回响应还在飞，它不会覆盖本地修改
      localDirtyRef.current.inventory = true;
      setInventory(updatedInventory);
      localStorage.setItem("inventory_stock", JSON.stringify(updatedInventory));
      if (!isCloudbaseConfigured()) {
        return;
      }
      // 云端初始化前先别 replaceCollection，避免把云端真实数据用本地空集合覆盖
      if (!cloudDataInitializedRef.current.inventory) {
        console.warn('Inventory: 云端尚未初始化，写入延后');
        return;
      }
      await replaceCollection(cloudbaseCollections.inventory, updatedInventory, inventory, item => item.code);
    } catch (error) {
      handleCloudbaseError(error, OperationType.WRITE, cloudbaseCollections.inventory);
    }
  };

  const handleUpdateSamples = async (updatedSamples: SampleRecord[]) => {
    try {
      localDirtyRef.current.samples = true;
      const preparedSamples = updatedSamples.map(prepareSampleForCloudbaseSync);
      setSamples(preparedSamples);
      localStorage.setItem("sample_records", JSON.stringify(preparedSamples));
      if (!isCloudbaseConfigured()) {
        return;
      }
      if (!cloudDataInitializedRef.current.samples) {
        console.warn('Samples: 云端尚未初始化，写入延后');
        return;
      }
      await replaceCollection(cloudbaseCollections.samples, preparedSamples, samples, sample => sample.id);
    } catch (error) {
      handleCloudbaseError(error, OperationType.WRITE, cloudbaseCollections.samples);
    }
  };

  const handleUpdateNotes = async (updatedNotes: Record<string, StickyNote>) => {
    try {
      localDirtyRef.current.notes = true;
      setNotes(updatedNotes);
      localStorage.setItem("order_sticky_notes", JSON.stringify(updatedNotes));
      if (!isCloudbaseConfigured()) {
        return;
      }
      if (!cloudDataInitializedRef.current.notes) {
        console.warn('Notes: 云端尚未初始化，写入延后');
        return;
      }
      await replaceRecordCollection(cloudbaseCollections.notes, updatedNotes, notes);
    } catch (error) {
      handleCloudbaseError(error, OperationType.WRITE, cloudbaseCollections.notes);
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
    
    // Clean CloudBase collections but leave purchase_orders in local import history alone
    try {
      if (isCloudbaseConfigured()) {
        await clearCloudbaseCollections([
          cloudbaseCollections.inventory,
          cloudbaseCollections.samples,
          cloudbaseCollections.notes,
        ]);
      }
    } catch (error) {
      console.error("Failed to clear CloudBase collections:", error);
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

  const backupToCloudbase = async (orders: PurchaseOrder[]) => {
    if (!isCloudbaseConfigured()) {
      console.warn("CloudBase backup skipped because VITE_CLOUDBASE_ENV_ID is not configured.");
      return;
    }

    try {
      const backup = await saveLedgerBackup(orders);
      console.log(`Successfully backed up ledger to CloudBase: ${backup.id}`);
      markLedgerBackupLoaded(backup.rawTime);
      setLatestRemoteLedgerBackup(current => {
        if (!current || backup.rawTime >= current.rawTime) {
          return backup;
        }
        return current;
      });
      // 历史备份的过期清理由 MongoDB TTL 索引 (createdAt) 自动处理
    } catch (error) {
      console.error("Failed to backup ledger to CloudBase:", error);
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
        let finalRows: unknown[][] = [];
        // 按需加载电子表格解析库，避免增大首屏包体积
        const [{ default: ExcelJS }, XLSX] = await Promise.all([
          import('exceljs'),
          import('xlsx'),
        ]);
        try {
          const workbook = new ExcelJS.Workbook();
          const buffer = await file.arrayBuffer();
          await workbook.xlsx.load(buffer);
          const worksheet = workbook.worksheets[0];
          worksheet.eachRow((row) => {
            const values = Array.isArray(row.values) ? row.values : [];
            finalRows.push(values.slice(1));
          });
        } catch (exceljsErr) {
          console.warn('ExcelJS parser failed in App.tsx, falling back to SheetJS XLSX:', getErrorMessage(exceljsErr));
          let workbook;
          try {
            const data = await file.arrayBuffer();
            workbook = XLSX.read(data, { type: 'array' });
          } catch (initialErr) {
            console.warn('Standard arrayBuffer parse failed in App.tsx. Attempting text-based fallback.', getErrorMessage(initialErr));
            // Fallback for ERP-generated Excel (often XML/HTML disguised as XLSX which fails ZIP inflation)
            const textData = await file.text();
            workbook = XLSX.read(textData, { type: 'string' });
          }

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          finalRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
        }

        const lines = rowsToLedgerLines(finalRows);

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
        // 按订单编号 (CGDD-) 合并，保留旧台账独有订单及其星标，避免数据/星标丢失
        const { merged, stats } = mergePurchaseOrdersById(purchaseOrders, parsedOrders);
        handleUpdateOrders(merged);
        alert(
          `🎉 成功解析并合并本地台账：\n` +
          `  • 新增 ${stats.added} 笔\n` +
          `  • 更新 ${stats.updated} 笔\n` +
          `  • 内容不变 ${stats.unchanged} 笔\n` +
          `  • 旧台账独有（已保留）${stats.retained} 笔\n` +
          `合并后共 ${merged.length} 笔，即将自动备份至云端。`,
        );

        // Save to CloudBase as backup
        await backupToCloudbase(merged);
        if (userAccess.mode === 'ledgerUploadOnly') {
          await loadHistoryBackups();
        }
      } else {
        alert("未能在文件中解析出任何有效的订单账目。请检查列分录是否和标准 36 列采购合规台账兼容。");
      }
    } catch (e) {
      console.error(e);
      alert("加载台账失败: " + getErrorMessage(e));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const loadHistoryBackups = async () => {
    setIsLoadingHistory(true);
    setHistoryLoadError(null);
    try {
      if (!isCloudbaseConfigured()) {
        setHistoryBackups([]);
        setHistoryLoadError("请先在 .env.local 配置 VITE_CLOUDBASE_ENV_ID 后再读取云端备份。");
        return;
      }
      const backups = await listDocuments<LedgerBackup>(cloudbaseCollections.ledgerBackups, { sizeFields: ['orders'] });
      const sortedBackups = [...backups].sort((a, b) => b.rawTime - a.rawTime);
      setHistoryBackups(sortedBackups);
      setLatestRemoteLedgerBackup(getLatestLedgerBackup(sortedBackups));
    } catch (err) {
      console.error("Failed to list historical backups from CloudBase:", err);
      try {
        const message = err instanceof Error ? err.message : String(err);
        const parsed = JSON.parse(message) as { error?: string };
        setHistoryLoadError(parsed.error || message);
      } catch {
        setHistoryLoadError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSelectHistoryBackup = async (backup: typeof historyBackups[0]) => {
    setIsUploading(true);
    try {
      // 摘要列表只带 ordersCount，没有 orders，这里按需拉完整文档
      let parsedOrders: PurchaseOrder[] | undefined = backup.orders;
      if (!Array.isArray(parsedOrders)) {
        const full = await getDocument<LedgerBackup>(cloudbaseCollections.ledgerBackups, backup.id);
        parsedOrders = full?.orders;
      }
      if (Array.isArray(parsedOrders)) {
        const { merged, stats } = mergePurchaseOrdersById(purchaseOrders, parsedOrders);
        handleUpdateOrders(merged);
        markLedgerBackupLoaded(backup.rawTime);
        setLatestRemoteLedgerBackup(current => {
          if (current && current.rawTime >= backup.rawTime) {
            return current;
          }
          return backup;
        });

        // Show success reminder via animated toast notice
        setSuccessToast(
          `🎉 已合并历史台账 [${backup.timeCreated}]：新增 ${stats.added} / 更新 ${stats.updated} / 保留 ${stats.retained}，共 ${merged.length} 笔`,
        );

        setIsHistoryModalOpen(false);
        // We do not call backupToCloudbase(parsedOrders) here to prevent duplicate backup entries in the cloud.
      } else {
        alert("台账备份文件格式不正确，期望是一个有效的采购单数组。");
      }
    } catch (err) {
      console.error("Failed to load select ledger:", err);
      alert(`无法载入选定的历史台账: ${getErrorMessage(err)}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSignIn = async (username: string, password: string) => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const user = await signInToCloudbase(username, password);
      setAuthUser(user);
      setAuthStatus('authenticated');
    } catch (error) {
      setAuthUser(null);
      setAuthStatus('unauthenticated');
      setAuthError(getErrorMessage(error));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutFromCloudbase();
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setAuthUser(null);
      setAuthStatus('unauthenticated');
      setPurchaseOrders([]);
      setInventory([]);
      setSamples([]);
      setNotes({});
    }
  };

  useEffect(() => {
    if (authStatus === 'authenticated' && userAccess.mode === 'ledgerUploadOnly') {
      void loadHistoryBackups();
    }
  }, [authStatus, userAccess.mode]);

  const applyingSamplesCount = samples.filter(s => s.status === '申请中').length;
  const hasLedgerUpdate = isLedgerBackupNewerThanLoaded(latestRemoteLedgerBackup, loadedLedgerBackupRawTime);

  if (authStatus === 'checking') {
    return (
      <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-300" />
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-slate-400">CloudBase Auth Checking</p>
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return (
      <SystemLogin
        isConfigured={isCloudbaseConfigured()}
        isSigningIn={isSigningIn}
        error={authError}
        onSignIn={handleSignIn}
      />
    );
  }

  if (userAccess.mode === 'ledgerUploadOnly') {
    return (
      <div className="min-h-screen bg-[#F1F5F9] text-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-[#111827] text-white flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/15 border border-blue-400/30 flex items-center justify-center">
                <UploadCloud className="h-5 w-5 text-blue-300" />
              </div>
              <div>
                <h1 className="text-lg font-black tracking-tight">财务台账上传</h1>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">CloudBase 用户: {authUser?.username ?? authUser?.uid}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="h-8 w-8 rounded border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition"
              title="退出登入"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <div className="p-8 space-y-6">
            <div>
              <p className="text-sm font-bold text-slate-800">仅开放上传台账功能</p>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                当前账号为财务权限，不显示采购大屏、采购单列表、样品追踪和订单便签模块。
              </p>
            </div>

            <input
              type="file"
              accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              ref={fileInputRef}
              onClick={event => {
                event.currentTarget.value = '';
              }}
              onChange={handleFileUpload}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-black text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <UploadCloud className="h-5 w-5" />
              {isUploading ? '正在上传台账...' : '上传 XLSX / JSON 台账'}
            </button>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Cloud className="w-5 h-5 text-blue-500 stroke-[2]" />
                  <div>
                    <h2 className="text-sm font-black text-slate-800">历史台账备份</h2>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">读取 CloudBase ledger_backups 集合</p>
                  </div>
                </div>
                <button
                  onClick={loadHistoryBackups}
                  disabled={isLoadingHistory}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 text-[10.5px] font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </div>

              <div className="p-5">
                {historyLoadError && (
                  <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-600">
                    {historyLoadError}
                  </div>
                )}

                {isLoadingHistory ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
                    <p className="text-xs text-slate-500 font-bold">正在拉取云端历史台账...</p>
                  </div>
                ) : historyBackups.length === 0 ? (
                  <div className="py-10 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-3 bg-white">
                    <FileJson className="w-9 h-9 text-slate-300 stroke-[1.5]" />
                    <div className="text-center space-y-1 px-4">
                      <p className="text-xs font-bold text-slate-600">云端暂无备份文件</p>
                      <p className="text-[10.5px] text-slate-400 leading-relaxed">上传台账后会自动保存至 CloudBase，可在这里查看历史记录。</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                    {historyBackups.map(backup => (
                      <div
                        key={backup.id}
                        className="p-3 border border-slate-150 rounded-xl bg-white hover:border-blue-300 transition-all flex items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <FileJson className="w-5 h-5 text-blue-500 stroke-[1.5] mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 font-mono leading-tight truncate">{backup.name}</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-1">
                              备份时间: <strong className="text-slate-600">{backup.timeCreated}</strong>
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                            {formatLedgerBackupSize(backup.size)}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">{backup.ordersCount ?? backup.orders?.length ?? 0} 笔订单</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (userAccess.mode === 'none') {
    return (
      <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white text-slate-900 shadow-2xl p-8">
          <div className="h-11 w-11 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-red-600" />
          </div>
          <h1 className="mt-5 text-xl font-black tracking-tight">当前账号未配置系统权限</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            仅 `caigou` 可查看全部模块，`caiwu` 可上传台账。请切换到已授权账号。
          </p>
          <button
            onClick={handleSignOut}
            className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
          >
            退出并重新登入
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex flex-col font-sans text-slate-900 selection:bg-blue-100">
      
      {/* Lightweight toast feedback kept in the app shell without loading the animation library. */}
      {successToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-500/35 max-w-md w-full sm:w-auto">
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
        </div>
      )}

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
                <img src="/logo.png" alt="logo" className="w-7 h-7 shrink-0 object-contain" />
                {!isSidebarMinimized && (
                  <h1 className="text-lg font-bold tracking-tight text-white font-sans whitespace-nowrap">
                    采购管理系统
                  </h1>
                )}
              </div>
              {!isSidebarMinimized && (
                <div className="text-[10px] text-slate-400 mt-1 uppercase font-semibold whitespace-nowrap">
                  Procurement v4.2
                </div>
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
            {navigationTabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onMouseEnter={() => handleModuleIntent(tab.id)}
                  onFocus={() => handleModuleIntent(tab.id)}
                  onClick={() => {
                    handleTabChange(tab.id);
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

            {/* 小程序分组：与上方业务模块视觉分隔，独立 section */}
            {!isSidebarMinimized && (
              <div className="pt-3 px-1 text-slate-500 font-mono text-[10px] tracking-wider uppercase font-bold whitespace-nowrap overflow-hidden border-t border-slate-800 mt-3">
                小程序
              </div>
            )}
            {isSidebarMinimized && <div className="my-2 mx-3 border-t border-slate-800" />}

            {miniAppTabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onMouseEnter={() => handleModuleIntent(tab.id)}
                  onFocus={() => handleModuleIntent(tab.id)}
                  onClick={() => {
                    handleTabChange(tab.id);
                    setIsSidebarOpen(false);
                  }}
                  title={isSidebarMinimized ? tab.label : undefined}
                  className={`w-full flex items-center ${isSidebarMinimized ? 'justify-center p-3.5' : 'gap-3 px-4 py-3'} text-xs font-semibold uppercase transition-all duration-200 rounded-xl cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/25 font-bold scale-[1.01]'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <span className={`relative ${isActive ? 'text-white' : 'text-slate-400'}`}>{tab.icon}</span>
                  {!isSidebarMinimized && <span className="whitespace-nowrap">{tab.label}</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right workspace core */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#F8FAFC] lg:m-4 lg:ml-2 lg:h-[calc(100vh-2rem)] lg:rounded-2xl lg:shadow-xl lg:border lg:border-slate-200/80">
          
          {/* Top Header */}
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-2 bg-white border-b border-slate-200 gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-1.5 rounded-md hover:bg-slate-100 text-slate-600 cursor-pointer"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight text-slate-800">
                  {activeTab === 'noteboard' ? '便签画板' : activeTab === 'supplier-summary' ? '供应商汇总' : purchaseOrders.length === 0 ? '系统初始配准' : (
                    <>
                      {activeTab === 'dashboard' && '采购物料大屏'}
                      {activeTab === 'ledger' && '采购单台账'}
                      {activeTab === 'inventory' && '样品获取与打样追踪'}
                      {activeTab === 'notes' && '订单便签与流转'}
                    </>
                  )}
                </h2>
                <span className="hidden md:inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-mono leading-none">
                  {currentTime || '...'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <div className="flex flex-col items-end leading-none gap-0.5">
                <span className="text-[9px] uppercase font-semibold text-slate-400 font-mono">User</span>
                <div className="flex items-center gap-1.5">
                  <span className="max-w-32 truncate font-mono text-[11px] font-bold text-slate-700">
                    {authUser?.username ?? authUser?.email ?? authUser?.uid ?? '已登入'}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="h-6 w-6 rounded border border-slate-200 bg-white text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 flex items-center justify-center transition"
                    title="退出登入"
                  >
                    <LogOut className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="h-6 w-px bg-slate-200"></div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="file"
                    accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    ref={fileInputRef}
                    onClick={event => {
                      event.currentTarget.value = '';
                    }}
                    onChange={handleFileUpload}
                  />
                  <button
                    onClick={() => {
                      setIsHistoryModalOpen(true);
                      loadHistoryBackups();
                    }}
                    disabled={isUploading}
                    className="relative px-2.5 py-1 border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-[11px] font-bold transition-all flex items-center gap-1 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={hasLedgerUpdate ? '台账有更新，点击选择云端最新台账' : '选择云端历史存储的台账文件并加载'}
                  >
                    {hasLedgerUpdate && (
                      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                    )}
                    <UploadCloud className="w-3 h-3" />
                    {isUploading ? '加载中...' : '加载台账'}
                  </button>
                  <button
                    onClick={handleClearAllData}
                    className={`px-2.5 py-1 border rounded text-[11px] font-bold transition-all ${
                      isConfirmingClear
                        ? 'bg-red-600 text-white border-red-600 hover:bg-red-700 shadow-md shadow-red-500/20'
                        : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    }`}
                    title="清除所有本地缓存数据，恢复初始状态"
                  >
                    {isConfirmingClear ? '再次点击确认' : '清除缓存'}
                  </button>
                </div>
                {hasLedgerUpdate && latestRemoteLedgerBackup && (
                  <div className="max-w-[230px] rounded border border-red-100 bg-red-50 px-1.5 py-0.5 text-[9px] font-bold leading-none text-red-600 flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-red-500 shrink-0" />
                    <span className="shrink-0">台账有更新</span>
                    <span className="font-mono font-semibold text-red-500 truncate">{latestRemoteLedgerBackup.timeCreated}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end leading-none gap-0.5">
                <span className="text-[9px] uppercase font-semibold text-slate-400 font-mono">延期</span>
                {(() => {
                  const overdueCount = purchaseOrders.filter(po => {
                    if (po.inboundStatus === '全部入库') return false;
                    return new Date(po.deliveryDate).getTime() < new Date().getTime();
                  }).length;
                  return (
                    <span className={`font-mono text-xs font-bold ${overdueCount > 0 ? 'text-[#EF4444] animate-pulse font-extrabold' : 'text-[#22C55E]'}`}>
                      {overdueCount} 单
                    </span>
                  );
                })()}
              </div>
              <div className="h-6 w-px bg-slate-200"></div>
              <div className="flex flex-col items-end leading-none gap-0.5">
                <span className="text-[9px] uppercase font-semibold text-slate-400 font-mono">星标</span>
                <span className="font-mono text-xs font-bold text-slate-800">
                  {starredIds.size} 笔
                </span>
              </div>
            </div>
          </header>

          {/* Central content container */}
          <main ref={mainScrollRef} className="flex-1 p-3 md:p-4 overflow-y-auto bg-[#F8FAFC]">
            <Suspense fallback={<ModuleLoadingFallback label={MODULE_FALLBACK_LABELS[activeTab]} />}>
              {activeTab === 'noteboard' ? (
                <NoteboardCanvas authUser={authUser} />
              ) : activeTab === 'supplier-summary' ? (
                <SupplierSummaryApp purchaseOrders={purchaseOrders} />
              ) : purchaseOrders.length === 0 ? (
                <POList
                  purchaseOrders={purchaseOrders}
                  dataRevision={ledgerRevision}
                  onReplaceOrders={handleUpdateOrders}
                  authUser={authUser}
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
                  {activeTab === 'dashboard' && (
                    <Dashboard
                      purchaseOrders={purchaseOrders}
                      inventory={inventory}
                      authUser={authUser}
                      onNavigateToPOS={(poId?: string) => {
                        if (poId) setTargetSearchTerm(poId);
                        handleTabChange('ledger');
                      }}
                      onNavigateToMaterials={() => handleTabChange('inventory')}
                      onGenerateQuickPO={handleGenerateQuickPO}
                    />
                  )}

                  {activeTab === 'ledger' && (
                    <POList
                      purchaseOrders={purchaseOrders}
                      dataRevision={ledgerRevision}
                      onReplaceOrders={handleUpdateOrders}
                      authUser={authUser}
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
                  )}

                  {activeTab === 'inventory' && (
                    <SampleTracker
                      purchaseOrders={purchaseOrders}
                      onNavigateToPOS={(poId?: string) => {
                        if (poId) setTargetSearchTerm(poId);
                        handleTabChange('ledger');
                      }}
                      samples={samples}
                      onSamplesChange={handleUpdateSamples}
                    />
                  )}

                  {activeTab === 'notes' && (
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
                  )}
                </>
              )}
            </Suspense>
          </main>


        </div>

      </div>

      {/* 全屏加载遮罩：上传/载入台账时显示，防重复点击 */}
      {isUploading && (
        <div className="fixed inset-0 z-[9998] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm mx-4">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-bold text-slate-800">正在加载台账</p>
              <p className="text-xs text-slate-500 mt-1">请稍候，正在解析订单数据并合并到本地…</p>
            </div>
          </div>
        </div>
      )}

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
                  <p className="text-xs text-slate-500 font-medium">正在拉取云端 CloudBase 备份列表...</p>
                </div>
              ) : historyBackups.length === 0 ? (
                <div className="py-10 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 bg-slate-25/50">
                  <FileJson className="w-10 h-10 text-slate-300 stroke-[1.5]" />
                  <div className="text-center space-y-1 px-4">
                    <p className="text-xs font-bold text-slate-600">云端暂无备份文件</p>
                    <p className="text-[10.5px] text-slate-450 leading-relaxed">系统每次加载台账或者手动备份时，会自动备份至云端 CloudBase 数据库中。</p>
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
                提示: 备份将会长期在 CloudBase 的 <code>ledger_backups</code> 集合中安全留存。
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
