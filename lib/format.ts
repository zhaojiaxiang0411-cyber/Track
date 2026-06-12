import type { Team } from "./types";

export const TEAM_LABELS: Record<Team, string> = {
  A: "cisco",
  B: "homison",
};

export function teamLabel(team: Team): string {
  return TEAM_LABELS[team];
}

// 返回本地时间字符串（YYYY-MM-DD HH:mm:ss），与 formatDateTime 的本地时间解析保持一致。
// 不能用 new Date().toISOString()，那是 UTC，会比本地时间偏 8 小时。
export function nowLocalString(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function parseLocalTimeMs(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return new Date(value).getTime();
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[2]}/${match[3]} ${match[4]}`;
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
