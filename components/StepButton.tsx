"use client";

import { formatDateTime, formatDuration, teamLabel } from "@/lib/format";
import { PIPELINE_STEPS, resolveStepLabel } from "@/lib/pipeline";
import type { StepInstance } from "@/lib/types";

type StepButtonProps = {
  step: StepInstance;
  switch1: string;
  switch2: string;
  isCurrent: boolean;
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
  onComplete,
  completing,
  id,
}: StepButtonProps) {
  const isDone = Boolean(step.completed_at);
  const isTeamA = step.team === "A";
  const isBusy = completing === step.step_order;
  const displayLabel = resolveStepLabel(step.step_order, step.label);

  let className =
    "relative flex min-w-[7.5rem] flex-col rounded-lg border px-2 py-2 text-left text-xs transition-all ";

  if (isDone) {
    className += isTeamA
      ? "border-blue-700 bg-blue-600 text-white"
      : "border-orange-700 bg-orange-600 text-white";
  } else if (isCurrent) {
    className += isTeamA
      ? "animate-pulse border-2 border-blue-500 bg-blue-100 text-blue-900 shadow-md"
      : "animate-pulse border-2 border-orange-500 bg-orange-100 text-orange-900 shadow-md";
  } else {
    className += "border-slate-200 bg-slate-50 text-slate-400";
  }

  const handleClick = async () => {
    if (!isCurrent || isDone || isBusy) return;
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
      disabled={!isCurrent || isDone || isBusy}
      className={className}
      title={
        isCurrent
          ? `点击完成（${teamLabel(step.team)}）`
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
      {isBusy && (
        <span className="mt-1 text-[10px] italic opacity-80">提交中…</span>
      )}
    </button>
  );
}
