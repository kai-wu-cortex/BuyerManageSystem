import React, { useState } from 'react';
import { Cloud, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';

interface SystemLoginProps {
  isConfigured: boolean;
  isSigningIn: boolean;
  error: string | null;
  onSignIn: (username: string, password: string) => Promise<void>;
}

export default function SystemLogin({
  isConfigured,
  isSigningIn,
  error,
  onSignIn,
}: SystemLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSignIn(username, password);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.05fr_0.95fr] overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
        <section className="bg-[#111827] p-8 sm:p-10 flex flex-col justify-between gap-12">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-blue-500/15 border border-blue-400/30 flex items-center justify-center">
                <Cloud className="h-5 w-5 text-blue-300" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight">NovaSpark Buyer System</h1>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">采购管理系统 v4.2</p>
              </div>
            </div>

            <div className="space-y-4 max-w-md">
              <p className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
                采购系统登入验证
              </p>
              <p className="text-sm leading-6 text-slate-300">
                使用系统账号密码登入，业务数据会在登入后连接云端数据库。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-mono text-slate-500">ENV</p>
              <p className="mt-1 font-bold text-slate-200">buyersystem</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-mono text-slate-500">AUTH</p>
              <p className="mt-1 font-bold text-emerald-300">数据库账号认证</p>
            </div>
          </div>
        </section>

        <section className="p-8 sm:p-10 bg-[#F8FAFC] text-slate-900">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">System Login</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">登入系统</h2>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-xs font-black text-slate-600">用户名</span>
              <span className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
                <UserRound className="h-4 w-4 text-slate-400" />
                <input
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  autoComplete="username"
                  className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                  placeholder="系统用户名"
                  type="text"
                />
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-black text-slate-600">密码</span>
              <span className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
                <LockKeyhole className="h-4 w-4 text-slate-400" />
                <input
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                  placeholder="系统密码"
                  type="password"
                />
              </span>
            </label>

            {(!isConfigured || error) && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-600">
                {isConfigured ? error : 'CloudBase 环境未配置，无法登入系统。'}
              </div>
            )}

            <button
              type="submit"
              disabled={!isConfigured || isSigningIn}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSigningIn ? '正在验证...' : '登入'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}