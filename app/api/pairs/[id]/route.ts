import { getSession } from "@/lib/auth";
import { deletePair, getPairById, updatePairInfo } from "@/lib/pairs";
import { canManagePairs } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    // 单个 Pair 为只读数据，对所有人（含游客）开放。
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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = getSession(request);
    if (!canManagePairs(session.role)) {
      return NextResponse.json(
        { error: "无权限修改 pipeline，仅 cisco 账号可操作" },
        { status: session.role === "guest" ? 401 : 403 }
      );
    }
    const { id } = await context.params;
    const body = (await request.json()) as {
      rack?: string;
      footprint?: string;
    };
    const fields: { rack?: string; footprint?: string } = {};
    if (typeof body.rack === "string") fields.rack = body.rack;
    if (typeof body.footprint === "string") fields.footprint = body.footprint;
    const pair = updatePairInfo(Number(id), fields);
    return NextResponse.json({ pair });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新失败" },
      { status: 400 }
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
