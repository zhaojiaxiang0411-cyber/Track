import {
  authenticate,
  cookieSecure,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SEC,
} from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";

    const user = authenticate(username, password);
    if (!user) {
      return NextResponse.json(
        { error: "用户名或密码错误" },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, createSessionToken(user), {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
      maxAge: SESSION_TTL_SEC,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "登录失败" }, { status: 400 });
  }
}
