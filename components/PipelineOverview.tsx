"use client";

import { teamLabel } from "@/lib/format";
import type { PairWithSteps } from "@/lib/types";
import { PipelineProgressDots } from "./PipelineProgressDots";

type PipelineOverviewProps = {
  pairs: PairWithSteps[];
  onJumpToPair?: (pairId: number) => void;
};

export function PipelineOverview({ pairs, onJumpToPair }: PipelineOverviewProps) {
  const total = pairs.length;
  const waitingA = pairs.filter((p) => p.waiting_team === "A").length;
  const waitingB = pairs.filter((p) => p.waiting_team === "B").length;
  const completed = pairs.filter((p) => p.status === "completed").length;
  const inProgress = total - completed;

  if (total === 0) return null;

  return (
    <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">流水线概览</h2>
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
          <StatBadge label="已完成" count={completed} color="emerald" />
        </div>
      </div>

      <div className="space-y-2">
        {pairs.map((pair) => (
          <button
            key={pair.id}
            type="button"
            onClick={() => onJumpToPair?.(pair.id)}
            className="flex w-full flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-left transition-colors duration-300 hover:bg-slate-100 hover:ring-1 hover:ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="min-w-[5.5rem] text-xs font-semibold text-slate-700">
              {pair.switch1}–{pair.switch2}
            </span>
            <PipelineProgressDots
              steps={pair.steps}
              currentStepOrder={pair.current_step_order}
              compact
            />
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
        ))}
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
  color: "slate" | "amber" | "blue" | "orange" | "emerald";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    orange: "bg-orange-100 text-orange-800",
    emerald: "bg-emerald-100 text-emerald-800",
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
