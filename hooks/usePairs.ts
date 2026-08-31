"use client";

import { matchesOwnerFilter } from "@/lib/owner";
import type { PairFilter, PairWithSteps } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const RECENT_HINT_MS = 10000;

function filterPairs(all: PairWithSteps[], filter: PairFilter): PairWithSteps[] {
  switch (filter) {
    case "waiting_a":
      return all.filter((p) => p.waiting_team === "A");
    case "waiting_b":
      return all.filter((p) => p.waiting_team === "B");
    case "waiting_c":
      return all.filter((p) => p.waiting_team === "C");
    case "completed":
      return all.filter((p) => p.status === "completed");
    default:
      return all;
  }
}

/**
 * @param ownerFilter 只看某个 owner 的 pipeline（null = 全部）。它先于 team 筛选生效，
 *   且只影响 pairs 与 counts；allPairs 始终是全量，Pipeline Overview 要留作全局看板。
 */
export function usePairs(
  filter: PairFilter,
  enabled: boolean,
  ownerFilter: string | null = null
) {
  const [allPairs, setAllPairs] = useState<PairWithSteps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState<ReadonlySet<number>>(
    () => new Set()
  );
  const hintTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const markRecentlyUpdated = useCallback((pairId: number) => {
    setRecentlyUpdated((prev) => {
      const next = new Set(prev);
      next.add(pairId);
      return next;
    });

    const existing = hintTimers.current.get(pairId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      hintTimers.current.delete(pairId);
      setRecentlyUpdated((prev) => {
        if (!prev.has(pairId)) return prev;
        const next = new Set(prev);
        next.delete(pairId);
        return next;
      });
    }, RECENT_HINT_MS);

    hintTimers.current.set(pairId, timer);
  }, []);

  const fetchPairs = useCallback(async () => {
    if (!enabled) {
      setAllPairs([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/pairs?filter=all", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        pairs?: PairWithSteps[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setAllPairs(data.pairs ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const ownedPairs = useMemo(
    () => allPairs.filter((p) => matchesOwnerFilter(p.owner, ownerFilter)),
    [allPairs, ownerFilter]
  );

  const pairs = useMemo(
    () => filterPairs(ownedPairs, filter),
    [ownedPairs, filter]
  );

  // 计数跟随 owner 筛选，否则「等 homison 3」会算上别人的 pair，与列表看到的对不上
  const counts = useMemo(
    () => ({
      all: ownedPairs.length,
      waiting_a: ownedPairs.filter((p) => p.waiting_team === "A").length,
      waiting_b: ownedPairs.filter((p) => p.waiting_team === "B").length,
      waiting_c: ownedPairs.filter((p) => p.waiting_team === "C").length,
      completed: ownedPairs.filter((p) => p.status === "completed").length,
    }),
    [ownedPairs]
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPairs();
  }, [enabled, fetchPairs]);

  useEffect(() => {
    if (!enabled) return;

    const source = new EventSource("/api/events");
    const timers = hintTimers.current;

    source.addEventListener("pair_updated", (event) => {
      fetchPairs();
      try {
        const data = JSON.parse((event as MessageEvent).data) as {
          pairId?: number;
          action?: string;
        };
        // 步骤被撤回同样要高亮：其他人正等着重做这一步，需要引起注意
        const isStepChange =
          data.action === "step_completed" || data.action === "step_reverted";
        if (isStepChange && typeof data.pairId === "number") {
          markRecentlyUpdated(data.pairId);
        }
      } catch {
        /* ignore malformed event payloads */
      }
    });

    return () => {
      source.close();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [enabled, fetchPairs, markRecentlyUpdated]);

  return {
    pairs,
    allPairs,
    counts,
    loading,
    error,
    refresh: fetchPairs,
    recentlyUpdated,
  };
}
