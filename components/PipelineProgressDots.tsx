"use client";

import { resolveStepLabel } from "@/lib/pipeline";
import { teamLabel } from "@/lib/format";
import type { StepInstance } from "@/lib/types";

type PipelineProgressDotsProps = {
  steps: StepInstance[];
  currentStepOrder: number | null;
  /** 紧凑模式：更小色点，用于概览栏 */
  compact?: boolean;
  /** 显示步骤编号 tooltip */
  showTooltip?: boolean;
};

function dotClass(
  step: StepInstance,
  isDone: boolean,
  isCurrent: boolean,
  compact: boolean
): string {
  const size = compact ? "h-2 w-2" : "h-2.5 w-2.5";
  const base = `rounded-full transition-all duration-300 ${size} `;

  if (isDone) {
    return (
      base + (step.team === "A" ? "bg-blue-600" : "bg-orange-600")
    );
  }
  if (isCurrent) {
    return (
      base +
      "ring-2 ring-offset-1 animate-pulse " +
      (step.team === "A"
        ? "bg-blue-400 ring-blue-500"
        : "bg-orange-400 ring-orange-500")
    );
  }
  return base + "bg-slate-200";
}

export function PipelineProgressDots({
  steps,
  currentStepOrder,
  compact = false,
  showTooltip = true,
}: PipelineProgressDotsProps) {
  const doneCount = steps.filter((s) => s.completed_at).length;
  const total = steps.length;

  return (
    <div className="flex items-center gap-2">
      {!compact && (
        <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-500">
          {doneCount}/{total}
        </span>
      )}
      <div
        className={`flex flex-wrap items-center ${compact ? "gap-0.5" : "gap-1"}`}
        role="img"
        aria-label={`进度 ${doneCount}/${total}`}
      >
        {steps.map((step) => {
          const isDone = Boolean(step.completed_at);
          const isCurrent = currentStepOrder === step.step_order;
          const label = resolveStepLabel(step.step_order, step.label);

          let title = `#${step.step_order} ${label}`;
          if (isDone) title += " · 已完成";
          else if (isCurrent) title += ` · 进行中（${teamLabel(step.team)}）`;
          else title += " · 待执行";

          return (
            <span
              key={step.id}
              className={dotClass(step, isDone, isCurrent, compact)}
              title={showTooltip ? title : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
