"use client";

import { useState, useEffect } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface Goal {
  key: string;
  label: string;
  target: number;
  unit: string;
  current: number;
}

const DEFAULT_GOALS: { key: string; target: number; isSleep?: boolean }[] = [
  { key: "stepCount", target: 8000 },
  { key: "exerciseTime", target: 30 },
  { key: "activeEnergy", target: 500 },
  { key: "sleep", target: 7.5, isSleep: true },
];

const STORAGE_KEY = "vitalstat-goals";

export function GoalsTracker({ metrics, sleepNights }: Props) {
  const [customTargets, setCustomTargets] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);

  // Load saved goals
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCustomTargets(JSON.parse(saved));
    } catch {}
  }, []);

  const saveTarget = (key: string, val: number) => {
    const next = { ...customTargets, [key]: val };
    setCustomTargets(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  // Build goals with current values
  const goals: Goal[] = DEFAULT_GOALS.map(g => {
    const target = customTargets[g.key] ?? g.target;
    let current = 0;

    if (g.isSleep) {
      const today = sleepNights.length > 0 ? sleepNights[sleepNights.length - 1] : null;
      current = today ? today.totalMinutes / 60 : 0;
      return { key: g.key, label: "Somn", target, unit: "ore", current };
    }

    const data = metrics[g.key];
    if (data && data.length > 0) {
      const latest = data[data.length - 1];
      const cfg = METRIC_CONFIG[g.key];
      current = cfg?.aggregation === "sum" ? latest.sum : latest.mean;
    }
    const cfg = METRIC_CONFIG[g.key];
    return { key: g.key, label: cfg?.label || g.key, target, unit: cfg?.unit || "", current };
  }).filter(g => g.current > 0 || g.key === "sleep");

  if (goals.length === 0) return null;

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Obiective zilnice</h3>
        <button
          onClick={() => setEditing(!editing)}
          className="text-[9px] text-[var(--accent)] hover:underline"
        >
          {editing ? "Gata" : "Editeaza"}
        </button>
      </div>

      <div className="space-y-3">
        {goals.map(goal => {
          const pct = Math.min(100, goal.target > 0 ? (goal.current / goal.target) * 100 : 0);
          const achieved = pct >= 100;
          const color = achieved ? "#10b981" : pct >= 75 ? "#22d3ee" : pct >= 50 ? "#f59e0b" : "#ef4444";

          return (
            <div key={goal.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[var(--muted-strong)]">
                  {achieved ? "✅" : "🎯"} {goal.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium tabular-nums">
                    {goal.current.toFixed(goal.key === "sleep" ? 1 : 0)}
                    <span className="text-[var(--muted)]"> / </span>
                    {editing ? (
                      <input
                        type="number"
                        value={customTargets[goal.key] ?? goal.target}
                        onChange={e => saveTarget(goal.key, Number(e.target.value))}
                        className="w-14 bg-transparent border-b border-[var(--glass-border)] text-center text-[11px] tabular-nums"
                      />
                    ) : (
                      goal.target.toFixed(goal.key === "sleep" ? 1 : 0)
                    )}
                    <span className="text-[9px] text-[var(--muted)] ml-0.5">{goal.unit}</span>
                  </span>
                  <span className="text-[9px] font-medium tabular-nums" style={{ color }}>{pct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}80, ${color})`,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
