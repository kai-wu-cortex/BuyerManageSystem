import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Pin, Loader2, Image as ImageIcon, CheckSquare, Square, X as XIcon, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import {
  deleteDocument,
  listDocuments,
  setDocument,
  type CloudbaseAuthUser,
} from '../lib/cloudbaseData';

const COLLECTION = 'noteboard_items';

type StickyColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple';

const COLOR_SKINS: Record<StickyColor, { bg: string; border: string; chip: string }> = {
  yellow: { bg: 'bg-yellow-100', border: 'border-yellow-300', chip: 'bg-yellow-400' },
  pink: { bg: 'bg-pink-100', border: 'border-pink-300', chip: 'bg-pink-400' },
  blue: { bg: 'bg-sky-100', border: 'border-sky-300', chip: 'bg-sky-400' },
  green: { bg: 'bg-emerald-100', border: 'border-emerald-300', chip: 'bg-emerald-400' },
  purple: { bg: 'bg-violet-100', border: 'border-violet-300', chip: 'bg-violet-400' },
};

interface NoteboardItem {
  id: string;
  uid: string;
  /** 富文本 HTML 内容（contentEditable 直接吐出） */
  html: string;
  color: StickyColor;
  pinned: boolean;
  /** 用户可调整的便签宽度（像素），未设则使用默认 */
  width?: number;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_NOTE_WIDTH = 260;
const MIN_NOTE_WIDTH = 160;
const MAX_NOTE_WIDTH = 600;

interface NoteboardCanvasProps {
  authUser: CloudbaseAuthUser | null;
}

function ownerDocId(uid: string, noteId: string): string {
  return `${uid}__${noteId}`;
}

// 把粘贴板/拖拽的图片转 base64 内嵌到便签 HTML 中
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      resolve(typeof value === 'string' ? value : '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function NoteboardCanvas({ authUser }: NoteboardCanvasProps) {
  const uid = authUser?.uid ?? 'anon';

  const NOTEBOARD_STORAGE_KEY = 'noteboard_items';

  const [items, setItems] = useState<NoteboardItem[]>(() => {
    try {
      const stored = localStorage.getItem(NOTEBOARD_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });
  const itemsRef = useRef<NoteboardItem[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const persistTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // 全屏切换
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 画布缩放级别 (50% ~ 200%)
  const [zoom, setZoom] = useState(1);
  const ZOOM_STEP = 0.1;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2;

  // 中键拖动 / 触控板平移状态
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // 按 Esc 退出全屏
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // 原生 wheel 事件：必须 passive:false 才能 preventDefault
  // 同时统一处理 Ctrl/Cmd+滚轮 (鼠标缩放) 和触控板捏合手势 (浏览器自动设 ctrlKey=true)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      // 触控板捏合 OR 鼠标 Ctrl/Cmd + 滚轮 → 缩放
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        // 触控板捏合的 deltaY 较小且连续，鼠标滚轮 deltaY 较大
        // 用更细的步长以适配触控板
        const delta = event.deltaY;
        const factor = Math.abs(delta) < 20 ? 0.02 : ZOOM_STEP;
        setZoom(prev => {
          const next = prev - Math.sign(delta) * factor;
          return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
        });
        return;
      }
      // 触控板两指拖动 → 滚动画布（浏览器默认就会触发 scroll，不需要 preventDefault）
      // shift + 滚轮 → 横向滚动（浏览器自带，不需手动处理）
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // 中键拖动画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (event: MouseEvent) => {
      // button: 0=左键 1=中键 2=右键
      if (event.button !== 1) return;
      event.preventDefault();
      panStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: canvas.scrollLeft,
        scrollTop: canvas.scrollTop,
      };
      setIsPanning(true);
    };

    const onMouseMove = (event: MouseEvent) => {
      const state = panStateRef.current;
      if (!state) return;
      event.preventDefault();
      canvas.scrollLeft = state.scrollLeft - (event.clientX - state.startX);
      canvas.scrollTop = state.scrollTop - (event.clientY - state.startY);
    };

    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 1) return;
      panStateRef.current = null;
      setIsPanning(false);
    };

    const onMouseLeave = () => {
      panStateRef.current = null;
      setIsPanning(false);
    };

    // 鼠标中键默认会触发"自动滚动模式"（光标变指南针），通过取消 auxclick 阻止
    const onAuxClick = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('auxclick', onAuxClick);

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('auxclick', onAuxClick);
    };
  }, []);

  // 防止多选模式下选中文本时 useEffect 反复 setState
  useEffect(() => {
    if (!selectionMode) setSelectedIds(new Set());
  }, [selectionMode]);

  // 初次加载
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listDocuments<NoteboardItem>(COLLECTION)
      .then(records => {
        if (cancelled) return;
        const own = records.filter(r => r.uid === uid);
        setItems(own);
      })
      .catch(err => {
        console.error('Noteboard load failed', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    try {
      localStorage.setItem(NOTEBOARD_STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const orderedItems = useMemo(() => {
    // 排序按创建时间倒序，编辑/调宽度/换颜色都不会改变便签位置
    // 仅置顶状态变化会让置顶卡片浮到最前
    return [...items].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [items]);

  const markSaving = (id: string, isSaving: boolean) => {
    setSavingIds(prev => {
      const next = new Set(prev);
      if (isSaving) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const persistItem = async (item: NoteboardItem) => {
    markSaving(item.id, true);
    try {
      await setDocument(COLLECTION, ownerDocId(uid, item.id), item);
    } catch (err) {
      console.error('Save noteboard item failed', err);
    } finally {
      markSaving(item.id, false);
    }
  };

  const debouncedPersist = (item: NoteboardItem, delay = 800) => {
    const existing = persistTimersRef.current.get(item.id);
    if (existing) clearTimeout(existing);
    persistTimersRef.current.set(
      item.id,
      setTimeout(() => {
        persistTimersRef.current.delete(item.id);
        void persistItem(item);
      }, delay)
    );
  };

  const handleAddNote = () => {
    const now = new Date().toISOString();
    const newItem: NoteboardItem = {
      id: `nb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      uid,
      html: '',
      color: 'yellow',
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    setItems(prev => [newItem, ...prev]);
    void persistItem(newItem);
  };

  const handleUpdateItem = (id: string, patch: Partial<NoteboardItem>) => {
    const now = new Date().toISOString();
    setItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, ...patch, updatedAt: now } : item
      )
    );
    const current = itemsRef.current.find(item => item.id === id);
    if (current) {
      const merged = { ...current, ...patch, updatedAt: now };
      if ('html' in patch) {
        debouncedPersist(merged, 800);
      } else {
        debouncedPersist(merged, 300);
      }
    }
  };

  const handleDeleteItem = async (id: string) => {
    const deletedItem = itemsRef.current.find(item => item.id === id);
    setItems(prev => prev.filter(item => item.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      await deleteDocument(COLLECTION, ownerDocId(uid, id));
    } catch (err) {
      console.error('Delete noteboard item failed', err);
      if (deletedItem) {
        setItems(prev => [...prev, deletedItem]);
      }
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === orderedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orderedItems.map(i => i.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedIds.size} 张便签？`)) return;
    const ids: string[] = Array.from(selectedIds);
    setItems(prev => prev.filter(item => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
    await Promise.all(
      ids.map(id =>
        deleteDocument(COLLECTION, ownerDocId(uid, id)).catch(err =>
          console.error('Batch delete failed for', id, err),
        ),
      ),
    );
  };

  const handleBatchSetColor = (color: StickyColor) => {
    if (selectedIds.size === 0) return;
    const now = new Date().toISOString();
    const toUpdate: NoteboardItem[] = [];
    setItems(prev => {
      const next = prev.map(item => {
        if (!selectedIds.has(item.id)) return item;
        const updated = { ...item, color, updatedAt: now };
        toUpdate.push(updated);
        return updated;
      });
      return next;
    });
    toUpdate.forEach(item => {
      void persistItem(item);
    });
  };

  const handleBatchPin = (pinned: boolean) => {
    if (selectedIds.size === 0) return;
    const now = new Date().toISOString();
    const toUpdate: NoteboardItem[] = [];
    setItems(prev => {
      const next = prev.map(item => {
        if (!selectedIds.has(item.id)) return item;
        const updated = { ...item, pinned, updatedAt: now };
        toUpdate.push(updated);
        return updated;
      });
      return next;
    });
    toUpdate.forEach(item => {
      void persistItem(item);
    });
  };

  return (
    <div
      className={`flex flex-col gap-4 ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] bg-slate-50 p-4'
          : 'h-full'
      }`}
    >
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-white text-lg shadow-md">
            📝
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 font-sans">便签画板</h2>
            <p className="text-[10px] text-slate-400 font-mono">
              {orderedItems.length} 张便签 · 数据云同步 · 支持富文本与图片
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 缩放控件 */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10))}
              disabled={zoom <= ZOOM_MIN}
              className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
              title="缩小 (Ctrl + 滚轮)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-2 py-1.5 text-[10px] font-mono font-bold text-slate-600 hover:bg-slate-50 min-w-[44px]"
              title="重置缩放"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10))}
              disabled={zoom >= ZOOM_MAX}
              className="px-2 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed border-l border-slate-200"
              title="放大 (Ctrl + 滚轮)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* 重置缩放（独立按钮，更明显） */}
          {zoom !== 1 && (
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              title="重置缩放"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* 全屏切换 */}
          <button
            type="button"
            onClick={() => setIsFullscreen(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            title={isFullscreen ? '退出全屏 (Esc)' : '全屏'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {isFullscreen ? '退出全屏' : '全屏'}
          </button>

          <button
            type="button"
            onClick={() => setSelectionMode(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
              selectionMode
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            {selectionMode ? '退出多选' : '多选'}
          </button>

          {!selectionMode && (
            <button
              type="button"
              onClick={handleAddNote}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#2563EB] text-white hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              添加便签
            </button>
          )}
        </div>
      </div>

      {/* 多选批量操作条 */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5"
          >
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900"
            >
              {selectedIds.size === orderedItems.length && orderedItems.length > 0 ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {selectedIds.size === orderedItems.length && orderedItems.length > 0 ? '取消全选' : '全选'}
            </button>

            <span className="text-xs font-mono text-slate-600">
              已选 <strong className="text-blue-700">{selectedIds.size}</strong> / {orderedItems.length} 张
            </span>

            <div className="h-4 w-px bg-blue-200" />

            <span className="text-[10px] text-slate-500 font-mono">批量颜色:</span>
            <div className="flex items-center gap-1">
              {(Object.keys(COLOR_SKINS) as StickyColor[]).map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleBatchSetColor(color)}
                  disabled={selectedIds.size === 0}
                  className={`w-4 h-4 rounded-full ${COLOR_SKINS[color].chip} hover:scale-110 transition-transform disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={`批量改为 ${color}`}
                />
              ))}
            </div>

            <div className="h-4 w-px bg-blue-200" />

            <button
              type="button"
              onClick={() => handleBatchPin(true)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-md border border-blue-200 bg-white text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Pin className="w-3 h-3" />
              批量置顶
            </button>
            <button
              type="button"
              onClick={() => handleBatchPin(false)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-md border border-blue-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              取消置顶
            </button>
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3 h-3" />
              批量删除
            </button>

            <button
              type="button"
              onClick={() => setSelectionMode(false)}
              className="ml-auto p-1 rounded hover:bg-blue-100 text-slate-500"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 画布 (Ctrl/Cmd + 滚轮 / 触控板捏合 缩放; 中键拖动平移) */}
      <div
        ref={canvasRef}
        className={`flex-1 overflow-auto bg-slate-100 rounded-2xl border border-slate-200 p-4 md:p-6 shadow-inner [background-image:radial-gradient(#CBD5E1_1.2px,transparent_1.2px)] [background-size:24px_24px] ${
          isPanning ? 'cursor-grabbing select-none' : ''
        }`}
      >
        <div
          className="transition-[zoom] duration-150"
          style={{ zoom }}
        >
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono py-16">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              加载便签中…
            </div>
          ) : orderedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-slate-400 px-6 py-16">
              <div className="text-5xl mb-3">📝</div>
              <p className="text-xs font-bold text-slate-600 mb-1">画板还是空的</p>
              <p className="text-[11px] text-slate-400">点击右上「添加便签」开始记录任意内容</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 items-start">
              <AnimatePresence>
                {orderedItems.map(item => (
                  <NoteCard
                    key={item.id}
                    item={item}
                    isSaving={savingIds.has(item.id)}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onPatch={patch => handleUpdateItem(item.id, patch)}
                    onDelete={() => handleDeleteItem(item.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 单张便签卡片 ─────────────────────────────────────────────────────

interface NoteCardProps {
  item: NoteboardItem;
  isSaving: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onPatch: (patch: Partial<NoteboardItem>) => void;
  onDelete: () => void;
  key?: string;
}

function NoteCard({ item, isSaving, selectionMode, isSelected, onToggleSelect, onPatch, onDelete }: NoteCardProps) {
  const skin = COLOR_SKINS[item.color];
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 只在 html 内容外部变化时同步到 DOM（避免每次输入都重置光标）
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== item.html) {
      editor.innerHTML = item.html;
    }
  }, [item.html]);

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    onPatch({ html: editorRef.current.innerHTML });
  };

  // 粘贴板：图片自动转 base64 插入，文本走默认
  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardItems = event.clipboardData?.items;
    if (!clipboardItems) return;
    for (let i = 0; i < clipboardItems.length; i += 1) {
      const clipItem = clipboardItems[i];
      if (clipItem.kind === 'file' && clipItem.type.startsWith('image/')) {
        event.preventDefault();
        const file = clipItem.getAsFile();
        if (!file) continue;
        const dataUrl = await fileToDataUrl(file);
        insertImageAtCursor(dataUrl);
        if (editorRef.current) onPatch({ html: editorRef.current.innerHTML });
        return;
      }
    }
  };

  // 拖拽图片到便签
  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    event.preventDefault();
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const dataUrl = await fileToDataUrl(file);
        insertImageAtCursor(dataUrl);
      }
    }
    if (editorRef.current) onPatch({ html: editorRef.current.innerHTML });
  };

  const handleFilePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const dataUrl = await fileToDataUrl(file);
    editorRef.current?.focus();
    insertImageAtCursor(dataUrl);
    if (editorRef.current) onPatch({ html: editorRef.current.innerHTML });
    event.target.value = '';
  };

  const insertImageAtCursor = (src: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const img = `<img src="${src}" style="max-width:100%; border-radius:6px; margin:4px 0;" />`;
    // 使用 execCommand 在光标处插入
    document.execCommand('insertHTML', false, img);
  };

  // 宽度拖动调节
  const widthDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const handleWidthDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    widthDragRef.current = {
      startX: event.clientX,
      startWidth: item.width ?? DEFAULT_NOTE_WIDTH,
    };
    const onMove = (ev: MouseEvent) => {
      const state = widthDragRef.current;
      if (!state) return;
      const next = Math.min(MAX_NOTE_WIDTH, Math.max(MIN_NOTE_WIDTH, state.startWidth + (ev.clientX - state.startX)));
      onPatch({ width: Math.round(next) });
    };
    const onUp = () => {
      widthDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: 'spring', damping: 22, stiffness: 220 }}
      style={{ width: item.width ?? DEFAULT_NOTE_WIDTH }}
      className={`${skin.bg} ${skin.border} border rounded-xl shadow-md flex flex-col min-h-[180px] hover:shadow-lg transition-shadow group relative ${
        selectionMode && isSelected ? 'ring-4 ring-blue-400 ring-offset-2 ring-offset-slate-100' : ''
      }`}
      onDrop={handleDrop}
      onDragOver={event => event.preventDefault()}
    >
      {/* 多选模式遮罩：整卡片可点 */}
      {selectionMode && (
        <button
          type="button"
          onClick={onToggleSelect}
          className="absolute inset-0 z-10 rounded-xl"
          title="点击选中/取消选中"
        >
          <span className="sr-only">选中</span>
        </button>
      )}

      {selectionMode && (
        <div className="absolute top-2 right-2 z-20 pointer-events-none">
          {isSelected ? (
            <CheckSquare className="w-5 h-5 text-blue-600 bg-white rounded" />
          ) : (
            <Square className="w-5 h-5 text-slate-400 bg-white/80 rounded" />
          )}
        </div>
      )}

      {/* 顶部工具栏（非多选模式才显示） */}
      {!selectionMode && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-black/5">
          <div className="flex items-center gap-1">
            {(Object.keys(COLOR_SKINS) as StickyColor[]).map(color => (
              <button
                key={color}
                type="button"
                onClick={() => onPatch({ color })}
                className={`w-3 h-3 rounded-full ${COLOR_SKINS[color].chip} ${
                  item.color === color ? 'ring-2 ring-slate-800 scale-110' : 'hover:scale-110'
                } transition-transform`}
                title={color}
              />
            ))}
          </div>

          <div className="flex items-center gap-1">
            {isSaving && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFilePick}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1 rounded hover:bg-black/10 text-slate-500 transition-colors"
              title="插入图片"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onPatch({ pinned: !item.pinned })}
              className={`p-1 rounded hover:bg-black/10 transition-colors ${item.pinned ? 'text-rose-600' : 'text-slate-400'}`}
              title={item.pinned ? '取消置顶' : '置顶'}
            >
              <Pin className={`w-3.5 h-3.5 ${item.pinned ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('确定删除这张便签？')) onDelete();
              }}
              className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 富文本编辑区 */}
      <div
        ref={editorRef}
        contentEditable={!selectionMode}
        suppressContentEditableWarning
        onInput={handleEditorInput}
        onPaste={handlePaste}
        data-placeholder="在这里写点什么，可粘贴/拖拽图片…"
        className={`flex-1 p-3 text-xs leading-relaxed text-slate-800 outline-none font-sans empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 [&_img]:max-w-full [&_img]:h-auto [&_img]:block ${
          selectionMode ? 'pointer-events-none select-none' : ''
        }`}
      />

      {/* 时间戳 */}
      <div className="px-3 py-1.5 border-t border-black/5 text-[9px] font-mono text-slate-500 flex items-center justify-between">
        <span>{new Date(item.updatedAt).toLocaleString('zh-CN', { hour12: false })}</span>
        {item.pinned && <span className="text-rose-600 font-bold">📌 置顶</span>}
      </div>

      {/* 宽度调节手柄（右下角） */}
      {!selectionMode && (
        <div
          onMouseDown={handleWidthDragStart}
          onDoubleClick={event => {
            event.stopPropagation();
            onPatch({ width: DEFAULT_NOTE_WIDTH });
          }}
          title="拖动调整宽度 · 双击恢复默认"
          className="absolute bottom-1 right-1 w-3 h-3 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            backgroundImage: 'linear-gradient(135deg, transparent 50%, rgb(100 116 139) 50%, rgb(100 116 139) 60%, transparent 60%, transparent 70%, rgb(100 116 139) 70%, rgb(100 116 139) 80%, transparent 80%)',
          }}
        />
      )}
    </motion.div>
  );
}
