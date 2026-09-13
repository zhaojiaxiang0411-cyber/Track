import type { Team } from "./types";

export const TEAM_LABELS: Record<Team, string> = {
  A: "cisco",
  B: "homison",
  C: "esxi",
};

export function teamLabel(team: Team): string {
  return TEAM_LABELS[team];
}

// 业务时区：写库与显示的时间一律取该时区的墙钟，默认东八区。
// 不能依赖进程本地时区（d.getHours() 等）——容器默认 UTC，会把时间写成早 8 小时的
// 墙钟，前端再按浏览器时区（UTC+8）解析，「已进行」就凭空多出 8 小时。
const DEFAULT_BUSINESS_TIME_ZONE = "Asia/Shanghai";

function businessTimeZone(): string {
  // 客户端打包里读不到该环境变量，取不到时回落默认时区。
  const fromEnv =
    typeof process !== "undefined" ? process.env.APP_TIMEZONE : undefined;
  const trimmed = fromEnv?.trim();
  return trimmed ? trimmed : DEFAULT_BUSINESS_TIME_ZONE;
}

let cachedFormatter: Intl.DateTimeFormat | null = null;
let cachedTimeZone = "";

function businessTimeFormatter(): Intl.DateTimeFormat {
  const timeZone = businessTimeZone();
  if (!cachedFormatter || cachedTimeZone !== timeZone) {
    cachedFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23", // 勿用 hour12: false，部分实现会把午夜输出成 24 点
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    cachedTimeZone = timeZone;
  }
  return cachedFormatter;
}

// 返回业务时区的时间字符串（YYYY-MM-DD HH:mm:ss），与 formatDateTime 的解析格式保持一致。
// 不能用 new Date().toISOString()，那是 UTC，会比东八区偏 8 小时。
export function nowLocalString(): string {
  const parts = businessTimeFormatter().formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return (
    `${pick("year")}-${pick("month")}-${pick("day")} ` +
    `${pick("hour")}:${pick("minute")}:${pick("second")}`
  );
}

// 业务时区的当天日期（YYYY-MM-DD），用于导出文件名等场景。
export function todayLocalDate(): string {
  return nowLocalString().slice(0, 10);
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
