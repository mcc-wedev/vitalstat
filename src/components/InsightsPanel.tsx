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
  /** Optional: full (unfiltered) dataset for baseline context.
   *  Insights need historical context (28d baselines, pattern detection)
   *  even when the user selected "7d" for display. */
  fullMetrics?: Record<string, DailySummary[]>;
  fullSleep?: SleepNight[];
  /** Current selected period for scoping "recent" insights */
  periodDays?: number;
}

const SEV: Record<InsightSeverity, { dotColor: string; textColor: string; label: string }> = {
  alert:   { dotColor: "#FF3B30", textColor: "#FF3B30", label: "Atentie" },
  warning: { dotColor: "#FF9500", textColor: "#FF9500", label: "Avertizare" },
  good:    { dotColor: "#34C759", textColor: "#34C759", label: "Bine" },
  info:    { dotColor: "#007AFF", textColor: "#007AFF", label: "Info" },
};

const SEV_ORDER: InsightSeverity[] = ["alert", "warning", "info", "good"];

export function InsightsPanel({ metrics, sleepNights, filter, maxItems, compact, fullMetrics, fullSleep }: InsightsPanelProps) {
  const insights = useMemo(() => {
    // CRITICAL: Always pass full dataset to insights engine.
    // Slicing (e.g., slice(-14,-7) for weekly comparison) would break
    // on short periods (7d, 14d). Period selector only affects display,
    // not analysis.
    const sourceMetrics = fullMetrics || metrics;
    const sourceSleep = fullSleep || sleepNights;
    let all = generateInsights(sourceMetrics, sourceSleep);
    if (filter) all = all.filter(i => i.category === filter || i.metric === filter);
    all.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
    if (maxItems) all = all.slice(0, maxItems);
    return all;
  }, [metrics, sleepNights, filter, maxItems, fullMetrics, fullSleep]);

  if (insights.length === 0) return null;

  if (compact) {
    return (
      <div className="space-y-3">
        {insights.map((insight) => {
          const s = SEV[insight.severity];
          return (
            <div key={insight.id} className="flex items-start gap-3">
              <div className="mt-1.5 shrink-0">
                <div className="w-2 h-2 rounded-full" style={{ background: s.dotColor }} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold text-[13px]" style={{ color: s.textColor }}>{insight.title}</h4>
                <p className="text-[13px] mt-0.5 leading-relaxed line-clamp-2" style={{ color: "rgba(235,235,245,0.6)" }}>
                  {insight.body}
                </p>
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
      className="insight-card animate-in"
      style={style}
    >
      <div className="flex items-start gap-3">
        {/* Severity dot */}
        <div className="mt-1.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.dotColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-[15px] text-white mb-1">
            {insight.title}
          </h4>
          <p
            className="text-[15px] whitespace-pre-line leading-relaxed"
            style={{ color: "rgba(235,235,245,0.6)" }}
          >
            {insight.body}
          </p>
        </div>
      </div>
    </div>
  );
}
