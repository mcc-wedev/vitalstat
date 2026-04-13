"use client";

import { useMemo } from "react";
import { computeEvidenceBasedReport, type EvidenceBasedReport } from "@/lib/stats/evidenceBased";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

/** Color by zone: green/yellow/red */
function zoneColor(zone: string): string {
  switch (zone) {
    case "adapted": case "regular": case "excellent": case "above_avg":
    case "improving": case "maintaining": case "minimal": case "early":
    case "moderate_early": case "intermediate":
      return "rgb(52,199,89)";
    case "moderate": case "average": case "mild": case "moderate_late":
    case "declining_normal":
      return "rgb(255,204,0)";
    case "overreaching": case "irregular": case "below_avg": case "low":
    case "declining_fast": case "significant": case "late":
      return "rgb(255,59,48)";
    default: return "var(--label-secondary)";
  }
}

function zoneLabel(zone: string): string {
  const labels: Record<string, string> = {
    adapted: "Bine adaptat", moderate: "Efort moderat", overreaching: "Suprasolicitare",
    regular: "Regulat", irregular: "Neregulat",
    excellent: "Excelent", above_avg: "Peste medie", average: "Medie", below_avg: "Sub medie", low: "Scazut",
    improving: "In crestere", maintaining: "Stabil", declining_normal: "Declin normal", declining_fast: "Declin accelerat",
    minimal: "Minim", mild: "Usor", significant: "Semnificativ",
    early: "Matinal", moderate_early: "Moderat matinal", intermediate: "Intermediar",
    moderate_late: "Moderat nocturn", late: "Nocturn",
  };
  return labels[zone] || zone;
}

function MetricRow({ title, value, unit, zone, detail, reference }: {
  title: string;
  value: string;
  unit?: string;
  zone: string;
  detail: string;
  reference: string;
}) {
  return (
    <div style={{ padding: "16px 0", borderBottom: "0.5px solid var(--separator)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--label-primary)" }}>{title}</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: "var(--label-primary)", letterSpacing: "-0.02em" }}>
          {value}
          {unit && <span style={{ fontSize: 13, fontWeight: 400, color: "var(--label-secondary)", marginLeft: 3 }}>{unit}</span>}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: zoneColor(zone),
          padding: "2px 8px", borderRadius: 6,
          background: `${zoneColor(zone)}18`,
        }}>
          {zoneLabel(zone)}
        </span>
        <span style={{ fontSize: 11, color: "var(--label-tertiary)", maxWidth: "60%", textAlign: "right" }}>
          {detail}
        </span>
      </div>
      <p style={{ fontSize: 10, color: "var(--label-quaternary, rgba(235,235,245,0.18))", marginTop: 6, fontStyle: "italic" }}>
        {reference}
      </p>
    </div>
  );
}

export function EvidencePanel({ metrics, sleepNights }: Props) {
  // Read user profile for age/sex
  const profile = useMemo(() => {
    try {
      const raw = localStorage.getItem("vitalstat-user-profile");
      if (raw) {
        const p = JSON.parse(raw);
        return { age: p.age || 50, sex: (p.sex || "male") as "male" | "female" };
      }
    } catch {}
    return { age: 50, sex: "male" as const };
  }, []);

  const report = useMemo(
    () => computeEvidenceBasedReport(metrics, sleepNights, profile.age, profile.sex),
    [metrics, sleepNights, profile.age, profile.sex]
  );

  // Only show if we have at least 2 metrics available
  const available = Object.values(report).filter(v => v !== null);
  if (available.length < 2) return null;

  return (
    <div className="hh-card" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
          Metrici validate stiintific
        </p>
        <span style={{ fontSize: 10, color: "var(--label-quaternary, rgba(235,235,245,0.18))" }}>
          {available.length}/6 disponibile
        </span>
      </div>

      {report.hrvCv && (
        <MetricRow
          title="HRV Variabilitate"
          value={report.hrvCv.cv.toFixed(1)}
          unit="% CV"
          zone={report.hrvCv.zone}
          detail={`ln(HRV) medie: ${report.hrvCv.mean_ln.toFixed(2)} · ${report.hrvCv.n} zile`}
          reference={report.hrvCv.reference}
        />
      )}

      {report.rhrTrend && (
        <MetricRow
          title="Trend puls repaus"
          value={report.rhrTrend.change >= 0 ? `+${report.rhrTrend.change.toFixed(1)}` : report.rhrTrend.change.toFixed(1)}
          unit="bpm vs. baza"
          zone={report.rhrTrend.alert ? "overreaching" : Math.abs(report.rhrTrend.change) < 3 ? "adapted" : "moderate"}
          detail={`${report.rhrTrend.currentRhr.toFixed(0)} bpm acum · ${report.rhrTrend.trendPerMonth >= 0 ? "+" : ""}${report.rhrTrend.trendPerMonth.toFixed(1)} bpm/luna`}
          reference={report.rhrTrend.reference}
        />
      )}

      {report.vo2Trajectory && (
        <MetricRow
          title="VO2 Max traiectorie"
          value={report.vo2Trajectory.currentVo2.toFixed(1)}
          unit="mL/kg/min"
          zone={report.vo2Trajectory.status}
          detail={`Asteptat pt. varsta: ${report.vo2Trajectory.expectedForAge} · ${report.vo2Trajectory.delta >= 0 ? "+" : ""}${report.vo2Trajectory.delta.toFixed(1)} fata de norma`}
          reference={report.vo2Trajectory.reference}
        />
      )}

      {report.walkingSpeed && (
        <MetricRow
          title="Viteza de mers"
          value={report.walkingSpeed.meanSpeed.toFixed(2)}
          unit="m/s"
          zone={report.walkingSpeed.zone}
          detail={`Percentila ~${report.walkingSpeed.percentile} · ${report.walkingSpeed.n} zile`}
          reference={report.walkingSpeed.reference}
        />
      )}

      {report.sri && (
        <MetricRow
          title="Regularitate somn (SRI)"
          value={report.sri.sri.toFixed(0)}
          unit="/ 100"
          zone={report.sri.zone}
          detail={`Bedtime ±${report.sri.bedtimeStdMin.toFixed(0)} min · Trezire ±${report.sri.waketimeStdMin.toFixed(0)} min`}
          reference={report.sri.reference}
        />
      )}

      {report.chronotype && (
        <MetricRow
          title="Cronotip + Social Jet Lag"
          value={report.chronotype.socialJetLagHours.toFixed(1)}
          unit="h jet lag"
          zone={report.chronotype.jetLagZone}
          detail={`Cronotip: ${zoneLabel(report.chronotype.chronotype)} · MSFsc ${report.chronotype.msfsc.toFixed(1)}h`}
          reference={report.chronotype.reference}
        />
      )}
    </div>
  );
}
