"use client";

import { AuthBar } from "@/components/AuthBar";
import { CreatePairForm } from "@/components/CreatePairForm";
import { OwnerFilterSelect } from "@/components/OwnerFilter";
import { PairCard } from "@/components/PairCard";
import { PairFilterBar } from "@/components/PairFilter";
import { PipelineOverview } from "@/components/PipelineOverview";
import { useAuth } from "@/hooks/useAuth";
import { usePairs } from "@/hooks/usePairs";
import { teamLabel } from "@/lib/format";
import { UNASSIGNED_OWNER } from "@/lib/owner";
import { canEditInfo, canManagePairs } from "@/lib/permissions";
import type { PairFilter } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

// owner 筛选是个人视图偏好，存本地即可，不入库、不影响别人（与全局共享的 sort_order 不同）
const OWNER_FILTER_STORAGE_KEY = "track.owner-filter";

export default function HomePage() {
  const [filter, setFilter] = useState<PairFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [highlightPairId, setHighlightPairId] = useState<number | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const { user, loading: authLoading, login, logout } = useAuth();
  const { pairs, allPairs, counts, loading, error, refresh, recentlyUpdated } =
    usePairs(filter, true, ownerFilter);
  const canManage = canManagePairs(user.role);
  const userCanEditInfo = canEditInfo(user.role);

  // 首帧不能读 localStorage（服务端渲染没有它，会 hydration 不一致），挂载后再恢复
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(OWNER_FILTER_STORAGE_KEY);
      if (saved) setOwnerFilter(saved);
    } catch {
      /* 隐私模式下 localStorage 可能不可用，忽略即可 */
    }
  }, []);

  const changeOwnerFilter = useCallback((next: string | null) => {
    setOwnerFilter(next);
    try {
      if (next === null) {
        window.localStorage.removeItem(OWNER_FILTER_STORAGE_KEY);
      } else {
        window.localStorage.setItem(OWNER_FILTER_STORAGE_KEY, next);
      }
    } catch {
      /* 同上 */
    }
  }, []);

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
        // 总览始终是全量，点到被筛掉的 pair 时要放开筛选，否则点击看起来毫无反应。
        // 这里连 owner 筛选一起清掉（而非临时放开），让下拉的显示与实际生效的筛选始终一致。
        setFilter("all");
        changeOwnerFilter(null);
        setPendingScrollId(pairId);
        return;
      }
      scrollToPair(pairId);
    },
    [pairs, scrollToPair, changeOwnerFilter]
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
              <div className="flex flex-wrap items-center gap-3">
                <PairFilterBar
                  value={filter}
                  onChange={setFilter}
                  counts={counts}
                />
                <OwnerFilterSelect
                  pairs={allPairs}
                  value={ownerFilter}
                  onChange={changeOwnerFilter}
                />
              </div>
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
          {ownerFilter !== null && allPairs.length > 0 ? (
            <>
              <p className="text-slate-500">
                {ownerFilter === UNASSIGNED_OWNER
                  ? "没有未指派 Owner 的 pipeline"
                  : `Owner「${ownerFilter}」下没有符合当前筛选的 pipeline`}
              </p>
              <button
                type="button"
                onClick={() => changeOwnerFilter(null)}
                className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                查看全部 Owner
              </button>
            </>
          ) : (
            <p className="text-slate-500">暂无 Pair，请新建一对交换机开始跟踪</p>
          )}
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
