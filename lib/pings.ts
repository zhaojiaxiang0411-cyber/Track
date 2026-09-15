import { nowLocalString } from "./format";
import type { Ping, Role } from "./types";

// 「呼叫对方确认」是按需的临时协作提示，刻意不入库：一次呼叫的生命周期只有几分钟，
// 权威状态始终是 pipeline 自身的步骤进度。与 lib/events.ts 的 SSE 客户端集合一样是
// 单进程内存态——重启即丢（没人确认就再点一次），多实例部署不共享。
// 另注：`next dev` 首次编译某个路由或热更新时会重新实例化本模块，开发中呼叫会凭空消失，
// 这是开发期特性，生产构建（next start / standalone）下所有路由共用同一实例，不会发生。
//
// key = pairId：一个 pair 同时只保留一个呼叫，重复点等于「再催一次」，不堆积成一串横幅。
const pings = new Map<number, PingRecord>();

// 待确认最多留 2 小时：这么久没人理说明当班的人早换了，留着只是噪音。
const PENDING_TTL_MS = 2 * 60 * 60 * 1000;
// 已确认再留 5 分钟，只为让发起方看到「对方已确认」，之后自动收起。
const ACKED_TTL_MS = 5 * 60 * 1000;

type PingRecord = Ping & {
  // TTL 判断用真实 epoch 毫秒：createdAt / ackedAt 是业务时区的墙钟字符串，
  // 把它解析出来再和 Date.now() 相减会受进程时区影响（容器为 UTC 时偏 8 小时），
  // 这是 AGENTS.md 时区约定里点名的跨边界比较陷阱。
  createdAtMs: number;
  ackedAtMs: number | null;
};

function isExpired(record: PingRecord, nowMs: number): boolean {
  return record.ackedAtMs !== null
    ? nowMs - record.ackedAtMs > ACKED_TTL_MS
    : nowMs - record.createdAtMs > PENDING_TTL_MS;
}

// 惰性清理，不用 setTimeout：dev 热重载会重复加载模块，遗留的定时器会持有旧 Map 的
// 引用；读时过滤既简单也不会泄漏。
function sweep(nowMs: number): void {
  for (const [pairId, record] of pings) {
    if (isExpired(record, nowMs)) pings.delete(pairId);
  }
}

function toPing(record: PingRecord): Ping {
  return {
    pairId: record.pairId,
    stepOrder: record.stepOrder,
    fromRole: record.fromRole,
    toRole: record.toRole,
    createdAt: record.createdAt,
    ackedAt: record.ackedAt,
  };
}

export function listPings(): Ping[] {
  sweep(Date.now());
  return [...pings.values()].map(toPing);
}

export function getPing(pairId: number): Ping | null {
  const record = pings.get(pairId);
  if (!record) return null;
  if (isExpired(record, Date.now())) {
    pings.delete(pairId);
    return null;
  }
  return toPing(record);
}

/**
 * 发起（或再催一次）呼叫。已有呼叫会被整体覆盖：发起时刻刷新、确认标记清空，
 * 语义就是「我又喊了一声，你再确认一次」。
 */
export function createPing(
  pairId: number,
  fromRole: Role,
  toRole: Role,
  stepOrder: number | null
): Ping {
  const record: PingRecord = {
    pairId,
    stepOrder,
    fromRole,
    toRole,
    createdAt: nowLocalString(),
    createdAtMs: Date.now(),
    ackedAt: null,
    ackedAtMs: null,
  };
  pings.set(pairId, record);
  return toPing(record);
}

/** 确认「已收到」。调用方须先用 canAckPing 校验身份。幂等：重复点不改确认时刻。 */
export function ackPing(pairId: number): Ping {
  const record = pings.get(pairId);
  if (!record || isExpired(record, Date.now())) {
    pings.delete(pairId);
    throw new Error("该呼叫已失效，请刷新页面");
  }
  if (record.ackedAt !== null) return toPing(record);

  const acked: PingRecord = {
    ...record,
    ackedAt: nowLocalString(),
    ackedAtMs: Date.now(),
  };
  pings.set(pairId, acked);
  return toPing(acked);
}

export function dismissPing(pairId: number): void {
  pings.delete(pairId);
}
