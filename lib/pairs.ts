import { getDb, runTransaction } from "./db";
import { broadcast } from "./events";
import { PIPELINE_STEPS, TOTAL_STEPS, resolveStepLabel } from "./pipeline";
import { nowLocalString, parseLocalTimeMs, teamLabel } from "./format";
import type { Pair, PairFilter, PairWithSteps, StepInstance, Team } from "./types";

function rowToPair(row: Record<string, unknown>): Pair {
  return {
    id: row.id as number,
    switch1: row.switch1 as string,
    switch2: row.switch2 as string,
    owner: (row.owner as string | null) ?? null,
    status: row.status as Pair["status"],
    created_at: row.created_at as string,
  };
}

function rowToStep(row: Record<string, unknown>): StepInstance {
  return {
    id: row.id as number,
    pair_id: row.pair_id as number,
    step_order: row.step_order as number,
    action_key: row.action_key as string,
    team: row.team as Team,
    label: row.label as string,
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    duration_sec: (row.duration_sec as number | null) ?? null,
  };
}

function enrichPair(pair: Pair, steps: StepInstance[]): PairWithSteps {
  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);
  const firstIncomplete = sorted.find((s) => !s.completed_at);
  const lastCompleted = [...sorted].reverse().find((s) => s.completed_at);

  let totalDuration: number | null = null;
  // 计时基准为 Snapshot（步骤 2）完成时刻，
  // 不计入 MW Start（步骤 1）与 Snapshot（步骤 2）本身耗时
  const EXCLUDED_LAST_ORDER = 2;
  const snapshot = sorted.find((s) => s.step_order === 2);
  const mwStart = sorted.find((s) => s.step_order === 1);
  const baseTime =
    snapshot?.completed_at ?? mwStart?.completed_at ?? pair.created_at;
  if (lastCompleted?.completed_at && lastCompleted.step_order > EXCLUDED_LAST_ORDER) {
    const start = parseLocalTimeMs(baseTime);
    const end = parseLocalTimeMs(lastCompleted.completed_at);
    totalDuration = Math.max(0, Math.round((end - start) / 1000));
  }

  return {
    ...pair,
    steps: sorted,
    current_step_order: firstIncomplete?.step_order ?? null,
    waiting_team:
      pair.status === "completed" ? null : (firstIncomplete?.team ?? null),
    total_duration_sec: totalDuration,
  };
}

export function listPairs(filter: PairFilter = "all"): PairWithSteps[] {
  const db = getDb();
  const pairs = db
    .prepare("SELECT * FROM pairs ORDER BY id DESC")
    .all() as Record<string, unknown>[];

  const getSteps = db.prepare(
    "SELECT * FROM step_instances WHERE pair_id = ? ORDER BY step_order ASC"
  );

  const enriched = pairs.map((row) => {
    const pair = rowToPair(row);
    const steps = getSteps.all(pair.id).map(rowToStep);
    return enrichPair(pair, steps);
  });

  switch (filter) {
    case "waiting_a":
      return enriched.filter((p) => p.waiting_team === "A");
    case "waiting_b":
      return enriched.filter((p) => p.waiting_team === "B");
    case "completed":
      return enriched.filter((p) => p.status === "completed");
    default:
      return enriched;
  }
}

export function getPairById(id: number): PairWithSteps | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM pairs WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  const pair = rowToPair(row);
  const steps = db
    .prepare(
      "SELECT * FROM step_instances WHERE pair_id = ? ORDER BY step_order ASC"
    )
    .all(id)
    .map(rowToStep);

  return enrichPair(pair, steps);
}

export function createPair(
  switch1: string,
  switch2: string,
  owner = ""
): PairWithSteps {
  const s1 = switch1.trim();
  const s2 = switch2.trim();
  const ownerName = owner.trim();
  if (!s1 || !s2) {
    throw new Error("交换机编号不能为空");
  }
  if (s1 === s2) {
    throw new Error("两台交换机编号不能相同");
  }

  const db = getDb();
  const insertPair = db.prepare(
    "INSERT INTO pairs (switch1, switch2, owner, created_at) VALUES (?, ?, ?, ?)"
  );
  const insertStep = db.prepare(`
    INSERT INTO step_instances (pair_id, step_order, action_key, team, label, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const pairId = runTransaction(() => {
    const result = insertPair.run(s1, s2, ownerName || null, nowLocalString());
    const newPairId = Number(result.lastInsertRowid);

    for (const step of PIPELINE_STEPS) {
      const startedAt = step.order === 1 ? nowLocalString() : null;
      insertStep.run(
        newPairId,
        step.order,
        step.actionKey,
        step.team,
        step.label,
        startedAt
      );
    }
    return newPairId;
  });
  const pair = getPairById(pairId);
  if (!pair) throw new Error("创建 Pair 失败");

  broadcast("pair_updated", { pairId, action: "created" });
  return pair;
}

export function completeStep(pairId: number, stepOrder: number): PairWithSteps {
  const db = getDb();
  const pair = getPairById(pairId);
  if (!pair) throw new Error("Pair 不存在");

  if (pair.status === "completed") {
    throw new Error("该 Pair 已完成，无法继续操作");
  }

  if (stepOrder < 1 || stepOrder > TOTAL_STEPS) {
    throw new Error("无效的步骤编号");
  }

  if (pair.current_step_order !== stepOrder) {
    throw new Error("必须按顺序执行，当前应完成步骤 " + pair.current_step_order);
  }

  const step = pair.steps.find((s) => s.step_order === stepOrder);
  if (!step) throw new Error("步骤不存在");
  if (step.completed_at) throw new Error("该步骤已完成");

  const prevStep = pair.steps.find((s) => s.step_order === stepOrder - 1);
  const startedAt =
    step.started_at ??
    prevStep?.completed_at ??
    pair.created_at;
  const completedAt = nowLocalString();
  const durationSec = Math.max(
    0,
    Math.round(
      (parseLocalTimeMs(completedAt) - parseLocalTimeMs(startedAt)) / 1000
    )
  );

  const updateStep = db.prepare(`
    UPDATE step_instances
    SET started_at = ?, completed_at = ?, duration_sec = ?
    WHERE pair_id = ? AND step_order = ?
  `);

  runTransaction(() => {
    updateStep.run(startedAt, completedAt, durationSec, pairId, stepOrder);

    const nextOrder = stepOrder + 1;
    if (nextOrder <= TOTAL_STEPS) {
      db.prepare(`
        UPDATE step_instances SET started_at = ? WHERE pair_id = ? AND step_order = ?
      `).run(completedAt, pairId, nextOrder);
    } else {
      db.prepare("UPDATE pairs SET status = 'completed' WHERE id = ?").run(
        pairId
      );
    }
  });

  const updated = getPairById(pairId);
  if (!updated) throw new Error("更新失败");

  broadcast("pair_updated", { pairId, action: "step_completed", stepOrder });
  return updated;
}

export function deletePair(pairId: number): void {
  const db = getDb();
  const result = db.prepare("DELETE FROM pairs WHERE id = ?").run(pairId);
  if (result.changes === 0) throw new Error("Pair 不存在");
  broadcast("pair_updated", { pairId, action: "deleted" });
}

export function buildExportCsv(): string {
  const pairs = listPairs("all");
  const header =
    "Pair,Switch1,Switch2,StepOrder,Action,Team,Phase,StartedAt,CompletedAt,DurationSec,PairStatus";
  const rows: string[] = [header];

  // Pipeline Start（步骤 1）与 Snapshot（步骤 2）不计入导出
  const EXCLUDED_STEP_ORDERS = new Set([1, 2]);

  for (const pair of pairs) {
    for (const step of pair.steps) {
      if (EXCLUDED_STEP_ORDERS.has(step.step_order)) continue;
      const template = PIPELINE_STEPS.find((t) => t.order === step.step_order);
      const phase = template?.phase ?? "";
      rows.push(
        [
          `${pair.switch1}-${pair.switch2}`,
          pair.switch1,
          pair.switch2,
          step.step_order,
          csvEscape(resolveStepLabel(step.step_order, step.label)),
          teamLabel(step.team),
          phase,
          step.started_at ?? "",
          step.completed_at ?? "",
          step.duration_sec ?? "",
          pair.status,
        ].join(",")
      );
    }
  }

  return rows.join("\n");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
