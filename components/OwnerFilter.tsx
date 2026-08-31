"use client";

import { normalizeOwnerKey, UNASSIGNED_OWNER } from "@/lib/owner";
import type { PairWithSteps } from "@/lib/types";
import { useMemo } from "react";

type OwnerFilterProps = {
  /** 用全量 pair 生成候选，避免候选随 team 筛选而变 */
  pairs: PairWithSteps[];
  value: string | null;
  onChange: (value: string | null) => void;
};

export function OwnerFilterSelect({ pairs, value, onChange }: OwnerFilterProps) {
  const { owners, unassignedCount } = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    let unassigned = 0;

    for (const pair of pairs) {
      const key = normalizeOwnerKey(pair.owner);
      if (!key) {
        unassigned += 1;
        continue;
      }
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        // 大小写不同的同名 owner 合并为一项，展示取首次出现的原始写法
        byKey.set(key, { label: pair.owner?.trim() ?? key, count: 1 });
      }
    }

    const list = [...byKey.entries()]
      .map(([key, entry]) => ({ key, ...entry }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );

    return { owners: list, unassignedCount: unassigned };
  }, [pairs]);

  // 选中的 owner 可能已被删除或改名。仍把它留在选项里，否则 select 会显示成「全部 Owner」
  // 而列表实际是空的，让人误以为 pipeline 丢了。
  const staleOwner =
    value !== null &&
    value !== UNASSIGNED_OWNER &&
    !owners.some((o) => o.key === value)
      ? value
      : null;

  const active = value !== null;

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Owner</span>
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          title="只显示指定 Owner 的 pipeline（仅影响下方卡片列表，选择保存在本浏览器）"
          className={`rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ${
            active
              ? "border-blue-300 bg-blue-50 font-medium text-blue-800 focus:ring-blue-200"
              : "border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-blue-200"
          }`}
        >
          <option value="">全部 Owner</option>
          {owners.map((owner) => (
            <option key={owner.key} value={owner.key}>
              {owner.label}（{owner.count}）
            </option>
          ))}
          {unassignedCount > 0 && (
            <option value={UNASSIGNED_OWNER}>未指派（{unassignedCount}）</option>
          )}
          {staleOwner && <option value={staleOwner}>{staleOwner}（0）</option>}
        </select>
      </label>
      {active && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          清除
        </button>
      )}
    </div>
  );
}
