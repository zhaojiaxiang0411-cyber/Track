"use client";

import { CreatePairForm } from "@/components/CreatePairForm";
import { PairCard } from "@/components/PairCard";
import { PairFilterBar } from "@/components/PairFilter";
import { PipelineOverview } from "@/components/PipelineOverview";
import { usePairs } from "@/hooks/usePairs";
import { teamLabel } from "@/lib/format";
import type { PairFilter } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export default function HomePage() {
  const [filter, setFilter] = useState<PairFilter>("all");
  const [highlightPairId, setHighlightPairId] = useState<number | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);
  const { pairs, allPairs, counts, loading, error, refresh } = usePairs(filter);

  const scrollToPair = useCallback((pairId: number) => {
    const el = document.getElementById(`pair-${pairId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightPairId(pairId);
    window.setTimeout(() => setHighlightPairId(null), 2000);
  }, []);

  const handleJumpToPair = useCallback(
    (pairId: number) => {
      const isVisible = pairs.some((p) => p.id === pairId);
      if (!isVisible) {
        setFilter("all");
        setPendingScrollId(pairId);
        return;
      }
      scrollToPair(pairId);
    },
    [pairs, scrollToPair]
  );

  useEffect(() => {
    if (pendingScrollId === null) return;
    if (!pairs.some((p) => p.id === pendingScrollId)) return;
    scrollToPair(pendingScrollId);
    setPendingScrollId(null);
  }, [pairs, pendingScrollId, scrollToPair]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          交换机替换流水线
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {teamLabel("A")}（蓝）与 {teamLabel("B")}（橙）协作跟踪 · 实时同步
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-blue-600" />
            {teamLabel("A")}：MW Start / Snapshot / Decommission / Register / Check / Post Check
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-orange-600" />
            {teamLabel("B")}：Label / 拔插线 / Downlink
          </span>
        </div>
      </header>

      <section className="mb-6 space-y-4">
        <CreatePairForm onCreated={refresh} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <PairFilterBar value={filter} onChange={setFilter} counts={counts} />
          <a
            href="/api/export"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            导出 CSV
          </a>
        </div>
      </section>

      {!loading && !error && allPairs.length > 0 && (
        <PipelineOverview pairs={allPairs} onJumpToPair={handleJumpToPair} />
      )}

      {loading && (
        <p className="text-center text-sm text-slate-500">加载中…</p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && !error && pairs.length === 0 && (
        <div className="rounded-2xl bg-white py-16 text-center shadow-sm ring-1 ring-slate-200">
          <p className="text-slate-500">暂无 Pair，请新建一对交换机开始跟踪</p>
        </div>
      )}

      <section className="space-y-6">
        {pairs.map((pair) => (
          <PairCard
            key={pair.id}
            pair={pair}
            onUpdated={refresh}
            highlighted={highlightPairId === pair.id}
          />
        ))}
      </section>
    </main>
  );
}
