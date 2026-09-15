"use client";

import { formatDateTime, roleLabel, roleTeam } from "@/lib/format";
import { teamStyle } from "@/lib/teamStyles";
import type { PairWithSteps, Ping, Role } from "@/lib/types";
import { useState } from "react";
import { LiveDuration } from "./LiveDuration";

type PingBannerProps = {
  pings: Ping[];
  /** 用于把 pairId 还原成「Pair 201 – 202」这样的显示名 */
  pairs: PairWithSteps[];
  /** 当前卡片列表里能看到的 pair；看得见的交给卡片内的 PingNotice 呈现 */
  visiblePairIds: ReadonlySet<number>;
  role: Role;
  onAck: (pairId: number) => Promise<void>;
  onDismiss: (pairId: number) => Promise<void>;
  onJumpToPair: (pairId: number) => void;
};

/**
 * 顶部呼叫横幅的兜底形态。呼叫提示主场在对应 pair 的卡片里（见 PingNotice），
 * 但卡片可能被筛选条 / Owner 筛选挡掉，那样呼叫就石沉大海了 —— 这时才在顶部露一条，
 * 点击可跳转（handleJumpToPair 会顺带放开筛选）。两种形态与卡片内一致：
 * - 别人呼叫我：醒目横幅（按呼叫方 team 配色）+「已收到」按钮，点一下才消失。
 * - 我呼叫别人：低调横幅，显示等待时长，对方确认后变成绿色的「已确认」。
 *
 * 被呼叫方一旦确认，自己这条就不再显示（回执是给发起方看的），无需再手动关。
 */
export function PingBanner({
  pings,
  pairs,
  visiblePairIds,
  role,
  onAck,
  onDismiss,
  onJumpToPair,
}: PingBannerProps) {
  const [busyPairId, setBusyPairId] = useState<number | null>(null);

  const hidden = pings.filter((p) => !visiblePairIds.has(p.pairId));
  const incoming = hidden.filter((p) => p.toRole === role && !p.ackedAt);
  const outgoing = hidden.filter((p) => p.fromRole === role);
  if (incoming.length === 0 && outgoing.length === 0) return null;

  const pairName = (pairId: number) => {
    const pair = pairs.find((p) => p.id === pairId);
    return pair ? `Pair ${pair.switch1} – ${pair.switch2}` : `Pair #${pairId}`;
  };

  const run = async (pairId: number, action: () => Promise<void>) => {
    setBusyPairId(pairId);
    try {
      await action();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyPairId(null);
    }
  };

  const stepSuffix = (ping: Ping) =>
    ping.stepOrder !== null ? ` · 步骤 #${ping.stepOrder}` : "";

  return (
    // 贴顶悬浮：现场同事往下翻看卡片时也不会漏掉呼叫。
    // 底色跟随 body 的 slate-100，否则滚动内容会从横幅之间的缝隙里透出来。
    <div className="sticky top-0 z-30 -mx-4 mb-4 space-y-2 bg-slate-100/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6">
      {incoming.map((ping) => {
        const fromTeam = roleTeam(ping.fromRole);
        const style = fromTeam ? teamStyle(fromTeam).banner : "";
        return (
          <div
            key={`in-${ping.pairId}`}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 shadow-md ${style}`}
          >
            <button
              type="button"
              onClick={() => onJumpToPair(ping.pairId)}
              className="flex flex-1 items-center gap-2 text-left text-sm font-semibold"
            >
              <span className="inline-block h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-current" />
              <span>
                {roleLabel(ping.fromRole)} 呼叫你确认 {pairName(ping.pairId)}
                {stepSuffix(ping)}
                <span className="ml-1 font-normal opacity-75">
                  · 已等 <LiveDuration startedAt={ping.createdAt} />
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => run(ping.pairId, () => onAck(ping.pairId))}
              disabled={busyPairId === ping.pairId}
              className="flex-none rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busyPairId === ping.pairId ? "确认中…" : "已收到"}
            </button>
          </div>
        );
      })}

      {outgoing.map((ping) => (
        <div
          key={`out-${ping.pairId}`}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm shadow-sm ring-1 ${
            ping.ackedAt
              ? "bg-emerald-50 text-emerald-900 ring-emerald-300"
              : "bg-white text-slate-600 ring-slate-200"
          }`}
        >
          <button
            type="button"
            onClick={() => onJumpToPair(ping.pairId)}
            className="flex-1 text-left"
          >
            {ping.ackedAt ? (
              <span className="font-medium">
                {roleLabel(ping.toRole)} 已确认收到 · {pairName(ping.pairId)}
                <span className="ml-1 font-normal opacity-75">
                  {formatDateTime(ping.ackedAt)}
                </span>
              </span>
            ) : (
              <span>
                已呼叫 {roleLabel(ping.toRole)} 确认 {pairName(ping.pairId)}
                {stepSuffix(ping)}
                <span className="ml-1 opacity-75">
                  · 等待中 <LiveDuration startedAt={ping.createdAt} />
                </span>
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => run(ping.pairId, () => onDismiss(ping.pairId))}
            disabled={busyPairId === ping.pairId}
            className="flex-none rounded-lg px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
          >
            {busyPairId === ping.pairId ? "收起中…" : "收起"}
          </button>
        </div>
      ))}
    </div>
  );
}
