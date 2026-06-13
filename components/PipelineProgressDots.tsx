"use client";

import {
  resolveStepLabel,
  resolveStepPhase,
  resolveStepSwitch,
} from "@/lib/pipeline";
import { teamLabel, formatDuration } from "@/lib/format";
import type { StepInstance } from "@/lib/types";

type PipelineProgressDotsProps = {
  steps: StepInstance[];
  currentStepOrder: number | null;
  /** 紧凑模式：更小色点，用于概览栏 */
  compact?: boolean;
  /** 显示步骤编号 tooltip */
  showTooltip?: boolean;
  /** 交换机对，用于在悬停卡片中显示「该步骤对应的交换机」 */
  switch1?: string;
  switch2?: string;
};

/** 与 globals.css 中 blink-strong 动画周期保持一致（毫秒），用于全局同频对齐 */
const BLINK_PERIOD_MS = 900;

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
      "ring-2 ring-offset-1 animate-blink-strong " +
      (step.team === "A"
        ? "bg-blue-500 ring-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.35)]"
        : "bg-orange-500 ring-orange-500 shadow-[0_0_0_3px_rgba(249,115,22,0.35)]")
    );
  }
  return base + "bg-slate-200";
}

export function PipelineProgressDots({
  steps,
  currentStepOrder,
  compact = false,
  showTooltip = true,
  switch1,
  switch2,
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
        {steps.map((step, index) => {
          const isDone = Boolean(step.completed_at);
          const isCurrent = currentStepOrder === step.step_order;
          const label = resolveStepLabel(step.step_order, step.label);
          const stepSwitch = resolveStepSwitch(step.step_order, switch1, switch2);

          // 阶段边界（全局→SW1、SW1→SW2）插入分隔线
          const prevStep = index > 0 ? steps[index - 1] : null;
          const showPhaseDivider =
            prevStep !== null &&
            resolveStepPhase(prevStep.step_order) !==
              resolveStepPhase(step.step_order);

          const statusText = isDone
            ? "已完成"
            : isCurrent
              ? "进行中"
              : "待执行";

          // 原生 title 作为无障碍/兜底
          const fallbackTitle = `#${step.step_order} ${label}${
            stepSwitch ? ` · ${stepSwitch}` : ""
          } · ${statusText}`;

          return (
            <span key={step.id} className="inline-flex items-center">
              {showPhaseDivider && (
                <span
                  aria-hidden="true"
                  className={`${compact ? "mx-1 h-2.5" : "mx-1.5 h-3"} w-px shrink-0 rounded-full bg-slate-300`}
                />
              )}
              <span className="group/dot relative inline-flex shrink-0">
              <span
                className={dotClass(step, isDone, isCurrent, compact)}
                style={
                  isCurrent
                    ? { animationDelay: `-${Date.now() % BLINK_PERIOD_MS}ms` }
                    : undefined
                }
                title={showTooltip ? fallbackTitle : undefined}
                aria-label={fallbackTitle}
              />
              {showTooltip && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 group-hover/dot:block">
                  <span className="block whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-left shadow-lg ring-1 ring-black/5">
                    <span className="block text-[11px] font-semibold text-white">
                      #{step.step_order} {label}
                    </span>
                    {stepSwitch && (
                      <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-200">
                        <SwitchIcon />
                        <span className="font-medium tabular-nums">
                          {stepSwitch}
                        </span>
                      </span>
                    )}
                    <span className="mt-1 flex items-center gap-1.5 text-[10px]">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          isDone
                            ? step.team === "A"
                              ? "bg-blue-400"
                              : "bg-orange-400"
                            : isCurrent
                              ? "bg-amber-300"
                              : "bg-slate-500"
                        }`}
                      />
                      <span className="text-slate-300">
                        {statusText} · {teamLabel(step.team)}
                      </span>
                    </span>
                    {isDone && step.duration_sec !== null && (
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        耗时 {formatDuration(step.duration_sec)}
                      </span>
                    )}
                    <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-slate-900" />
                  </span>
                </span>
              )}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SwitchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 shrink-0 text-slate-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="20" height="5" rx="1" />
      <rect x="2" y="13" width="20" height="5" rx="1" />
      <path d="M6 8.5h.01M6 15.5h.01" />
    </svg>
  );
}
