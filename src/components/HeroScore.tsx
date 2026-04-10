"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";

interface HeroScoreProps {
  rhrData: DailySummary[];
  hrvData: DailySummary[];
  sleepData: SleepNight[];
  exerciseData?: DailySummary[];
  respData?: DailySummary[];
  spo2Data?: DailySummary[];
  tempData?: DailySummary[];
  /** All dates in the currently selected period. Recovery is computed
   *  for each date and averaged (or single value when only 1 date). */
  periodDates?: string[];
  /** Label for the period (e.g., "Azi", "7 zile") */
  periodLabel?: string;
}

const COMPONENT_COLORS: Record<string, string> = {
  "HRV": "#FF2D55",
  "Puls repaus": "#FF3B30",
  "Somn": "#AF52DE",
  "Balanta antrenament": "#FF9500",
  "Efort ieri": "#FA114F",
  "Rata respiratorie": "#5AC8FA",
  "SpO2": "#34C759",
  "Temperatura": "#FF9500",
};

function getScoreLabel(score: number): string {
  if (score >= 80) return "Excelent";
  if (score >= 60) return "Bun";
  if (score >= 40) return "Mediu";
  if (score >= 20) return "Slab";
  return "Critic";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#34C759";
  if (score >= 60) return "#30D158";
  if (score >= 40) return "#FF9500";
  return "#FF3B30";
}

function getScoreMessage(score: number): string {
  if (score >= 80) return "Esti gata pentru efort intens.";
  if (score >= 60) return "In forma buna — antrenament moderat.";
  if (score >= 40) return "Recupereaza. Evita efortul intens.";
  if (score >= 20) return "Odihneste-te. Prioritizeaza somnul.";
  return "Odihna completa. Asculta-ti corpul.";
}

function formatDateRo(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const months = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
    const days = ["duminica", "luni", "marti", "miercuri", "joi", "vineri", "sambata"];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
}

export function HeroScore({
  rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData,
  periodDates, periodLabel,
}: HeroScoreProps) {
  // Compute recovery for EACH date in the period, then average them.
  // For single-day periods (today/yesterday), this gives one score.
  // For multi-day periods (7d/30d/etc), this gives the period average.
  const result = useMemo(() => {
    // Determine which dates to compute for
    let dates = periodDates && periodDates.length > 0
      ? [...new Set(periodDates)].sort()
      : [];

    if (dates.length === 0) {
      const allDates = [...rhrData.map(d => d.date), ...hrvData.map(d => d.date)];
      const last = [...new Set(allDates)].sort().pop();
      if (last) dates = [last];
    }

    if (dates.length === 0) {
      return { score: null, label: "", color: "", message: "", components: [], confidence: "low" as const, dateCount: 0, latestDate: "" };
    }

    // Compute recovery for each date
    const recoveries = dates
      .map(date => ({
        date,
        rec: calculateRecovery(rhrData, hrvData, sleepData, date, exerciseData, respData, spo2Data, tempData),
      }))
      .filter(r => r.rec.hasEnoughData);

    if (recoveries.length === 0) {
      // Try fallback: compute for latest available date
      const latest = [...new Set([...rhrData.map(d => d.date), ...hrvData.map(d => d.date)])].sort().pop();
      if (latest) {
        const rec = calculateRecovery(rhrData, hrvData, sleepData, latest, exerciseData, respData, spo2Data, tempData);
        if (rec.hasEnoughData) {
          return {
            score: rec.total,
            label: getScoreLabel(rec.total),
            color: getScoreColor(rec.total),
            message: getScoreMessage(rec.total),
            components: rec.components.filter(c => c.available),
            confidence: rec.confidence,
            dateCount: 1,
            latestDate: latest,
            fallback: true,
          };
        }
      }
      return { score: null, label: "", color: "", message: "Date insuficiente pentru calcul (minim 14 zile de date cardiovasculare necesare).", components: [], confidence: "low" as const, dateCount: 0, latestDate: "" };
    }

    // Average the scores
    const avgScore = Math.round(
      recoveries.reduce((s, r) => s + r.rec.total, 0) / recoveries.length
    );

    // Average each component too
    const componentAvgs: Record<string, { name: string; scores: number[] }> = {};
    for (const { rec } of recoveries) {
      for (const c of rec.components) {
        if (!c.available) continue;
        if (!componentAvgs[c.name]) componentAvgs[c.name] = { name: c.name, scores: [] };
        componentAvgs[c.name].scores.push(c.score);
      }
    }
    const avgComponents = Object.values(componentAvgs)
      .map(c => ({
        name: c.name,
        score: Math.round(c.scores.reduce((s, v) => s + v, 0) / c.scores.length),
      }))
      .sort((a, b) => b.score - a.score);

    const latestDate = recoveries[recoveries.length - 1].date;
    // Confidence: average of confidences (take worst)
    const confidences = recoveries.map(r => r.rec.confidence);
    const confidence: "high" | "medium" | "low" = confidences.includes("low") ? "low"
      : confidences.includes("medium") ? "medium" : "high";

    return {
      score: avgScore,
      label: getScoreLabel(avgScore),
      color: getScoreColor(avgScore),
      message: getScoreMessage(avgScore),
      components: avgComponents,
      confidence,
      dateCount: recoveries.length,
      latestDate,
    };
  }, [rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData, periodDates]);

  if (result.score === null) {
    return (
      <div className="hh-card animate-in">
        <p className="hh-caption" style={{ color: "var(--label-secondary)", letterSpacing: "0.045em", textTransform: "uppercase", marginBottom: 8 }}>
          Recuperare
        </p>
        <p className="hh-body" style={{ color: "var(--label-secondary)" }}>
          {result.message || "Date insuficiente"}
        </p>
      </div>
    );
  }

  const isAverage = result.dateCount > 1;

  return (
    <div className="hh-card animate-scale-in" style={{ padding: "20px 20px 18px" }}>
      {/* Uppercase section label + date/period */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span
          className="hh-caption"
          style={{
            color: "var(--label-secondary)",
            letterSpacing: "0.045em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Recuperare {isAverage && periodLabel ? `· medie ${periodLabel.toLowerCase()}` : ""}
        </span>
        {result.latestDate && (
          <span className="hh-caption" style={{ color: "var(--label-tertiary)" }}>
            {isAverage
              ? `${result.dateCount} zile`
              : formatDateRo(result.latestDate)}
          </span>
        )}
      </div>

      {/* Hero number */}
      <div className="flex items-baseline gap-2" style={{ marginBottom: 4 }}>
        <span
          className="hh-mono-num"
          style={{
            fontSize: "56px",
            fontWeight: 700,
            lineHeight: 1,
            color: result.color,
            letterSpacing: "-0.025em",
          }}
        >
          {result.score}
        </span>
        <span
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: result.color,
            letterSpacing: "-0.01em",
          }}
        >
          {result.label}
        </span>
      </div>

      {/* Descriptive message */}
      <p
        className="hh-body"
        style={{
          color: "var(--label-secondary)",
          marginTop: 6,
          marginBottom: 18,
        }}
      >
        {isAverage && periodLabel
          ? `Scor mediu pe ${periodLabel.toLowerCase()} — ${result.message.toLowerCase()}`
          : result.message}
      </p>

      {/* Component bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {result.components.map((comp) => {
          const barColor = COMPONENT_COLORS[comp.name] || "var(--accent)";
          return (
            <div key={comp.name}>
              <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                <span className="hh-footnote" style={{ color: "var(--label-secondary)" }}>
                  {comp.name}
                </span>
                <span className="hh-footnote hh-mono-num" style={{ color: "var(--label-primary)", fontWeight: 600 }}>
                  {comp.score}
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(comp.score, 100)}%`,
                    height: "100%",
                    background: barColor,
                    borderRadius: 999,
                    transition: "width 600ms cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
