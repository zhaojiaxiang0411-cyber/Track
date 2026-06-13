"use client";

import { teamLabel } from "@/lib/format";
import type { PairWithSteps } from "@/lib/types";
import { PipelineProgressDots } from "./PipelineProgressDots";

type PipelineOverviewProps = {
  pairs: PairWithSteps[];
  onJumpToPair?: (pairId: number) => void;
  recentlyUpdated?: ReadonlySet<number>;
};

export function PipelineOverview({
  pairs,
  onJumpToPair,
  recentlyUpdated,
}: PipelineOverviewProps) {
  const total = pairs.length;
  const waitingA = pairs.filter((p) => p.waiting_team === "A").length;
  const waitingB = pairs.filter((p) => p.waiting_team === "B").length;
  const completed = pairs.filter((p) => p.status === "completed").length;
  const inProgress = total - completed;
  const operating = pairs.filter(
    (p) => p.status !== "completed" && p.operating
  ).length;
  const onHold = pairs.filter(
    (p) => p.status !== "completed" && !p.operating
  ).length;

  // 正在操作的（未完成）置顶，便于聚焦实际推进中的 pipeline；
  // 其余保持原有顺序（id 倒序）。
  const sortedPairs = [...pairs].sort((a, b) => {
    const aOp = a.status !== "completed" && a.operating ? 1 : 0;
    const bOp = b.status !== "completed" && b.operating ? 1 : 0;
    return bOp - aOp;
  });

  if (total === 0) return null;

  return (
    <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Pipeline Overview</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          <StatBadge label="全部" count={total} color="slate" />
          <StatBadge label="进行中" count={inProgress} color="amber" />
          <StatBadge label="正在操作" count={operating} color="green" />
          <StatBadge label="队列中" count={onHold} color="amber" />
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
          <StatBadge label="已完成" count={completed} color="emerald" />
        </div>
      </div>

      <div className="space-y-2">
        {sortedPairs.map((pair) => {
          const justUpdated = recentlyUpdated?.has(pair.id) ?? false;
          return (
          <button
            key={pair.id}
            type="button"
            onClick={() => onJumpToPair?.(pair.id)}
            className={`flex w-full flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-left transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              justUpdated
                ? "bg-emerald-50 ring-2 ring-emerald-400"
                : "bg-slate-50 hover:bg-slate-100 hover:ring-1 hover:ring-slate-200"
            }`}
          >
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
            <span className="flex w-16 shrink-0 justify-start">
              {pair.status !== "completed" &&
                (pair.operating ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                    操作中
                  </span>
                ) : (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      pair.waiting_team === "A"
                        ? "bg-blue-100 text-blue-700"
                        : pair.waiting_team === "B"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        pair.waiting_team === "A"
                          ? "bg-blue-500"
                          : pair.waiting_team === "B"
                            ? "bg-orange-500"
                            : "bg-amber-500"
                      }`}
                    />
                    队列中
                  </span>
                ))}
            </span>
            <PipelineProgressDots
              steps={pair.steps}
              currentStepOrder={pair.current_step_order}
              switch1={pair.switch1}
              switch2={pair.switch2}
              compact
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
              ) : pair.waiting_team === "A" ? (
                <span className="font-medium text-blue-600">
                  等 {teamLabel("A")} #{pair.current_step_order}
                </span>
              ) : pair.waiting_team === "B" ? (
                <span className="font-medium text-orange-600">
                  等 {teamLabel("B")} #{pair.current_step_order}
                </span>
              ) : null}
            </span>
          </button>
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
  color: "slate" | "amber" | "blue" | "orange" | "emerald" | "green";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    orange: "bg-orange-100 text-orange-800",
    emerald: "bg-emerald-100 text-emerald-800",
    green: "bg-green-100 text-green-800",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${colors[color]}`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          color === "blue"
            ? "bg-blue-600"
            : color === "orange"
              ? "bg-orange-600"
              : color === "emerald"
                ? "bg-emerald-600"
                : color === "green"
                  ? "bg-green-600"
                  : color === "amber"
                    ? "bg-amber-500"
                    : "bg-slate-400"
        }`}
      />
      {label}
      <span className="tabular-nums font-bold">{count}</span>
    </span>
  );
}
