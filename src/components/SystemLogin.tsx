import React, { useState } from 'react';
import { Cloud, KeyRound, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import type { CloudbaseOtpMethod } from '../lib/cloudbaseData';

type LoginMode = 'password' | CloudbaseOtpMethod;

interface SystemLoginProps {
  isConfigured: boolean;
  isSigningIn: boolean;
  isSendingOtp: boolean;
  otpMethod: CloudbaseOtpMethod | null;
  otpTarget: string | null;
  error: string | null;
  onSignIn: (username: string, password: string) => Promise<void>;
  onSendOtp: (method: CloudbaseOtpMethod, target: string) => Promise<void>;
  onVerifyOtp: (code: string) => Promise<void>;
}

const loginModes: { id: LoginMode; label: string }[] = [
  { id: 'password', label: '账号密码' },
  { id: 'phone', label: '短信验证码' },
  { id: 'email', label: '邮箱验证' },
];

export default function SystemLogin({
  isConfigured,
  isSigningIn,
  isSendingOtp,
  otpMethod,
  otpTarget,
  error,
  onSignIn,
  onSendOtp,
  onVerifyOtp,
}: SystemLoginProps) {
  const [mode, setMode] = useState<LoginMode>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const activeOtpTarget = otpMethod === mode ? otpTarget : null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === 'password') {
      void onSignIn(username, password);
      return;
    }

    if (!activeOtpTarget) {
      void onSendOtp(mode, mode === 'phone' ? phone : email);
      return;
    }

    void onVerifyOtp(otpCode);
  };

  const handleModeChange = (nextMode: LoginMode) => {
    setMode(nextMode);
    setOtpCode('');
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
                <p className="text-xs font-semibold text-slate-400 mt-0.5">CloudBase Identity Gateway</p>
              </div>
            </div>

            <div className="space-y-4 max-w-md">
              <p className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
                采购系统登入验证
              </p>
              <p className="text-sm leading-6 text-slate-300">
                使用 CloudBase SDK 认证账号进入系统，业务数据会在登入后再连接云端数据库。
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
              <p className="mt-1 font-bold text-emerald-300">Password / SMS / Email</p>
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
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
              {loginModes.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleModeChange(item.id)}
                  className={`rounded-md px-2 py-2 text-xs font-black transition ${
                    mode === item.id
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {mode === 'password' && (
              <>
                <label className="block">
                  <span className="text-xs font-black text-slate-600">用户名</span>
                  <span className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
                    <UserRound className="h-4 w-4 text-slate-400" />
                    <input
                      value={username}
                      onChange={event => setUsername(event.target.value)}
                      autoComplete="username"
                      className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                      placeholder="CloudBase 用户名"
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
                      placeholder="CloudBase 密码"
                      type="password"
                    />
                  </span>
                </label>
              </>
            )}

            {mode === 'phone' && (
              <label className="block">
                <span className="text-xs font-black text-slate-600">手机号</span>
                <span className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <input
                    value={phone}
                    onChange={event => setPhone(event.target.value)}
                    autoComplete="tel"
                    className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                    placeholder="13800138000 或 +8613800138000"
                    type="tel"
                  />
                </span>
              </label>
            )}

            {mode === 'email' && (
              <label className="block">
                <span className="text-xs font-black text-slate-600">邮箱</span>
                <span className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <input
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    autoComplete="email"
                    className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                    placeholder="name@example.com"
                    type="email"
                  />
                </span>
              </label>
            )}

            {mode !== 'password' && activeOtpTarget && (
              <label className="block">
                <span className="text-xs font-black text-slate-600">验证码</span>
                <span className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  <input
                    value={otpCode}
                    onChange={event => setOtpCode(event.target.value)}
                    autoComplete="one-time-code"
                    className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                    placeholder="输入收到的验证码"
                    type="text"
                  />
                </span>
                <span className="mt-2 block text-[11px] font-semibold text-slate-500">
                  验证码已发送至 {activeOtpTarget}
                </span>
              </label>
            )}

            {(!isConfigured || error) && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-600">
                {isConfigured ? error : 'CloudBase 环境未配置，无法登入系统。'}
              </div>
            )}

            <button
              type="submit"
              disabled={!isConfigured || isSigningIn || isSendingOtp}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSigningIn
                ? '正在验证...'
                : isSendingOtp
                  ? '正在发送...'
                  : mode === 'password'
                    ? '登入'
                    : activeOtpTarget
                      ? '验证并登入'
                      : '发送验证码'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
