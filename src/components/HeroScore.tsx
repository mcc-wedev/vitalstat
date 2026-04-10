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
  targetDate?: string;
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
  if (score >= 80) return "Esti gata pentru efort intens azi.";
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
  rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData, targetDate,
}: HeroScoreProps) {
  const { recovery, date } = useMemo(() => {
    let d = targetDate;
    if (!d) {
      const allDates = [...rhrData.map(x => x.date), ...hrvData.map(x => x.date)];
      d = allDates.sort().pop() || "";
    }
    return {
      recovery: calculateRecovery(rhrData, hrvData, sleepData, d, exerciseData, respData, spo2Data, tempData),
      date: d,
    };
  }, [rhrData, hrvData, sleepData, exerciseData, respData, spo2Data, tempData, targetDate]);

  if (!recovery.hasEnoughData) {
    return (
      <div className="hh-card animate-in">
        <p className="hh-caption" style={{ color: "var(--label-secondary)", letterSpacing: "0.045em", textTransform: "uppercase", marginBottom: 8 }}>
          Recuperare
        </p>
        <p className="hh-body" style={{ color: "var(--label-secondary)" }}>
          {recovery.message}
        </p>
      </div>
    );
  }

  const score = recovery.total;
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const message = getScoreMessage(score);
  const activeComponents = recovery.components.filter(c => c.available);

  return (
    <div className="hh-card animate-scale-in" style={{ padding: "20px 20px 18px" }}>
      {/* Uppercase section label + date */}
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
          Recuperare
        </span>
        {date && (
          <span className="hh-caption" style={{ color: "var(--label-tertiary)" }}>
            {formatDateRo(date)}
          </span>
        )}
      </div>

      {/* Hero number — large bold, Apple style */}
      <div className="flex items-baseline gap-2" style={{ marginBottom: 4 }}>
        <span
          className="hh-mono-num"
          style={{
            fontSize: "56px",
            fontWeight: 700,
            lineHeight: 1,
            color,
            letterSpacing: "-0.025em",
          }}
        >
          {score}
        </span>
        <span
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color,
            letterSpacing: "-0.01em",
          }}
        >
          {label}
        </span>
      </div>

      {/* Short descriptive message */}
      <p
        className="hh-body"
        style={{
          color: "var(--label-secondary)",
          marginTop: 6,
          marginBottom: 18,
        }}
      >
        {message}
      </p>

      {/* Component bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {activeComponents.map((comp) => {
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
