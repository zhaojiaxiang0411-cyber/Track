import type { Team } from "./types";

export const TEAM_LABELS: Record<Team, string> = {
  A: "cisco",
  B: "homison",
};

export function teamLabel(team: Team): string {
  return TEAM_LABELS[team];
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}
