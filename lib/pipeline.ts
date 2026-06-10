import type { PipelineStepTemplate } from "./types";

export const PIPELINE_STEPS: PipelineStepTemplate[] = [
  { order: 1, actionKey: "mw_start", label: "MW Start", team: "A", phase: "全局" },
  { order: 2, actionKey: "snapshot_sw1", label: "Snapshot", team: "A", phase: "SW1" },
  { order: 3, actionKey: "label_sw1", label: "Label", team: "B", phase: "SW1" },
  { order: 4, actionKey: "decomm_sw1", label: "Decommission", team: "A", phase: "SW1" },
  {
    order: 5,
    actionKey: "uplink_only_sw1",
    label: "Mount and Plugin Uplinks",
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
  { order: 7, actionKey: "downlink_sw1", label: "Plug in Downlink", team: "B", phase: "SW1" },
  { order: 8, actionKey: "post_check_sw1", label: "Post Check", team: "A", phase: "SW1" },
  { order: 9, actionKey: "decomm_sw2", label: "Decommission", team: "A", phase: "SW2" },
  {
    order: 10,
    actionKey: "uplink_only_sw2",
    label: "Mount and Plugin Uplinks",
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
  { order: 12, actionKey: "downlink_sw2", label: "Plug in Downlink", team: "B", phase: "SW2" },
  { order: 13, actionKey: "post_check_sw2", label: "Post Check", team: "A", phase: "SW2" },
];

export const TOTAL_STEPS = PIPELINE_STEPS.length;

export function resolveStepLabel(stepOrder: number, fallback = ""): string {
  return PIPELINE_STEPS.find((s) => s.order === stepOrder)?.label ?? fallback;
}
