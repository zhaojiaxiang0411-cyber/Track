"use client";

import { formatDateTime, formatDuration, teamLabel } from "@/lib/format";
import {
  isExcludedFromTiming,
  resolveStepLabel,
  resolveStepPhase,
} from "@/lib/pipeline";
import { teamStyle } from "@/lib/teamStyles";
import type { StepInstance } from "@/lib/types";
import { LiveDuration } from "./LiveDuration";

type StepButtonProps = {
  step: StepInstance;
  switch1: string;
  switch2: string;
  isCurrent: boolean;
  canComplete: boolean;
  onComplete: (stepOrder: number) => Promise<void>;
  completing: number | null;
  id?: string;
};

function phaseLabel(actionKey: string, switch1: string, switch2: string): string {
  const phase = resolveStepPhase(actionKey);
  if (phase === "SW1") return `SW ${switch1}`;
  if (phase === "SW2") return `SW ${switch2}`;
  return phase;
}

export function StepButton({
  step,
  switch1,
  switch2,
  isCurrent,
  canComplete,
  onComplete,
  completing,
  id,
}: StepButtonProps) {
  const isDone = Boolean(step.completed_at);
  const style = teamStyle(step.team);
  const isBusy = completing === step.step_order;
  const displayLabel = resolveStepLabel(step.action_key, step.label);
  // 当前步骤但无权操作（如 homison 看到 cisco 的步骤、或未登录）
  const isCurrentLocked = isCurrent && !isDone && !canComplete;
  const isActionable = isCurrent && !isDone && canComplete;
  const excludedFromTiming = isExcludedFromTiming(step.action_key);
  // 正在进行中的步骤显示实时耗时（排除 Pipeline Start / Snapshot，与总耗时口径一致）
  const showLiveDuration =
    isCurrent && !isDone && !excludedFromTiming && Boolean(step.started_at);

  let className =
    "relative flex min-w-[7.5rem] flex-col rounded-lg border px-2 py-2 text-left text-xs transition-all ";

  if (isDone) {
    className += style.buttonDone;
  } else if (isActionable) {
    className += style.buttonActionable;
  } else if (isCurrentLocked) {
    className += style.buttonLocked;
  } else {
    className += "border-slate-200 bg-slate-50 text-slate-400";
  }

  const handleClick = async () => {
    if (!isActionable || isBusy) return;
    const confirmed = window.confirm(
      `确认完成步骤 #${step.step_order}：${displayLabel}？`
    );
    if (!confirmed) return;
    await onComplete(step.step_order);
  };

  return (
    <button
      type="button"
      id={id}
      onClick={handleClick}
      disabled={!isActionable || isBusy}
      className={className}
      title={
        isActionable
          ? `点击完成（${teamLabel(step.team)}）`
          : isCurrentLocked
            ? `无权操作：该步骤需 ${teamLabel(step.team)} 账号`
            : isDone
              ? `已完成 ${formatDateTime(step.completed_at)}`
              : "等待前序步骤"
      }
    >
      <span className="mb-0.5 font-mono text-[10px] opacity-80">
        #{step.step_order} · {teamLabel(step.team)}
      </span>
      <span className="font-medium leading-tight">{displayLabel}</span>
      <span className="mt-0.5 text-[10px] opacity-75">
        {phaseLabel(step.action_key, switch1, switch2)}
      </span>
      {isDone && (
        <span className="mt-1 text-[10px] opacity-90">
          ✓ {formatDateTime(step.completed_at)}
          {!excludedFromTiming && step.duration_sec !== null && (
            <span className="ml-1">({formatDuration(step.duration_sec)})</span>
          )}
        </span>
      )}
      {showLiveDuration && !isBusy && (
        <span className="mt-1 text-[10px] font-medium opacity-90">
          ⏱ 已进行 <LiveDuration startedAt={step.started_at!} />
        </span>
      )}
      {isBusy && (
        <span className="mt-1 text-[10px] italic opacity-80">提交中…</span>
      )}
      {isCurrentLocked && (
        <span className="mt-1 text-[10px] opacity-90">🔒 需 {teamLabel(step.team)}</span>
      )}
    </button>
  );
}
