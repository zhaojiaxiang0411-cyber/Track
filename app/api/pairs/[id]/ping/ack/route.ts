import { getSession } from "@/lib/auth";
import { broadcast } from "@/lib/events";
import { roleLabel } from "@/lib/format";
import { canAckPing, isCollaborator } from "@/lib/permissions";
import { ackPing, getPing } from "@/lib/pings";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// 回执「已收到」：只有被呼叫的那一方能点，否则发起方自己点掉就成了自问自答。
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = getSession(request);
    if (!isCollaborator(session.role)) {
      return NextResponse.json(
        { error: "无权限确认，请先登录" },
        { status: session.role === "guest" ? 401 : 403 }
      );
    }

    const { id } = await context.params;
    const pairId = Number(id);
    const ping = getPing(pairId);
    if (!ping) {
      return NextResponse.json(
        { error: "该呼叫已失效，请刷新页面" },
        { status: 404 }
      );
    }
    if (!canAckPing(session.role, ping.toRole)) {
      return NextResponse.json(
        { error: `该呼叫是发给 ${roleLabel(ping.toRole)} 的，无法代为确认` },
        { status: 403 }
      );
    }

    const acked = ackPing(pairId);
    broadcast("ping_updated", { pairId, action: "acked" });
    return NextResponse.json({ ping: acked });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "确认失败" },
      { status: 400 }
    );
  }
}
