import type { Role, Team } from "./types";

// 纯权限判断函数：不依赖 node:crypto / next-server，
// 可同时在服务端路由与客户端组件中安全引用。

// 能否完成（点击）某个步骤：
// - admin（cisco）：任意步骤
// - homison：仅 Team B（homison）步骤
// - guest（未登录）：不可
export function canCompleteStep(role: Role, team: Team): boolean {
  if (role === "admin") return true;
  if (role === "homison") return team === "B";
  return false;
}

// 能否新建 / 删除 pipeline：仅 admin（cisco）
export function canManagePairs(role: Role): boolean {
  return role === "admin";
}
