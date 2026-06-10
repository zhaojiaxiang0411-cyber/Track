"use client";

import type { PairFilter, PairWithSteps } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

function filterPairs(all: PairWithSteps[], filter: PairFilter): PairWithSteps[] {
  switch (filter) {
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

export function usePairs(filter: PairFilter) {
  const [allPairs, setAllPairs] = useState<PairWithSteps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPairs = useCallback(async () => {
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
  }, []);

  const pairs = useMemo(
    () => filterPairs(allPairs, filter),
    [allPairs, filter]
  );

  const counts = useMemo(
    () => ({
      all: allPairs.length,
      waiting_a: allPairs.filter((p) => p.waiting_team === "A").length,
      waiting_b: allPairs.filter((p) => p.waiting_team === "B").length,
      completed: allPairs.filter((p) => p.status === "completed").length,
    }),
    [allPairs]
  );

  useEffect(() => {
    setLoading(true);
    fetchPairs();
  }, [fetchPairs]);

  useEffect(() => {
    const source = new EventSource("/api/events");

    source.addEventListener("pair_updated", () => {
      fetchPairs();
    });

    return () => source.close();
  }, [fetchPairs]);

  return { pairs, allPairs, counts, loading, error, refresh: fetchPairs };
}
