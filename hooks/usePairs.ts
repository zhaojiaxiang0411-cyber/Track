"use client";

import type { PairFilter, PairWithSteps } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const RECENT_HINT_MS = 10000;

function filterPairs(all: PairWithSteps[], filter: PairFilter): PairWithSteps[] {
  switch (filter) {
    case "operating":
      return all.filter((p) => p.status !== "completed" && p.operating);
    case "on_hold":
      return all.filter((p) => p.status !== "completed" && !p.operating);
    case "waiting_a":
      return all.filter((p) => p.waiting_team === "A");
    case "waiting_b":
      return all.filter((p) => p.waiting_team === "B");
    case "completed":
      return all.filter((p) => p.status === "completed");
    default:
      return all;
  }
}

export function usePairs(filter: PairFilter, enabled: boolean) {
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

  const pairs = useMemo(
    () => filterPairs(allPairs, filter),
    [allPairs, filter]
  );

  const counts = useMemo(
    () => ({
      all: allPairs.length,
      operating: allPairs.filter((p) => p.status !== "completed" && p.operating)
        .length,
      on_hold: allPairs.filter((p) => p.status !== "completed" && !p.operating)
        .length,
      waiting_a: allPairs.filter((p) => p.waiting_team === "A").length,
      waiting_b: allPairs.filter((p) => p.waiting_team === "B").length,
      completed: allPairs.filter((p) => p.status === "completed").length,
    }),
    [allPairs]
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
        if (data.action === "step_completed" && typeof data.pairId === "number") {
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
