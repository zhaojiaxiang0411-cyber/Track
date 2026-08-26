"use client";

import {
  FULL_PIPELINE_STEPS,
  resolveStepLabel,
  resolveStepPhase,
  resolveStepSwitch,
} from "@/lib/pipeline";
import { teamLabel, formatDuration } from "@/lib/format";
import { teamStyle } from "@/lib/teamStyles";
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
  /**
   * 按完整布局对齐：以 FULL_PIPELINE_STEPS 为列基准，缺失的可选步骤留等宽空位。
   * 仅在多个 pair 上下排列时有意义（总览栏），单个 pair 视图开启只会多出无意义的空位。
   */
  alignToFullLayout?: boolean;
};

/** 与 globals.css 中 blink-strong 动画周期保持一致（毫秒），用于全局同频对齐 */
const BLINK_PERIOD_MS = 900;

function dotSizeClass(compact: boolean): string {
  return compact ? "h-2 w-2" : "h-2.5 w-2.5";
}

function dotClass(
  step: StepInstance,
  isDone: boolean,
  isCurrent: boolean,
  compact: boolean
): string {
  const base = `rounded-full transition-all duration-300 ${dotSizeClass(compact)} `;
  const style = teamStyle(step.team);

  if (isDone) {
    return base + style.dotDone;
  }
  if (isCurrent) {
    return base + "ring-2 ring-offset-1 animate-blink-strong " + style.dotCurrent;
  }
  return base + "bg-slate-200";
}

/** 一个进度点位：step 为 null 表示该 pair 没有这一步（占位空列，仅用于对齐）。 */
type DotColumn = {
  key: string;
  step: StepInstance | null;
  phase: string;
};

const FULL_LAYOUT_ACTION_KEYS = new Set(
  FULL_PIPELINE_STEPS.map((template) => template.actionKey)
);

function buildDotColumns(steps: StepInstance[], align: boolean): DotColumn[] {
  if (!align) {
    return steps.map((step) => ({
      key: String(step.id),
      step,
      phase: resolveStepPhase(step.action_key),
    }));
  }

  const stepByActionKey = new Map(steps.map((step) => [step.action_key, step]));
  const columns: DotColumn[] = FULL_PIPELINE_STEPS.map((template) => ({
    key: template.actionKey,
    step: stepByActionKey.get(template.actionKey) ?? null,
    phase: template.phase,
  }));

  // 历史遗留步骤的 action_key 可能不在现行布局中，追加到末尾，避免被静默丢弃。
  for (const step of steps) {
    if (FULL_LAYOUT_ACTION_KEYS.has(step.action_key)) continue;
    columns.push({
      key: String(step.id),
      step,
      phase: resolveStepPhase(step.action_key),
    });
  }

  // 末尾的空位（如未勾选 Esxi Check 时的收尾检查）连同它前面的阶段分隔线一起裁掉：
  // 行尾之后没有内容，裁掉不影响任何点位对齐，却能避免留下一条悬空竖线。
  // 注意只裁末尾，中间的空位必须保留，否则后续列会整体左移。
  while (columns.length > 0 && columns[columns.length - 1].step === null) {
    columns.pop();
  }

  return columns;
}

export function PipelineProgressDots({
  steps,
  currentStepOrder,
  compact = false,
  showTooltip = true,
  switch1,
  switch2,
  alignToFullLayout = false,
}: PipelineProgressDotsProps) {
  const doneCount = steps.filter((s) => s.completed_at).length;
  const total = steps.length;
  const columns = buildDotColumns(steps, alignToFullLayout);

  return (
    <div className="flex items-center gap-2">
      {!compact && (
        <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-500">
          {doneCount}/{total}
        </span>
      )}
      <div
        className={`flex items-center ${
          // 对齐模式下不能换行：一旦折行，列基准就失效了
          alignToFullLayout ? "shrink-0 flex-nowrap" : "flex-wrap"
        } ${compact ? "gap-0.5" : "gap-1"}`}
        role="img"
        aria-label={`进度 ${doneCount}/${total}`}
      >
        {columns.map((column, index) => {
          const prevColumn = index > 0 ? columns[index - 1] : null;
          // 阶段边界（全局→SW1、SW1→SW2）插入分隔线
          const showPhaseDivider =
            prevColumn !== null && prevColumn.phase !== column.phase;
          const divider = showPhaseDivider ? (
            <span
              aria-hidden="true"
              className={`${compact ? "mx-1 h-2.5" : "mx-1.5 h-3"} w-px shrink-0 rounded-full bg-slate-300`}
            />
          ) : null;

          const step = column.step;
          if (step === null) {
            return (
              <span key={column.key} className="inline-flex items-center">
                {divider}
                <span
                  aria-hidden="true"
                  className={`${dotSizeClass(compact)} shrink-0`}
                />
              </span>
            );
          }

          const isDone = Boolean(step.completed_at);
          const isCurrent = currentStepOrder === step.step_order;
          const label = resolveStepLabel(step.action_key, step.label);
          const stepSwitch = resolveStepSwitch(step.action_key, switch1, switch2);

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
            <span key={column.key} className="inline-flex items-center">
              {divider}
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
                            ? teamStyle(step.team).tooltipDot
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
