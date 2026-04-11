"use client";

import { useMemo, useState, useEffect } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";
import { mannKendall, smoothCMA } from "@/lib/stats/advanced";
import {
  rhrPercentile,
  hrvPercentile,
  vo2MaxPercentile,
  walkingSpeedPercentile,
  percentileToYearsOffset,
  BIOMARKER_MAX_OFFSET,
  vo2MaxCategory,
} from "@/lib/stats/norms";
import { loadProfile, saveProfile, type UserProfile } from "@/lib/userProfile";
import type { Sex } from "@/lib/stats/norms";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  BIOLOGICAL AGE v2 — Apple Watch only, percentile-based
 *
 *  Methodology:
 *  1. Each biomarker value is compared against **age × sex norms**
 *     from published literature (not hardcoded averages).
 *  2. Percentile is converted to a "years offset" via a calibrated
 *     max-offset per biomarker (strongest predictors get larger
 *     offsets — Kodama 2009 meta-analysis for effect sizes).
 *  3. Final bio-age = chronological age + Σ(offsets), weighted
 *     by data availability.
 *  4. 12-month trajectory: are biomarkers improving or degrading?
 *     Uses Mann-Kendall test on smoothed HRV + RHR to detect
 *     statistically significant aging acceleration/deceleration.
 *
 *  Evidence base:
 *  - VO2 Max: Kodama 2009 (JAMA meta, n=102,980) — strongest single
 *    predictor of all-cause mortality. ACSM percentile tables.
 *  - HRV SDNN: Umetani 1998, Voss 2015 — autonomic aging marker.
 *  - RHR: Nauman 2011 (HUNT, n=50,088), Jensen 2013 — cardiovascular
 *    conditioning & mortality.
 *  - Walking speed: Studenski 2011 (JAMA) — survival predictor
 *    after 65y.
 *  - Sleep: Mander 2017 — sleep architecture and cognitive aging.
 *  - Activity: Lee 2019 (JAMA, n=16,741) — 7500+ steps/day = 40%
 *    mortality reduction.
 *
 *  NOT a medical diagnosis. Relative fitness indicator only.
 * ═══════════════════════════════════════════════════════════════
 */
export function BiologicalAge({ metrics, sleepNights }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    const onUpdate = () => setProfile(loadProfile());
    window.addEventListener("vitalstat-profile-updated", onUpdate);
    return () => window.removeEventListener("vitalstat-profile-updated", onUpdate);
  }, []);

  const handleSave = (age: number, sex: Sex) => {
    const p = saveProfile(age, sex);
    setProfile(p);
    setEditing(false);
  };

  const analysis = useMemo(() => {
    if (!profile) return null;
    const { age, sex } = profile;

    const rhr = metrics.restingHeartRate;
    const hrv = metrics.hrv;
    if (!rhr || rhr.length < 14 || !hrv || hrv.length < 14) return null;

    // Use last 30 days for "current state"
    const N = 30;
    const rhrRecent = rhr.slice(-N).filter(d => d.mean > 30);
    const hrvRecent = hrv.slice(-N).filter(d => d.mean >= 5);
    if (rhrRecent.length < 7 || hrvRecent.length < 7) return null;

    const rhrAvg = meanStd(rhrRecent.map(d => d.mean)).mean;
    const hrvAvg = meanStd(hrvRecent.map(d => d.mean)).mean;

    // Core two: RHR + HRV (always available)
    const rhrPct = rhrPercentile(rhrAvg, age, sex);
    const hrvPct = hrvPercentile(hrvAvg, age, sex);
    const rhrOffset = percentileToYearsOffset(rhrPct, BIOMARKER_MAX_OFFSET.rhr);
    const hrvOffset = percentileToYearsOffset(hrvPct, BIOMARKER_MAX_OFFSET.hrv);

    // VO2 Max — strongest single predictor
    let vo2Offset = 0, vo2Pct: number | null = null, vo2Avg: number | null = null;
    let vo2Cat: string | null = null;
    if (metrics.vo2Max && metrics.vo2Max.length >= 3) {
      const recent = metrics.vo2Max.slice(-10).filter(d => d.mean > 15);
      if (recent.length >= 3) {
        vo2Avg = meanStd(recent.map(d => d.mean)).mean;
        vo2Pct = vo2MaxPercentile(vo2Avg, age, sex);
        vo2Offset = percentileToYearsOffset(vo2Pct, BIOMARKER_MAX_OFFSET.vo2Max);
        vo2Cat = vo2MaxCategory(vo2Pct);
      }
    }

    // Walking speed — Apple stores in m/s
    let walkOffset = 0, walkPct: number | null = null, walkMs: number | null = null;
    if (metrics.walkingSpeed && metrics.walkingSpeed.length >= 14) {
      const recent = metrics.walkingSpeed.slice(-N).filter(d => d.mean > 0.3);
      if (recent.length >= 7) {
        walkMs = meanStd(recent.map(d => d.mean)).mean;
        walkPct = walkingSpeedPercentile(walkMs, age, sex);
        walkOffset = percentileToYearsOffset(walkPct, BIOMARKER_MAX_OFFSET.walkingSpeed);
      }
    }

    // Sleep quality offset (Mander 2017) — simpler scoring
    let sleepOffset = 0, sleepDetail = "";
    if (sleepNights.length >= 14) {
      const last14 = sleepNights.slice(-14);
      const avgHours = last14.reduce((s, n) => s + n.totalMinutes / 60, 0) / last14.length;
      const avgEff = last14.reduce((s, n) => s + n.efficiency, 0) / last14.length;
      const totalMin = last14.reduce((s, n) => s + n.totalMinutes, 0);
      const deepPct = totalMin > 0 ? (last14.reduce((s, n) => s + n.stages.deep, 0) / totalMin) * 100 : 0;

      // Score 0-100 for sleep
      let sleepScore = 50;
      if (avgHours >= 7 && avgHours <= 9) sleepScore += 20;
      else if (avgHours >= 6.5) sleepScore += 5;
      else sleepScore -= 20;
      if (avgEff >= 0.9) sleepScore += 15;
      else if (avgEff < 0.8) sleepScore -= 10;
      if (deepPct >= 18) sleepScore += 15;
      else if (deepPct < 12) sleepScore -= 10;
      sleepScore = Math.max(0, Math.min(100, sleepScore));
      sleepOffset = percentileToYearsOffset(sleepScore, BIOMARKER_MAX_OFFSET.sleep);
      sleepDetail = `${avgHours.toFixed(1)}h · eficienta ${(avgEff * 100).toFixed(0)}%`;
    }

    // Activity offset (Lee 2019 dose-response)
    let activityOffset = 0;
    let stepsAvg = 0;
    if (metrics.stepCount && metrics.stepCount.length >= 14) {
      const recent = metrics.stepCount.slice(-N);
      stepsAvg = meanStd(recent.map(d => d.sum)).mean;
      // Lee 2019: dose-response curve plateaus around 7500
      let actScore = 50;
      if (stepsAvg >= 10000) actScore = 90;
      else if (stepsAvg >= 7500) actScore = 80;
      else if (stepsAvg >= 5000) actScore = 60;
      else if (stepsAvg >= 3000) actScore = 35;
      else actScore = 15;
      activityOffset = percentileToYearsOffset(actScore, BIOMARKER_MAX_OFFSET.activity);
    }

    // Weight offsets by evidence strength (effect sizes from meta-analyses)
    // Re-normalize if VO2 or walking missing
    const factors = [
      { key: "vo2", offset: vo2Offset, weight: vo2Pct !== null ? 0.28 : 0, label: "VO2 Max" },
      { key: "hrv", offset: hrvOffset, weight: 0.22, label: "HRV" },
      { key: "rhr", offset: rhrOffset, weight: 0.17, label: "Puls repaus" },
      { key: "walk", offset: walkOffset, weight: walkPct !== null ? 0.13 : 0, label: "Viteza mers" },
      { key: "sleep", offset: sleepOffset, weight: sleepNights.length >= 14 ? 0.12 : 0, label: "Somn" },
      { key: "activity", offset: activityOffset, weight: stepsAvg > 0 ? 0.08 : 0, label: "Activitate" },
    ];

    const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
    if (totalWeight === 0) return null;
    const weightedOffset = factors.reduce((s, f) => s + (f.weight / totalWeight) * f.offset, 0);
    // Scale by availability — less data = regress toward chronological age
    const scale = Math.min(1, totalWeight / 0.7); // full weight when ~70% factors present
    const bioAge = Math.round(age + weightedOffset * scale);

    // 12-month trajectory (Mann-Kendall on smoothed HRV + RHR)
    let pace: "incetineste" | "stabil" | "accelereaza" = "stabil";
    let paceDetail = "Biomarkerii tai sunt stabili in ultimele luni.";
    if (hrv.length >= 60 && rhr.length >= 60) {
      const hrvSmoothed = smoothCMA(hrv.slice(-180).filter(d => d.mean >= 5).map(d => Math.log(d.mean)), 7);
      const rhrSmoothed = smoothCMA(rhr.slice(-180).map(d => d.mean), 7);
      const mkHRV = mannKendall(hrvSmoothed);
      const mkRHR = mannKendall(rhrSmoothed);

      const hrvImproving = mkHRV && mkHRV.significant && mkHRV.tau > 0.15;
      const hrvDeclining = mkHRV && mkHRV.significant && mkHRV.tau < -0.15;
      const rhrImproving = mkRHR && mkRHR.significant && mkRHR.tau < -0.15;
      const rhrDeclining = mkRHR && mkRHR.significant && mkRHR.tau > 0.15;

      if (hrvImproving || rhrImproving) {
        pace = "incetineste";
        paceDetail = "Biomarkerii tai se imbunatatesc statistic semnificativ. Imbatranesti mai incet decat media populatiei.";
      } else if (hrvDeclining || rhrDeclining) {
        pace = "accelereaza";
        paceDetail = "Unii biomarkeri se degradeaza statistic semnificativ. Prioritizeaza somnul, zona 2 cardio si managementul stresului.";
      }
    }

    const delta = bioAge - age;
    const color = delta <= -5 ? "#10b981" : delta <= -2 ? "#34C759" : delta <= 2 ? "#007AFF" : delta <= 5 ? "#FF9500" : "#FF3B30";

    const breakdown = factors
      .filter(f => f.weight > 0)
      .map(f => {
        const years = f.offset * (f.weight / totalWeight) * scale;
        return { label: f.label, years, offset: f.offset };
      })
      .sort((a, b) => Math.abs(b.years) - Math.abs(a.years));

    return {
      bioAge,
      delta,
      color,
      pace,
      paceDetail,
      breakdown,
      rhrPct: Math.round(rhrPct),
      hrvPct: Math.round(hrvPct),
      vo2Pct: vo2Pct !== null ? Math.round(vo2Pct) : null,
      vo2Avg,
      vo2Cat,
      walkPct: walkPct !== null ? Math.round(walkPct) : null,
      walkKmh: walkMs !== null ? walkMs * 3.6 : null,
      rhrAvg: Math.round(rhrAvg),
      hrvAvg: Math.round(hrvAvg),
      sleepDetail,
      confidenceCount: factors.filter(f => f.weight > 0).length,
    };
  }, [metrics, sleepNights, profile]);

  // No profile yet — show onboarding
  if (!profile) {
    return <ProfileOnboarding onSave={handleSave} />;
  }

  if (!analysis) {
    return (
      <div className="hh-card">
        <div className="hh-section-label" style={{ marginBottom: 8 }}>
          <span>Varsta biologica</span>
          <button onClick={() => setEditing(true)} className="hh-caption" style={{ color: "var(--accent)", border: "none", background: "none", cursor: "pointer" }}>
            {profile.age} ani · {profile.sex === "male" ? "barbat" : "femeie"} ✎
          </button>
        </div>
        <p className="hh-footnote" style={{ color: "var(--label-tertiary)" }}>
          Necesare cel putin 14 zile de HRV si puls de repaus.
        </p>
        {editing && <EditProfile profile={profile} onSave={handleSave} onCancel={() => setEditing(false)} />}
      </div>
    );
  }

  return (
    <div className="hh-card animate-in" style={{ minWidth: 0 }}>
      {/* Header */}
      <div className="hh-section-label" style={{ marginBottom: 12 }}>
        <span>Varsta biologica</span>
        <button
          onClick={() => setEditing(true)}
          className="hh-caption"
          style={{ color: "var(--label-tertiary)", border: "none", background: "none", cursor: "pointer", textTransform: "none", letterSpacing: 0 }}
        >
          {profile.age} ani · {profile.sex === "male" ? "barbat" : "femeie"} ✎
        </button>
      </div>

      {editing && <EditProfile profile={profile} onSave={handleSave} onCancel={() => setEditing(false)} />}

      {/* Big number */}
      <div className="flex items-baseline gap-3" style={{ marginBottom: 4 }}>
        <span className="hh-mono-num" style={{ fontSize: 48, fontWeight: 700, color: analysis.color, lineHeight: 1 }}>
          {analysis.bioAge}
        </span>
        <span className="hh-footnote" style={{ color: "var(--label-secondary)" }}>ani</span>
      </div>
      <p className="hh-subheadline" style={{
        color: analysis.delta < 0 ? "#34C759" : analysis.delta > 0 ? "#FF9500" : "var(--label-secondary)",
        fontWeight: 600,
        marginBottom: 14,
      }}>
        {analysis.delta < 0
          ? `${Math.abs(analysis.delta)} ani mai tanar decat varsta ta cronologica`
          : analysis.delta > 0
            ? `${analysis.delta} ani peste varsta ta cronologica`
            : "La nivelul varstei tale cronologice"}
      </p>

      {/* Pace pill */}
      <div style={{ marginBottom: 14 }}>
        <span className="hh-caption-2" style={{
          display: "inline-block",
          padding: "4px 10px",
          borderRadius: 999,
          background: analysis.pace === "incetineste" ? "rgba(52,199,89,0.15)" : analysis.pace === "accelereaza" ? "rgba(255,59,48,0.15)" : "rgba(120,120,128,0.15)",
          color: analysis.pace === "incetineste" ? "#34C759" : analysis.pace === "accelereaza" ? "#FF3B30" : "var(--label-secondary)",
          fontWeight: 600,
        }}>
          {analysis.pace === "incetineste" ? "↓ imbatranire incetineste" : analysis.pace === "accelereaza" ? "↑ imbatranire accelereaza" : "— ritm stabil"}
        </span>
        <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginTop: 6 }}>
          {analysis.paceDetail}
        </p>
      </div>

      {/* Breakdown table */}
      <div style={{ marginBottom: 12 }}>
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          Contributia fiecarui biomarker
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {analysis.breakdown.map(f => {
            const positive = f.years < 0; // younger = negative years
            return (
              <div key={f.label} className="flex items-center justify-between" style={{ padding: "4px 0" }}>
                <span className="hh-footnote" style={{ color: "var(--label-primary)" }}>{f.label}</span>
                <span className="hh-mono-num hh-footnote" style={{
                  color: positive ? "#34C759" : f.years > 0 ? "#FF9500" : "var(--label-tertiary)",
                  fontWeight: 600,
                }}>
                  {f.years >= 0 ? "+" : ""}{f.years.toFixed(1)} ani
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Percentile explainer */}
      <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: 12, marginBottom: 8 }}>
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          Percentile vs {profile.age} ani {profile.sex === "male" ? "barbat" : "femeie"}
        </p>
        <div className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.5 }}>
          Puls repaus {analysis.rhrAvg} bpm → <b style={{ color: "var(--label-primary)" }}>percentila {analysis.rhrPct}</b>
          <br/>
          HRV {analysis.hrvAvg} ms → <b style={{ color: "var(--label-primary)" }}>percentila {analysis.hrvPct}</b>
          {analysis.vo2Pct !== null && analysis.vo2Avg !== null && (
            <>
              <br/>
              VO2 Max {analysis.vo2Avg.toFixed(1)} mL/kg/min → <b style={{ color: "var(--label-primary)" }}>percentila {analysis.vo2Pct}</b>
              {analysis.vo2Cat && <span style={{ color: "var(--label-tertiary)" }}> ({analysis.vo2Cat})</span>}
            </>
          )}
          {analysis.walkPct !== null && analysis.walkKmh !== null && (
            <>
              <br/>
              Viteza mers {analysis.walkKmh.toFixed(1)} km/h → <b style={{ color: "var(--label-primary)" }}>percentila {analysis.walkPct}</b>
            </>
          )}
        </div>
      </div>

      <p className="hh-caption-2" style={{ color: "var(--label-tertiary)", fontStyle: "italic" }}>
        Estimare bazata pe norme populationale din Kodama 2009, Umetani 1998, Nauman 2011, Studenski 2011. Nu inlocuieste evaluare medicala.
      </p>
    </div>
  );
}

/* ───────────────────── Onboarding ───────────────────── */

function ProfileOnboarding({ onSave }: { onSave: (age: number, sex: Sex) => void }) {
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex | "">("");

  const valid = Number(age) >= 10 && Number(age) <= 100 && (sex === "male" || sex === "female");

  return (
    <div className="hh-card animate-in">
      <div className="hh-section-label" style={{ marginBottom: 8 }}>
        <span>Configureaza-ti profilul</span>
      </div>
      <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginBottom: 14 }}>
        Normele populationale difera semnificativ intre barbati si femei, si intre decade de varsta. Acest profil ramane doar pe dispozitivul tau.
      </p>

      <div style={{ marginBottom: 14 }}>
        <label className="hh-caption" style={{ color: "var(--label-tertiary)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Varsta cronologica
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={10}
          max={100}
          value={age}
          onChange={(e) => setAge(e.target.value)}
          placeholder="30"
          style={{
            background: "var(--surface-2)",
            border: "none",
            borderRadius: 10,
            padding: "10px 14px",
            color: "var(--label-primary)",
            fontSize: 17,
            width: 100,
            fontVariantNumeric: "tabular-nums",
          }}
        />
        <span className="hh-footnote" style={{ color: "var(--label-tertiary)", marginLeft: 8 }}>ani</span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="hh-caption" style={{ color: "var(--label-tertiary)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Sex biologic
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["male", "female"] as Sex[]).map(s => (
            <button
              key={s}
              onClick={() => setSex(s)}
              className="hh-card-tappable"
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: sex === s ? "var(--accent)" : "var(--surface-2)",
                color: sex === s ? "#fff" : "var(--label-primary)",
                border: "none",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 600,
                flex: 1,
              }}
            >
              {s === "male" ? "Barbat" : "Femeie"}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => valid && onSave(Number(age), sex as Sex)}
        disabled={!valid}
        className="hh-card-tappable"
        style={{
          padding: "12px 20px",
          borderRadius: 10,
          background: valid ? "var(--accent)" : "var(--surface-2)",
          color: valid ? "#fff" : "var(--label-tertiary)",
          border: "none",
          cursor: valid ? "pointer" : "default",
          fontSize: 15,
          fontWeight: 600,
          width: "100%",
        }}
      >
        Salveaza si calculeaza
      </button>
    </div>
  );
}

function EditProfile({
  profile, onSave, onCancel,
}: {
  profile: UserProfile;
  onSave: (age: number, sex: Sex) => void;
  onCancel: () => void;
}) {
  const [age, setAge] = useState(String(profile.age));
  const [sex, setSex] = useState<Sex>(profile.sex);
  return (
    <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: 12, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input
        type="number"
        inputMode="numeric"
        value={age}
        onChange={(e) => setAge(e.target.value)}
        style={{ background: "var(--surface-1)", border: "none", borderRadius: 8, padding: "6px 10px", color: "var(--label-primary)", fontSize: 14, width: 70, fontVariantNumeric: "tabular-nums" }}
      />
      <select
        value={sex}
        onChange={(e) => setSex(e.target.value as Sex)}
        style={{ background: "var(--surface-1)", border: "none", borderRadius: 8, padding: "6px 10px", color: "var(--label-primary)", fontSize: 14 }}
      >
        <option value="male">Barbat</option>
        <option value="female">Femeie</option>
      </select>
      <button
        onClick={() => { const n = Number(age); if (n >= 10 && n <= 100) onSave(n, sex); }}
        className="hh-card-tappable"
        style={{ padding: "6px 12px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
      >
        Salveaza
      </button>
      <button
        onClick={onCancel}
        className="hh-card-tappable"
        style={{ padding: "6px 12px", borderRadius: 8, background: "transparent", color: "var(--label-secondary)", border: "none", cursor: "pointer", fontSize: 13 }}
      >
        Anuleaza
      </button>
    </div>
  );
}
