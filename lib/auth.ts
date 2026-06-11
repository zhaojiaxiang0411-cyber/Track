import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import type { Role, SessionUser } from "./types";

// 会话 Cookie 名称与有效期
export const SESSION_COOKIE = "track_session";
export const SESSION_TTL_SEC = 60 * 60 * 12; // 12 小时

interface UserRecord {
  username: string;
  role: Role;
  password: string;
}

// 账号来源：默认 cisco/cisco、homison/homison，可用环境变量覆盖。
// 不在源码里写死生产密码：部署时通过 AUTH_*_PASSWORD 注入。
function getUsers(): UserRecord[] {
  return [
    {
      username: "cisco",
      role: "admin",
      password: process.env.AUTH_CISCO_PASSWORD ?? "cisco",
    },
    {
      username: "homison",
      role: "homison",
      password: process.env.AUTH_HOMISON_PASSWORD ?? "homison",
    },
  ];
}

// 会话签名密钥：生产环境务必通过 AUTH_SESSION_SECRET 设置高熵随机值。
function getSecret(): string {
  return (
    process.env.AUTH_SESSION_SECRET ??
    "track-dev-insecure-secret-change-in-production"
  );
}

function sha256(input: string): Buffer {
  return crypto.createHash("sha256").update(input, "utf8").digest();
}

// 以哈希后的定长缓冲做常数时间比较，避免时序侧信道并兼容任意长度输入。
function constantTimeEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function hmac(payload: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

// 校验用户名 / 密码，成功返回会话用户，失败返回 null（统一处理避免账号枚举）。
export function authenticate(
  username: string,
  password: string
): SessionUser | null {
  const user = getUsers().find((u) => u.username === username);
  if (!user) {
    // 仍执行一次比较，弱化时序差异
    constantTimeEqual(password, "\u0000invalid");
    return null;
  }
  if (!constantTimeEqual(password, user.password)) return null;
  return { username: user.username, role: user.role };
}

// 生成 HMAC 签名的会话令牌：base64url(payload).hmac
export function createSessionToken(user: SessionUser): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const payload = Buffer.from(
    JSON.stringify({ u: user.username, r: user.role, exp })
  ).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

const VALID_ROLES: Role[] = ["admin", "homison"];

export function verifySessionToken(
  token: string | undefined
): SessionUser | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = hmac(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { u?: unknown; r?: unknown; exp?: unknown };
    if (
      typeof data.u !== "string" ||
      typeof data.exp !== "number" ||
      data.exp < Math.floor(Date.now() / 1000) ||
      !VALID_ROLES.includes(data.r as Role)
    ) {
      return null;
    }
    return { username: data.u, role: data.r as Role };
  } catch {
    return null;
  }
}

// 从请求中解析当前会话，未登录返回 guest。
export function getSession(request: NextRequest): SessionUser {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token) ?? { username: "", role: "guest" };
}

// 是否以安全标志下发 Cookie：内网 http 部署默认 false，
// https 部署可设置 AUTH_COOKIE_SECURE=true。
export function cookieSecure(): boolean {
  return process.env.AUTH_COOKIE_SECURE === "true";
}
