"use client";

import { formatDateTime, formatDuration, teamLabel } from "@/lib/format";
import { canCompleteStep, canToggleOperating } from "@/lib/permissions";
import type { PairWithSteps, Role } from "@/lib/types";
import { useState } from "react";
import { PipelineProgressDots } from "./PipelineProgressDots";
import { StepButton } from "./StepButton";

type PairCardProps = {
  pair: PairWithSteps;
  role: Role;
  canDelete: boolean;
  onUpdated: () => void;
  highlighted?: boolean;
};

export function PairCard({
  pair,
  role,
  canDelete,
  onUpdated,
  highlighted,
}: PairCardProps) {
  const [completing, setCompleting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingOperating, setTogglingOperating] = useState(false);

  const canToggle = canToggleOperating(role) && pair.status !== "completed";

  const handleComplete = async (stepOrder: number) => {
    setCompleting(stepOrder);
    try {
      const res = await fetch(
        `/api/pairs/${pair.id}/steps/${stepOrder}/complete`,
        { method: "POST" }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "操作失败");
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setCompleting(null);
    }
  };

  const handleToggleOperating = async () => {
    setTogglingOperating(true);
    try {
      const res = await fetch(`/api/pairs/${pair.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operating: !pair.operating }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "更新失败");
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失败");
    } finally {
      setTogglingOperating(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `确认删除 Pair ${pair.switch1}-${pair.switch2}？此操作不可恢复。`
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/pairs/${pair.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "删除失败");
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const statusBadge =
    pair.status === "completed" ? (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
        Completed
      </span>
    ) : pair.waiting_team === "A" ? (
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
        等待 {teamLabel("A")} · 步骤 #{pair.current_step_order}
      </span>
    ) : pair.waiting_team === "B" ? (
      <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
        等待 {teamLabel("B")} · 步骤 #{pair.current_step_order}
      </span>
    ) : null;

  const operatingBadge =
    pair.status === "completed" ? null : pair.operating ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
        正在操作
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        队列中
      </span>
    );

  return (
    <article
      id={`pair-${pair.id}`}
      className={`scroll-mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 transition-shadow duration-500 ${
        highlighted
          ? "ring-2 ring-blue-500 shadow-md"
          : pair.operating && pair.status !== "completed"
            ? "ring-1 ring-green-300 border-l-4 border-green-500"
            : "ring-slate-200"
      }`}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Pair {pair.switch1} – {pair.switch2}
            {pair.owner && (
              <span className="ml-2 align-middle rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Owner: {pair.owner}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500">
            创建于 {formatDateTime(pair.created_at)}
            {pair.total_duration_sec !== null && (
              <span className="ml-2">
                已耗时 {formatDuration(pair.total_duration_sec)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {operatingBadge}
          {statusBadge}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              {deleting ? "删除中…" : "删除"}
            </button>
          )}
        </div>
      </header>

      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2">
        <PipelineProgressDots
          steps={pair.steps}
          currentStepOrder={pair.current_step_order}
          switch1={pair.switch1}
          switch2={pair.switch2}
        />
      </div>

      {canToggle && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleToggleOperating}
            disabled={togglingOperating}
            className={`rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50 ${
              pair.operating
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {togglingOperating
              ? "处理中…"
              : pair.operating
                ? "⏸ 挂起"
                : "▶ 开始操作"}
          </button>
          <span className="text-xs text-slate-500">
            {pair.operating
              ? "操作中，可点击下方当前步骤完成"
              : "点击「开始操作」后才能完成下方步骤"}
          </span>
        </div>
      )}

      <div className="mb-4 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2">
          {pair.steps.map((step) => (
            <StepButton
              key={step.id}
              id={
                pair.current_step_order === step.step_order
                  ? `pair-${pair.id}-current-step`
                  : undefined
              }
              step={step}
              switch1={pair.switch1}
              switch2={pair.switch2}
              isCurrent={pair.current_step_order === step.step_order}
              canComplete={canCompleteStep(role, step.team)}
              pairOperating={pair.operating}
              onComplete={handleComplete}
              completing={completing}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
