"use client";

import { useState } from "react";

type CreatePairFormProps = {
  onCreated: () => void;
};

export function CreatePairForm({ onCreated }: CreatePairFormProps) {
  const [switch1, setSwitch1] = useState("");
  const [switch2, setSwitch2] = useState("");
  const [rack, setRack] = useState("");
  const [footprint, setFootprint] = useState("");
  const [owner, setOwner] = useState("");
  const [esxiCheck, setEsxiCheck] = useState(false);
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
        body: JSON.stringify({
          switch1,
          switch2,
          rack,
          footprint,
          owner,
          esxiCheck,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "创建失败");
      setSwitch1("");
      setSwitch2("");
      setRack("");
      setFootprint("");
      setOwner("");
      setEsxiCheck(false);
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
          Rack
        </label>
        <input
          type="text"
          value={rack}
          onChange={(e) => setRack(e.target.value)}
          placeholder="可选，机架"
          className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Info
        </label>
        <input
          type="text"
          value={footprint}
          onChange={(e) => setFootprint(e.target.value)}
          placeholder="可选，Info"
          className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
      <label
        className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        title="勾选后插入三次 Esxi Check（esxi 负责）：每台交换机的 Label and Unplug Downlinks 与 Decommission 之间各一次，流水线末尾再收尾一次。创建后不可更改"
      >
        <input
          type="checkbox"
          checked={esxiCheck}
          onChange={(e) => setEsxiCheck(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        Esxi Check
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "创建中…" : "Build New Pipeline"}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
