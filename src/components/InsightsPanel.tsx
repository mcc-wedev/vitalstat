"use client";

import { useMemo } from "react";
import type { SmartInsight, SmartSeverity } from "@/lib/stats/smartInsights";
import { generateSmartInsights } from "@/lib/stats/smartInsights";
import { useProfile } from "@/lib/useProfile";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";

interface InsightsPanelProps {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  filter?: string;
  maxItems?: number;
  compact?: boolean;
  fullMetrics?: Record<string, DailySummary[]>;
  fullSleep?: SleepNight[];
  /** Only show critical/warning (hide positive/info). For overview "Highlights". */
  actionableOnly?: boolean;
  /** Window size in days — determines which insight tier to activate */
  windowDays?: number;
}

const SEV: Record<SmartSeverity, { color: string; label: string }> = {
  critical: { color: "#FF3B30", label: "Atentie" },
  warning:  { color: "#FF9500", label: "Avertizare" },
  positive: { color: "#34C759", label: "Excelent" },
  info:     { color: "#5AC8FA", label: "Info" },
};

const SEV_ORDER: SmartSeverity[] = ["critical", "warning", "info", "positive"];

export function InsightsPanel({ metrics, sleepNights, filter, maxItems, compact, fullMetrics, fullSleep, actionableOnly, windowDays }: InsightsPanelProps) {
  const profile = useProfile();
  const insights = useMemo(() => {
    const sourceMetrics = fullMetrics || metrics;
    const sourceSleep = fullSleep || sleepNights;
    const days = windowDays || Math.max(Object.values(sourceMetrics).reduce((m, arr) => Math.max(m, arr.length), 0), 30);

    let all = generateSmartInsights(metrics, sleepNights, sourceMetrics, sourceSleep, days, profile);

    if (filter) all = all.filter(i => i.category === filter);
    if (actionableOnly) {
      all = all.filter(i => i.severity === "critical" || i.severity === "warning");
    }
    // Sort by priority (highest first), then by severity order
    all.sort((a, b) => b.priority - a.priority || SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
    if (maxItems) all = all.slice(0, maxItems);
    return all;
  }, [metrics, sleepNights, filter, maxItems, fullMetrics, fullSleep, actionableOnly, windowDays, profile?.age, profile?.sex]);

  if (insights.length === 0) return null;

  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {insights.map((insight) => {
          const s = SEV[insight.severity];
          return (
            <div key={insight.id} className="flex items-start gap-2.5">
              <span
                className="shrink-0 rounded-full"
                style={{ background: s.color, width: 6, height: 6, marginTop: 7 }}
              />
              <div className="min-w-0 flex-1">
                <div className="hh-headline" style={{ color: "var(--label-primary)", fontSize: 14, lineHeight: 1.3 }}>
                  {insight.title}
                </div>
                <div
                  className="hh-footnote line-clamp-2"
                  style={{ color: "var(--label-secondary)", marginTop: 2, lineHeight: 1.35 }}
                >
                  {insight.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Full cards — Apple "Highlights" style
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {insights.map((insight, i) => (
        <InsightCard key={insight.id} insight={insight} delay={i * 40} />
      ))}
    </div>
  );
}

function InsightCard({ insight, delay }: { insight: SmartInsight; delay: number }) {
  const s = SEV[insight.severity];

  return (
    <div
      className="hh-card animate-in"
      style={{
        animationDelay: `${delay}ms`,
        borderLeft: `3px solid ${s.color}`,
        paddingLeft: 16,
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span
          className="hh-caption-2"
          style={{
            color: s.color,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 700,
          }}
        >
          {s.label}
        </span>
      </div>
      <h4
        className="hh-headline"
        style={{
          color: "var(--label-primary)",
          marginBottom: 4,
          fontSize: 15,
        }}
      >
        {insight.title}
      </h4>
      <p
        className="hh-subheadline"
        style={{
          color: "var(--label-secondary)",
          whiteSpace: "pre-line",
          lineHeight: 1.4,
        }}
      >
        {insight.body}
      </p>
    </div>
  );
}
