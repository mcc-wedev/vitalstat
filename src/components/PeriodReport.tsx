"use client";

import { useMemo, useState } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { generatePeriodReport, type PeriodReport as PR } from "@/lib/stats/periodAnalysis";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  windowDays: number;
  periodLabel: string;
}

/**
 * Deep self-understanding report for periods >= 30 days.
 * Shows: averages, best/worst days, patterns, training,
 * morning quality, self-signals, Q-over-Q.
 */
export function PeriodReport({ metrics, sleepNights, allMetrics, allSleep, windowDays, periodLabel }: Props) {
  const report = useMemo(
    () => generatePeriodReport(metrics, sleepNights, allMetrics, allSleep, windowDays),
    [metrics, sleepNights, allMetrics, allSleep, windowDays],
  );

  if (!report.averages.length && !report.bestDays.length && !report.selfSignals.length) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ─── Averages ─── */}
      {report.averages.length > 0 && (
        <AveragesSection averages={report.averages} periodLabel={periodLabel} />
      )}

      {/* ─── Best / Worst Days ─── */}
      {(report.bestDays.length > 0 || report.worstDays.length > 0) && (
        <BestWorstSection
          bestDays={report.bestDays}
          worstDays={report.worstDays}
          goodPattern={report.goodDayPattern}
          badPattern={report.badDayPattern}
        />
      )}

      {/* ─── Training Patterns ─── */}
      {report.trainingPatterns && (
        <TrainingSection training={report.trainingPatterns} />
      )}

      {/* ─── Morning Quality ─── */}
      {report.morningQuality && (
        <MorningSection morning={report.morningQuality} />
      )}

      {/* ─── Self Signals ─── */}
      {report.selfSignals.length > 0 && (
        <SelfSignalsSection signals={report.selfSignals} />
      )}

      {/* ─── Quarter Comparison ─── */}
      {report.quarterComparison && report.quarterComparison.length > 0 && (
        <QuarterSection quarters={report.quarterComparison} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SECTIONS
// ═══════════════════════════════════════════════════════════════

function AveragesSection({ averages, periodLabel }: { averages: PR["averages"]; periodLabel: string }) {
  return (
    <section>
      <div className="hh-section-label">
        <span>Rezumat {periodLabel}</span>
      </div>
      <div className="hh-card" style={{ minWidth: 0, padding: 0 }}>
        {averages.map((a, i) => (
          <div
            key={a.key}
            style={{
              padding: "14px 16px",
              borderTop: i > 0 ? "0.5px solid var(--separator)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="hh-footnote" style={{ color: "var(--label-secondary)", marginBottom: 2 }}>
                {a.label}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span className="hh-mono-num" style={{ fontSize: 22, fontWeight: 700 }}>
                  {formatNum(a.current, a.key)}
                </span>
                <span className="hh-footnote" style={{ color: "var(--label-tertiary)" }}>
                  {a.unit}
                </span>
              </div>
            </div>

            <div style={{ textAlign: "right", minWidth: 72 }}>
              <DeltaBadge deltaPct={a.deltaPct} key_={a.key} />
              <div className="hh-footnote" style={{ color: "var(--label-tertiary)", marginTop: 2 }}>
                {a.trend === "up" ? "↑" : a.trend === "down" ? "↓" : "→"}
                {a.trendSignificant ? " semnificativ" : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BestWorstSection({
  bestDays, worstDays, goodPattern, badPattern,
}: {
  bestDays: PR["bestDays"];
  worstDays: PR["worstDays"];
  goodPattern: PR["goodDayPattern"];
  badPattern: PR["badDayPattern"];
}) {
  return (
    <section>
      <div className="hh-section-label">
        <span>Cele mai bune si mai grele zile</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Best */}
        <div className="hh-card" style={{ minWidth: 0 }}>
          <div className="hh-footnote" style={{ color: "#34C759", fontWeight: 600, marginBottom: 10 }}>
            Cele mai bune
          </div>
          {bestDays.map(d => (
            <DayRow key={d.date} day={d} color="#34C759" />
          ))}
          {goodPattern && (
            <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginTop: 10, lineHeight: 1.45 }}>
              {goodPattern.narrative}
            </p>
          )}
        </div>

        {/* Worst */}
        <div className="hh-card" style={{ minWidth: 0 }}>
          <div className="hh-footnote" style={{ color: "#FF3B30", fontWeight: 600, marginBottom: 10 }}>
            Cele mai grele
          </div>
          {worstDays.map(d => (
            <DayRow key={d.date} day={d} color="#FF3B30" />
          ))}
          {badPattern && (
            <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginTop: 10, lineHeight: 1.45 }}>
              {badPattern.narrative}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function TrainingSection({ training }: { training: NonNullable<PR["trainingPatterns"]> }) {
  const [expanded, setExpanded] = useState(false);
  const maxAvg = Math.max(...training.dayDistribution.map(d => d.avg), 1);

  return (
    <section>
      <div className="hh-section-label">
        <span>Tipare de antrenament</span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="hh-footnote"
          style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}
        >
          {expanded ? "Ascunde" : "Detalii"}
        </button>
      </div>
      <div className="hh-card" style={{ minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div className="hh-footnote" style={{ color: "var(--label-secondary)" }}>Medie saptamanala</div>
            <div className="hh-mono-num" style={{ fontSize: 22, fontWeight: 700 }}>
              {Math.round(training.weeklyAvgMinutes)} <span className="hh-footnote" style={{ color: "var(--label-tertiary)", fontWeight: 400 }}>min</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="hh-footnote" style={{ color: "var(--label-secondary)" }}>Zi de varf</div>
            <div className="hh-footnote" style={{ fontWeight: 600, textTransform: "capitalize" }}>{training.peakDay}</div>
          </div>
        </div>

        {expanded && (
          <>
            {/* Day-of-week heatmap */}
            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {training.dayDistribution.map(d => {
                const intensity = d.avg / maxAvg;
                const bg = intensity > 0.6 ? "#34C759" : intensity > 0.3 ? "#FF9500" : "var(--surface-2)";
                return (
                  <div
                    key={d.day}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "6px 0",
                      borderRadius: 6,
                      background: bg,
                      opacity: intensity > 0.1 ? 0.8 : 0.4,
                    }}
                  >
                    <div className="hh-footnote" style={{ fontSize: 10, color: intensity > 0.3 ? "#fff" : "var(--label-secondary)" }}>
                      {d.day}
                    </div>
                    <div className="hh-footnote hh-mono-num" style={{ fontSize: 11, fontWeight: 600, color: intensity > 0.3 ? "#fff" : "var(--label-primary)" }}>
                      {Math.round(d.avg)}
                    </div>
                  </div>
                );
              })}
            </div>

            {training.recoveryImpact && (
              <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.45 }}>
                {training.recoveryImpact}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function MorningSection({ morning }: { morning: NonNullable<PR["morningQuality"]> }) {
  return (
    <section>
      <div className="hh-section-label">
        <span>Cum iti sunt diminetile</span>
      </div>
      <div className="hh-card" style={{ minWidth: 0 }}>
        {/* Distribution bars */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <MorningBar label="Bune" pct={morning.goodPct} color="#34C759" />
          <MorningBar label="Neutre" pct={morning.neutralPct} color="#FF9500" />
          <MorningBar label="Dificile" pct={morning.difficultPct} color="#FF3B30" />
        </div>

        <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.5 }}>
          {morning.narrative}
        </p>
      </div>
    </section>
  );
}

function SelfSignalsSection({ signals }: { signals: PR["selfSignals"] }) {
  return (
    <section>
      <div className="hh-section-label">
        <span>Te cunosti?</span>
      </div>
      <div className="hh-card" style={{ minWidth: 0, padding: 0 }}>
        {signals.map((s, i) => (
          <div
            key={s.title}
            style={{
              padding: "14px 16px",
              borderTop: i > 0 ? "0.5px solid var(--separator)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span className="hh-footnote" style={{ fontWeight: 600 }}>{s.title}</span>
            </div>
            <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.5, margin: 0 }}>
              {s.narrative}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuarterSection({ quarters }: { quarters: NonNullable<PR["quarterComparison"]> }) {
  return (
    <section>
      <div className="hh-section-label">
        <span>Evolutie pe trimestre</span>
      </div>
      <div className="hh-card" style={{ minWidth: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px 8px 0", color: "var(--label-secondary)", fontWeight: 500, fontSize: 12 }}>Metrica</th>
              {quarters[0]?.quarters.map((_, i) => (
                <th key={i} style={{ textAlign: "right", padding: "4px 8px 8px", color: "var(--label-secondary)", fontWeight: 500, fontSize: 12 }}>
                  T{i + 1}
                </th>
              ))}
              <th style={{ textAlign: "right", padding: "4px 0 8px 8px", color: "var(--label-secondary)", fontWeight: 500, fontSize: 12 }}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map(q => (
              <tr key={q.key} style={{ borderTop: "0.5px solid var(--separator)" }}>
                <td className="hh-footnote" style={{ padding: "8px 8px 8px 0", fontWeight: 500 }}>{q.label}</td>
                {q.quarters.map((val, i) => (
                  <td key={i} className="hh-mono-num hh-footnote" style={{ textAlign: "right", padding: "8px" }}>
                    {formatQVal(val, q.key)}
                  </td>
                ))}
                <td style={{ textAlign: "right", padding: "8px 0 8px 8px" }}>
                  <span style={{
                    color: q.trend === "improving" ? "#34C759" : q.trend === "declining" ? "#FF3B30" : "var(--label-tertiary)",
                    fontWeight: 600,
                    fontSize: 13,
                  }}>
                    {q.trend === "improving" ? "↑" : q.trend === "declining" ? "↓" : "→"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MINI COMPONENTS
// ═══════════════════════════════════════════════════════════════

function DayRow({ day, color }: { day: PR["bestDays"][number]; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
      <div>
        <div className="hh-footnote" style={{ fontWeight: 500 }}>{day.dayLabel}</div>
        {day.keyFactor && (
          <div className="hh-footnote" style={{ color: "var(--label-tertiary)", fontSize: 11 }}>
            {day.keyFactor}: {day.keyValue}
          </div>
        )}
      </div>
      <span className="hh-mono-num" style={{ color, fontWeight: 700, fontSize: 18 }}>
        {day.recoveryScore}
      </span>
    </div>
  );
}

function DeltaBadge({ deltaPct, key_ }: { deltaPct: number; key_: string }) {
  const cfg = { restingHeartRate: false, respiratoryRate: false } as Record<string, boolean>;
  const higherIsBetter = cfg[key_] !== undefined ? cfg[key_] : true;
  const improving = higherIsBetter ? deltaPct > 0 : deltaPct < 0;
  const color = Math.abs(deltaPct) < 2 ? "var(--label-tertiary)" : improving ? "#34C759" : "#FF3B30";
  const sign = deltaPct > 0 ? "+" : "";

  return (
    <span className="hh-mono-num hh-footnote" style={{ color, fontWeight: 600 }}>
      {sign}{deltaPct.toFixed(1)}%
    </span>
  );
}

function MorningBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{
        height: 6,
        borderRadius: 3,
        background: "var(--surface-2)",
        overflow: "hidden",
        marginBottom: 4,
      }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <div className="hh-footnote" style={{ fontSize: 11, color: "var(--label-secondary)" }}>
        {label} {pct}%
      </div>
    </div>
  );
}

// ── Formatting helpers ──

function formatNum(value: number, key: string): string {
  if (key === "stepCount" && value >= 1000) {
    return value.toLocaleString("ro-RO", { maximumFractionDigits: 0 });
  }
  const dec = key === "oxygenSaturation" ? 1 : key === "hrv" || key === "restingHeartRate" || key === "exerciseTime" || key === "stepCount" ? 0 : 1;
  return value.toLocaleString("ro-RO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function formatQVal(value: number, key: string): string {
  if (key === "stepCount") return value.toLocaleString("ro-RO", { maximumFractionDigits: 0 });
  const dec = key === "oxygenSaturation" ? 1 : 0;
  return value.toLocaleString("ro-RO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
