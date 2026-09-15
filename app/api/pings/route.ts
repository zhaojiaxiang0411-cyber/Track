import { listPairs } from "@/lib/pairs";
import { dismissPing, listPings } from "@/lib/pings";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 当前有效的呼叫列表。呼叫是内存态、不在 pairs 表里，刷新页面要靠这个接口恢复。
// 只暴露 pair id、步骤号、角色名与时间，无敏感信息，故与 pairs 列表一样对所有人开放。
export async function GET() {
  try {
    const pings = listPings();
    if (pings.length === 0) return NextResponse.json({ pings: [] });

    // 作废判断放在这里而不是 lib/pings.ts：让内存态模块不依赖数据库层，保持解耦。
    const currentByPairId = new Map(
      listPairs().map((pair) => [pair.id, pair.current_step_order])
    );

    const active = pings.filter((ping) => {
      const current = currentByPairId.get(ping.pairId);
      // undefined = pair 已被删除；步骤号变了 = 对方已推进流水线，这本身就是最强的
      // 「我看到了」，呼叫自动作废，顺手清出内存。
      if (current === undefined || current !== ping.stepOrder) {
        dismissPing(ping.pairId);
        return false;
      }
      return true;
    });

    return NextResponse.json({ pings: active });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取失败" },
      { status: 500 }
    );
  }
}
