"use client";

import { useHealthStore, type DatePreset } from "@/stores/healthStore";

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "7d", label: "7z" },
  { key: "30d", label: "30z" },
  { key: "90d", label: "90z" },
  { key: "6m", label: "6 luni" },
  { key: "1y", label: "1 an" },
  { key: "all", label: "Tot" },
];

export function DateRangePicker() {
  const { datePreset, setDatePreset } = useHealthStore();

  return (
    <div className="flex items-center gap-1">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => setDatePreset(p.key)}
          className={`pill ${datePreset === p.key ? "pill-active" : ""}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
