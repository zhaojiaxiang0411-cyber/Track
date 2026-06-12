"use client";

import { AuthBar } from "@/components/AuthBar";
import { CreatePairForm } from "@/components/CreatePairForm";
import { PairCard } from "@/components/PairCard";
import { PairFilterBar } from "@/components/PairFilter";
import { PipelineOverview } from "@/components/PipelineOverview";
import { useAuth } from "@/hooks/useAuth";
import { usePairs } from "@/hooks/usePairs";
import { teamLabel } from "@/lib/format";
import { canManagePairs } from "@/lib/permissions";
import type { PairFilter } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export default function HomePage() {
  const [filter, setFilter] = useState<PairFilter>("all");
  const [highlightPairId, setHighlightPairId] = useState<number | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);
  const { user, loading: authLoading, login, logout } = useAuth();
  const isAuthed = user.role !== "guest";
  const { pairs, allPairs, counts, loading, error, refresh, recentlyUpdated } =
    usePairs(filter, isAuthed);
  const canManage = canManagePairs(user.role);

  const scrollToPair = useCallback((pairId: number) => {
    const el = document.getElementById(`pair-${pairId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightPairId(pairId);
    window.setTimeout(() => setHighlightPairId(null), 2000);

    const currentStep = document.getElementById(`pair-${pairId}-current-step`);
    if (currentStep) {
      currentStep.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              ACI Leaf Refresh Pipeline
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {teamLabel("A")}（蓝）与 {teamLabel("B")}（橙）协作跟踪 · 实时同步
            </p>
          </div>
          <AuthBar
            user={user}
            loading={authLoading}
            onLogin={login}
            onLogout={logout}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-blue-600" />
            {teamLabel("A")}：Pipeline Start / Snapshot / Decommission / Register / Check / Post Check
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-orange-600" />
            {teamLabel("B")}：Label / Uplink / Downlink
          </span>
        </div>
      </header>

      <section className="mb-6 space-y-4">
        {!authLoading && isAuthed && (
          <>
            {canManage && <CreatePairForm onCreated={refresh} />}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <PairFilterBar value={filter} onChange={setFilter} counts={counts} />
              <a
                href="/api/export"
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                导出 CSV
              </a>
            </div>
          </>
        )}
      </section>

      {!authLoading && !isAuthed && (
        <section className="rounded-2xl bg-white py-12 text-center shadow-sm ring-1 ring-slate-200">
          <p className="mb-2 text-base font-medium text-slate-800">请先登录</p>
          <p className="text-sm text-slate-500">登录后才可查看和操作 pipeline</p>
        </section>
      )}

      {isAuthed && (
        <>
          {!loading && !error && allPairs.length > 0 && (
            <PipelineOverview
              pairs={allPairs}
              onJumpToPair={handleJumpToPair}
              recentlyUpdated={recentlyUpdated}
            />
          )}

          {loading && <p className="text-center text-sm text-slate-500">加载中…</p>}
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
                role={user.role}
                canDelete={canManage}
                onUpdated={refresh}
                highlighted={highlightPairId === pair.id}
              />
            ))}
          </section>
        </>
      )}
    </main>
  );
}
