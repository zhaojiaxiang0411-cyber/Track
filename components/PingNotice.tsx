"use client";

import { formatDateTime, roleLabel, roleTeam } from "@/lib/format";
import { teamStyle } from "@/lib/teamStyles";
import type { Ping, Role } from "@/lib/types";
import { useState } from "react";
import { LiveDuration } from "./LiveDuration";

type PingNoticeProps = {
  ping: Ping;
  role: Role;
  onAck: (pairId: number) => Promise<void>;
  onDismiss: (pairId: number) => Promise<void>;
  onResend: (pairId: number) => Promise<void>;
  /** 「再催一次」是否可点：与发起呼叫同一条规则（当前步骤须由对方负责） */
  canResend: boolean;
};

/**
 * 卡片内的呼叫提示条，渲染在对应 pair 的 PairCard 里。呼叫总是针对某条 pipeline 的某一步，
 * 和它的步骤按钮放在一起才看得懂上下文，也不会让无关的人被顶部横幅打扰。
 * 顶部 PingBanner 退化为兜底：只在该 pair 被筛选掉、当前列表里看不见时才出现。
 *
 * 两种形态：
 * - 别人呼叫我：按呼叫方 team 配色的醒目提示 +「已收到」，点一下才消失。
 * - 我呼叫别人：低调提示 + 等待时长，可「再催一次」或「收起」；对方确认后转绿。
 *
 * 被呼叫方一旦确认，自己这条就不再显示（回执是给发起方看的），无需再手动关。
 */
export function PingNotice({
  ping,
  role,
  onAck,
  onDismiss,
  onResend,
  canResend,
}: PingNoticeProps) {
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  // 呼叫记录的是发起时的步骤号，可能与卡片当前步骤不同，故仍然标出来
  const stepSuffix = ping.stepOrder !== null ? ` · 步骤 #${ping.stepOrder}` : "";

  if (ping.toRole === role && !ping.ackedAt) {
    const fromTeam = roleTeam(ping.fromRole);
    const style = fromTeam ? teamStyle(fromTeam).banner : "";
    return (
      <div
        className={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 ${style}`}
      >
        <span className="flex flex-1 items-center gap-2 text-sm font-semibold">
          <span className="inline-block h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-current" />
          <span>
            {roleLabel(ping.fromRole)} 呼叫你确认{stepSuffix}
            <span className="ml-1 font-normal opacity-75">
              · 已等 <LiveDuration startedAt={ping.createdAt} />
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => run(() => onAck(ping.pairId))}
          disabled={busy}
          className="flex-none rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? "确认中…" : "已收到"}
        </button>
      </div>
    );
  }

  if (ping.fromRole === role) {
    return (
      <div
        className={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2 text-xs ring-1 ${
          ping.ackedAt
            ? "bg-emerald-50 text-emerald-900 ring-emerald-300"
            : "bg-slate-50 text-slate-600 ring-slate-200"
        }`}
      >
        {ping.ackedAt ? (
          <span className="font-medium">
            {roleLabel(ping.toRole)} 已确认收到
            <span className="ml-1 font-normal opacity-75">
              {formatDateTime(ping.ackedAt)}
            </span>
          </span>
        ) : (
          <span>
            已呼叫 {roleLabel(ping.toRole)} 确认{stepSuffix}
            <span className="ml-1 opacity-75">
              · 等待中 <LiveDuration startedAt={ping.createdAt} />
            </span>
          </span>
        )}
        <span className="flex flex-none items-center gap-2">
          {/* 已确认就不给「再催一次」：那时该看的是流水线本身，想重新喊先「收起」 */}
          {!ping.ackedAt && (
            <button
              type="button"
              onClick={() => run(() => onResend(ping.pairId))}
              disabled={busy || !canResend}
              title={
                canResend
                  ? "再喊一声，刷新等待时刻并清掉旧回执"
                  : "当前步骤不由对方负责，轮到对方时才能呼叫确认"
              }
              className="rounded-lg bg-amber-50 px-2 py-1 font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "处理中…" : "再催一次"}
            </button>
          )}
          <button
            type="button"
            onClick={() => run(() => onDismiss(ping.pairId))}
            disabled={busy}
            className="rounded-lg px-2 py-1 font-medium text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-60"
          >
            {busy ? "收起中…" : "收起"}
          </button>
        </span>
      </div>
    );
  }

  // 与我无关（游客，或别人之间的呼叫）
  return null;
}
