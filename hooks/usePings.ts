"use client";

import { subscribeSse } from "@/lib/sseClient";
import type { Ping } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

// 服务端会让过期的呼叫自己消失（已确认保留 5 分钟、待确认上限 2 小时），但那没有事件推送。
// 手里还挂着呼叫时低频兜一次，避免横幅在屏幕上永远留着一条早已失效的记录。
const STALE_SWEEP_MS = 60000;

/**
 * 呼叫确认状态。它是服务端内存态、不在 /api/pairs 的返回里，所以单独拉一个接口。
 *
 * 同时订阅 ping_updated 与 pair_updated：后者是为了让「对方推进流水线即视为隐式确认」
 * 的自动作废及时反映到界面（作废判断在 GET /api/pings 里做）。
 */
export function usePings(enabled: boolean) {
  const [pings, setPings] = useState<Ping[]>([]);

  const fetchPings = useCallback(async () => {
    if (!enabled) {
      setPings([]);
      return;
    }
    try {
      const res = await fetch("/api/pings", { cache: "no-store" });
      const data = (await res.json()) as { pings?: Ping[] };
      if (res.ok) setPings(data.pings ?? []);
    } catch {
      // 呼叫只是辅助提示，拉取失败静默处理，不要用错误条打扰主流程
    }
  }, [enabled]);

  useEffect(() => {
    fetchPings();
  }, [fetchPings]);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribePing = subscribeSse("ping_updated", () => {
      fetchPings();
    });
    const unsubscribePair = subscribeSse("pair_updated", () => {
      fetchPings();
    });
    return () => {
      unsubscribePing();
      unsubscribePair();
    };
  }, [enabled, fetchPings]);

  useEffect(() => {
    if (!enabled || pings.length === 0) return;
    const timer = setInterval(fetchPings, STALE_SWEEP_MS);
    return () => clearInterval(timer);
  }, [enabled, pings.length, fetchPings]);

  const pingByPairId = useMemo(
    () => new Map(pings.map((ping) => [ping.pairId, ping])),
    [pings]
  );

  // 三个写操作都抛出服务端给的错误信息，由调用方 alert，与 PairCard 既有的做法一致
  const request = useCallback(
    async (pairId: number, path: string, method: string, fallback: string) => {
      const res = await fetch(`/api/pairs/${pairId}${path}`, { method });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? fallback);
      await fetchPings();
    },
    [fetchPings]
  );

  const sendPing = useCallback(
    (pairId: number) => request(pairId, "/ping", "POST", "呼叫失败"),
    [request]
  );

  const ackPing = useCallback(
    (pairId: number) => request(pairId, "/ping/ack", "POST", "确认失败"),
    [request]
  );

  const dismissPing = useCallback(
    (pairId: number) => request(pairId, "/ping", "DELETE", "收起失败"),
    [request]
  );

  return { pings, pingByPairId, sendPing, ackPing, dismissPing };
}
