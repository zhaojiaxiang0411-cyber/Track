import { getSession } from "@/lib/auth";
import { createPair, listPairs } from "@/lib/pairs";
import { canManagePairs } from "@/lib/permissions";
import type { PairFilter } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (session.role === "guest") {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const filter = (request.nextUrl.searchParams.get("filter") ??
      "all") as PairFilter;
    const pairs = listPairs(filter);
    return NextResponse.json({ pairs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!canManagePairs(session.role)) {
      return NextResponse.json(
        { error: "无权限新建 pipeline，仅 cisco 账号可操作" },
        { status: session.role === "guest" ? 401 : 403 }
      );
    }
    const body = (await request.json()) as {
      switch1?: string;
      switch2?: string;
      owner?: string;
    };
    const pair = createPair(
      body.switch1 ?? "",
      body.switch2 ?? "",
      body.owner ?? ""
    );
    return NextResponse.json({ pair }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建失败" },
      { status: 400 }
    );
  }
}
