"use client";

import { formatDateTime, formatDuration, teamLabel } from "@/lib/format";
import type { PairWithSteps } from "@/lib/types";
import { useState } from "react";
import { PipelineProgressDots } from "./PipelineProgressDots";
import { StepButton } from "./StepButton";

type PairCardProps = {
  pair: PairWithSteps;
  onUpdated: () => void;
  highlighted?: boolean;
};

export function PairCard({ pair, onUpdated, highlighted }: PairCardProps) {
  const [completing, setCompleting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  return (
    <article
      id={`pair-${pair.id}`}
      className={`scroll-mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 transition-shadow duration-500 ${
        highlighted
          ? "ring-2 ring-blue-500 shadow-md"
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
          {statusBadge}
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            {deleting ? "删除中…" : "删除"}
          </button>
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
              onComplete={handleComplete}
              completing={completing}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
