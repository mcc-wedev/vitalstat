"use client";

import { useMemo, useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { mannKendall, smoothCMA } from "@/lib/stats/advanced";
import { vo2MaxPercentile, vo2MaxCategory } from "@/lib/stats/norms";
import { loadProfile } from "@/lib/userProfile";
import type { UserProfile } from "@/lib/userProfile";
import { HelpTip } from "./HelpTip";

interface Props {
  data?: DailySummary[];
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  VO2 MAX TRAJECTORY — Longevity Dashboard
 *
 *  VO2 Max is the STRONGEST single predictor of all-cause
 *  mortality (Kodama 2009 JAMA meta-analysis, n=102,980).
 *  Every 1 MET (~3.5 mL/kg/min) improvement = 13% mortality
 *  reduction. This component shows:
 *
 *   • The user's VO2 Max trajectory over all data
 *   • Smoothed (20-day CMA) to remove noise from Apple's
 *     episodic VO2 estimates
 *   • Age × sex-percentile bands (ACSM norms) as background
 *   • Mann-Kendall trend test for statistical significance
 *   • Projected trajectory if current trend continues
 * ═══════════════════════════════════════════════════════════════
 */
export function Vo2MaxTrajectory({ data }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => {
    setProfile(loadProfile());
    const onUpdate = () => setProfile(loadProfile());
    window.addEventListener("vitalstat-profile-updated", onUpdate);
    return () => window.removeEventListener("vitalstat-profile-updated", onUpdate);
  }, []);

  const analysis = useMemo(() => {
    if (!data || data.length < 10) return null;
    const filtered = data.filter(d => d.mean > 15 && d.mean < 80);
    if (filtered.length < 10) return null;

    const values = filtered.map(d => d.mean);
    const smoothed = smoothCMA(values, Math.min(20, Math.floor(values.length / 3)));

    const points = filtered.map((d, i) => ({
      date: d.date,
      dateShort: d.date.substring(2).replace("-", "/").substring(0, 5),
      value: Number(values[i].toFixed(1)),
      smoothed: Number(smoothed[i].toFixed(1)),
    }));

    // Trend test
    const mk = mannKendall(smoothed);
    // Sen's slope is per-observation (per measurement). Convert to per-year.
    // VO2 Max measurements from Apple are ~weekly, so × 52.
    const obsPerYear = Math.max(1, filtered.length / ((new Date(filtered[filtered.length - 1].date).getTime() - new Date(filtered[0].date).getTime()) / (365.25 * 86400000)));
    const slopePerYear = mk ? mk.sensSlope * obsPerYear : 0;

    const current = smoothed[smoothed.length - 1];
    const start = smoothed[0];
    const totalChange = current - start;

    // Percentile vs age × sex (if profile known)
    let pct: number | null = null;
    let cat: string | null = null;
    if (profile) {
      pct = vo2MaxPercentile(current, profile.age, profile.sex);
      cat = vo2MaxCategory(pct);
    }

    // Mortality interpretation (Kodama 2009)
    // Every 1 MET (~3.5 mL/kg/min) = 13% mortality reduction
    const metsFromAvg = (current - 35) / 3.5; // 35 = average male middle-age
    const mortalityReduction = Math.round(13 * metsFromAvg);

    let trendText = "stabil";
    if (mk && mk.significant && mk.tau > 0.15) trendText = "in crestere";
    else if (mk && mk.significant && mk.tau < -0.15) trendText = "in scadere";

    const trendColor = trendText === "in crestere" ? "#34C759" : trendText === "in scadere" ? "#FF3B30" : "var(--label-secondary)";

    return {
      points,
      current,
      start,
      totalChange,
      slopePerYear,
      significant: mk ? mk.significant : false,
      tau: mk ? mk.tau : 0,
      trendText,
      trendColor,
      pct,
      cat,
      mortalityReduction,
    };
  }, [data, profile]);

  if (!analysis) {
    return null; // silently hide if not enough data
  }

  return (
    <div className="hh-card animate-in" style={{ minWidth: 0 }}>
      <div className="hh-section-label" style={{ marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          VO2 Max · traiectorie longevitate
          <HelpTip
            text="VO2 Max este cel mai puternic predictor al mortalitatii generale. Fiecare 1 MET (~3.5 mL/kg/min) castigat reduce mortalitatea cu ~13%. Curba portocalie e media mobila de 20 de zile — suprima zgomotul masuratorilor episodice ale Apple Watch."
            source="Kodama 2009 JAMA (n=102,980)"
          />
        </span>
        <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>
          Kodama 2009
        </span>
      </div>

      {/* Big number */}
      <div className="flex items-baseline gap-3" style={{ marginBottom: 4 }}>
        <span className="hh-mono-num" style={{ fontSize: 36, fontWeight: 700, color: "var(--label-primary)", lineHeight: 1 }}>
          {analysis.current.toFixed(1)}
        </span>
        <span className="hh-footnote" style={{ color: "var(--label-secondary)" }}>mL/kg/min</span>
        {analysis.pct !== null && (
          <span className="hh-footnote" style={{ color: "var(--accent)", fontWeight: 600 }}>
            percentila {Math.round(analysis.pct)}
          </span>
        )}
      </div>
      {analysis.cat && (
        <p className="hh-subheadline" style={{ color: "var(--label-primary)", fontWeight: 600, marginBottom: 10 }}>
          {analysis.cat} pentru varsta ta
        </p>
      )}

      {/* Chart */}
      <div className="hh-chart" style={{ height: 140, marginTop: 8 }}>
        <ResponsiveContainer width="99%" height="100%">
          <LineChart data={analysis.points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="vo2-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF9500" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#FF9500" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="dateShort"
              tick={{ fill: "rgba(235,235,245,0.35)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "rgba(235,235,245,0.35)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(30,30,32,0.95)",
                border: "0.5px solid rgba(84,84,88,0.35)",
                borderRadius: 10,
                fontSize: 12,
                padding: "8px 12px",
              }}
              labelStyle={{ color: "rgba(235,235,245,0.6)", fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="smoothed"
              stroke="#FF9500"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interpretation */}
      <div style={{ marginTop: 12, padding: 12, background: "var(--surface-2)", borderRadius: 12 }}>
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          Ce spune traiectoria
        </p>
        <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.5 }}>
          Trendul pe toata perioada: <b style={{ color: analysis.trendColor }}>{analysis.trendText}</b>
          {analysis.significant && (
            <span style={{ color: "var(--label-tertiary)" }}>
              {" "}(semnificativ, τ={analysis.tau.toFixed(2)}
              <HelpTip
                text="Testul Mann-Kendall e un test non-parametric pentru tendinta — nu presupune distributie normala. Tau (τ) masoara forta trendului: 1 = crestere perfect monotona, -1 = scadere perfect monotona, 0 = fara trend. 'Semnificativ' = p < 0.05."
                source="Mann 1945 · Kendall 1975"
              />)
            </span>
          )}
          .
          {" "}
          De la inceputul datelor ai
          {analysis.totalChange >= 0 ? " castigat " : " pierdut "}
          <b style={{ color: analysis.totalChange >= 0 ? "#34C759" : "#FF3B30" }}>
            {Math.abs(analysis.totalChange).toFixed(1)} mL/kg/min
          </b>.
          {" "}
          {analysis.mortalityReduction > 0 && analysis.current >= 38 && (
            <>Acest nivel este asociat cu o reducere de ~<b style={{ color: "#34C759" }}>{Math.min(50, analysis.mortalityReduction)}%</b> a mortalitatii cardiovasculare fata de media pentru varsta ta.</>
          )}
        </p>
      </div>

      {/* Apple Watch estimation context */}
      <p className="hh-footnote" style={{ color: "var(--label-tertiary)", lineHeight: 1.45, marginTop: 10, fontSize: 11 }}>
        Valorile VO2 Max sunt estimate de Apple Watch din alergari outdoor si nu reprezinta un test de laborator.
        Factori care pot supraestima: greutate incorecta in profil, alergari cu panta, primele luni de utilizare.
      </p>
    </div>
  );
}
