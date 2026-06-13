import { getSession } from "@/lib/auth";
import { deletePair, getPairById } from "@/lib/pairs";
import { canManagePairs } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = getSession(_request);
    if (session.role === "guest") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { id } = await context.params;
    const pair = getPairById(Number(id));
    if (!pair) {
      return NextResponse.json({ error: "Pair 不存在" }, { status: 404 });
    }
    return NextResponse.json({ pair });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = getSession(request);
    if (!canManagePairs(session.role)) {
      return NextResponse.json(
        { error: "无权限删除 pipeline，仅 cisco 账号可操作" },
        { status: session.role === "guest" ? 401 : 403 }
      );
    }
    const { id } = await context.params;
    deletePair(Number(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 400 }
    );
  }
}
