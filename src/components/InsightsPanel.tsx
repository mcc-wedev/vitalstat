"use client";

import { useMemo } from "react";
import type { Insight, InsightSeverity } from "@/lib/stats/insights";
import { generateInsights } from "@/lib/stats/insights";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";

interface InsightsPanelProps {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  filter?: string;
  maxItems?: number;
}

const SEV: Record<InsightSeverity, { icon: string; bg: string; border: string; text: string; glow: string }> = {
  alert:   { icon: "⚠️", bg: "rgba(239,68,68,0.04)",  border: "rgba(239,68,68,0.15)", text: "text-red-400",     glow: "0 0 20px rgba(239,68,68,0.08)" },
  warning: { icon: "⚡",  bg: "rgba(245,158,11,0.04)", border: "rgba(245,158,11,0.15)", text: "text-amber-400",   glow: "0 0 20px rgba(245,158,11,0.06)" },
  good:    { icon: "✓",  bg: "rgba(16,185,129,0.04)", border: "rgba(16,185,129,0.15)", text: "text-emerald-400", glow: "0 0 20px rgba(16,185,129,0.06)" },
  info:    { icon: "ℹ",  bg: "rgba(59,130,246,0.04)", border: "rgba(59,130,246,0.12)", text: "text-blue-400",    glow: "none" },
};

const SEV_ORDER: InsightSeverity[] = ["alert", "warning", "info", "good"];

export function InsightsPanel({ metrics, sleepNights, filter, maxItems }: InsightsPanelProps) {
  const insights = useMemo(() => {
    let all = generateInsights(metrics, sleepNights);
    if (filter) all = all.filter(i => i.category === filter || i.metric === filter);
    all.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
    if (maxItems) all = all.slice(0, maxItems);
    return all;
  }, [metrics, sleepNights, filter, maxItems]);

  if (insights.length === 0) return null;

  return (
    <div className="space-y-3">
      {insights.map((insight, i) => (
        <InsightCard key={insight.id} insight={insight} style={{ animationDelay: `${i * 50}ms` }} />
      ))}
    </div>
  );
}

function InsightCard({ insight, style }: { insight: Insight; style?: React.CSSProperties }) {
  const s = SEV[insight.severity];

  return (
    <div
      className="insight-card animate-in backdrop-blur-xl"
      style={{
        background: s.bg,
        borderColor: s.border,
        boxShadow: s.glow,
        ...style,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="text-base mt-0.5 shrink-0">{s.icon}</span>
        <div className="flex-1 min-w-0">
          <h4 className={`font-semibold text-sm ${s.text}`}>{insight.title}</h4>
          <p className="text-[13px] text-[var(--muted-strong)] mt-1.5 whitespace-pre-line leading-relaxed">
            {insight.body}
          </p>
        </div>
      </div>
    </div>
  );
}
