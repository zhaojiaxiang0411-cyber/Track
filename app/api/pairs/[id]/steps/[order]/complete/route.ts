import { completeStep } from "@/lib/pairs";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; order: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id, order } = await context.params;
    const pair = completeStep(Number(id), Number(order));
    return NextResponse.json({ pair });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作失败" },
      { status: 400 }
    );
  }
}
