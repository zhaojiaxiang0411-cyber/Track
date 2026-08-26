import type { PipelineStepTemplate, StepTemplateDef } from "./types";

// 步骤模板的单一事实来源。
// 注意：流水线长度按 pair 变化（可选步骤 Esxi Check 勾选后为 17 步，否则 14 步），
// 因此 step_order 不再是「步骤身份」的稳定键。所有元数据查找一律用 action_key。

// 基础布局（14 步），不含任何可选步骤。
const BASE_STEP_DEFS: StepTemplateDef[] = [
  { actionKey: "mw_start", label: "Pipeline Start", team: "A", phase: "全局" },
  { actionKey: "snapshot_sw1", label: "Snapshot", team: "A", phase: "全局" },
  {
    actionKey: "label_sw1",
    label: "Label and Unplug Downlinks",
    team: "B",
    phase: "SW1",
  },
  { actionKey: "decomm_sw1", label: "Decommission", team: "A", phase: "SW1" },
  {
    actionKey: "uplink_only_sw1",
    label: "Rack and Plugin Uplinks",
    team: "B",
    phase: "SW1",
  },
  { actionKey: "commission_sw1", label: "Register", team: "A", phase: "SW1" },
  { actionKey: "downlink_sw1", label: "Plugin Downlinks", team: "B", phase: "SW1" },
  { actionKey: "post_check_sw1", label: "Post Check", team: "A", phase: "SW1" },
  {
    actionKey: "label_sw2",
    label: "Label and Unplug Downlinks",
    team: "B",
    phase: "SW2",
  },
  { actionKey: "decomm_sw2", label: "Decommission", team: "A", phase: "SW2" },
  {
    actionKey: "uplink_only_sw2",
    label: "Rack and Plugin Uplinks",
    team: "B",
    phase: "SW2",
  },
  { actionKey: "commission_sw2", label: "Register", team: "A", phase: "SW2" },
  { actionKey: "downlink_sw2", label: "Plugin Downlinks", team: "B", phase: "SW2" },
  { actionKey: "post_check_sw2", label: "Post Check", team: "A", phase: "SW2" },
];

// 可选步骤：Esxi Check 由 esxi（Team C）负责，勾选后共三次——
// SW1 / SW2 各一次（插在同 phase 的 Label and Unplug Downlinks 之后、Decommission 之前），
// 外加整条流水线末尾的一次收尾检查（phase 为「全局」，两台交换机都完成后执行）。
const OPTIONAL_STEP_DEFS: Array<{
  anchorAfter: string;
  def: StepTemplateDef;
}> = [
  {
    anchorAfter: "label_sw1",
    def: { actionKey: "esxi_check_sw1", label: "Esxi Check", team: "C", phase: "SW1" },
  },
  {
    anchorAfter: "label_sw2",
    def: { actionKey: "esxi_check_sw2", label: "Esxi Check", team: "C", phase: "SW2" },
  },
  {
    anchorAfter: "post_check_sw2",
    def: {
      actionKey: "esxi_check_final",
      label: "Esxi Check",
      team: "C",
      phase: "全局",
    },
  },
];

export interface PipelineOptions {
  /** 是否包含 Esxi Check（SW1 / SW2 各一步） */
  esxiCheck: boolean;
}

/** 按选项生成完整流水线，order 从 1 连续编号。 */
export function buildPipelineSteps(options: PipelineOptions): PipelineStepTemplate[] {
  const defs: StepTemplateDef[] = [];
  for (const step of BASE_STEP_DEFS) {
    defs.push(step);
    if (options.esxiCheck) {
      for (const optional of OPTIONAL_STEP_DEFS) {
        if (optional.anchorAfter === step.actionKey) defs.push(optional.def);
      }
    }
  }
  return defs.map((def, index) => ({ ...def, order: index + 1 }));
}

/** 基础 14 步布局（不含可选步骤），供文档与默认展示使用。 */
export const BASE_PIPELINE_STEPS: PipelineStepTemplate[] = buildPipelineSteps({
  esxiCheck: false,
});

// 含全部可选步骤的完整布局，作为「跨 pair 对齐进度点」的列基准：
// 未勾选 Esxi Check 的 pair 在对应列留空位，14 步与 17 步的同一步骤才能竖向对齐。
// 基准必须是超集，否则勾选了可选步骤的 pair 会有步骤落在基准之外。
export const FULL_PIPELINE_STEPS: PipelineStepTemplate[] = buildPipelineSteps({
  esxiCheck: true,
});

const STEP_DEFS_BY_KEY = new Map<string, StepTemplateDef>(
  [...BASE_STEP_DEFS, ...OPTIONAL_STEP_DEFS.map((o) => o.def)].map((def) => [
    def.actionKey,
    def,
  ])
);

export function resolveStepLabel(actionKey: string, fallback = ""): string {
  return STEP_DEFS_BY_KEY.get(actionKey)?.label ?? fallback;
}

export function resolveStepPhase(actionKey: string): string {
  return STEP_DEFS_BY_KEY.get(actionKey)?.phase ?? "";
}

/**
 * 解析某个步骤对应的交换机名称。
 * - phase 为 SW1 → switch1
 * - phase 为 SW2 → switch2
 * - phase 为「全局」→ 两台交换机（若已知）
 */
export function resolveStepSwitch(
  actionKey: string,
  switch1?: string,
  switch2?: string
): string | null {
  const phase = resolveStepPhase(actionKey);
  if (phase === "SW1") return switch1 ?? "SW1";
  if (phase === "SW2") return switch2 ?? "SW2";
  if (phase === "全局") {
    if (switch1 && switch2) return `${switch1} · ${switch2}`;
    return "全局";
  }
  return null;
}

// 计时基准为 Snapshot 完成时刻：Pipeline Start 与 Snapshot 本身的耗时
// 既不计入总耗时，也不进入 CSV 导出。
export const TIMING_BASE_ACTION_KEY = "snapshot_sw1";
export const PIPELINE_START_ACTION_KEY = "mw_start";

const TIMING_EXCLUDED_ACTION_KEYS = new Set<string>([
  PIPELINE_START_ACTION_KEY,
  TIMING_BASE_ACTION_KEY,
]);

export function isExcludedFromTiming(actionKey: string): boolean {
  return TIMING_EXCLUDED_ACTION_KEYS.has(actionKey);
}
