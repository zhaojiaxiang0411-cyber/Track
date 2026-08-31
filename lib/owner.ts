// owner 是自由文本字段，前端「只看我的」筛选按它做匹配。归一化与匹配规则集中在这里，
// 供 hooks 与组件共用（纯函数，无 node 依赖，服务端/客户端均可引用）。

/** 下拉里代表「未指派」的哨兵值：owner 为空串会与「全部 Owner」的空值混淆，故用显式哨兵 */
export const UNASSIGNED_OWNER = "__unassigned__";

/**
 * owner 大小写不一（现场可能填 Eng9 / eng9）时应视为同一人，
 * 与 PipelineOverview「按 Owner 排序」的 sensitivity: "base" 口径保持一致。
 */
export function normalizeOwnerKey(owner: string | null | undefined): string {
  return owner?.trim().toLowerCase() ?? "";
}

export function matchesOwnerFilter(
  owner: string | null | undefined,
  ownerFilter: string | null
): boolean {
  if (!ownerFilter) return true;
  const key = normalizeOwnerKey(owner);
  if (ownerFilter === UNASSIGNED_OWNER) return key === "";
  return key === ownerFilter;
}
