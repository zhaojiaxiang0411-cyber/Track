import { getSession } from "@/lib/auth";
import { reorderPairs } from "@/lib/pairs";
import { canManagePairs } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!canManagePairs(session.role)) {
      return NextResponse.json(
        { error: "无权限调整顺序，仅 cisco 账号可操作" },
        { status: session.role === "guest" ? 401 : 403 }
      );
    }

    const body = (await request.json()) as { orderedIds?: unknown };
    if (
      !Array.isArray(body.orderedIds) ||
      !body.orderedIds.every((id) => typeof id === "number")
    ) {
      return NextResponse.json(
        { error: "orderedIds 必须是 pair id 数组" },
        { status: 400 }
      );
    }

    const pairs = reorderPairs(body.orderedIds);
    return NextResponse.json({ pairs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "调整顺序失败" },
      { status: 400 }
    );
  }
}
