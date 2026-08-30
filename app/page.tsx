"use client";

import { AuthBar } from "@/components/AuthBar";
import { CreatePairForm } from "@/components/CreatePairForm";
import { PairCard } from "@/components/PairCard";
import { PairFilterBar } from "@/components/PairFilter";
import { PipelineOverview } from "@/components/PipelineOverview";
import { useAuth } from "@/hooks/useAuth";
import { usePairs } from "@/hooks/usePairs";
import { teamLabel } from "@/lib/format";
import { canEditInfo, canManagePairs } from "@/lib/permissions";
import type { PairFilter } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

export default function HomePage() {
  const [filter, setFilter] = useState<PairFilter>("all");
  const [highlightPairId, setHighlightPairId] = useState<number | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const { user, loading: authLoading, login, logout } = useAuth();
  const { pairs, allPairs, counts, loading, error, refresh, recentlyUpdated } =
    usePairs(filter, true);
  const canManage = canManagePairs(user.role);
  const userCanEditInfo = canEditInfo(user.role);

  const scrollToPair = useCallback((pairId: number) => {
    const el = document.getElementById(`pair-${pairId}`);
    if (!el) return;
    // 卡片比视口还高时居中会把标题连同高亮角标顶出屏幕，这种情况退回顶部对齐
    const fitsInViewport =
      el.getBoundingClientRect().height + 48 < window.innerHeight;
    el.scrollIntoView({
      behavior: "smooth",
      block: fitsInViewport ? "center" : "start",
    });

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    // 先清空再置位，否则连续点击同一个 pair 时 class 不变化，CSS 动画不会重播
    setHighlightPairId(null);
    window.requestAnimationFrame(() => {
      setHighlightPairId(pairId);
      // 与 globals.css 里 jump-highlight 动画时长保持一致
      highlightTimerRef.current = window.setTimeout(
        () => setHighlightPairId(null),
        2400
      );
    });

    // 当前步骤只在进度条容器内横向居中：不能用 scrollIntoView，它会连带滚动页面，
    // 把上面刚发起的「卡片垂直居中」平滑滚动覆盖掉。
    const currentStep = document.getElementById(`pair-${pairId}-current-step`);
    const track = currentStep?.closest<HTMLElement>("[data-step-track]");
    if (currentStep && track) {
      const stepRect = currentStep.getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();
      const delta =
        stepRect.left -
        trackRect.left -
        (trackRect.width - stepRect.width) / 2;
      track.scrollBy({ left: delta, behavior: "smooth" });
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

  useEffect(
    () => () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    },
    []
  );

  const handleReorder = useCallback(
    async (orderedIds: number[]) => {
      const res = await fetch("/api/pairs/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "调整顺序失败");
      await refresh();
    },
    [refresh]
  );

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              DC Refresh Pipelines
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {teamLabel("A")}（蓝）、{teamLabel("B")}（橙）与 {teamLabel("C")}（紫）协作跟踪 · 实时同步
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
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-violet-600" />
            {teamLabel("C")}：Esxi Check（可选步骤，由 {teamLabel("A")} 代为点击）
          </span>
        </div>
      </header>

      <section className="mb-6 space-y-4">
        {!authLoading && (
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

      {!loading && !error && allPairs.length > 0 && (
        <PipelineOverview
          pairs={allPairs}
          onJumpToPair={handleJumpToPair}
          recentlyUpdated={recentlyUpdated}
          canReorder={canManage}
          onReorder={handleReorder}
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
            canEditInfo={userCanEditInfo}
            onUpdated={refresh}
            highlighted={highlightPairId === pair.id}
          />
        ))}
      </section>
    </main>
  );
}
