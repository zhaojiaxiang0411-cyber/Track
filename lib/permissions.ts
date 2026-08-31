import type { Role, Team } from "./types";

// 纯权限判断函数：不依赖 node:crypto / next-server，
// 可同时在服务端路由与客户端组件中安全引用。

// 能否完成（点击）某个步骤：
// - admin（cisco）：任意步骤
// - homison：仅 Team B（homison）步骤
// - guest（未登录）：不可
// Team C（esxi）没有独立账号，其步骤由 admin 代为点击：
// 这里 homison 的 team === "B" 判断已自然排除 C，勿改成 team !== "A"。
export function canCompleteStep(role: Role, team: Team): boolean {
  if (role === "admin") return true;
  if (role === "homison") return team === "B";
  return false;
}

// 能否撤回已完成的步骤：仅 admin（cisco）
// 刻意不复用 canCompleteStep —— 那个函数对 homison 的 Team B 步骤返回 true，
// 复用会把撤回权一并给到 homison。撤回是纠错动作，只归 cisco。
export function canRevertStep(role: Role): boolean {
  return role === "admin";
}

// 能否新建 / 删除 pipeline：仅 admin（cisco）
export function canManagePairs(role: Role): boolean {
  return role === "admin";
}

// 能否修改 Info 字段：admin（cisco）与 homison 均可
// （admin 可改全部信息；homison 仅限 Info）
export function canEditInfo(role: Role): boolean {
  return role === "admin" || role === "homison";
}
