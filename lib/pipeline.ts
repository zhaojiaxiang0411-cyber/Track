import type { PipelineStepTemplate } from "./types";

export const PIPELINE_STEPS: PipelineStepTemplate[] = [
  { order: 1, actionKey: "mw_start", label: "Pipeline Start", team: "A", phase: "全局" },
  { order: 2, actionKey: "snapshot_sw1", label: "Snapshot", team: "A", phase: "SW1" },
  { order: 3, actionKey: "label_sw1", label: "Label", team: "B", phase: "SW1" },
  { order: 4, actionKey: "decomm_sw1", label: "Decommission", team: "A", phase: "SW1" },
  {
    order: 5,
    actionKey: "uplink_only_sw1",
    label: "Rack and Plugin Uplinks",
    team: "B",
    phase: "SW1",
  },
  {
    order: 6,
    actionKey: "commission_sw1",
    label: "Register",
    team: "A",
    phase: "SW1",
  },
  { order: 7, actionKey: "downlink_sw1", label: "Plugin Downlinks", team: "B", phase: "SW1" },
  { order: 8, actionKey: "post_check_sw1", label: "Post Check", team: "A", phase: "SW1" },
  { order: 9, actionKey: "decomm_sw2", label: "Decommission", team: "A", phase: "SW2" },
  {
    order: 10,
    actionKey: "uplink_only_sw2",
    label: "Rack and Plugin Uplinks",
    team: "B",
    phase: "SW2",
  },
  {
    order: 11,
    actionKey: "commission_sw2",
    label: "Register",
    team: "A",
    phase: "SW2",
  },
  { order: 12, actionKey: "downlink_sw2", label: "Plugin Downlinks", team: "B", phase: "SW2" },
  { order: 13, actionKey: "post_check_sw2", label: "Post Check", team: "A", phase: "SW2" },
];

export const TOTAL_STEPS = PIPELINE_STEPS.length;

export function resolveStepLabel(stepOrder: number, fallback = ""): string {
  return PIPELINE_STEPS.find((s) => s.order === stepOrder)?.label ?? fallback;
}

export function resolveStepPhase(stepOrder: number): string {
  return PIPELINE_STEPS.find((s) => s.order === stepOrder)?.phase ?? "";
}

/**
 * 解析某个步骤对应的交换机名称。
 * - phase 为 SW1 → switch1
 * - phase 为 SW2 → switch2
 * - phase 为「全局」→ 两台交换机（若已知）
 */
export function resolveStepSwitch(
  stepOrder: number,
  switch1?: string,
  switch2?: string
): string | null {
  const phase = resolveStepPhase(stepOrder);
  if (phase === "SW1") return switch1 ?? "SW1";
  if (phase === "SW2") return switch2 ?? "SW2";
  if (phase === "全局") {
    if (switch1 && switch2) return `${switch1} · ${switch2}`;
    return "全局";
  }
  return null;
}
