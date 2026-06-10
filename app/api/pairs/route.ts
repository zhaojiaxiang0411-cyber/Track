import { createPair, listPairs } from "@/lib/pairs";
import type { PairFilter } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
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
    const body = (await request.json()) as {
      switch1?: string;
      switch2?: string;
    };
    const pair = createPair(body.switch1 ?? "", body.switch2 ?? "");
    return NextResponse.json({ pair }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建失败" },
      { status: 400 }
    );
  }
}
