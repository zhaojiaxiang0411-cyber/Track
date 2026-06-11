export type Team = "A" | "B";

export type PairStatus = "active" | "completed";

export interface PipelineStepTemplate {
  order: number;
  actionKey: string;
  label: string;
  team: Team;
  phase: string;
}

export interface Pair {
  id: number;
  switch1: string;
  switch2: string;
  owner: string | null;
  status: PairStatus;
  created_at: string;
}

export interface StepInstance {
  id: number;
  pair_id: number;
  step_order: number;
  action_key: string;
  team: Team;
  label: string;
  started_at: string | null;
  completed_at: string | null;
  duration_sec: number | null;
}

export interface PairWithSteps extends Pair {
  steps: StepInstance[];
  current_step_order: number | null;
  waiting_team: Team | null;
  total_duration_sec: number | null;
}

export type PairFilter = "all" | "waiting_a" | "waiting_b" | "completed";
