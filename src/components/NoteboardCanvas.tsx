import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Pin, Loader2, Image as ImageIcon, CheckSquare, Square, X as XIcon } from 'lucide-react';
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
  createdAt: string;
  updatedAt: string;
}

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

  const [items, setItems] = useState<NoteboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

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

  const orderedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
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
    setItems(prev => {
      const next = prev.map(item => {
        if (item.id !== id) return item;
        return { ...item, ...patch, updatedAt: new Date().toISOString() };
      });
      const target = next.find(item => item.id === id);
      if (target) void persistItem(target);
      return next;
    });
  };

  const handleDeleteItem = async (id: string) => {
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
    <div className="h-full flex flex-col gap-4">
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

      {/* 画布 */}
      <div className="flex-1 overflow-auto bg-slate-100 rounded-2xl border border-slate-200 p-4 md:p-6 shadow-inner [background-image:radial-gradient(#CBD5E1_1.2px,transparent_1.2px)] [background-size:24px_24px]">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            加载便签中…
          </div>
        ) : orderedItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 px-6">
            <div className="text-5xl mb-3">📝</div>
            <p className="text-xs font-bold text-slate-600 mb-1">画板还是空的</p>
            <p className="text-[11px] text-slate-400">点击右上「添加便签」开始记录任意内容</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: 'spring', damping: 22, stiffness: 220 }}
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
        className={`flex-1 p-3 text-xs leading-relaxed text-slate-800 outline-none font-sans empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 [&_img]:max-w-full ${
          selectionMode ? 'pointer-events-none select-none' : ''
        }`}
      />

      {/* 时间戳 */}
      <div className="px-3 py-1.5 border-t border-black/5 text-[9px] font-mono text-slate-500 flex items-center justify-between">
        <span>{new Date(item.updatedAt).toLocaleString('zh-CN', { hour12: false })}</span>
        {item.pinned && <span className="text-rose-600 font-bold">📌 置顶</span>}
      </div>
    </motion.div>
  );
}
