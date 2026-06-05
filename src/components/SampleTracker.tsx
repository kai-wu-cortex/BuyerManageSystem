import React, { useState, useEffect, useRef } from 'react';
import { SampleRecord, SampleStatus, PurchaseOrder } from '../types';
import { 
  Clipboard, 
  HelpCircle, 
  Plus, 
  Trash2, 
  CheckCircle, 
  Clock, 
  FileCheck, 
  TrendingUp, 
  AlertTriangle,
  Upload,
  Calendar,
  Layers,
  Search,
  SlidersHorizontal,
  Sparkles,
  Link2,
  Edit2,
  Package,
  Truck,
  User,
  X,
  FileText,
  Image as ImageIcon
} from 'lucide-react';

const INITIAL_SAMPLES: SampleRecord[] = [
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

interface SampleTrackerProps {
  purchaseOrders: PurchaseOrder[];
  onNavigateToPOS: (poId?: string) => void;
  samples?: SampleRecord[];
  onSamplesChange?: (updated: SampleRecord[]) => void;
}

export default function SampleTracker({ 
  purchaseOrders, 
  onNavigateToPOS,
  samples: propsSamples,
  onSamplesChange
}: SampleTrackerProps) {
  const [internalSamples, setInternalSamples] = useState<SampleRecord[]>([]);
  const samples = propsSamples !== undefined ? propsSamples : internalSamples;
  
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Clipboard Paste & Capture state
  const [pastedText, setPastedText] = useState('');
  const [pastedImages, setPastedImages] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseLog, setParseLog] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Manual Sample Record Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSampleId, setEditingSampleId] = useState<string | null>(null);
  
  // Reusable React modal-based confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    theme?: 'red' | 'blue';
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const triggerConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = "确认删除",
    cancelText = "取消",
    theme: 'red' | 'blue' = 'red'
  ) => {
    setConfirmDialog({
      show: true,
      title,
      message,
      onConfirm: (): void => {
        onConfirm();
        setConfirmDialog(prev => ({ ...prev, show: false }));
      },
      confirmText,
      cancelText,
      theme
    });
  };

  const [formState, setFormState] = useState<Partial<SampleRecord>>({
    name: '',
    spec: '',
    category: '原材料',
    supplier: '',
    requestDate: new Date().toISOString().split('T')[0],
    status: '申请中',
    quantity: 1,
    unit: 'PCS',
    courierInfo: '',
    assignedTo: '',
    notes: '',
    poId: ''
  });

  // Reference for file picker and rich text editor
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Load from local storage if no props passed
  useEffect(() => {
    if (propsSamples === undefined) {
      const saved = localStorage.getItem('sample_records');
      if (saved) {
        setInternalSamples(JSON.parse(saved));
      } else {
        setInternalSamples(INITIAL_SAMPLES);
        localStorage.setItem('sample_records', JSON.stringify(INITIAL_SAMPLES));
      }
    }
  }, [propsSamples]);

  // Save to local storage
  const saveSamples = (updated: SampleRecord[]) => {
    if (onSamplesChange) {
      onSamplesChange(updated);
    } else {
      setInternalSamples(updated);
      localStorage.setItem('sample_records', JSON.stringify(updated));
    }
  };

  // Sync content from rich text contentEditable editor
  const syncContentEditable = () => {
    if (!editorRef.current) return;
    // Extract plain text
    const textVal = editorRef.current.innerText || '';
    setPastedText(textVal);

    // Extract all base64 structures from inline <img> tags
    const imgs = editorRef.current.querySelectorAll('img');
    const imgUrlsCollected: string[] = [];
    imgs.forEach(img => {
      const src = img.getAttribute('src');
      if (src) {
        imgUrlsCollected.push(src);
      }
    });
    setPastedImages(imgUrlsCollected);
  };

  // Insert image tag inline at the current text cursor position
  const insertImageAtCursor = (base64: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const selection = window.getSelection();
    if (!selection) return;

    let range: Range;
    if (selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
    }

    // Ensure the range target is inside our editor
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
    }

    range.deleteContents();

    const img = document.createElement('img');
    img.src = base64;
    img.className = 'max-h-[140px] my-2 rounded-lg border border-slate-800 object-contain shadow-lg hover:scale-[1.02] transition-transform inline-block mr-2 align-middle select-all';
    img.setAttribute('alt', 'pasted-inline-image');

    range.insertNode(img);

    // Add a helper trailing space/text-node so the user can easily continue typing after the image
    const spaceNode = document.createTextNode(' ');
    range.insertNode(spaceNode);

    // Position cursor after the helper space
    const newRange = document.createRange();
    newRange.setStartAfter(spaceNode);
    newRange.setEndAfter(spaceNode);
    selection.removeAllRanges();
    selection.addRange(newRange);
  };

  // Handle Clipboard Paste directly targeting rich text containing mixed images/multiline text
  const handleContentEditablePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData.items;
    let containsImage = false;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        containsImage = true;
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault(); // Suspend standard text/file binary chunk bypass
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            insertImageAtCursor(result);
            setParseLog(prev => [...prev, `📸 剪贴板富文本通道已嵌入截图 (${Math.round(result.length / 1024)} KB)`]);
            syncContentEditable();
          };
          reader.readAsDataURL(file);
        }
      }
    }

    // If there were no image files, let the browser handle standard text paste natively,
    // and sync the editor state to local React state on the next event loop cycle.
    if (!containsImage) {
      setTimeout(syncContentEditable, 0);
    }
  };

  // Handle local uploaded files - support parsing multiple files directly into the editor
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach((file: any) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          insertImageAtCursor(result);
          setParseLog(prev => [...prev, `📎 已成功从本地选中并插入图片 到富文本框: ${file.name}`]);
          syncContentEditable();
        };
        reader.readAsDataURL(file);
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Clear both plain text, state hooks and HTML inside the editor
  const clearEditor = () => {
    setPastedText('');
    setPastedImages([]);
    if (editorRef.current) {
      editorRef.current.innerHTML = '';
    }
  };

  // Rule-based client backup parser (in case No API key or off-line environment)
  const ruleBasedFallbackParser = (text: string): Partial<SampleRecord> => {
    const lines = text.split('\n');
    const result: Partial<SampleRecord> = {
      name: '',
      spec: '标准规格',
      category: '原材料',
      supplier: '常规供应商',
      quantity: 1,
      unit: 'PCS',
      courierInfo: '',
      assignedTo: '打样工程组',
      notes: ''
    };

    // Concatenate notes
    const notesArray: string[] = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Match common keyword fields
      if (trimmed.includes('名称') || trimmed.includes('品名')) {
        result.name = trimmed.replace(/.*[:：]/, '').trim();
      } else if (trimmed.includes('型号') || trimmed.includes('规格') || trimmed.includes('spec')) {
        result.spec = trimmed.replace(/.*[:：]/, '').trim();
      } else if (trimmed.includes('供应商') || trimmed.includes('厂家') || trimmed.includes('来源')) {
        result.supplier = trimmed.replace(/.*[:：]/, '').trim();
      } else if (trimmed.includes('数量') || trimmed.includes('份数')) {
        const num = parseInt(trimmed.replace(/[^0-9]/g, ''));
        if (!isNaN(num)) result.quantity = num;
        const unitMatch = trimmed.match(/[0-9]+([a-zA-Z\u4e00-\u9fa5]+)/);
        if (unitMatch) result.unit = unitMatch[1];
      } else if (trimmed.includes('分类') || trimmed.includes('类别') || trimmed.includes('类型')) {
        const cat = trimmed.replace(/.*[:：]/, '').trim();
        if (['原材料', '标签', '包装物', '瓶子', '袋子', '辅料', '其他'].includes(cat)) {
          result.category = cat;
        }
      } else if (trimmed.includes('快递') || trimmed.includes('单号') || trimmed.includes('物流')) {
        result.courierInfo = trimmed.replace(/.*[:：]/, '').trim();
      } else if (trimmed.includes('跟进') || trimmed.includes('负责人') || trimmed.includes('跟进人')) {
        result.assignedTo = trimmed.replace(/.*[:：]/, '').trim();
      } else {
        notesArray.push(trimmed);
      }
    });

    if (!result.name && lines.length > 0) {
      // Use first available text chunk if no explicit key-value was found
      result.name = lines[0].slice(0, 24).trim();
    }

    result.notes = notesArray.join('; ');
    return result;
  };

  // Core structured formatting dispatching
  const triggerAIRecordFormatting = async () => {
    if (!pastedText.trim() && pastedImages.length === 0) {
      setParseError("⚠️ 请先在剪切板输入区粘贴一些文字，或者按 Ctrl+V 贴入图片截图。");
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setParseLog([`🚀 正在启动 样品深度感知审计引擎...`]);

    try {
      setParseLog(prev => [...prev, `正在尝试通过后端智能 Gemini-3.5-Flash 进行富文本多模态解构...`]);
      
      const response = await fetch('/api/gemini/parse-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pastedText,
          images: pastedImages
        })
      });

      let resJson: any = null;
      try {
        resJson = await response.json();
      } catch (e) {
        // Fallback if not json
      }

      if (!response.ok) {
        const errorMsg = resJson?.message || `HTTP Error response code: ${response.status}`;
        throw new Error(errorMsg);
      }

      if (resJson.success) {
        const data = resJson.data;
        setParseLog(prev => [
          ...prev, 
          `✅ AI 提取解析成功！`,
          `📦 匹配到样品: ${data.name || '未命名'}`,
          `🏭 来源供应商: ${data.supplier || '未明确'}`,
          `🗂️ 预测类别: ${data.category || '原材料'}`
        ]);

        // Pre-fill manual states
        setFormState({
          name: data.name || '未命名',
          spec: data.spec || '标准公制',
          category: (['原材料', '标签', '包装物', '瓶子', '袋子', '辅料', '其他'].includes(data.category) ? data.category : '原材料') as any,
          supplier: data.supplier || '常规合格商',
          quantity: typeof data.quantity === 'number' ? data.quantity : 1,
          unit: data.unit || 'PCS',
          courierInfo: data.courierInfo || '自取或在途',
          assignedTo: data.assignedTo || '样品工程团队',
          notes: data.notes || '',
          requestDate: new Date().toISOString().split('T')[0],
          status: '申请中',
          imgUrl: pastedImages[0] || undefined,
          imgUrls: pastedImages.length > 0 ? pastedImages : undefined
        });

        setShowAddForm(true);
      } else {
        // Fallback warning info or fallback manual logic
        setParseLog(prev => [
          ...prev,
          `⚠️ AI 远程代理暂不可达 (${resJson.message || 'KEY MISSING'} - 已为您提供智能规则匹配回退)`
        ]);

        const fallbackData = ruleBasedFallbackParser(pastedText);
        const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const serial = Math.floor(100 + Math.random() * 900);
        const newId = `SMP-${todayStr}-${serial}`;

        const newRecord: SampleRecord = {
          name: fallbackData.name || '未命名',
          spec: fallbackData.spec || '标准规格',
          category: (fallbackData.category as any) || '原材料',
          supplier: fallbackData.supplier || '常规供应商',
          quantity: fallbackData.quantity || 1,
          unit: fallbackData.unit || 'PCS',
          courierInfo: fallbackData.courierInfo || '',
          assignedTo: fallbackData.assignedTo || '打样工程组',
          notes: fallbackData.notes || '',
          id: newId,
          requestDate: new Date().toISOString().split('T')[0],
          status: '申请中',
          imgUrl: pastedImages[0] || undefined,
          imgUrls: pastedImages.length > 0 ? pastedImages : undefined
        };

        saveSamples([newRecord, ...samples]);
        
        clearEditor();
        setParseLog(prev => [...prev, `✅ 已通过结构算法自动完成样品登记！编号: ${newId}`]);
        setTimeout(() => setIsParsing(false), 2000);
        return;
      }
    } catch (err: any) {
      console.warn("AI parse failed, using client rule base", err);
      setParseLog(prev => [
        ...prev,
        `⚠️ 智能路由异常: 临时切入常规特征码探测模式以保证基本可用性。`
      ]);

      const fallbackData = ruleBasedFallbackParser(pastedText);
      const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const serial = Math.floor(100 + Math.random() * 900);
      const newId = `SMP-${todayStr}-${serial}`;

      const newRecord: SampleRecord = {
        name: fallbackData.name || '未命名(系统接管)',
        spec: fallbackData.spec || '标准规格',
        category: (fallbackData.category as any) || '原材料',
        supplier: fallbackData.supplier || '未明确系统接管',
        quantity: fallbackData.quantity || 1,
        unit: fallbackData.unit || 'PCS',
        courierInfo: fallbackData.courierInfo || '',
        assignedTo: fallbackData.assignedTo || '打样工程组',
        notes: fallbackData.notes || '',
        id: newId,
        requestDate: new Date().toISOString().split('T')[0],
        status: '申请中', 
        imgUrl: pastedImages[0] || undefined,
        imgUrls: pastedImages.length > 0 ? pastedImages : undefined
      };

      saveSamples([newRecord, ...samples]);
      
      clearEditor();
      setParseLog(prev => [...prev, `✅ 已通过底层结构算法自动完成样品强制登记！编号: ${newId}`]);
    } finally {
      setIsParsing(false);
    }
  };

  // Submit form (Save / Update record)
  const saveRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name) return;

    if (editingSampleId) {
      // Update
      const updated = samples.map(s => s.id === editingSampleId ? {
        ...s,
        ...formState,
        id: editingSampleId
      } as SampleRecord : s);
      saveSamples(updated);
      setEditingSampleId(null);
    } else {
      // Add
      const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const serial = Math.floor(100 + Math.random() * 900);
      const newId = `SMP-${todayStr}-${serial}`;

      const newRecord: SampleRecord = {
        ...formState,
        id: newId,
        requestDate: formState.requestDate || new Date().toISOString().split('T')[0],
        status: formState.status || '申请中',
        imgUrl: formState.imgUrl || pastedImages[0] || undefined,
        imgUrls: formState.imgUrls || (pastedImages.length > 0 ? pastedImages : undefined)
      } as SampleRecord;

      saveSamples([newRecord, ...samples]);
    }

    // Reset UI state
    setShowAddForm(false);
    clearEditor();
    setParseLog([]);
    setFormState({
      name: '',
      spec: '',
      category: '原材料',
      supplier: '',
      requestDate: new Date().toISOString().split('T')[0],
      status: '申请中',
      quantity: 1,
      unit: 'PCS',
      courierInfo: '',
      assignedTo: '',
      notes: '',
      poId: ''
    });
  };

  // Delete sample record
  const deleteRecord = (id: string) => {
    const record = samples.find(s => s.id === id);
    const targetName = record ? `【${record.name} - ${record.id}】` : '';
    triggerConfirm(
      "确认删除样品记录",
      `您确定要彻底删除该样品跟踪跟进卡片 ${targetName} 吗？此操作会立刻同步清除它的历史流转记录及附加的多模态照片，且不可逆转。`,
      () => {
        const filtered = samples.filter(s => s.id !== id);
        saveSamples(filtered);
      }
    );
  };

  // Change individual status quickly
  const updateStatus = (id: string, newStatus: SampleStatus) => {
    const updated = samples.map(s => s.id === id ? { ...s, status: newStatus } : s);
    saveSamples(updated);
  };

  // Trigger editing existing record
  const startEditing = (record: SampleRecord) => {
    setEditingSampleId(record.id);
    setFormState(record);
    setShowAddForm(true);
  };

  // Quick reset to seed data
  const resetToSeeds = () => {
    triggerConfirm(
      "重置数据缓存",
      "若重置，所有新建的样品跟进卡片、历史照片附档等均会被物理清空。您确认重新加载初始自带的系统打样记录台账吗？",
      () => {
        saveSamples(INITIAL_SAMPLES);
      },
      "立即重置",
      "取消",
      "blue"
    );
  };

  // Sync to a Purchase Order quick helper
  const linkWithPO = (sampleId: string, poId: string) => {
    const updated = samples.map(s => s.id === sampleId ? { ...s, poId } : s);
    saveSamples(updated);
  };

  // Filter calculation
  const filteredSamples = samples.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.assignedTo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = !statusFilter || s.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Helper to render beautiful visual grid of images for the sample cards, as sketched by user
  const renderSampleImages = (record: SampleRecord) => {
    const images = record.imgUrls?.length 
      ? record.imgUrls 
      : record.imgUrl 
        ? [record.imgUrl] 
        : [];

    if (images.length === 0) {
      return (
        <div className="h-32 w-full bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center gap-1.5 text-slate-450 mt-2 mb-3.5 px-3 py-4 border-dashed">
          <ImageIcon className="w-5 h-5 text-slate-300" />
          <span className="text-[10px] font-mono text-slate-450">无图样外观附证</span>
        </div>
      );
    }

    return (
      <div className="relative mt-2 mb-3.5 group rounded-xl overflow-hidden border border-slate-205 shadow-xs bg-slate-950">
        {images.length === 1 && (
          <div className="h-44 w-full overflow-hidden flex items-center justify-center">
            <img 
              src={images[0]} 
              alt={`${record.name}-0`} 
              className="w-full h-full object-contain hover:scale-105 transition-transform duration-300" 
            />
          </div>
        )}

        {images.length === 2 && (
          <div className="grid grid-cols-2 gap-0.5 h-32 w-full">
            {images.map((img, idx) => (
              <div key={idx} className="h-full w-full overflow-hidden border-r last:border-r-0 border-slate-900 flex items-center justify-center">
                <img 
                  src={img} 
                  alt={`${record.name}-${idx}`} 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" 
                />
              </div>
            ))}
          </div>
        )}

        {images.length === 3 && (
          <div className="grid grid-cols-3 gap-0.5 h-28 w-full">
            {images.map((img, idx) => (
              <div key={idx} className="h-full w-full overflow-hidden border-r last:border-r-0 border-slate-900 flex items-center justify-center">
                <img 
                  src={img} 
                  alt={`${record.name}-${idx}`} 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" 
                />
              </div>
            ))}
          </div>
        )}

        {images.length >= 4 && (
          <div className="grid grid-cols-2 gap-0.5 h-40 w-full relative">
            {images.slice(0, 4).map((img, idx) => (
              <div key={idx} className="h-full w-full overflow-hidden border-r border-b border-slate-900 flex items-center justify-center relative">
                <img 
                  src={img} 
                  alt={`${record.name}-${idx}`} 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" 
                />
                {idx === 3 && images.length > 4 && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center font-bold text-white text-xs select-none">
                    +{images.length - 4} 张
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Floating count badge overlay */}
        <div className="absolute top-2.5 right-2.5 bg-slate-900/80 backdrop-blur-xs text-white text-[9px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded shadow-sm hover:scale-105 transition-transform select-none">
          {images.length} 张图片
        </div>
      </div>
    );
  };

  // Get status badge styles
  const getStatusColor = (status: SampleStatus) => {
    switch (status) {
      case '申请中':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case '寄送中':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case '已收到':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case '测试中':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case '合格启用':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case '不合格退回':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* LEFT SIDEBAR: Title banner & Stacked stats cards, as sketched in user's layout plan */}
        <div className="lg:col-span-1 space-y-4">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
              <span>新样获取与打样</span>
            </h2>
            <p className="text-[10px] text-slate-500 font-mono uppercase mt-0.5 leading-relaxed tracking-wider">
              SAMPLE CONTROL STATION
            </p>
          </div>

          {/* Vertical Stack of Stats Cards */}
          <div className="flex flex-col gap-3">
            {[
              { label: '样品总数', value: samples.length, icon: <Layers className="w-4.5 h-4.5 text-slate-500" />, color: 'bg-slate-50 border-slate-200' },
              { label: '在途获取中', value: samples.filter(s => s.status === '寄送中' || s.status === '申请中').length, icon: <Truck className="w-4.5 h-4.5 text-amber-500" />, color: 'bg-amber-50/50 border-amber-200' },
              { label: '测试打样中', value: samples.filter(s => s.status === '测试中').length, icon: <Clock className="w-4.5 h-4.5 text-purple-500" />, color: 'bg-purple-50/50 border-purple-200' },
              { label: '测试合格启用', value: samples.filter(s => s.status === '合格启用').length, icon: <CheckCircle className="w-4.5 h-4.5 text-emerald-500" />, color: 'bg-emerald-50/50 border-emerald-205' },
              { label: '品质退回/不合格', value: samples.filter(s => s.status === '不合格退回').length, icon: <AlertTriangle className="w-4.5 h-4.5 text-rose-500" />, color: 'bg-rose-50/50 border-rose-205' }
            ].map((stat, i) => (
              <div key={i} className={`p-4 rounded-xl border flex items-center justify-between ${stat.color} shadow-xs hover:shadow-sm transition-all duration-200`}>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-sans font-bold">{stat.label}</span>
                  <div className="font-mono text-xl font-bold text-slate-800">{stat.value}</div>
                </div>
                {stat.icon}
              </div>
            ))}
          </div>

          {/* Fast Cache Reset Option tucked below stats */}
          <button
            onClick={resetToSeeds}
            className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[10px] font-bold font-sans transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1"
          >
            🔄 恢复演示模拟样品
          </button>
        </div>

        {/* RIGHT AREA: Active controls and tracking cards grid */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Main subheader & Action Trigger at top of main panel */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 bg-slate-50/30 p-4 rounded-xl border border-slate-150">
            <div>
              <h2 className="text-sm font-bold text-slate-850 tracking-tight flex items-center gap-1.5 font-sans">
                新样打样与获取跟踪台账 / SAMPLE EXTRACTION TRACKER
              </h2>
              <p className="text-[10px] text-slate-500 uppercase mt-0.5">
                支持剪切板富文本及多张截图极速感知汇聚。全物性特征提取，实验室流向跟踪，大货采购对账。
              </p>
            </div>
            
            <button
              onClick={() => {
                setEditingSampleId(null);
                setFormState({
                  name: '',
                  spec: '',
                  category: '原材料',
                  supplier: '',
                  requestDate: new Date().toISOString().split('T')[0],
                  status: '申请中',
                  quantity: 1,
                  unit: 'PCS',
                  courierInfo: '',
                  assignedTo: '',
                  notes: '',
                  poId: ''
                });
                setShowAddForm(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-bold font-sans transition-all active:scale-95 shadow-sm cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" /> 新增样品登记
            </button>
          </div>

      {/* Multimodal Parsing Stage */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Paste Board Panel */}
          <div className="flex-1 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-300 font-mono flex items-center gap-1.5">
                <Clipboard className="w-3.5 h-3.5 text-blue-450" />
                剪切板富文本感知通道 / DATA PORT FOR CLIPBOARD PASTE
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-400 font-mono uppercase bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                  CTRL+V 贴入多张图片/便敲
                </span>
                {pastedImages.length > 0 && (
                  <button 
                    onClick={clearEditor}
                    className="text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center gap-1"
                    title="清空当前输入"
                  >
                    <X className="w-4 h-4" />
                    <span>清空</span>
                  </button>
                )}
              </div>
            </div>

            <div className="relative w-full">
              <div 
                ref={editorRef}
                contentEditable={true}
                onInput={syncContentEditable}
                onPaste={handleContentEditablePaste}
                onKeyDown={(e) => {
                  // Allow writing feedback, sync states instantly
                  setTimeout(syncContentEditable, 0);
                }}
                className="w-full min-h-[160px] max-h-[320px] overflow-y-auto bg-slate-950 rounded-lg border border-slate-800 p-4 text-xs font-mono text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all custom-rich-textarea leading-relaxed"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              />
              {(!pastedText.trim() && pastedImages.length === 0) && (
                <div className="absolute left-4 top-4 right-4 pointer-events-none text-slate-500 text-xs font-mono leading-relaxed select-none">
                  可以直接在此框按下 <span className="text-blue-400 font-bold">Ctrl+V</span> 贴入富文本。
                  <br />同时支持导入供应商提供的文字段落，以及直接粘贴、拖入、嵌入多张图片截图。
                  <br /><span className="text-amber-400 font-bold">富文本图片将直接在此框内与文字混合排版、预览和退格删除。</span>
                </div>
              )}
            </div>

            {/* Quick Helper actions on the rich text context */}
            <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5 font-mono">
                📝 已捕获文本: <strong className="text-slate-200 font-bold">{pastedText.length} 字</strong>
                <span className="text-slate-700">|</span> 
                📸 已捕获多图: <strong className="text-slate-200 font-bold">{pastedImages.length} 张</strong>
              </span>
              <label className="text-[10px] text-blue-400 hover:underline cursor-pointer flex items-center gap-1 mb-1">
                📎 插入本地多张图片
                <input 
                  type="file" 
                  accept="image/*"
                  multiple
                  className="hidden" 
                  onChange={handleImageFileChange}
                  ref={fileInputRef}
                />
              </label>
            </div>

            <div className="flex justify-between items-center mt-1">
              <p className="text-[10px] text-slate-400 max-w-md">
                💡 模型支持对提取到的样品特征自动分配状态标签并预测属于分类。
              </p>
              <button
                onClick={triggerAIRecordFormatting}
                disabled={isParsing}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold font-sans transition-all flex items-center gap-2 shadow-md hover:shadow-blue-500/10 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                {isParsing ? '多维结构化解构中...' : '智能无损审计解构 / EXTRACT FROM CLIPBOARD'}
              </button>
            </div>
          </div>

          {/* Audit Process Terminal Debug log */}
          <div className="w-full lg:w-80 bg-slate-950 p-4 rounded-lg border border-slate-800 text-[10px] font-mono select-none flex flex-col">
            <span className="text-slate-400 font-bold uppercase tracking-wider mb-2 border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-550 bg-emerald-500 rounded-full animate-ping"></span>
              打样感知审计流 LOG:
            </span>
            <div className="flex-1 min-h-[90px] max-h-[140px] overflow-y-auto space-y-1 text-[#dbe0ef] pr-1">
              {parseLog.length === 0 ? (
                <div className="text-slate-600 italic">暂无流式抽取任务活动。准备就绪。</div>
              ) : (
                parseLog.map((log, i) => (
                  <div key={i} className="leading-relaxed">{log}</div>
                ))
              )}
            </div>
            {parseError && (
              <div className="mt-2 text-rose-400 border border-rose-900/30 bg-rose-950/20 p-2 rounded">
                {parseError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manual Add / Edit Modal Overlay */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 bg-[#0F172A] text-white flex justify-between items-center shrink-0">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-450" />
                  {editingSampleId ? `修改打样记录: ${editingSampleId}` : '拟制并确认样品获取跟进档案'}
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">请审核并调整结构化识别后的各维度数据，以保障大台账档案一致性。</p>
              </div>
              <button 
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={saveRecord} className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {/* Form entries */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">样品名称 *</label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 font-medium outline-none text-slate-800 focus:border-blue-500"
                    placeholder="请输入采购样品完整品名"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">技术规格型号</label>
                  <input
                    type="text"
                    value={formState.spec}
                    onChange={(e) => setFormState({ ...formState, spec: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 font-medium outline-none text-slate-800 focus:border-blue-500"
                    placeholder="请输入详细尺寸、型号、分子量或实验规格"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">数量</label>
                  <input
                    type="number"
                    min="1"
                    value={formState.quantity}
                    onChange={(e) => setFormState({ ...formState, quantity: Number(e.target.value) })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 font-medium outline-none text-slate-800 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">单位</label>
                  <input
                    type="text"
                    value={formState.unit}
                    onChange={(e) => setFormState({ ...formState, unit: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 font-medium outline-none text-slate-800 focus:border-blue-500"
                    placeholder="Pcs/桶/箱/包"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">申领/送样日 *</label>
                  <input
                    type="date"
                    required
                    value={formState.requestDate}
                    onChange={(e) => setFormState({ ...formState, requestDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 outline-none text-slate-800 focus:border-blue-505"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">阶段状态</label>
                  <select
                    value={formState.status}
                    onChange={(e) => setFormState({ ...formState, status: e.target.value as SampleStatus })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 bg-white outline-none text-slate-800 focus:border-blue-505"
                  >
                    {['申请中', '寄送中', '已收到', '测试中', '合格启用', '不合格退回'].map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">供样厂商 / 提供商名称 *</label>
                  <input
                    type="text"
                    required
                    value={formState.supplier}
                    onChange={(e) => setFormState({ ...formState, supplier: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 font-medium outline-none text-slate-800 focus:border-blue-500"
                    placeholder="请输入生产厂商、代销商全称"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">承运物流快递公司与底单号</label>
                  <input
                    type="text"
                    value={formState.courierInfo}
                    onChange={(e) => setFormState({ ...formState, courierInfo: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 font-medium outline-none text-slate-800 focus:border-blue-500"
                    placeholder="例：顺丰 SF1002340292"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">关联后续采购大单号 (选填)</label>
                  <select
                    value={formState.poId || ''}
                    onChange={(e) => setFormState({ ...formState, poId: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-2.5 bg-white outline-none text-slate-800 focus:border-blue-505"
                  >
                    <option value="">-- 暂不关联正式订单 / 独立样品 --</option>
                    {purchaseOrders.map(po => (
                      <option key={po.id} value={po.id}>{po.id} ({po.supplier})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">技术检验记事 / 打样测试备注说明</label>
                <textarea
                  value={formState.notes}
                  onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                  placeholder="请输入该样品的评定、化学组分、使用反馈、需要攻克的泄漏痛点或者性能缺陷描述..."
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-xs outline-none text-slate-800 min-h-[85px]"
                />
              </div>

              {(formState.imgUrls?.length ? formState.imgUrls : formState.imgUrl ? [formState.imgUrl] : []).length > 0 && (
                <div className="border border-slate-100 rounded-lg p-3 bg-slate-50 space-y-1.5 shrink-0">
                  <span className="block font-semibold text-slate-500">已贴入/上传图样外观:</span>
                  <div className="w-full max-h-[140px] rounded overflow-hidden flex overflow-x-auto snap-x gap-2 bg-white border border-slate-200">
                    {(formState.imgUrls?.length ? formState.imgUrls : [formState.imgUrl]).map((img, i) => (
                       <img key={i} src={img} alt={`Sample preview ${i}`} className="max-h-[140px] w-full snap-center object-contain shrink-0" />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-slate-100 shrink-0">
                <div>
                  {editingSampleId && (
                    <button
                      type="button"
                      onClick={() => {
                        deleteRecord(editingSampleId);
                        setShowAddForm(false);
                      }}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-bold font-sans transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      删除登记
                    </button>
                  )}
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold font-sans transition-all active:scale-95 cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold font-sans transition-all active:scale-95 shadow-sm cursor-pointer"
                  >
                    保存并记入台账
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Controller Filters and Actions */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="搜索样品名称、编号、来源供应商或跟进人员..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white rounded-lg border border-slate-200 text-xs outline-none text-slate-850 placeholder-slate-400 focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] transition-colors font-sans"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
          <div className="flex items-center gap-1.5 min-w-[130px]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-1.5 px-2.5 border border-slate-200 rounded-lg bg-white text-[11px] font-semibold text-slate-700 outline-none focus:border-[#2563EB] transition-colors w-full"
            >
              <option value="">[所有状态 - STATUS]</option>
              {['申请中', '寄送中', '已收到', '测试中', '合格启用', '不合格退回'].map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grid of tracking cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredSamples.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-400 space-y-3 shadow-xs">
            <Clipboard className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold max-w-sm mx-auto">没有匹配到合适的样品跟进纪录。您可以尝试清除搜索过滤，或者在上方贴入微信/Excel图片启动智能格式化！</p>
          </div>
        ) : (
          filteredSamples.map(record => (
            <div 
              key={record.id} 
              className="bg-white rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all duration-300 relative flex flex-col justify-between overflow-hidden group shadow-md"
            >
              <div>
                {/* Header: Core sample identity info (Name and Tags at absolute top, as requested) */}
                <div className="p-5 pb-3 border-b border-slate-100 bg-slate-50/20">
                  <div className="flex justify-between items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getStatusColor(record.status)} font-sans shrink-0 uppercase`}>
                      {record.status}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="bg-slate-100 text-slate-600 text-[9px] font-bold font-mono px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wider shrink-0">
                        {record.category}
                      </span>
                    </div>
                  </div>

                  {/* Prominent Sample Name at Top */}
                  <div className="space-y-1 mt-3">
                    <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-400 uppercase tracking-widest font-bold">
                      <span>{record.id}</span>
                      <span className="text-slate-500 font-sans tracking-normal">数量：<strong className="text-slate-800 font-bold">{record.quantity || 1} {record.unit || 'PCS'}</strong></span>
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug tracking-tight pt-1 font-sans">
                      {record.name}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1" title={record.spec}>
                      <span className="shrink-0 text-slate-400 font-bold">规格：</span>
                      <span className="truncate max-w-xs font-semibold text-slate-700">{record.spec || '常规测试包 / 未附规格'}</span>
                    </p>
                  </div>
                </div>

                {/* Redesigned Image Attachment Collage representing user's 'pic' boxes */}
                <div className="px-5 pt-2">
                  {renderSampleImages(record)}
                </div>

                {/* Meta Fields section */}
                <div className="px-5 pb-4 space-y-2.5 text-xs text-slate-650 font-sans border-b border-slate-100">
                  <div className="grid grid-cols-1 gap-1.5 text-[11px] leading-relaxed">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>负责跟进：<strong className="text-slate-800 font-semibold">{record.assignedTo || '样品研发室'}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5" title={record.supplier}>
                      <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">提供厂商：<strong className="text-slate-800 font-semibold">{record.supplier}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">承运底单：<strong className="font-mono text-slate-700 font-bold">{record.courierInfo || '白条送货 / 自提'}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>送样申请期：<strong className="font-mono text-slate-700 font-semibold">{record.requestDate}</strong></span>
                    </div>
                  </div>

                  {/* Technical Notes explanation box */}
                  <div className="bg-slate-50 border border-slate-150 p-2.5 rounded-lg text-[10.5px] text-slate-550 leading-relaxed italic mt-1 font-sans">
                    📝 <strong>工艺检验纪事：</strong>{record.notes || '暂无详细检验测试流程、特殊控制缺陷及配方打样纪事。'}
                  </div>

                  {/* Real linkage module */}
                  {record.poId ? (
                    <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg flex items-center justify-between text-[10px] font-sans text-emerald-800 mt-2">
                      <span className="flex items-center gap-1">
                        <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                        已对接大货PO：<strong className="font-mono font-extrabold">{record.poId}</strong>
                      </span>
                      <button 
                        onClick={onNavigateToPOS}
                        className="text-emerald-700 font-bold hover:underline cursor-pointer flex items-center"
                      >
                        点击审计对账 &rarr;
                      </button>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-150 p-2 rounded-lg flex items-center justify-between text-[10px] text-slate-400 mt-2">
                      <span className="flex items-center gap-1">
                        <X className="w-3.2 h-3.2" />
                        暂未挂钩采购大单
                      </span>
                      <select
                        onChange={(e) => linkWithPO(record.id, e.target.value)}
                        className="bg-white border border-slate-205 rounded p-0.5 text-[9px] font-medium outline-none text-slate-650 cursor-pointer"
                      >
                        <option value="">关联大单PO...</option>
                        {purchaseOrders.map(po => (
                          <option key={po.id} value={po.id}>{po.id}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Redesigned Card Controls Footer */}
              <div className="px-5 py-3.5 bg-slate-55 bg-slate-50 border-t border-slate-100 flex items-center justify-between mt-auto">
                {/* Fast state adjustment mechanism */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-sans">流转到:</span>
                  <select
                    value={record.status}
                    onChange={(e) => updateStatus(record.id, e.target.value as SampleStatus)}
                    className="bg-white border border-slate-200 rounded p-1 text-[10px] font-bold text-slate-700 outline-none cursor-pointer focus:border-blue-500 hover:bg-slate-100 transition-all shadow-xs"
                  >
                    {['申请中', '寄送中', '已收到', '测试中', '合格启用', '不合格退回'].map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                {/* Operational controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => startEditing(record)}
                    className="p-1 px-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-sans text-[10px] font-bold cursor-pointer flex items-center gap-1 transition-all active:scale-95 shadow-xs"
                    title="修改卡片数据"
                  >
                    <Edit2 className="w-3" />
                    修改
                  </button>
                  
                  <button
                    onClick={() => deleteRecord(record.id)}
                    className="p-1.5 bg-white hover:bg-red-50 text-red-500 border border-slate-200 hover:border-red-200 rounded cursor-pointer transition-all active:scale-95 shadow-xs"
                    title="清除样品卡片"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      </div>
      </div>

      {/* Custom Confirmation Dialog Modal */}
      {confirmDialog.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs transition-opacity duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 transform scale-100 transition-transform duration-200 flex flex-col space-y-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-full ${confirmDialog.theme === 'red' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 font-sans">{confirmDialog.title}</h3>
            </div>
            
            <p className="text-slate-600 text-xs font-sans leading-relaxed">
              {confirmDialog.message}
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(prev => ({ ...prev, show: false }))}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg font-sans transition-all active:scale-95 cursor-pointer"
              >
                {confirmDialog.cancelText || "取消"}
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-1.5 text-white text-xs font-semibold rounded-lg font-sans transition-all active:scale-95 cursor-pointer shadow-md ${
                  confirmDialog.theme === 'red' 
                    ? 'bg-red-600 hover:bg-red-500 shadow-red-500/10' 
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/10'
                }`}
              >
                {confirmDialog.confirmText || "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
