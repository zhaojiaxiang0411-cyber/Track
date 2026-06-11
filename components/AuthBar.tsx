"use client";

import type { SessionUser } from "@/lib/types";
import { useState } from "react";

type AuthBarProps = {
  user: SessionUser;
  loading: boolean;
  onLogin: (username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
};

const ROLE_LABEL: Record<SessionUser["role"], string> = {
  admin: "全部权限",
  homison: "仅 homison 步骤",
  guest: "只读",
};

const ROLE_BADGE: Record<SessionUser["role"], string> = {
  admin: "bg-blue-100 text-blue-800",
  homison: "bg-orange-100 text-orange-800",
  guest: "bg-slate-100 text-slate-600",
};

export function AuthBar({ user, loading, onLogin, onLogout }: AuthBarProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onLogin(username, password);
      setUsername("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <span className="text-xs text-slate-400">…</span>;
  }

  if (user.role !== "guest") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">已登录</span>
        <span className="font-semibold text-slate-800">{user.username}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_BADGE[user.role]}`}
        >
          {ROLE_LABEL[user.role]}
        </span>
        <button
          type="button"
          onClick={() => onLogout()}
          className="rounded-lg px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          登出
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
        未登录 · 只读
      </span>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="用户名"
        autoComplete="username"
        className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="密码"
        autoComplete="current-password"
        className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        required
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "登录中…" : "登录"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
