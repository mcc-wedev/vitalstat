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
  compact?: boolean;
}

const SEV: Record<InsightSeverity, { icon: string; bg: string; borderColor: string; text: string; glow: string; label: string }> = {
  alert:   { icon: "\u26a0\ufe0f", bg: "rgba(239,68,68,0.04)",  borderColor: "rgba(239,68,68,0.5)",  text: "text-red-400",     glow: "0 0 20px rgba(239,68,68,0.08)",  label: "Atentie" },
  warning: { icon: "\u26a1",       bg: "rgba(245,158,11,0.04)", borderColor: "rgba(245,158,11,0.5)", text: "text-amber-400",   glow: "0 0 20px rgba(245,158,11,0.06)", label: "Avertizare" },
  good:    { icon: "\u2713",       bg: "rgba(16,185,129,0.04)", borderColor: "rgba(16,185,129,0.4)", text: "text-emerald-400", glow: "0 0 20px rgba(16,185,129,0.06)", label: "Bine" },
  info:    { icon: "\u2139",       bg: "rgba(59,130,246,0.04)", borderColor: "rgba(59,130,246,0.35)", text: "text-blue-400",    glow: "none",                           label: "Info" },
};

const SEV_ORDER: InsightSeverity[] = ["alert", "warning", "info", "good"];

export function InsightsPanel({ metrics, sleepNights, filter, maxItems, compact }: InsightsPanelProps) {
  const insights = useMemo(() => {
    let all = generateInsights(metrics, sleepNights);
    if (filter) all = all.filter(i => i.category === filter || i.metric === filter);
    all.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
    if (maxItems) all = all.slice(0, maxItems);
    return all;
  }, [metrics, sleepNights, filter, maxItems]);

  if (insights.length === 0) return null;

  if (compact) {
    return (
      <div className="space-y-3">
        {insights.map((insight) => {
          const s = SEV[insight.severity];
          return (
            <div key={insight.id} className="flex items-start gap-3">
              {/* Severity dot */}
              <div className="mt-1.5 shrink-0">
                <div className="w-2 h-2 rounded-full" style={{ background: s.borderColor }} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className={`font-semibold text-xs ${s.text}`}>{insight.title}</h4>
                <p className="text-[11px] text-[var(--muted-strong)] mt-0.5 leading-relaxed line-clamp-2">{insight.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

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
        borderLeftColor: s.borderColor,
        boxShadow: s.glow,
        ...style,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={`font-semibold text-sm ${s.text}`}>{insight.title}</h4>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{
              background: s.bg,
              color: s.borderColor,
              border: `1px solid ${s.borderColor}30`,
            }}>
              {s.label}
            </span>
          </div>
          <p className="text-[13px] text-[var(--muted-strong)] mt-1 whitespace-pre-line leading-relaxed">
            {insight.body}
          </p>
        </div>
      </div>
    </div>
  );
}
