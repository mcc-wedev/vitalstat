"use client";

import { useMemo } from "react";
import type { Insight, InsightSeverity } from "@/lib/stats/insights";
import { generateInsights } from "@/lib/stats/insights";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";

interface InsightsPanelProps {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  filter?: string; // filter by category
  maxItems?: number;
}

const SEVERITY_CONFIG: Record<
  InsightSeverity,
  { icon: string; bg: string; border: string; text: string }
> = {
  alert: {
    icon: "⚠️",
    bg: "bg-red-500/5",
    border: "border-red-500/20",
    text: "text-red-400",
  },
  warning: {
    icon: "⚡",
    bg: "bg-amber-500/5",
    border: "border-amber-500/20",
    text: "text-amber-400",
  },
  good: {
    icon: "✓",
    bg: "bg-emerald-500/5",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
  },
  info: {
    icon: "ℹ",
    bg: "bg-blue-500/5",
    border: "border-blue-500/20",
    text: "text-blue-400",
  },
};

const SEVERITY_ORDER: InsightSeverity[] = ["alert", "warning", "info", "good"];

export function InsightsPanel({
  metrics,
  sleepNights,
  filter,
  maxItems,
}: InsightsPanelProps) {
  const insights = useMemo(() => {
    let all = generateInsights(metrics, sleepNights);
    if (filter) {
      all = all.filter((i) => i.category === filter || i.metric === filter);
    }
    // Sort: alerts first, then warnings, then info, then good
    all.sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
    );
    if (maxItems) {
      all = all.slice(0, maxItems);
    }
    return all;
  }, [metrics, sleepNights, filter, maxItems]);

  if (insights.length === 0) {
    return (
      <div className="bg-card border border-card-border rounded-xl p-6 text-center text-muted">
        Insuficiente date pentru interpretari. Necesita minimum 14 zile.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const config = SEVERITY_CONFIG[insight.severity];

  return (
    <div
      className={`${config.bg} border ${config.border} rounded-xl p-4 transition-colors`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5 shrink-0">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <h4 className={`font-medium text-sm ${config.text}`}>
            {insight.title}
          </h4>
          <p className="text-sm text-foreground/80 mt-1 whitespace-pre-line leading-relaxed">
            {insight.body}
          </p>
          <div className="flex gap-2 mt-2">
            <span className="text-xs text-muted px-2 py-0.5 bg-white/5 rounded-full">
              {insight.category}
            </span>
            {insight.metric && (
              <span className="text-xs text-muted px-2 py-0.5 bg-white/5 rounded-full">
                {insight.metric}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
