import NoteboardCanvas from './NoteboardCanvas';
import type { CloudbaseAuthUser } from '../lib/cloudbaseData';

export type MiniAppId = 'noteboard';

interface MiniAppLauncherProps {
  activeApp: MiniAppId | null;
  onSelectApp: (id: MiniAppId | null) => void;
  authUser: CloudbaseAuthUser | null;
}

const APPS: { id: MiniAppId; name: string; gradient: string; emoji: string; subtitle: string }[] = [
  {
    id: 'noteboard',
    name: '便签画板',
    gradient: 'from-amber-300 via-orange-400 to-rose-500',
    emoji: '📝',
    subtitle: '记录灵感与待办',
  },
];

export default function MiniAppLauncher({ activeApp, onSelectApp, authUser }: MiniAppLauncherProps) {
  if (activeApp === 'noteboard') {
    return (
      <div className="h-full flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onSelectApp(null)}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          ← 返回小程序
        </button>
        <div className="flex-1 min-h-0">
          <NoteboardCanvas authUser={authUser} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900 font-sans">小程序</h2>
          <p className="text-xs text-slate-500 mt-1">系统自带的轻量工具，不受台账数据影响</p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-6">
          {APPS.map(app => (
            <button
              key={app.id}
              type="button"
              onClick={() => onSelectApp(app.id)}
              className="flex flex-col items-center gap-2 group focus:outline-none"
            >
              <div
                className={`w-16 h-16 rounded-[18px] bg-gradient-to-br ${app.gradient} flex items-center justify-center text-3xl shadow-md group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-200 group-active:scale-95`}
              >
                {app.emoji}
              </div>
              <div className="text-center">
                <p className="text-[11px] font-semibold text-slate-800">{app.name}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{app.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
