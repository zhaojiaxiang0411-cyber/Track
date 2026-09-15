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

// 是否参与协作：登录用户（guest 只读，不发起也不确认呼叫）。
// 呼叫相关的权限都先过这道门，再各自附加条件。
export function isCollaborator(role: Role): boolean {
  return role === "admin" || role === "homison";
}

// 执行某个 Team 步骤的账号：Team C（esxi）没有独立账号，由 admin（cisco）代为点击，
// 故 A 与 C 都归到 admin。canCompleteStep 不能替代它——admin 有权点任意步骤，
// 用那个函数判断「这步是谁的活」会把 Team B 也算成 admin 的。
export function teamOwnerRole(team: Team): Role {
  return team === "B" ? "homison" : "admin";
}

// 能否发起「呼叫对方确认」：登录 + 当前进行中的步骤正是被呼叫方的活。
// 收紧到这个时机是因为呼叫的语义是「轮到你了，回一声看到没」——等着自己干活时
// 去催对方毫无意义，pipeline 已完成（waitingTeam 为 null）时同样没什么要确认的。
export function canSendPing(role: Role, waitingTeam: Team | null): boolean {
  if (!isCollaborator(role)) return false;
  if (waitingTeam === null) return false;
  const toRole = pingTargetRole(role);
  return toRole !== null && toRole === teamOwnerRole(waitingTeam);
}

// 能否确认某个呼叫：只有被呼叫的那一方。
// 别放宽成「任意登录用户」——发起方自己点掉回执，就等于自问自答，这个功能也就没意义了。
// 这里刻意不看步骤归属：呼叫发出后对方可能已经推进了流水线，
// 回执是给发起方看的，不该因为时机变了就点不动。
export function canAckPing(role: Role, toRole: Role): boolean {
  return isCollaborator(role) && role === toRole;
}

// 呼叫对象恒为另一方。这里用 Role 而不是 Team 表达方向：Team C（esxi）没有独立账号，
// 用 team 会得出「呼叫 esxi」这种没人能确认的目标。
export function pingTargetRole(role: Role): Role | null {
  if (role === "admin") return "homison";
  if (role === "homison") return "admin";
  return null;
}
