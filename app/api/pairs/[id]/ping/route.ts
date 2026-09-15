import { getSession } from "@/lib/auth";
import { broadcast } from "@/lib/events";
import { roleLabel } from "@/lib/format";
import { getPairById } from "@/lib/pairs";
import {
  canSendPing,
  isCollaborator,
  pingTargetRole,
} from "@/lib/permissions";
import { createPing, dismissPing, getPing } from "@/lib/pings";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// 发起（或再催一次）「呼叫对方确认」：点完步骤后不确定对方看到了，主动喊一声。
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = getSession(request);
    if (!isCollaborator(session.role)) {
      return NextResponse.json(
        { error: "无权限呼叫，请先登录" },
        { status: session.role === "guest" ? 401 : 403 }
      );
    }
    const toRole = pingTargetRole(session.role);
    if (!toRole) {
      return NextResponse.json({ error: "没有可呼叫的对方" }, { status: 403 });
    }

    const { id } = await context.params;
    const pair = getPairById(Number(id));
    if (!pair) {
      return NextResponse.json({ error: "Pair 不存在" }, { status: 404 });
    }
    if (pair.status === "completed") {
      return NextResponse.json(
        { error: "该 pipeline 已完成，无需呼叫确认" },
        { status: 400 }
      );
    }
    // 只在对方的步骤进行中才允许呼叫。前端按钮已按同一规则禁用，这里是真正的强制：
    // SSE 有延迟，按钮点下去时步骤可能已被推进到自己这边。
    if (!canSendPing(session.role, pair.waiting_team)) {
      return NextResponse.json(
        {
          error: `当前步骤不由 ${roleLabel(toRole)} 负责，无需呼叫确认（可能已被推进，请刷新页面）`,
        },
        { status: 403 }
      );
    }

    // 记下发起时的当前步骤号：对方一旦点了下一步，呼叫就自动作废（见 GET /api/pings）
    const ping = createPing(
      pair.id,
      session.role,
      toRole,
      pair.current_step_order
    );
    broadcast("ping_updated", { pairId: pair.id, action: "created" });
    return NextResponse.json({ ping }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "呼叫失败" },
      { status: 400 }
    );
  }
}

// 关闭呼叫：仅发起方可收起（看到对方确认后，或误点想撤销）。
// 被呼叫方的动作是「已收到」，不是关掉别人的呼叫。
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = getSession(request);
    if (!isCollaborator(session.role)) {
      return NextResponse.json(
        { error: "无权限操作，请先登录" },
        { status: session.role === "guest" ? 401 : 403 }
      );
    }

    const { id } = await context.params;
    const pairId = Number(id);
    const ping = getPing(pairId);
    // 已被对方推进流水线作废、或已过期：视为已经收起，幂等返回成功
    if (!ping) return NextResponse.json({ ok: true });

    if (ping.fromRole !== session.role) {
      return NextResponse.json(
        { error: `该呼叫由 ${roleLabel(ping.fromRole)} 发起，只能由发起方收起` },
        { status: 403 }
      );
    }

    dismissPing(pairId);
    broadcast("ping_updated", { pairId, action: "dismissed" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作失败" },
      { status: 400 }
    );
  }
}
