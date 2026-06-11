import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Pin, Loader2 } from 'lucide-react';
import {
  deleteDocument,
  getDocument,
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
  uid: string;        // 隔离不同用户
  text: string;
  color: StickyColor;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NoteboardCanvasProps {
  authUser: CloudbaseAuthUser | null;
}

function ownerDocId(uid: string, noteId: string): string {
  // 用户命名空间 + 便签 id，避免不同用户的便签互相覆盖
  return `${uid}__${noteId}`;
}

export default function NoteboardCanvas({ authUser }: NoteboardCanvasProps) {
  const uid = authUser?.uid ?? 'anon';

  const [items, setItems] = useState<NoteboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // 初次加载
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listDocuments<NoteboardItem>(COLLECTION)
      .then(records => {
        if (cancelled) return;
        // 仅显示当前 uid 的便签（noteboard_items 按 uid 命名空间存储）
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
      // 置顶优先 → 然后按 updatedAt 倒序
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
      text: '',
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
    try {
      await deleteDocument(COLLECTION, ownerDocId(uid, id));
    } catch (err) {
      console.error('Delete noteboard item failed', err);
    }
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
            <p className="text-[10px] text-slate-400 font-mono">{orderedItems.length} 张便签 · 数据云同步</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddNote}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#2563EB] text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            添加便签
          </button>
        </div>
      </div>

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
              {orderedItems.map(item => {
                const skin = COLOR_SKINS[item.color];
                const isSaving = savingIds.has(item.id);
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 220 }}
                    className={`${skin.bg} ${skin.border} border rounded-xl shadow-md flex flex-col min-h-[180px] hover:shadow-lg transition-shadow group`}
                  >
                    {/* 顶部工具 */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-black/5">
                      <div className="flex items-center gap-1">
                        {(Object.keys(COLOR_SKINS) as StickyColor[]).map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => handleUpdateItem(item.id, { color })}
                            className={`w-3 h-3 rounded-full ${COLOR_SKINS[color].chip} ${
                              item.color === color ? 'ring-2 ring-slate-800 scale-110' : 'hover:scale-110'
                            } transition-transform`}
                            title={color}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-1">
                        {isSaving && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
                        <button
                          type="button"
                          onClick={() => handleUpdateItem(item.id, { pinned: !item.pinned })}
                          className={`p-1 rounded hover:bg-black/10 transition-colors ${item.pinned ? 'text-rose-600' : 'text-slate-400'}`}
                          title={item.pinned ? '取消置顶' : '置顶'}
                        >
                          <Pin className={`w-3.5 h-3.5 ${item.pinned ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('确定删除这张便签？')) {
                              void handleDeleteItem(item.id);
                            }
                          }}
                          className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 编辑区 */}
                    <textarea
                      value={item.text}
                      onChange={event => handleUpdateItem(item.id, { text: event.target.value })}
                      placeholder="在这里写点什么…"
                      className="flex-1 bg-transparent p-3 text-xs leading-relaxed text-slate-800 resize-none outline-none placeholder:text-slate-400 font-sans"
                    />

                    {/* 时间戳 */}
                    <div className="px-3 py-1.5 border-t border-black/5 text-[9px] font-mono text-slate-500 flex items-center justify-between">
                      <span>{new Date(item.updatedAt).toLocaleString('zh-CN', { hour12: false })}</span>
                      {item.pinned && <span className="text-rose-600 font-bold">📌 置顶</span>}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

void getDocument; // 预留：未来按 id 拉单条
