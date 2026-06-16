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
  rack: string | null;
  footprint: string | null;
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

// admin = cisco（全部权限）；homison = 仅 homison 步骤；guest = 未登录只读
export type Role = "admin" | "homison" | "guest";

export interface SessionUser {
  username: string;
  role: Role;
}
