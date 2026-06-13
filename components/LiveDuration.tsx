"use client";

import { formatDuration, parseLocalTimeMs } from "@/lib/format";
import { useEffect, useState } from "react";

type LiveDurationProps = {
  // 起算时刻（本地时间字符串，如 step.started_at）
  startedAt: string;
  className?: string;
};

/**
 * 实时跳动的耗时显示：从 startedAt 起算到当前时间，每秒刷新。
 * 用于「正在进行中」的步骤，复用 formatDuration 的展示格式。
 */
export function LiveDuration({ startedAt, className }: LiveDurationProps) {
  const startMs = parseLocalTimeMs(startedAt);
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.round((Date.now() - startMs) / 1000))
  );

  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.round((Date.now() - startMs) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startMs]);

  return <span className={className}>{formatDuration(seconds)}</span>;
}
