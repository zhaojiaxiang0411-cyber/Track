"use client";

import { teamLabel } from "@/lib/format";
import { teamStyle } from "@/lib/teamStyles";
import type { PairWithSteps } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import { PipelineProgressDots } from "./PipelineProgressDots";

type PipelineOverviewProps = {
  pairs: PairWithSteps[];
  onJumpToPair?: (pairId: number) => void;
  recentlyUpdated?: ReadonlySet<number>;
  canReorder?: boolean;
  onReorder?: (orderedIds: number[]) => Promise<void>;
};

export function PipelineOverview({
  pairs,
  onJumpToPair,
  recentlyUpdated,
  canReorder = false,
  onReorder,
}: PipelineOverviewProps) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  // 拖放后先按本地顺序渲染，等服务端顺序回流再交还控制权，避免请求往返期间列表跳回原位
  const [optimisticIds, setOptimisticIds] = useState<number[] | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const ordered = useMemo(() => {
    if (!optimisticIds) return pairs;
    const byId = new Map(pairs.map((p) => [p.id, p]));
    const picked = optimisticIds
      .map((id) => byId.get(id))
      .filter((p): p is PairWithSteps => p !== undefined);
    const pending = new Set(optimisticIds);
    // 乐观顺序生成之后别人新建的 pair 不在其中，兜底追加，避免它凭空消失
    return [...picked, ...pairs.filter((p) => !pending.has(p.id))];
  }, [pairs, optimisticIds]);

  useEffect(() => {
    if (!optimisticIds) return;
    const currentIds = pairs.map((p) => p.id);
    const settled =
      currentIds.length === optimisticIds.length &&
      currentIds.every((id, i) => id === optimisticIds[i]);
    if (settled) setOptimisticIds(null);
  }, [pairs, optimisticIds]);

  const handleDrop = (targetId: number) => {
    const sourceId = dragId;
    setDragId(null);
    setOverId(null);
    if (sourceId === null || sourceId === targetId || !onReorder) return;

    const ids = ordered.map((p) => p.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;

    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);

    setOptimisticIds(ids);
    setReorderError(null);
    onReorder(ids).catch((err: unknown) => {
      // 回到服务端权威顺序，不要把失败的排列留在界面上
      setOptimisticIds(null);
      setReorderError(err instanceof Error ? err.message : "调整顺序失败");
    });
  };

  const total = pairs.length;
  const waitingA = pairs.filter((p) => p.waiting_team === "A").length;
  const waitingB = pairs.filter((p) => p.waiting_team === "B").length;
  const waitingC = pairs.filter((p) => p.waiting_team === "C").length;
  const completed = pairs.filter((p) => p.status === "completed").length;
  const inProgress = total - completed;

  if (total === 0) return null;

  return (
    <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          Pipeline Overview
          {canReorder && (
            <span className="font-normal text-[10px] text-slate-400">
              拖拽行首手柄可调整顺序
            </span>
          )}
        </h2>
        <div className="flex flex-wrap gap-3 text-xs">
          <StatBadge label="全部" count={total} color="slate" />
          <StatBadge label="进行中" count={inProgress} color="amber" />
          <StatBadge
            label={`等 ${teamLabel("A")}`}
            count={waitingA}
            color="blue"
          />
          <StatBadge
            label={`等 ${teamLabel("B")}`}
            count={waitingB}
            color="orange"
          />
          {waitingC > 0 && (
            <StatBadge
              label={`等 ${teamLabel("C")}`}
              count={waitingC}
              color="violet"
            />
          )}
          <StatBadge label="已完成" count={completed} color="emerald" />
        </div>
      </div>

      {reorderError && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {reorderError}
        </p>
      )}

      <div className="space-y-2">
        {ordered.map((pair) => {
          const justUpdated = recentlyUpdated?.has(pair.id) ?? false;
          const isDragging = dragId === pair.id;
          const isDropTarget = canReorder && overId === pair.id && !isDragging;
          return (
          // 整行用 role="button" 而非真正的 <button>：draggable 元素内嵌可交互控件时，
          // 部分浏览器不会把拖拽事件交给外层，点击与拖拽会互相吞掉。
          <div
            key={pair.id}
            role="button"
            tabIndex={0}
            onClick={() => onJumpToPair?.(pair.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onJumpToPair?.(pair.id);
              }
            }}
            draggable={canReorder}
            onDragStart={(e) => {
              if (!canReorder) return;
              e.dataTransfer.effectAllowed = "move";
              // Firefox 必须写入数据，否则不会启动拖拽
              e.dataTransfer.setData("text/plain", String(pair.id));
              setDragId(pair.id);
            }}
            onDragOver={(e) => {
              if (!canReorder || dragId === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverId(pair.id);
            }}
            onDragLeave={() =>
              setOverId((cur) => (cur === pair.id ? null : cur))
            }
            onDrop={(e) => {
              if (!canReorder) return;
              e.preventDefault();
              handleDrop(pair.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            className={`flex w-full cursor-pointer flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-left transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isDragging ? "opacity-40" : ""
            } ${
              isDropTarget
                ? "bg-blue-50 ring-2 ring-blue-400"
                : justUpdated
                  ? "bg-emerald-50 ring-2 ring-emerald-400"
                  : "bg-slate-50 hover:bg-slate-100 hover:ring-1 hover:ring-slate-200"
            }`}
          >
            {canReorder && (
              <span
                aria-hidden
                title="拖拽调整顺序"
                className="shrink-0 cursor-grab select-none text-sm leading-none text-slate-400 active:cursor-grabbing"
              >
                ⠿
              </span>
            )}
            <span className="flex w-44 shrink-0 items-center gap-2">
              <span className="shrink-0 text-xs font-semibold text-slate-700">
                {pair.switch1}–{pair.switch2}
              </span>
              {pair.owner && (
                <span className="truncate rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {pair.owner}
                </span>
              )}
            </span>
            <PipelineProgressDots
              steps={pair.steps}
              currentStepOrder={pair.current_step_order}
              switch1={pair.switch1}
              switch2={pair.switch2}
              compact
              alignToFullLayout
            />
            {justUpdated && (
              <span className="inline-flex animate-pulse items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                刚更新
              </span>
            )}
            <span className="ml-auto text-[10px] text-slate-400">
              {pair.status === "completed" ? (
                <span className="font-medium text-emerald-600">已完成</span>
              ) : pair.waiting_team ? (
                <span
                  className={`font-medium ${teamStyle(pair.waiting_team).text}`}
                >
                  等 {teamLabel(pair.waiting_team)} #{pair.current_step_order}
                </span>
              ) : null}
            </span>
          </div>
          );
        })}
      </div>
    </section>
  );
}

function StatBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "slate" | "amber" | "blue" | "orange" | "violet" | "emerald";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    orange: "bg-orange-100 text-orange-800",
    violet: "bg-violet-100 text-violet-800",
    emerald: "bg-emerald-100 text-emerald-800",
  };
  const dots = {
    slate: "bg-slate-400",
    amber: "bg-amber-500",
    blue: "bg-blue-600",
    orange: "bg-orange-600",
    violet: "bg-violet-600",
    emerald: "bg-emerald-600",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${colors[color]}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dots[color]}`} />
      {label}
      <span className="tabular-nums font-bold">{count}</span>
    </span>
  );
}
