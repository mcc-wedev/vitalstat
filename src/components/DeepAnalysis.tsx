"use client";

import { useMemo } from "react";
import { computeDeepAnalysis, type DeepAnalysisReport, type ReadinessResult, type WeeklyRhythmResult } from "@/lib/stats/deepAnalysis";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

// ═══════════════════════════════════════════════════════════════
//  Color helpers
// ═══════════════════════════════════════════════════════════════

function statusColor(status: string): { main: string; bg: string; glow: string } {
  const green = ["balanced", "parasympathetic", "primed", "good", "none", "low"];
  const yellow = ["divergent", "moderate", "watch"];
  if (green.includes(status)) return { main: "rgb(52,199,89)", bg: "rgba(52,199,89,0.08)", glow: "rgba(52,199,89,0.15)" };
  if (yellow.includes(status)) return { main: "rgb(255,176,0)", bg: "rgba(255,176,0,0.08)", glow: "rgba(255,176,0,0.12)" };
  return { main: "rgb(255,59,48)", bg: "rgba(255,59,48,0.08)", glow: "rgba(255,59,48,0.12)" };
}

// ═══════════════════════════════════════════════════════════════
//  Readiness Ring — circular score display
// ═══════════════════════════════════════════════════════════════

function ReadinessRing({ score, zone }: { score: number; zone: string }) {
  const { main } = statusColor(zone);
  const r = 44, stroke = 6;
  const c = 2 * Math.PI * r;
  const progress = (score / 100) * c;

  return (
    <svg width={110} height={110} viewBox="0 0 110 110" style={{ display: "block" }}>
      {/* Track */}
      <circle cx={55} cy={55} r={r} fill="none" stroke="var(--surface-2, rgba(255,255,255,0.05))" strokeWidth={stroke} />
      {/* Progress */}
      <circle
        cx={55} cy={55} r={r} fill="none"
        stroke={main}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${progress} ${c - progress}`}
        strokeDashoffset={c * 0.25}
        style={{ filter: `drop-shadow(0 0 6px ${main})`, transition: "stroke-dasharray 0.8s ease" }}
      />
      {/* Score */}
      <text x={55} y={50} textAnchor="middle" fill="var(--label-primary)" fontSize={28} fontWeight={800} fontFamily="inherit">
        {score}
      </text>
      <text x={55} y={68} textAnchor="middle" fill="var(--label-tertiary)" fontSize={10} fontFamily="inherit">
        READINESS
      </text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Component Bars — readiness breakdown
// ═══════════════════════════════════════════════════════════════

function ComponentBar({ label, score, value, baseline, unit }: {
  label: string; score: number; value: number; baseline: number; unit: string;
}) {
  const color = score >= 65 ? "rgb(52,199,89)" : score >= 40 ? "rgb(255,176,0)" : "rgb(255,59,48)";
  const diff = value - baseline;
  const diffStr = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--label-secondary)" }}>{label}</span>
        <span style={{ fontSize: 12, color: "var(--label-tertiary)" }}>
          {value > 0 ? `${value.toFixed(1)} ${unit}` : "—"}{" "}
          {baseline > 0 && <span style={{ color, fontWeight: 600 }}>({diffStr})</span>}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: "var(--surface-2, rgba(255,255,255,0.05))", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 2,
          width: `${Math.max(2, Math.min(100, score))}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Weekly HRV Mini-Chart (bar chart with 7 days)
// ═══════════════════════════════════════════════════════════════

function WeeklyChart({ data }: { data: WeeklyRhythmResult }) {
  const maxHrv = Math.max(...data.dayScores.map(d => d.hrv), 1);
  const bestIdx = data.dayScores.findIndex(d => d.day === data.bestDay);
  const worstIdx = data.dayScores.findIndex(d => d.day === data.worstDay);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60, marginTop: 12 }}>
      {data.dayScores.map((d, i) => {
        const h = Math.max(4, (d.hrv / maxHrv) * 56);
        const isBest = i === bestIdx;
        const isWorst = i === worstIdx;
        const color = isBest ? "rgb(52,199,89)" : isWorst ? "rgb(255,59,48)" : "var(--label-quaternary, rgba(235,235,245,0.16))";
        return (
          <div key={d.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 3 }}>
            <div style={{
              width: "100%", maxWidth: 32, height: h, borderRadius: 4,
              background: isBest || isWorst ? color : "var(--label-quaternary, rgba(235,235,245,0.16))",
              opacity: d.hrv > 0 ? 1 : 0.3,
              transition: "height 0.4s ease",
            }} />
            <span style={{
              fontSize: 9, fontWeight: isBest || isWorst ? 700 : 400,
              color: isBest ? "rgb(52,199,89)" : isWorst ? "rgb(255,59,48)" : "var(--label-tertiary)",
            }}>
              {d.day}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Card wrapper (reuses premium style from EvidencePanel)
// ═══════════════════════════════════════════════════════════════

function InsightCard({ title, status, children }: {
  title: string;
  status: string;
  children: React.ReactNode;
}) {
  const { main, glow } = statusColor(status);
  return (
    <div style={{
      background: "var(--surface-1)",
      borderRadius: 16,
      padding: "20px 20px 16px",
      marginBottom: 12,
      position: "relative",
      overflow: "hidden",
      border: `0.5px solid ${glow}`,
      boxShadow: `0 0 20px ${glow}, 0 1px 3px rgba(0,0,0,0.08)`,
    }}>
      <div style={{
        position: "absolute", top: -30, right: -30, width: 120, height: 120,
        background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", top: 0, left: 0, width: 3, height: "100%",
        background: `linear-gradient(to bottom, ${main}, ${main}44)`,
        borderRadius: "3px 0 0 3px",
      }} />
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--label-primary)", marginBottom: 12, position: "relative" }}>
        {title}
      </div>
      <div style={{ position: "relative" }}>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export function DeepAnalysis({ metrics, sleepNights }: Props) {
  const report = useMemo(
    () => computeDeepAnalysis(metrics, sleepNights),
    [metrics, sleepNights]
  );

  const available = Object.values(report).filter(v => v !== null);
  if (available.length < 2) return null;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "linear-gradient(135deg, rgba(175,82,222,0.2), rgba(255,59,48,0.2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
        }}>
          &#x1F9E0;
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--label-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Analize avansate
          </p>
          <p style={{ fontSize: 11, color: "var(--label-tertiary)", margin: 0 }}>
            Corelatii intre HRV, puls, somn si exercitiu
          </p>
        </div>
      </div>

      {/* ─── Readiness Score ─── */}
      {report.readiness && (
        <InsightCard title="Readiness — cat de pregatit esti azi" status={report.readiness.zone}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
            <ReadinessRing score={report.readiness.score} zone={report.readiness.zone} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <ComponentBar label="HRV" score={report.readiness.components.hrv.score} value={report.readiness.components.hrv.value} baseline={report.readiness.components.hrv.baseline} unit="ms" />
              <ComponentBar label="Puls repaus" score={report.readiness.components.rhr.score} value={report.readiness.components.rhr.value} baseline={report.readiness.components.rhr.baseline} unit="bpm" />
              <ComponentBar label="Somn" score={report.readiness.components.sleep.score} value={report.readiness.components.sleep.value / 60} baseline={report.readiness.components.sleep.baseline / 60} unit="h" />
              {report.readiness.components.spo2 && (
                <ComponentBar label="SpO2" score={report.readiness.components.spo2.score}
                  value={report.readiness.components.spo2.value <= 1 ? report.readiness.components.spo2.value * 100 : report.readiness.components.spo2.value}
                  baseline={report.readiness.components.spo2.baseline <= 1 ? report.readiness.components.spo2.baseline * 100 : report.readiness.components.spo2.baseline}
                  unit="%" />
              )}
            </div>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--label-secondary)", margin: 0 }}>
            {report.readiness.description}
          </p>
        </InsightCard>
      )}

      {/* ─── Autonomic Balance ─── */}
      {report.autonomicBalance && (
        <InsightCard title="Echilibrul autonom" status={report.autonomicBalance.status}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ textAlign: "center", flex: 1, padding: "8px 0", borderRadius: 10, background: "var(--surface-2, rgba(255,255,255,0.03))" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: report.autonomicBalance.hrvTrend7d >= 0 ? "rgb(52,199,89)" : "rgb(255,59,48)" }}>
                {report.autonomicBalance.hrvTrend7d >= 0 ? "+" : ""}{report.autonomicBalance.hrvTrend7d.toFixed(1)}
              </div>
              <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 2 }}>HRV 7d (ms)</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, padding: "8px 0", borderRadius: 10, background: "var(--surface-2, rgba(255,255,255,0.03))" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: report.autonomicBalance.rhrTrend7d <= 0 ? "rgb(52,199,89)" : "rgb(255,59,48)" }}>
                {report.autonomicBalance.rhrTrend7d >= 0 ? "+" : ""}{report.autonomicBalance.rhrTrend7d.toFixed(1)}
              </div>
              <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 2 }}>RHR 7d (bpm)</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, padding: "8px 0", borderRadius: 10, background: "var(--surface-2, rgba(255,255,255,0.03))" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--label-secondary)" }}>
                {report.autonomicBalance.correlation.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 2 }}>Corelatie r</div>
            </div>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--label-secondary)", margin: 0 }}>
            {report.autonomicBalance.description}
          </p>
        </InsightCard>
      )}

      {/* ─── Overtraining ─── */}
      {report.overtraining && (
        <InsightCard title="Detector supraantrenament" status={report.overtraining.risk}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ textAlign: "center", flex: 1, padding: "8px 0", borderRadius: 10, background: "var(--surface-2, rgba(255,255,255,0.03))" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--label-primary)" }}>
                {report.overtraining.daysSuppressed}
              </div>
              <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 2 }}>Zile HRV sub baza</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, padding: "8px 0", borderRadius: 10, background: "var(--surface-2, rgba(255,255,255,0.03))" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: report.overtraining.hrvTrend >= 0 ? "rgb(52,199,89)" : "rgb(255,59,48)" }}>
                {report.overtraining.hrvTrend >= 0 ? "+" : ""}{report.overtraining.hrvTrend.toFixed(0)}
              </div>
              <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 2 }}>HRV trend (ms)</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, padding: "8px 0", borderRadius: 10, background: "var(--surface-2, rgba(255,255,255,0.03))" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--label-primary)" }}>
                {report.overtraining.exerciseTrend >= 0 ? "+" : ""}{report.overtraining.exerciseTrend.toFixed(0)}
              </div>
              <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 2 }}>Exercitiu (min)</div>
            </div>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--label-secondary)", margin: 0 }}>
            {report.overtraining.description}
          </p>
        </InsightCard>
      )}

      {/* ─── Sleep → HRV Impact ─── */}
      {report.sleepHrvImpact && (
        <InsightCard title="Cat conteaza somnul tau" status={report.sleepHrvImpact.sensitivity}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ textAlign: "center", flex: 1, padding: "10px 0", borderRadius: 10, background: "rgba(52,199,89,0.06)" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "rgb(52,199,89)" }}>
                {report.sleepHrvImpact.avgHrvAfterGoodSleep.toFixed(0)}
              </div>
              <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 2 }}>HRV dupa somn bun</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, padding: "10px 0", borderRadius: 10, background: "rgba(255,59,48,0.06)" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "rgb(255,59,48)" }}>
                {report.sleepHrvImpact.avgHrvAfterPoorSleep.toFixed(0)}
              </div>
              <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 2 }}>HRV dupa somn slab</div>
            </div>
            <div style={{ textAlign: "center", flex: 1, padding: "10px 0", borderRadius: 10, background: "var(--surface-2, rgba(255,255,255,0.03))" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--label-primary)" }}>
                +{report.sleepHrvImpact.difference.toFixed(0)}
              </div>
              <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 2 }}>Diferenta (ms)</div>
            </div>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--label-secondary)", margin: 0 }}>
            {report.sleepHrvImpact.description}
          </p>
        </InsightCard>
      )}

      {/* ─── Weekly Rhythm ─── */}
      {report.weeklyRhythm && (
        <InsightCard title="Ritmul tau saptamanal" status="balanced">
          <WeeklyChart data={report.weeklyRhythm} />
          <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--label-secondary)", margin: "12px 0 0 0" }}>
            {report.weeklyRhythm.description}
          </p>
        </InsightCard>
      )}
    </section>
  );
}
