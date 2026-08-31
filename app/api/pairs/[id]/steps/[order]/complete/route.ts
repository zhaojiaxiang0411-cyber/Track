import { getSession } from "@/lib/auth";
import { teamLabel } from "@/lib/format";
import { completeStep, getPairById, revertStepCompletion } from "@/lib/pairs";
import { canCompleteStep, canRevertStep } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; order: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id, order } = await context.params;
    const session = getSession(request);

    if (session.role === "guest") {
      return NextResponse.json(
        { error: "请先登录后再操作" },
        { status: 401 }
      );
    }

    const pair = getPairById(Number(id));
    if (!pair) {
      return NextResponse.json({ error: "Pair 不存在" }, { status: 404 });
    }
    const step = pair.steps.find((s) => s.step_order === Number(order));
    if (!step) {
      return NextResponse.json({ error: "步骤不存在" }, { status: 404 });
    }

    if (!canCompleteStep(session.role, step.team)) {
      return NextResponse.json(
        { error: `无权限操作 ${teamLabel(step.team)} 的步骤` },
        { status: 403 }
      );
    }

    const updated = completeStep(Number(id), Number(order));
    return NextResponse.json({ pair: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作失败" },
      { status: 400 }
    );
  }
}

// 撤销某一步的「已完成」，把它退回未完成状态交回对应 team 重做。
// order 由客户端显式给出，服务端校验它必须是当前最后一个已完成步骤（见 revertStepCompletion）。
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id, order } = await context.params;
    const session = getSession(request);

    if (session.role === "guest") {
      return NextResponse.json({ error: "请先登录后再操作" }, { status: 401 });
    }
    if (!canRevertStep(session.role)) {
      return NextResponse.json(
        { error: `无权限撤回步骤，需 ${teamLabel("A")} 账号` },
        { status: 403 }
      );
    }

    const pair = getPairById(Number(id));
    if (!pair) {
      return NextResponse.json({ error: "Pair 不存在" }, { status: 404 });
    }
    if (!pair.steps.some((s) => s.step_order === Number(order))) {
      return NextResponse.json({ error: "步骤不存在" }, { status: 404 });
    }

    const updated = revertStepCompletion(Number(id), Number(order));
    return NextResponse.json({ pair: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "撤回失败" },
      { status: 400 }
    );
  }
}
