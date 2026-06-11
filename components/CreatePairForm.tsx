"use client";

import { useState } from "react";

type CreatePairFormProps = {
  onCreated: () => void;
};

export function CreatePairForm({ onCreated }: CreatePairFormProps) {
  const [switch1, setSwitch1] = useState("");
  const [switch2, setSwitch2] = useState("");
  const [owner, setOwner] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ switch1, switch2, owner }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      setSwitch1("");
      setSwitch2("");
      setOwner("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Switch 1
        </label>
        <input
          type="text"
          value={switch1}
          onChange={(e) => setSwitch1(e.target.value)}
          placeholder="如 201"
          className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Switch 2
        </label>
        <input
          type="text"
          value={switch2}
          onChange={(e) => setSwitch2(e.target.value)}
          placeholder="如 202"
          className="w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Owner
        </label>
        <input
          type="text"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="可选，负责人"
          className="w-36 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "创建中…" : "新建 Pair"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
