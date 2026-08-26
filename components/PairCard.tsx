"use client";

import { formatDateTime, formatDuration, teamLabel } from "@/lib/format";
import { canCompleteStep } from "@/lib/permissions";
import { isExcludedFromTiming } from "@/lib/pipeline";
import { teamStyle } from "@/lib/teamStyles";
import type { PairWithSteps, Role } from "@/lib/types";
import { useState } from "react";
import { LiveDuration } from "./LiveDuration";
import { PipelineProgressDots } from "./PipelineProgressDots";
import { StepButton } from "./StepButton";

type PairCardProps = {
  pair: PairWithSteps;
  role: Role;
  canDelete: boolean;
  canEditInfo?: boolean;
  onUpdated: () => void;
  highlighted?: boolean;
};

export function PairCard({
  pair,
  role,
  canDelete,
  canEditInfo = false,
  onUpdated,
  highlighted,
}: PairCardProps) {
  const [completing, setCompleting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rackDraft, setRackDraft] = useState(pair.rack ?? "");
  const [footprintDraft, setFootprintDraft] = useState(pair.footprint ?? "");
  const [ownerDraft, setOwnerDraft] = useState(pair.owner ?? "");
  const [savingInfo, setSavingInfo] = useState(false);

  const startEdit = () => {
    setRackDraft(pair.rack ?? "");
    setFootprintDraft(pair.footprint ?? "");
    setOwnerDraft(pair.owner ?? "");
    setEditing(true);
  };

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    try {
      // admin 可改全部信息；homison 仅提交 Info（footprint）
      const payload = canDelete
        ? { rack: rackDraft, footprint: footprintDraft, owner: ownerDraft }
        : { footprint: footprintDraft };
      const res = await fetch(`/api/pairs/${pair.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      setEditing(false);
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingInfo(false);
    }
  };

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

  const currentStep =
    pair.current_step_order !== null
      ? pair.steps.find((s) => s.step_order === pair.current_step_order)
      : undefined;
  // 进行中的耗时排除 Pipeline Start / Snapshot，与总耗时口径一致
  const liveStep =
    currentStep &&
    !isExcludedFromTiming(currentStep.action_key) &&
    currentStep.started_at
      ? currentStep
      : undefined;

  const waitingTeam = pair.status === "completed" ? null : pair.waiting_team;

  const statusBadge =
    pair.status === "completed" ? (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
        Completed
      </span>
    ) : waitingTeam ? (
      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${teamStyle(waitingTeam).badge}`}
      >
        等待 {teamLabel(waitingTeam)} · 步骤 #{pair.current_step_order}
        {liveStep && (
          <span className="ml-1 font-normal">
            · 已进行 <LiveDuration startedAt={liveStep.started_at!} />
          </span>
        )}
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
            {pair.rack && (
              <span className="ml-2 align-middle rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Rack: {pair.rack}
              </span>
            )}
            {pair.footprint && (
              <span className="ml-2 align-middle rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Info: {pair.footprint}
              </span>
            )}
            {pair.owner && (
              <span className="ml-2 align-middle rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Owner: {pair.owner}
              </span>
            )}
            {pair.esxi_check && (
              <span className="ml-2 align-middle rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                含 Esxi Check
              </span>
            )}
            {(canDelete || canEditInfo) && !editing && (
              <button
                type="button"
                onClick={startEdit}
                className="ml-2 align-middle rounded-full px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                {canDelete ? "编辑信息" : "编辑 Info"}
              </button>
            )}
          </h2>
          {editing && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              {canDelete && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Rack
                  </label>
                  <input
                    type="text"
                    value={rackDraft}
                    onChange={(e) => setRackDraft(e.target.value)}
                    placeholder="可选，Rack"
                    className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Info
                </label>
                <input
                  type="text"
                  value={footprintDraft}
                  onChange={(e) => setFootprintDraft(e.target.value)}
                  placeholder="可选，Info"
                  className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              {canDelete && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Owner
                  </label>
                  <input
                    type="text"
                    value={ownerDraft}
                    onChange={(e) => setOwnerDraft(e.target.value)}
                    placeholder="可选，Owner"
                    className="w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleSaveInfo}
                disabled={savingInfo}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {savingInfo ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={savingInfo}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                取消
              </button>
            </div>
          )}
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
              onComplete={handleComplete}
              completing={completing}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
