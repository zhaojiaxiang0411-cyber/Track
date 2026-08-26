"use client";

import { teamLabel } from "@/lib/format";
import type { PairFilter as Filter } from "@/lib/types";

const FILTERS: { value: Filter; label: string; dotColor?: string }[] = [
  { value: "all", label: "全部", dotColor: "bg-slate-400" },
  { value: "waiting_a", label: `等 ${teamLabel("A")}`, dotColor: "bg-blue-600" },
  { value: "waiting_b", label: `等 ${teamLabel("B")}`, dotColor: "bg-orange-600" },
  { value: "waiting_c", label: `等 ${teamLabel("C")}`, dotColor: "bg-violet-600" },
  { value: "completed", label: "已完成", dotColor: "bg-emerald-600" },
];

type PairFilterProps = {
  value: Filter;
  onChange: (value: Filter) => void;
  counts?: Record<Filter, number>;
};

export function PairFilterBar({ value, onChange, counts }: PairFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => onChange(f.value)}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            value === f.value
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          {f.dotColor && (
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                value === f.value ? "bg-white/80" : f.dotColor
              }`}
            />
          )}
          {f.label}
          {counts && (
            <span
              className={`tabular-nums text-xs ${
                value === f.value ? "text-white/80" : "text-slate-400"
              }`}
            >
              {counts[f.value]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
