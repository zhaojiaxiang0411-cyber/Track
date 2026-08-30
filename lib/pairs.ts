import { getDb, runTransaction } from "./db";
import { broadcast } from "./events";
import {
  PIPELINE_START_ACTION_KEY,
  TIMING_BASE_ACTION_KEY,
  buildPipelineSteps,
  isExcludedFromTiming,
  resolveStepLabel,
  resolveStepSwitch,
} from "./pipeline";
import { nowLocalString, parseLocalTimeMs, teamLabel } from "./format";
import type { Pair, PairFilter, PairWithSteps, StepInstance, Team } from "./types";

function rowToPair(row: Record<string, unknown>): Pair {
  return {
    id: row.id as number,
    switch1: row.switch1 as string,
    switch2: row.switch2 as string,
    rack: (row.rack as string | null) ?? null,
    footprint: (row.footprint as string | null) ?? null,
    owner: (row.owner as string | null) ?? null,
    status: row.status as Pair["status"],
    esxi_check: Boolean(row.esxi_check),
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
  // 计时基准为 Snapshot 完成时刻，不计入 Pipeline Start 与 Snapshot 本身耗时。
  // 流水线长度按 pair 变化，故一律按 action_key 定位而非 step_order。
  const snapshot = sorted.find((s) => s.action_key === TIMING_BASE_ACTION_KEY);
  const mwStart = sorted.find((s) => s.action_key === PIPELINE_START_ACTION_KEY);
  const baseTime =
    snapshot?.completed_at ?? mwStart?.completed_at ?? pair.created_at;
  if (
    lastCompleted?.completed_at &&
    !isExcludedFromTiming(lastCompleted.action_key)
  ) {
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
  // 展示顺序由 sort_order 决定（Pipeline Overview 可拖拽调整）；
  // 同值时回落到 id DESC，与加入该列之前的默认顺序保持一致。
  const pairs = db
    .prepare("SELECT * FROM pairs ORDER BY sort_order ASC, id DESC")
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
    case "waiting_c":
      return enriched.filter((p) => p.waiting_team === "C");
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
  owner = "",
  rack = "",
  footprint = "",
  esxiCheck = false
): PairWithSteps {
  const s1 = switch1.trim();
  const s2 = switch2.trim();
  const ownerName = owner.trim();
  const rackName = rack.trim();
  const footprintName = footprint.trim();
  if (!s1 || !s2) {
    throw new Error("交换机编号不能为空");
  }
  if (s1 === s2) {
    throw new Error("两台交换机编号不能相同");
  }

  const db = getDb();
  // 新建的 pair 排在最前，与加入 sort_order 之前 id DESC 的习惯一致。
  const insertPair = db.prepare(
    `INSERT INTO pairs (switch1, switch2, rack, footprint, owner, esxi_check, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MIN(sort_order), 0) - 1 FROM pairs), ?)`
  );
  const insertStep = db.prepare(`
    INSERT INTO step_instances (pair_id, step_order, action_key, team, label, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const steps = buildPipelineSteps({ esxiCheck });

  const pairId = runTransaction(() => {
    const result = insertPair.run(
      s1,
      s2,
      rackName || null,
      footprintName || null,
      ownerName || null,
      esxiCheck ? 1 : 0,
      nowLocalString()
    );
    const newPairId = Number(result.lastInsertRowid);

    for (const step of steps) {
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

export function updatePairInfo(
  pairId: number,
  fields: { rack?: string; footprint?: string; owner?: string }
): PairWithSteps {
  const db = getDb();
  const existing = getPairById(pairId);
  if (!existing) throw new Error("Pair 不存在");

  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (fields.rack !== undefined) {
    sets.push("rack = ?");
    values.push(fields.rack.trim() || null);
  }
  if (fields.footprint !== undefined) {
    sets.push("footprint = ?");
    values.push(fields.footprint.trim() || null);
  }
  if (fields.owner !== undefined) {
    sets.push("owner = ?");
    values.push(fields.owner.trim() || null);
  }

  if (sets.length === 0) {
    return existing;
  }

  values.push(pairId);
  db.prepare(`UPDATE pairs SET ${sets.join(", ")} WHERE id = ?`).run(...values);

  const updated = getPairById(pairId);
  if (!updated) throw new Error("更新失败");

  broadcast("pair_updated", { pairId, action: "info_updated" });
  return updated;
}

// 按给定顺序重排 pair 的展示顺序（数组首位排最前），供 Pipeline Overview 拖拽使用。
// 要求 orderedIds 恰好是当前全部 pair 的一个排列：若拖拽期间别人新建或删除了 pair，
// 客户端手里的列表已经过时，此时整体拒绝，好过把过时顺序写进库导致遗漏或错位。
export function reorderPairs(orderedIds: number[]): PairWithSteps[] {
  const db = getDb();

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error("顺序列表不能为空");
  }
  if (!orderedIds.every((id) => Number.isInteger(id))) {
    throw new Error("顺序列表包含非法 id");
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error("顺序列表存在重复 id");
  }

  const existingIds = (
    db.prepare("SELECT id FROM pairs").all() as Array<{ id: number }>
  ).map((row) => row.id);
  const existing = new Set(existingIds);
  if (
    orderedIds.length !== existingIds.length ||
    orderedIds.some((id) => !existing.has(id))
  ) {
    throw new Error("Pipeline 列表已变化，请刷新后重试");
  }

  const update = db.prepare("UPDATE pairs SET sort_order = ? WHERE id = ?");
  runTransaction(() => {
    orderedIds.forEach((id, index) => update.run(index, id));
  });

  broadcast("pair_updated", { action: "reordered" });
  return listPairs("all");
}

export function completeStep(pairId: number, stepOrder: number): PairWithSteps {
  const db = getDb();
  const pair = getPairById(pairId);
  if (!pair) throw new Error("Pair 不存在");

  if (pair.status === "completed") {
    throw new Error("该 Pair 已完成，无法继续操作");
  }

  // 流水线长度按 pair 变化（含 Esxi Check 为 17 步，否则 14 步），
  // 因此边界与「是否最后一步」都取该 pair 自身的步骤。
  const lastOrder = pair.steps.reduce(
    (max, s) => Math.max(max, s.step_order),
    0
  );

  if (stepOrder < 1 || stepOrder > lastOrder) {
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
    if (nextOrder <= lastOrder) {
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
    "Pair,Switch1,Switch2,StepOrder,Action,Team,Switch,StartedAt,CompletedAt,DurationSec,DurationMin,PairStatus";
  const rows: string[] = [header];

  for (const pair of pairs) {
    for (const step of pair.steps) {
      // Pipeline Start 与 Snapshot 不计入导出，与总耗时口径一致
      if (isExcludedFromTiming(step.action_key)) continue;
      const phase =
        resolveStepSwitch(step.action_key, pair.switch1, pair.switch2) ?? "";
      rows.push(
        [
          csvCell(`${pair.switch1}-${pair.switch2}`),
          csvCell(pair.switch1),
          csvCell(pair.switch2),
          csvCell(step.step_order),
          csvCell(resolveStepLabel(step.action_key, step.label)),
          csvCell(teamLabel(step.team)),
          csvCell(phase),
          csvCell(step.started_at),
          csvCell(step.completed_at),
          csvCell(step.duration_sec),
          csvCell(toMinutes(step.duration_sec)),
          csvCell(pair.status),
        ].join(",")
      );
    }
  }

  const summary = buildSummarySection(pairs);
  if (summary.length > 0) {
    rows.push("");
    rows.push(...summary);
  }

  // 标准 CSV 用 CRLF 作行分隔，避免仅 \n 在部分工具中解析异常。
  return rows.join("\r\n");
}

// ---------------------------------------------------------------------------
// 汇总统计表（追加在明细之后）
// ---------------------------------------------------------------------------

// 报表列名与编号沿用现场交付口径，和 pipeline.ts 的步骤 label 不同名，
// 故在此单列一份映射；每列的 action_key 由 `${keyPrefix}_sw${1|2}` 拼出。
const SUMMARY_HOMISON_COLUMNS = [
  { header: "1. Labing & Unplug downlink", keyPrefix: "label" },
  { header: "2. ESXi verify", keyPrefix: "esxi_check" },
  { header: "4. Power off & power on & plug uplink", keyPrefix: "uplink_only" },
  { header: "6. Plug downlink", keyPrefix: "downlink" },
] as const;

const SUMMARY_CISCO_COLUMNS = [
  { header: "3. Decomission", keyPrefix: "decomm" },
  { header: "5. Verify uplink & register", keyPrefix: "commission" },
  { header: "7. Verify downlink & post check", keyPrefix: "post_check" },
] as const;

const SUMMARY_ESXI_FINAL_ACTION_KEY = "esxi_check_final";

// Total Port# / ESXi Port# 数据库中无对应字段，导出留空供人工填写。
const SUMMARY_HEADERS = [
  "Switch",
  "Total Port#",
  "ESXi Port#",
  ...SUMMARY_HOMISON_COLUMNS.map((c) => c.header),
  "Sum",
  ...SUMMARY_CISCO_COLUMNS.map((c) => c.header),
  "Sum",
  "Overall",
  "8. ESXi final check for a pair",
  "Note",
];

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface SummaryGroup {
  /** 各列的分钟值，null 表示该步骤不存在（未启用）或尚未完成 */
  cells: (string | null)[];
  /** 组内小计；只要有已存在但未完成的步骤就留空 */
  sum: string | null;
  totalSec: number;
  incomplete: boolean;
}

function summarizeGroup(
  stepsByKey: Map<string, StepInstance>,
  columns: readonly { keyPrefix: string }[],
  switchIndex: 1 | 2
): SummaryGroup {
  const cells: (string | null)[] = [];
  let totalSec = 0;
  let incomplete = false;

  for (const column of columns) {
    const step = stepsByKey.get(`${column.keyPrefix}_sw${switchIndex}`);
    // 步骤不存在说明该 pair 未勾选对应可选步骤，属于「不适用」而非「未完成」
    if (!step) {
      cells.push(null);
      continue;
    }
    if (step.duration_sec === null) {
      cells.push(null);
      incomplete = true;
      continue;
    }
    cells.push(toMinutes(step.duration_sec));
    totalSec += step.duration_sec;
  }

  return {
    cells,
    sum: incomplete ? null : toMinutes(totalSec),
    totalSec,
    incomplete,
  };
}

function buildSummarySection(pairs: PairWithSteps[]): string[] {
  if (pairs.length === 0) return [];

  // listPairs 按 id 倒序返回，报表按时间先后（id 升序）排列更符合阅读习惯。
  const ordered = [...pairs].sort((a, b) => a.id - b.id);

  const groupRow = new Array<string>(SUMMARY_HEADERS.length).fill("");
  groupRow[3] = "Homison & ESXi";
  groupRow[3 + SUMMARY_HOMISON_COLUMNS.length + 1] = "Cisco";

  const rows: string[] = [
    csvCell(buildSummaryTitle(ordered)),
    groupRow.map(csvCell).join(","),
    SUMMARY_HEADERS.map(csvCell).join(","),
  ];

  for (const pair of ordered) {
    const stepsByKey = new Map(pair.steps.map((s) => [s.action_key, s]));
    const esxiFinal = stepsByKey.get(SUMMARY_ESXI_FINAL_ACTION_KEY);

    for (const switchIndex of [1, 2] as const) {
      const homison = summarizeGroup(
        stepsByKey,
        SUMMARY_HOMISON_COLUMNS,
        switchIndex
      );
      const cisco = summarizeGroup(
        stepsByKey,
        SUMMARY_CISCO_COLUMNS,
        switchIndex
      );
      // 由秒累加后再换算，避免两个小计各自四舍五入后相加产生偏差
      const overall =
        homison.incomplete || cisco.incomplete
          ? null
          : toMinutes(homison.totalSec + cisco.totalSec);

      // ESXi 收尾检查是 pair 级步骤，只写在该 pair 的第一行，第二行留空（对应图中的合并单元格）
      const esxiFinalCell =
        switchIndex === 1 && esxiFinal ? toMinutes(esxiFinal.duration_sec) : null;
      const esxiFinalIncomplete =
        switchIndex === 1 && !!esxiFinal && esxiFinal.duration_sec === null;

      const incomplete =
        homison.incomplete || cisco.incomplete || esxiFinalIncomplete;

      rows.push(
        [
          switchIndex === 1 ? pair.switch1 : pair.switch2,
          null,
          null,
          ...homison.cells,
          homison.sum,
          ...cisco.cells,
          cisco.sum,
          overall,
          esxiFinalCell,
          incomplete ? "未完成" : null,
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }

  return rows;
}

function buildSummaryTitle(pairs: PairWithSteps[]): string {
  let startAt: string | null = null;
  let endAt: string | null = null;
  const footprints = new Set<string>();
  let allCompleted = true;

  for (const pair of pairs) {
    if (pair.footprint) footprints.add(pair.footprint);
    if (pair.status !== "completed") allCompleted = false;

    // 窗口起点取 Pipeline Start 的完成时刻（真正宣布开工的时刻），未点则退回创建时间
    const mwStart = pair.steps.find(
      (s) => s.action_key === PIPELINE_START_ACTION_KEY
    );
    const pairStart = mwStart?.completed_at ?? pair.created_at;
    if (!startAt || parseLocalTimeMs(pairStart) < parseLocalTimeMs(startAt)) {
      startAt = pairStart;
    }

    for (const step of pair.steps) {
      if (!step.completed_at) continue;
      if (!endAt || parseLocalTimeMs(step.completed_at) > parseLocalTimeMs(endAt)) {
        endAt = step.completed_at;
      }
    }
  }

  const dateLabel =
    startAt && endAt && formatSummaryDate(startAt) !== formatSummaryDate(endAt)
      ? `${formatSummaryDate(startAt)} - ${formatSummaryDate(endAt)}`
      : startAt
        ? formatSummaryDate(startAt)
        : "-";
  const site = footprints.size > 0 ? ` (${[...footprints].join(" / ")})` : "";
  const startLabel = startAt ? formatSummaryClock(startAt) : "-";
  const endLabel = endAt ? formatSummaryClock(endAt) : "-";
  const endPrefix = allCompleted ? "completed at" : "last update at";

  return `Change on ${dateLabel}${site} - started at ${startLabel} - ${endPrefix} ${endLabel} HKT`;
}

function formatSummaryDate(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(local);
  if (!match) return local;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTH_ABBR[Number(month) - 1]} ${year}`;
}

function formatSummaryClock(local: string): string {
  const match = /[ T](\d{2}):(\d{2})/.exec(local);
  if (!match) return local;
  const hour = Number(match[1]);
  const suffix = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

// 秒换算为分钟，保留 1 位小数；未完成的步骤（null）保持空单元格而非 0
function toMinutes(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  return (Math.round((seconds / 60) * 10) / 10).toFixed(1);
}

// 生成安全的 CSV 单元格：
// 1) 中和公式注入 —— Excel/Sheets 会把以 = + - @ 或控制字符（Tab/CR）开头的单元格
//    当作公式执行，甚至触发命令。switch 名称等字段用户可控，故对这类文本加前缀单引号使其失效。
// 2) 按 RFC 4180 转义 —— 含逗号 / 引号 / 换行(\r 或 \n) 的值用双引号包裹并将内部引号翻倍。
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
