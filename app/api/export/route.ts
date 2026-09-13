import { todayLocalDate } from "@/lib/format";
import { buildExportCsv } from "@/lib/pairs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// CSV 为只读数据导出，对所有人（含游客）开放。
export async function GET() {
  try {
    const csv = buildExportCsv();
    // 文件名日期取业务时区当天，toISOString() 是 UTC，凌晨导出会写成前一天。
    const filename = `switch-replacement-${todayLocalDate()}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导出失败" },
      { status: 500 }
    );
  }
}
