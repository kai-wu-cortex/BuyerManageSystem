import React, { useState, useEffect, useRef } from 'react';
import { PurchaseOrder, Comment, StickyNoteItem, StickyNote } from '../types';
import { useStarredPOs } from '../lib/hooks';
import type { CloudbaseAuthUser } from '../lib/cloudbaseData';
import {
  Pin,
  Paperclip,
  Send,
  Trash2,
  Bold,
  Italic,
  Highlighter,
  List,
  MessageSquare,
  Calendar,
  ChevronRight,
  FileText,
  User,
  X,
  Search,
  Sparkles,
  Clock,
  ExternalLink,
  BookOpen,
  Filter,
  Plus,
  Star,
} from 'lucide-react';

interface SkeuomorphicNotesProps {
  purchaseOrders: PurchaseOrder[];
  activePOId: string | null;
  onNavigateToPO: (poId: string) => void;
  autoAddNote?: string | null;
  onClearAutoAddNote?: () => void;
  notes?: Record<string, StickyNote>;
  onNotesChange?: (updated: Record<string, StickyNote>) => void;
  authUser?: CloudbaseAuthUser | null;
}

/** 把任意值安全转成有限数字，无效时返回 0；防 `.toFixed is not a function` 崩溃 */
function toSafeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatYuan(value: unknown): string {
  return toSafeNumber(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SkeuomorphicNotes({
  purchaseOrders,
  activePOId,
  onNavigateToPO,
  autoAddNote,
  onClearAutoAddNote,
  notes: propsNotes,
  onNotesChange,
  authUser = null
}: SkeuomorphicNotesProps) {
  const [internalNotes, setInternalNotes] = useState<Record<string, StickyNote>>({});
  const notes = propsNotes !== undefined ? propsNotes : internalNotes;
  const [selectedPOId, setSelectedPOId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'hasNotes' | 'starred'>('all');
  const { starredIds, toggleStar } = useStarredPOs(authUser);
  
  // Multiple notes active editing tracking
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  // Dialogue comments state
  const [commentText, setCommentText] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('采购专员');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load persistent note registry (only if props are not supplied)
  useEffect(() => {
    if (propsNotes === undefined) {
      const savedNotes = localStorage.getItem('order_sticky_notes');
      if (savedNotes) {
        try {
          setInternalNotes(JSON.parse(savedNotes));
        } catch (e) {
          console.error('Failed to load sticky notes:', e);
        }
      }
    }
  }, [propsNotes]);

  // Save changes
  const saveNotes = (updatedNotes: Record<string, StickyNote>) => {
    if (onNotesChange) {
      onNotesChange(updatedNotes);
    } else {
      setInternalNotes(updatedNotes);
      localStorage.setItem('order_sticky_notes', JSON.stringify(updatedNotes));
    }
  };

  // Helper function to extract PO entry with seamless fallback and legend structures migration
  const getPOEntry = (poId: string) => {
    const raw = notes[poId];
    if (!raw) {
      return {
        notesList: [{ id: 'default', noteText: '', color: 'yellow' as const, customBg: '#fcd8d8', updatedAt: '' }],
        comments: [] as Comment[]
      };
    }
    
    // Check if notes list is already defined and is an array
    if (raw.notesList && Array.isArray(raw.notesList)) {
      return {
        notesList: raw.notesList,
        comments: raw.comments || []
      };
    }
    
    // Migrate old legacy single-note representation beautifully
    return {
      notesList: [
        {
          id: 'note-legacy',
          noteText: raw.noteText || '',
          color: raw.color || 'yellow' as const,
          updatedAt: raw.updatedAt || ''
        }
      ],
      comments: raw.comments || []
    };
  };

  // Check if a PO has custom sticky notes content matching search filtering
  const hasNoteContent = (poId: string) => {
    const raw = notes[poId];
    if (!raw) return false;
    if (raw.noteText && raw.noteText.trim().length > 0) return true;
    if (raw.notesList && Array.isArray(raw.notesList)) {
      return raw.notesList.some(n => n.noteText.trim().length > 0);
    }
    return false;
  };

  // Save PO entry structure safely
  const savePOEntry = (poId: string, notesList: StickyNoteItem[], comments: Comment[]) => {
    const updatedNotes = {
      ...notes,
      [poId]: {
        poId,
        notesList,
        comments
      }
    };
    saveNotes(updatedNotes);
  };

  // Sync external active ID triggers
  useEffect(() => {
    if (activePOId) {
      setSelectedPOId(activePOId);
    } else if (purchaseOrders.length > 0 && !selectedPOId) {
      // 仅在桌面端 (lg+) 自动选中第一条；手机/平板端保持未选状态，先显示订单列表
      if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
        setSelectedPOId(purchaseOrders[0].id);
      }
    }
  }, [activePOId, purchaseOrders]);

  // Handle fallback if selected PO is deleted
  useEffect(() => {
    if (selectedPOId && !purchaseOrders.some(po => po.id === selectedPOId) && purchaseOrders.length > 0) {
      // 同样仅在桌面端自动回退到第一条
      if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
        setSelectedPOId(purchaseOrders[0].id);
      } else {
        setSelectedPOId('');
      }
    }
  }, [purchaseOrders, selectedPOId]);

  // Fetch active collections variables
  const poEntry = getPOEntry(selectedPOId);
  const activeNotesList = poEntry.notesList;
  const currentComments = poEntry.comments;

  const selectedPO = purchaseOrders.find(po => po.id === selectedPOId);

  // Filter & Search Purchase Orders
  const filteredPOs = purchaseOrders.filter(po => {
    // Search filter
    const matchesSearch = 
      po.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
      po.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      po.remarks.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    // Filter mode
    if (filterMode === 'hasNotes') {
      return hasNoteContent(po.id);
    }
    if (filterMode === 'starred') {
      return starredIds.has(po.id);
    }
    return true;
  });

  // Add a new distinct sticky note specifically to this PO
  const handleAddNewNote = () => {
    if (!selectedPOId) return;
    const entry = getPOEntry(selectedPOId);
    const newNoteId = 'note-' + Date.now();
    const beautifulPastels = [
      '#fcd8d8', // Soft Rose Pink (Focus-mode target color!)
      '#ffdfdf', // Warm Peach
      '#fef08a', // Amber yellow
      '#dbeafe', // Sky blue
      '#bbf7d0', // Emerald green
      '#fed7aa', // Light bronze-orange
      '#fbcfe8', // Bubblegum pink
      '#f3e8ff', // Soft purple lavender
      '#ccfbf1', // Mint teal
      '#e0f2fe', // Ocean blue
      '#fef3c7', // Warm Amber
      '#ffedd5'  // Warm Apricot
    ];
    const initialRandomColor = beautifulPastels[Math.floor(Math.random() * beautifulPastels.length)];

    const newNoteList = [
      ...entry.notesList,
      {
        id: newNoteId,
        noteText: '',
        color: 'yellow' as const,
        customBg: initialRandomColor,
        updatedAt: new Date().toLocaleString('zh-CN', { hour12: false })
      }
    ];
    savePOEntry(selectedPOId, newNoteList, entry.comments);
    setEditingNoteId(newNoteId);
    setEditText('');
  };

  // Auto trigger note creation when clicked from POList ledger
  useEffect(() => {
    if (autoAddNote && autoAddNote === selectedPOId) {
      handleAddNewNote();
      if (onClearAutoAddNote) {
        onClearAutoAddNote();
      }
    }
  }, [autoAddNote, selectedPOId]);

  // Cycle Pastel Skin Color for a specific note
  const handleColorChange = (noteId: string, color: 'yellow' | 'blue' | 'pink' | 'green') => {
    if (!selectedPOId) return;
    const entry = getPOEntry(selectedPOId);
    const updatedList = entry.notesList.map(n => 
      n.id === noteId 
        ? { ...n, color, customBg: undefined, updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }) } 
        : n
    );
    savePOEntry(selectedPOId, updatedList, entry.comments);
  };

  // Set random beautiful background color inside the notes
  const handleRandomBgChange = (noteId: string) => {
    if (!selectedPOId) return;
    const entry = getPOEntry(selectedPOId);
    const beautifulPastels = [
      '#fcd8d8', // Soft Rose Pink (Focus-mode target color!)
      '#ffdfdf', // Warm Peach
      '#fef08a', // Amber yellow
      '#dbeafe', // Sky blue
      '#bbf7d0', // Emerald green
      '#fed7aa', // Light bronze-orange
      '#fbcfe8', // Bubblegum pink
      '#f3e8ff', // Soft purple lavender
      '#ccfbf1', // Mint teal
      '#e0f2fe', // Ocean blue
      '#fef3c7', // Warm Amber
      '#e2e8f0', // Cool Slate
      '#ffedd5'  // Warm Apricot
    ];
    // Random choice
    const randomColor = beautifulPastels[Math.floor(Math.random() * beautifulPastels.length)];
    const updatedList = entry.notesList.map(n => 
      n.id === noteId 
        ? { ...n, customBg: randomColor, updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }) } 
        : n
    );
    savePOEntry(selectedPOId, updatedList, entry.comments);
  };

  // Save Text Area Payload for a specific note
  const handleSaveText = (noteId: string) => {
    if (!selectedPOId) return;
    const entry = getPOEntry(selectedPOId);
    const updatedList = entry.notesList.map(n => 
      n.id === noteId 
        ? { ...n, noteText: editText, updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }) } 
        : n
    );
    savePOEntry(selectedPOId, updatedList, entry.comments);
    setEditingNoteId(null);
  };

  // Begin typing for a specific note
  const handleStartEditing = (noteId: string, initialText: string) => {
    setEditingNoteId(noteId);
    setEditText(initialText);
  };

  // Cancel editing
  const handleCancelEditing = () => {
    setEditingNoteId(null);
  };

  // Delete a specific sticky note entirely
  const handleDeleteNote = (noteId: string) => {
    if (!selectedPOId) return;
    const entry = getPOEntry(selectedPOId);
    const updatedList = entry.notesList.filter(n => n.id !== noteId);
    savePOEntry(selectedPOId, updatedList, entry.comments);
    if (editingNoteId === noteId) {
      setEditingNoteId(null);
    }
  };

  // Dialogue Commits Builder
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPOId || !commentText.trim()) return;

    const newComment: Comment = {
      id: 'cmt-' + Math.random().toString(36).substr(2, 9),
      author: commentAuthor.trim() || '采购协同专员',
      content: commentText.trim(),
      time: new Date().toLocaleString('zh-CN', { hour12: false })
    };

    const entry = getPOEntry(selectedPOId);
    const newComments = [...entry.comments, newComment];

    savePOEntry(selectedPOId, entry.notesList, newComments);
    setCommentText('');
  };

  // Remove comment
  const handleDeleteComment = (commentId: string) => {
    if (!selectedPOId) return;
    const entry = getPOEntry(selectedPOId);
    const filteredComments = entry.comments.filter(c => c.id !== commentId);
    savePOEntry(selectedPOId, entry.notesList, filteredComments);
  };

  // Rich-text Markdown-like code formatter injector
  const insertFormatting = (syntaxStart: string, syntaxEnd: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(startPos, endPos);

    let replacement = '';
    if (syntaxStart === 'list') {
      replacement = `\n- ${selectedText || '待办备注条目'}`;
    } else {
      replacement = syntaxStart + (selectedText || '标红备注') + (syntaxEnd || syntaxStart);
    }

    const nextVal = text.substring(0, startPos) + replacement + text.substring(endPos);
    setEditText(nextVal);

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = startPos + syntaxStart.length;
      textarea.selectionEnd = startPos + syntaxStart.length + (selectedText || '标红备注').length;
    }, 40);
  };

  // Parser to convert markup tags into fully styled inline components
  const parseRichText = (str: string) => {
    if (!str.trim()) {
      return (
        <div className="text-center py-10">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2 opacity-50" />
          <p className="text-slate-400 italic text-xs">暂无富文本便签内容。</p>
          <p className="text-[10px] text-slate-400 mt-1">点击右下角“编辑备注”钢笔，支持极速语法工具，留下特殊说明、交期变更或异常说明吧！</p>
        </div>
      );
    }

    return str.split('\n').map((line, idx) => {
      let isItem = false;
      let display = line;

      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        isItem = true;
        display = line.trim().substring(2);
      }

      // Safe XSS and mapping to robust custom markup elements
      let rendered = display
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // Highlighters: ==keyText==
      rendered = rendered.replace(/==([^=]+)==/g, '<mark class="bg-amber-300/90 text-slate-900 font-semibold px-1 py-0.5 rounded border border-amber-400/20 font-sans shadow-sm leading-none">$1</mark>');
      // Bold: **text**
      rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-extrabold text-slate-950 font-sans">$1</strong>');
      // Italic: *text*
      rendered = rendered.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-800 font-sans">$1</em>');

      const textNode = <span dangerouslySetInnerHTML={{ __html: rendered }} />;

      if (isItem) {
        return (
          <li key={idx} className="list-disc ml-5 text-xs text-slate-800 leading-relaxed py-1 font-sans">
            {textNode}
          </li>
        );
      }

      return (
        <p key={idx} className="text-xs text-slate-800 leading-relaxed min-h-[1.4rem] py-1 font-sans">
          {textNode}
        </p>
      );
    });
  };

  // Note aesthetics lookup - improved vibrant pastel look for realistic "filled paper" warmth
  const skinThemeMap = {
    yellow: {
      bg: 'bg-gradient-to-br from-amber-100 to-yellow-200 border-yellow-300/60 shadow-[0_10px_25px_rgba(234,179,8,0.18)] text-amber-950',
      hexBg: '#fef08a',
      line: 'border-yellow-300/30',
      tag: 'bg-yellow-600/10 text-yellow-900 border-yellow-300/50',
      text: 'text-amber-950',
      activeBorder: 'ring-yellow-500',
      accent: 'bg-yellow-500'
    },
    blue: {
      bg: 'bg-gradient-to-br from-sky-100 to-cyan-200 border-sky-300/60 shadow-[0_10px_25px_rgba(14,165,233,0.18)] text-sky-950',
      hexBg: '#bae6fd',
      line: 'border-sky-300/30',
      tag: 'bg-sky-600/10 text-sky-900 border-sky-300/50',
      text: 'text-sky-950',
      activeBorder: 'ring-sky-500',
      accent: 'bg-sky-500'
    },
    pink: {
      bg: 'bg-gradient-to-br from-rose-100 to-pink-200 border-rose-300/60 shadow-[0_10px_25px_rgba(244,63,94,0.18)] text-rose-950',
      hexBg: '#fbcfe8',
      line: 'border-rose-300/30',
      tag: 'bg-rose-600/10 text-rose-900 border-rose-300/50',
      text: 'text-rose-950',
      activeBorder: 'ring-rose-500',
      accent: 'bg-[#EC4899]'
    },
    green: {
      bg: 'bg-gradient-to-br from-emerald-100 to-green-200 border-emerald-300/60 shadow-[0_10px_25px_rgba(16,185,129,0.18)] text-emerald-950',
      hexBg: '#bbf7d0',
      line: 'border-emerald-300/30',
      tag: 'bg-emerald-600/10 text-emerald-900 border-emerald-300/50',
      text: 'text-emerald-950',
      activeBorder: 'ring-emerald-500',
      accent: 'bg-emerald-500'
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6">

      {/* 1. LEFT SIDEBAR PANEL: PO SELECTION & STATUS FILTER LIST
          手机/平板：只有未选 PO 时显示；选中 PO 后只显示右侧编辑面板。
          lg+：左右并列。 */}
      <div className={`${selectedPOId ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 shrink-0 bg-white border border-slate-200 rounded-xl shadow-xs flex-col h-full overflow-hidden`}>
        
        {/* Panel Search & Header */}
        <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-500" /> 选择采购订单列表
            </h3>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
              共 {filteredPOs.length} 笔
            </span>
          </div>
          
          {/* Search field */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索账单号 / 供应商名称..."
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-white rounded-lg border border-slate-200 focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Quick tab filter selectors */}
          <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded-md text-[10px] font-medium text-slate-600">
            <button
              onClick={() => setFilterMode('all')}
              className={`py-1 rounded text-center transition-all cursor-pointer ${filterMode === 'all' ? 'bg-white shadow-xs font-bold text-slate-900' : 'hover:text-slate-900'}`}
            >
              全部账单
            </button>
            <button
              onClick={() => setFilterMode('hasNotes')}
              className={`py-1 rounded text-center transition-all cursor-pointer flex items-center justify-center gap-0.5 ${filterMode === 'hasNotes' ? 'bg-white shadow-xs font-bold text-slate-900' : 'hover:text-slate-900'}`}
              title="仅显示存在备忘录的账单"
            >
              <Paperclip className="w-2.5 h-2.5" /> 存在便签
            </button>
            <button
              onClick={() => setFilterMode('starred')}
              className={`py-1 rounded text-center transition-all cursor-pointer ${filterMode === 'starred' ? 'bg-white shadow-xs font-bold text-slate-900' : 'hover:text-slate-900'}`}
              title="仅显示加了星标的账单"
            >
              ⭐ 已加星标
            </button>
          </div>
        </div>

        {/* Scrollable PO Selection Cards Grid */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredPOs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 italic text-xs">
              无对应的采购单记录
            </div>
          ) : (
            filteredPOs.map((po) => {
              const hasNoteText = hasNoteContent(po.id);
              const poDetails = getPOEntry(po.id);
              const commentsCount = poDetails.comments.length;
              const isSelected = po.id === selectedPOId;
              const isStarred = starredIds.has(po.id);
              const activeColor = poDetails.notesList[0]?.color || 'yellow';
              const miniColors = skinThemeMap[activeColor];

              return (
                <div
                  key={po.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedPOId(po.id);
                    setEditingNoteId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedPOId(po.id);
                      setEditingNoteId(null);
                    }
                  }}
                  className={`w-full text-left p-3.5 transition-all outline-none flex items-start gap-2.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-300 ${
                    isSelected
                      ? 'bg-blue-50/40 border-r-4 border-r-blue-600'
                      : 'hover:bg-slate-50/70'
                  }`}
                >
                  {/* 星标按钮：列表项左侧，stopPropagation 避免触发选中 */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleStar(po.id);
                    }}
                    className="shrink-0 p-1 rounded hover:bg-amber-100/60 transition-colors -ml-1 -mt-1"
                    title={isStarred ? '取消星标' : '加星标'}
                    aria-label={isStarred ? '取消星标' : '加星标'}
                  >
                    <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`} />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-extrabold text-slate-900 truncate">
                        {po.id}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-sans font-bold ${
                        po.status === '已审核' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {po.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 font-sans truncate mb-1">
                      供应商: <strong className="text-slate-800">{po.supplier}</strong>
                    </div>

                    <div className="flex items-center gap-2 mt-1.5">
                      {/* Note Indicator */}
                      {hasNoteText ? (
                        <span className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded font-semibold font-mono ${miniColors.tag}`}>
                          <Paperclip className="w-2.5 h-2.5 shrink-0" /> 便签 ({poDetails.notesList.filter(n => n.noteText.trim()).length})
                        </span>
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                      )}

                      {/* Comment indicators */}
                      {commentsCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] px-1 bg-blue-50 text-blue-700 rounded font-semibold font-mono">
                          <MessageSquare className="w-2.5 h-2.5 shrink-0" /> {commentsCount} 条流转
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform text-slate-400 self-center ${isSelected ? 'translate-x-1 text-blue-600' : ''}`} />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. RIGHT PANEL: BEAUTIFUL IMMERSIVE CORK/DRAFTING CANVAS
          手机/平板：仅在选中 PO 时显示。 */}
      <div className={`${selectedPOId ? 'flex' : 'hidden lg:flex'} flex-1 bg-slate-100 rounded-2xl border border-slate-200 p-4 md:p-6 lg:p-8 relative shadow-inner flex-col overflow-y-auto h-full min-h-[450px] lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-140px)] [background-image:radial-gradient(#CBD5E1_1.2px,transparent_1.2px)] [background-size:24px_24px]`}>

        {/* 手机/平板顶部返回按钮 */}
        {selectedPOId && (
          <button
            type="button"
            onClick={() => setSelectedPOId('')}
            className="lg:hidden mb-3 self-start flex items-center gap-1.5 text-[11px] font-bold text-blue-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            ← 返回订单列表
          </button>
        )}
        
        {/* Canvas floating contextual pins and status info */}
        <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center bg-white/70 backdrop-blur-xs px-4 py-3 rounded-xl border border-slate-200/50 gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#2563EB]/10 text-[#2563EB] rounded-lg">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-wider">当前关联单据 / CURRENT DISPATCH PO</div>
              <h4 className="text-sm font-mono font-black text-slate-800 flex items-center gap-1.5 text-wrap break-all">
                {selectedPOId ? selectedPOId : '未选择关联单据'}
                {selectedPO && (
                  <span className="text-[11px] font-medium font-sans text-slate-500">
                    ({selectedPO.supplier})
                  </span>
                )}
              </h4>
            </div>
          </div>

          {selectedPOId && (
            <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
              <button
                type="button"
                onClick={handleAddNewNote}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-black rounded-lg flex items-center gap-1.5 transition-colors shadow-xs hover:shadow-md cursor-pointer"
                title="为此采购单增设一张额外的独立备忘便签，赋予独立色彩与备注内容"
              >
                <Plus className="w-4 h-4" /> 新增便签纸
              </button>
              <button
                type="button"
                onClick={() => onNavigateToPO(selectedPOId)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs hover:shadow cursor-pointer"
                title="去往采购台账主表查看该订单的所有细节字段及进行审核操作"
              >
                <ExternalLink className="w-3.5 h-3.5" /> 主台账
              </button>
            </div>
          )}
        </div>

        {selectedPOId ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
            
            {/* LARGE SKEUOMORPHIC STICKY NOTE PANEL - Span 7 */}
            <div className="xl:col-span-7 flex flex-col gap-8 relative">
              
              {activeNotesList.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed border-slate-300 bg-white/40 text-center min-h-[300px]">
                  <div className="p-4 bg-slate-200/50 rounded-full mb-4">
                    <Paperclip className="w-8 h-8 text-slate-400" />
                  </div>
                  <h5 className="font-bold text-slate-700 text-sm mb-1.5">当前采购订单暂无便签面</h5>
                  <p className="text-xs text-slate-500 max-w-sm mb-6 leading-relaxed">
                    您可以点击上方 “新增便签纸” 按钮，在本采购单据上贴上一张崭新的彩色备忘便签。
                  </p>
                  <button
                    type="button"
                    onClick={handleAddNewNote}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-black rounded-lg inline-flex items-center gap-1.5 transition-all shadow-xs hover:shadow-md cursor-pointer animate-pulse"
                  >
                    <Plus className="w-4 h-4" /> 贴上一块便签
                  </button>
                </div>
              ) : (
                activeNotesList.map((noteItem, noteIndex) => {
                const isSelectedEditing = editingNoteId === noteItem.id;
                const noteSkin = skinThemeMap[noteItem.color || 'yellow'];

                return (
                  <div key={noteItem.id} className="relative group/note transition-all duration-300">
                    {/* Adhesive physical design piece style */}
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-32 h-6 bg-white/70 backdrop-blur-[2.5px] border-l border-r border-dashed border-slate-300 rotate-[-1deg] shadow-xs flex items-center justify-center text-[8px] font-mono font-black text-slate-500 tracking-widest z-20 select-none">
                      📍 便签纸 #{noteIndex + 1}
                    </div>

                    {/* Corkboard backing wrapper with filled notebook texture styling */}
                    <div 
                      className={`p-6 pt-8 rounded-2xl border transition-all duration-300 hover:scale-[1.015] ${noteItem.customBg ? 'border-slate-300 shadow-[0_10px_25px_rgba(0,0,0,0.06)] text-slate-900' : noteSkin.bg} relative`}
                      style={{
                        backgroundColor: noteItem.customBg || noteSkin.hexBg,
                        backgroundImage: 'linear-gradient(rgba(0,0,0,0.03) 1.5px, transparent 1.5px)',
                        backgroundSize: '100% 24px'
                      }}
                    >
                      
                      {/* Metallic Silver Push-pin in the header */}
                      <div className="absolute top-2.5 left-4 flex items-center gap-1">
                        <Pin className="w-3.5 h-3.5 text-[#EF4444] drop-shadow-sm rotate-[-12deg]" />
                        <span className="text-[10px] font-mono font-bold text-slate-600/80 tracking-wide uppercase">
                          备忘 MEMO PAD
                        </span>
                      </div>

                      {/* Date stamp representation right side aligned */}
                      <div className="absolute top-2.5 right-4 text-right flex items-center gap-1 text-slate-600/70 font-mono text-[9px] font-bold">
                        <Clock className="w-3 h-3" />
                        <span>
                          {noteItem.updatedAt ? noteItem.updatedAt : '新页备忘'}
                        </span>
                      </div>

                      {/* Solid ruled separation line */}
                      <div className="mt-2.5 mb-4 border-b border-dashed border-slate-900/10" />

                      {/* We only render order details metadata context details on the very FIRST sticky note, to avoid vertical display redundancy */}
                      {noteIndex === 0 && selectedPO && (
                        <div className="bg-white/40 border border-white/40 p-3 rounded-lg mb-4 text-[10px] font-sans leading-relaxed text-slate-800">
                          <div className="grid grid-cols-2 gap-y-1 gap-x-4">
                            <div>
                              负责人: <strong className="text-slate-950 font-semibold">采购二组</strong>
                            </div>
                            <div>
                              总金额: <strong className="text-slate-950 font-mono font-bold">¥{formatYuan(selectedPO.items.reduce((sum, item) => sum + (toSafeNumber(item.orderedQty) * toSafeNumber(item.price)), 0) * (1 - toSafeNumber(selectedPO.discountRate)) - toSafeNumber(selectedPO.discountAmount))}</strong>
                            </div>
                            <div>
                              到货期望期: <strong className="text-slate-950 font-mono font-bold">{selectedPO.deliveryDate}</strong>
                            </div>
                            <div>
                              交期执行状态: <strong className="text-slate-950 font-semibold">{selectedPO.executionStatus}</strong>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* The dynamic editable memo pad area */}
                      <div className="min-h-[140px] pb-2">
                        {selectedPO ? (
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                            {/* Left Column: Product List */}
                            <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-dashed border-slate-900/15 pb-4 md:pb-0 md:pr-4 flex flex-col gap-2">
                              <div className="flex items-center justify-between border-b border-slate-900/10 pb-1 mb-1">
                                <span className="text-[10px] font-black text-slate-800 flex items-center gap-1">
                                  📦 关联核算产品清单 ({selectedPO.items.length})
                                </span>
                                {isSelectedEditing && (
                                  <span className="text-[8px] font-black text-amber-850 bg-amber-200/80 px-1 py-0.5 rounded-xs animate-pulse">
                                    💡 点击卡片可快速引入备注
                                  </span>
                                )}
                              </div>
                              <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1 text-[10px] scrollbar-thin scrollbar-thumb-slate-300">
                                {selectedPO.items.map((item, i) => (
                                  <div 
                                    key={i}
                                    onClick={() => {
                                      if (!isSelectedEditing) return;
                                      const productString = `\n- **${item.name}** (${item.code}) [${item.spec || '通用规格'}] - 数量: ==${item.orderedQty}${item.unit}==`;
                                      const textarea = textareaRef.current;
                                      if (!textarea) {
                                        setEditText(prev => prev ? prev + productString : productString.trim());
                                        return;
                                      }
                                      const startPos = textarea.selectionStart;
                                      const endPos = textarea.selectionEnd;
                                      const text = textarea.value;
                                      const nextVal = text.substring(0, startPos) + productString + text.substring(endPos);
                                      setEditText(nextVal);
                                      setTimeout(() => {
                                        textarea.focus();
                                        const newPos = startPos + productString.length;
                                        textarea.selectionStart = newPos;
                                        textarea.selectionEnd = newPos;
                                      }, 50);
                                    }}
                                    className={`p-2 rounded-lg border transition-all font-sans space-y-1 group/item relative ${
                                      isSelectedEditing 
                                        ? 'bg-amber-50/40 hover:bg-amber-100/90 hover:border-amber-400 border-amber-300/30 cursor-pointer active:scale-[0.98]' 
                                        : 'bg-white/50 hover:bg-white/80 border-slate-900/5 hover:border-slate-900/10'
                                    }`}
                                    title={isSelectedEditing ? "点击引用到便签备注中" : "关联采购产品核算清单"}
                                  >
                                    <div className="flex items-start justify-between gap-1.5">
                                      <span className={`font-extrabold break-words flex-1 transition-colors ${isSelectedEditing ? 'text-slate-900 group-hover/item:text-blue-700' : 'text-slate-900'}`} title={item.name}>
                                        {item.name}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        {isSelectedEditing && (
                                          <span className="opacity-0 group-hover/item:opacity-100 transition-all text-[8px] font-black bg-amber-500 text-slate-900 px-1 py-0.5 rounded-xs font-sans scale-95 origin-right">
                                            + 引入
                                          </span>
                                        )}
                                        <span className="font-mono text-[8px] text-slate-500 bg-slate-900/5 px-1 rounded-xs">
                                          {item.code}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-[9px] text-slate-600 truncate">
                                      规格: {item.spec || '通用标准'}
                                    </div>
                                    <div className="flex items-center justify-between font-mono text-[9px] border-t border-slate-900/5 pt-1 mt-1">
                                      <span className="text-slate-500">
                                        ¥{toSafeNumber(item.price).toFixed(2)} / {item.unit}
                                      </span>
                                      <span className="font-extrabold text-slate-900">
                                        Qty: {toSafeNumber(item.orderedQty).toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="text-right text-[9px] font-mono font-black text-slate-800">
                                      小计: ¥{formatYuan(toSafeNumber(item.orderedQty) * toSafeNumber(item.price))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Right Column: Note text & actions */}
                            <div className="md:col-span-7 flex flex-col justify-start">
                              <div className="flex items-center justify-between border-b border-slate-900/10 pb-1 mb-1 bg-transparent">
                                <span className="text-[10px] font-black text-slate-800 flex items-center gap-1">
                                  📝 便签备注内容 / NOTES DETAIL
                                </span>
                              </div>
                              {isSelectedEditing ? (
                                <div className="space-y-3">
                                  {/* Stylist floating bar toolbar */}
                                  <div className="flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200/90 rounded-lg shadow-xs">
                                    <button
                                      type="button"
                                      onClick={() => insertFormatting('**', '**')}
                                      className="p-1.5 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                      title="文本加粗 (包裹 **)"
                                    >
                                      <Bold className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => insertFormatting('*', '*')}
                                      className="p-1.5 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                      title="文本斜体 (包裹 *)"
                                    >
                                      <Italic className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => insertFormatting('==', '==')}
                                      className="p-1.5 text-slate-700 hover:text-slate-950 hover:bg-yellow-105 rounded-md transition-all text-yellow-650 cursor-pointer"
                                      title="标黄高亮 (包裹 == text ==)"
                                    >
                                      <Highlighter className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => insertFormatting('list')}
                                      className="p-1.5 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                                      title="添加项目符号 (包裹 - )"
                                    >
                                      <List className="w-4 h-4" />
                                    </button>
                                    <div className="h-4 w-px bg-slate-200 mx-1"></div>
                                    <span className="text-[9px] text-slate-400 font-sans hidden xl:inline select-none pr-1">
                                      选中文本后点击按钮
                                    </span>
                                  </div>

                                  <textarea
                                    ref={textareaRef}
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    className="w-full bg-white text-slate-900 border border-slate-200 rounded-xl p-3 text-xs leading-relaxed font-sans focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[140px] resize-y shadow-xs"
                                    placeholder="在此键入便签内容...
格式示例：
- 本批次 ==钢管硬度有异==
- **发货人**: 王经理"
                                  />

                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={handleCancelEditing}
                                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg shadow-2xs transition-all cursor-pointer"
                                    >
                                      取消
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveText(noteItem.id)}
                                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg shadow-xs hover:shadow transition-all cursor-pointer"
                                    >
                                      保存备注
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className={`prose max-w-none py-2 pr-1 selection:bg-yellow-250 min-h-[140px] ${noteSkin.text}`}>
                                  {parseRichText(noteItem.noteText)}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Solid ruled footer layout controls for coloring and removal */}
                      <div className="mt-4 pt-3 border-t border-dashed border-slate-900/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                        {/* Skeuomorphic Skin Pastel Switchers */}
                        <div className="flex items-center gap-1.5 bg-slate-900/5 px-2 py-1 rounded-lg">
                          <span className="text-[9px] font-mono text-slate-500 mr-1 uppercase select-none">
                            更换纸张色彩:
                          </span>
                          {(['yellow', 'blue', 'pink', 'green'] as const).map((colorKey) => {
                            const isSelected = noteItem.color === colorKey && !noteItem.customBg;
                            return (
                              <button
                                key={colorKey}
                                type="button"
                                onClick={() => handleColorChange(noteItem.id, colorKey)}
                                className={`w-4 h-4 rounded-full border border-slate-900/15 transition-transform ${
                                  isSelected ? 'ring-2 ring-slate-800 scale-125' : 'hover:scale-120 cursor-pointer'
                                }`}
                                style={{
                                  backgroundColor: 
                                    colorKey === 'yellow' ? '#fde047' :
                                    colorKey === 'blue' ? '#7dd3fc' :
                                    colorKey === 'pink' ? '#f472b6' : '#34d399'
                                }}
                                title={`切换标准 ${colorKey} 色型纸`}
                              />
                            );
                          })}
                          <div className="h-3 w-px bg-slate-300 mx-1 font-mono"></div>
                          <button
                            type="button"
                            onClick={() => handleRandomBgChange(noteItem.id)}
                            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all flex items-center gap-0.5 ${
                              noteItem.customBg 
                                ? 'bg-slate-800 text-white shadow-xs scale-105' 
                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 hover:scale-105 cursor-pointer'
                            }`}
                            title="立刻生成随机温暖的马克马卡龙便签填充色彩"
                          >
                            <span>🎲 随机填充</span>
                            {noteItem.customBg && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            )}
                          </button>
                        </div>

                        {/* Actions buttons */}
                        {!isSelectedEditing && (
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => handleStartEditing(noteItem.id, noteItem.noteText)}
                              className="px-3 py-1 bg-white hover:bg-slate-50 text-slate-755 text-[11px] font-extrabold border border-slate-300/60 rounded-md transition-all shadow-2xs hover:shadow-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5 text-blue-600" /> 编辑备注
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteNote(noteItem.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                              title="彻底删除当前便签"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                );
              }))}

            </div>

            {/* INDEX CARDS CHAT DIALOGUE DECK - Span 5 */}
            <div className="xl:col-span-12 lg:xl:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 font-mono tracking-wider flex items-center gap-1.5 uppercase">
                  <MessageSquare className="w-4 h-4 text-blue-600" /> 协同流转与处理评论 ({currentComments.length})
                </span>
              </div>

              {/* Stacked Deck container */}
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                {currentComments.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 bg-[#FAFBFD]/80 border border-dashed border-slate-200 rounded-xl font-mono text-xs shadow-2xs flex flex-col items-center justify-center gap-1">
                    <User className="w-6 h-6 text-slate-300 opacity-60 animate-bounce" />
                    <span>暂无关于该订单的流转记录意见。</span>
                    <span className="text-[10px] text-slate-400">利用下方评论区，支持跨部门交期追溯或处理纪要录入</span>
                  </div>
                ) : (
                  currentComments.map((comment, index) => {
                    // Tilt the physical index card cards organic look
                    const deg = index % 2 === 0 ? 'rotate-[0.5deg]' : 'rotate-[-0.6deg]';
                    return (
                      <div
                        key={comment.id}
                        className={`bg-white text-slate-800 p-3.5 rounded-xl border-l-[5px] border-l-blue-600 border-slate-200/90 shadow-sm transition-all hover:-translate-y-0.5 hover:rotate-0 duration-200 relative group ${deg}`}
                      >
                        {/* Audit Header */}
                        <div className="flex items-center justify-between text-[10px] font-mono mb-2 text-slate-500 border-b border-dashed border-slate-100 pb-1.5">
                          <span className="font-exrabold text-blue-800 font-sans flex items-center gap-1 bg-blue-50/70 px-1.5 py-0.5 rounded font-bold">
                            <User className="w-3 h-3" /> {comment.author}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {comment.time}
                          </span>
                        </div>
                        
                        {/* Note Body content */}
                        <p className="text-xs font-sans text-slate-700 leading-relaxed pr-6 break-words whitespace-pre-wrap">
                          {comment.content}
                        </p>

                        {/* Hover discard commentary card button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                          className="absolute top-3 right-3 text-slate-350 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-slate-55 cursor-pointer"
                          title="删除该记录"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Input post commenting form card */}
              <form onSubmit={handleAddComment} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                <div className="text-[10px] font-mono uppercase text-slate-400 tracking-wider font-extrabold flex items-center gap-1 bg-slate-50 p-1 pb-1.5 rounded">
                  <span>✒️ 新增处理意见 / WRITE CONCURRENT REPORT</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1 space-y-1">
                    <label className="text-[9px] font-mono text-slate-500 block">发稿角色/发言人</label>
                    <input
                      type="text"
                      value={commentAuthor}
                      onChange={(e) => setCommentAuthor(e.target.value)}
                      placeholder="如采购专员/仓管"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-sans focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[9px] font-mono text-slate-500 block">流传意见/处理纪要</label>
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="键入评论、协同进度或交期批注..."
                      className="w-full bg-slate-50 border border-[#2563EB]/25 focus:border-[#2563EB] rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-sans focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-mono font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-xs hover:shadow transition-colors cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" /> 提交流转批复 SUBMIT DIALOGUE
                </button>
              </form>

            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20 bg-white/40 border border-dashed border-slate-300 rounded-2xl">
            <Paperclip className="w-10 h-10 text-slate-400 mb-3 opacity-60" />
            <h5 className="font-extrabold text-slate-800 text-sm">暂未选择关联采购订单</h5>
            <p className="text-slate-500 text-xs mt-1 max-w-sm">
              左侧订单列表中点击任意订单即可立刻在该拟物面板上建立 or 编辑专属的富文本便签并开始和同事提交处理流转历史。
            </p>
          </div>
        )}

      </div>

    </div>
  );
}
