"use client";

import { formatDateTime, formatDuration, teamLabel } from "@/lib/format";
import { PIPELINE_STEPS, resolveStepLabel } from "@/lib/pipeline";
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

function phaseLabel(stepOrder: number, switch1: string, switch2: string): string {
  const template = PIPELINE_STEPS.find((s) => s.order === stepOrder);
  if (!template) return "";
  if (template.phase === "全局") return "全局";
  if (template.phase === "SW1") return `SW ${switch1}`;
  if (template.phase === "SW2") return `SW ${switch2}`;
  return template.phase;
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
  const isTeamA = step.team === "A";
  const isBusy = completing === step.step_order;
  const displayLabel = resolveStepLabel(step.step_order, step.label);
  // 当前步骤但无权操作（如 homison 看到 cisco 的步骤、或未登录）
  const isCurrentLocked = isCurrent && !isDone && !canComplete;
  const isActionable = isCurrent && !isDone && canComplete;
  // 正在进行中的步骤显示实时耗时（排除步骤 1/2，与总耗时统计口径一致）
  const showLiveDuration =
    isCurrent && !isDone && step.step_order > 2 && Boolean(step.started_at);

  let className =
    "relative flex min-w-[7.5rem] flex-col rounded-lg border px-2 py-2 text-left text-xs transition-all ";

  if (isDone) {
    className += isTeamA
      ? "border-blue-700 bg-blue-600 text-white"
      : "border-orange-700 bg-orange-600 text-white";
  } else if (isActionable) {
    className += isTeamA
      ? "animate-pulse border-2 border-blue-500 bg-blue-100 text-blue-900 shadow-md cursor-pointer"
      : "animate-pulse border-2 border-orange-500 bg-orange-100 text-orange-900 shadow-md cursor-pointer";
  } else if (isCurrentLocked) {
    className += isTeamA
      ? "border-2 border-dashed border-blue-300 bg-blue-50 text-blue-400 cursor-not-allowed"
      : "border-2 border-dashed border-orange-300 bg-orange-50 text-orange-400 cursor-not-allowed";
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
        {phaseLabel(step.step_order, switch1, switch2)}
      </span>
      {isDone && (
        <span className="mt-1 text-[10px] opacity-90">
          ✓ {formatDateTime(step.completed_at)}
          {step.step_order !== 1 && step.step_order !== 2 && step.duration_sec !== null && (
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
