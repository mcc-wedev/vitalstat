"use client";

import { useHealthStore, type DatePreset } from "@/stores/healthStore";

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Azi" },
  { key: "yesterday", label: "Ieri" },
  { key: "7d", label: "7z" },
  { key: "14d", label: "14z" },
  { key: "30d", label: "30z" },
  { key: "90d", label: "90z" },
  { key: "6m", label: "6L" },
  { key: "1y", label: "1A" },
  { key: "all", label: "Tot" },
];

export function DateRangePicker() {
  const { datePreset, setDatePreset } = useHealthStore();

  return (
    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => setDatePreset(p.key)}
          className={`pill shrink-0 ${datePreset === p.key ? "pill-active" : ""}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
