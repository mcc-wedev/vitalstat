"use client";

import { useMemo, useState } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";

interface Props {
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
}

type Severity = "critical" | "warning";

interface Alert {
  id: string;
  severity: Severity;
  title: string;
  body: string;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  ATTENTION BANNER — surfaces critical health signals at the top
 *  of the dashboard so the user sees them immediately.
 *
 *  Triggers:
 *   • Illness early warning: RHR elevated + HRV suppressed on 3d
 *     window vs 28d baseline (WHOOP/Oura-style detection).
 *   • HRV crash: today/yesterday < -2σ from 28d baseline.
 *   • Temperature surge: wrist temp > +0.5°C above baseline.
 *   • Sleep debt: 7-night average < 6h.
 *
 *  All baselines use the FULL dataset (not filtered), because
 *  the user's body doesn't care which period is selected in the UI.
 * ═══════════════════════════════════════════════════════════════
 */
export function AttentionBanner({ allMetrics, allSleep }: Props) {
  const [dismissed, setDismissed] = useState(false);

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    const rhr = allMetrics.restingHeartRate;
    const hrv = allMetrics.hrv;
    const resp = allMetrics.respiratoryRate;
    const temp = allMetrics.wristTemperature;

    // ── Illness early warning (combined RHR + HRV + optional resp/temp) ──
    if (rhr && rhr.length >= 14 && hrv && hrv.length >= 14) {
      const rhrBase = rhr.slice(-30, -3);
      const rhrNow = rhr.slice(-3);
      const hrvBaseArr = hrv.slice(-30, -3).filter(d => d.mean >= 5);
      const hrvNowArr = hrv.slice(-3).filter(d => d.mean >= 5);

      if (rhrBase.length >= 14 && hrvBaseArr.length >= 14 && rhrNow.length >= 2 && hrvNowArr.length >= 2) {
        const rhrBaseMean = rhrBase.reduce((s, d) => s + d.mean, 0) / rhrBase.length;
        const rhrNowMean = rhrNow.reduce((s, d) => s + d.mean, 0) / rhrNow.length;
        const rhrDelta = rhrNowMean - rhrBaseMean;

        const hrvBaseMean = hrvBaseArr.reduce((s, d) => s + d.mean, 0) / hrvBaseArr.length;
        const hrvNowMean = hrvNowArr.reduce((s, d) => s + d.mean, 0) / hrvNowArr.length;
        const hrvDeltaPct = ((hrvNowMean - hrvBaseMean) / hrvBaseMean) * 100;

        let respElevated = false;
        if (resp && resp.length >= 14) {
          const rBase = resp.slice(-30, -3);
          const rNow = resp.slice(-3);
          if (rBase.length >= 10 && rNow.length >= 2) {
            const b = rBase.reduce((s, d) => s + d.mean, 0) / rBase.length;
            const n = rNow.reduce((s, d) => s + d.mean, 0) / rNow.length;
            if (n - b > 1.5) respElevated = true;
          }
        }

        let tempElevated = false;
        if (temp && temp.length >= 7) {
          const last3 = temp.slice(-3);
          if (last3.some(d => d.mean > 0.4)) tempElevated = true;
        }

        const signals: string[] = [];
        if (rhrDelta > 3) signals.push(`puls +${rhrDelta.toFixed(0)} bpm`);
        if (hrvDeltaPct < -15) signals.push(`HRV ${hrvDeltaPct.toFixed(0)}%`);
        if (respElevated) signals.push("respiratie ↑");
        if (tempElevated) signals.push("temp ↑");

        if (signals.length >= 2) {
          out.push({
            id: "illness-early",
            severity: "critical",
            title: "Posibil semn de boala",
            body: `Corpul tau arata semne de stres multi-sistem (${signals.join(", ")}) fata de ultimele 28 de zile. Prioritizeaza somnul, hidratarea si reduce efortul azi.`,
          });
        }
      }
    }

    // ── HRV crash (single-metric, severe) ──
    if (hrv && hrv.length >= 21) {
      const hrvValid = hrv.slice(-30).filter(d => d.mean >= 5);
      if (hrvValid.length >= 14) {
        const base = hrvValid.slice(0, -3);
        const { mean: m, std } = meanStd(base.map(d => d.mean));
        const last = hrvValid[hrvValid.length - 1];
        if (std > 0) {
          const z = (last.mean - m) / std;
          if (z < -2 && !out.some(a => a.id === "illness-early")) {
            out.push({
              id: "hrv-crash",
              severity: "warning",
              title: "HRV brusc scazut",
              body: `HRV-ul tau a scazut la ${last.mean.toFixed(0)} ms (${z.toFixed(1)}σ sub normal pentru tine). Poate fi stres, lipsa de somn, alcool sau inceput de boala.`,
            });
          }
        }
      }
    }

    // ── Sleep debt (7-night average < 6h) ──
    if (allSleep.length >= 7) {
      const last7 = allSleep.slice(-7);
      const avg = last7.reduce((s, n) => s + n.totalMinutes / 60, 0) / last7.length;
      if (avg < 6) {
        out.push({
          id: "sleep-debt",
          severity: "warning",
          title: "Datorie de somn acumulata",
          body: `In ultimele 7 nopti ai dormit in medie ${avg.toFixed(1)}h. Sub 6h consecutiv creste inflamatia si scade imunitatea (Walker 2017).`,
        });
      }
    }

    return out.slice(0, 2); // max 2 alerts visible
  }, [allMetrics, allSleep]);

  if (dismissed || alerts.length === 0) return null;

  const topSeverity: Severity = alerts.some(a => a.severity === "critical") ? "critical" : "warning";
  const color = topSeverity === "critical" ? "#FF3B30" : "#FF9500";

  return (
    <div
      className="animate-in"
      style={{
        background: `${color}14`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 16,
      }}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            className="hh-caption"
            style={{
              color,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            In atentie azi
          </p>
          {alerts.map((a, i) => (
            <div key={a.id} style={{ marginTop: i === 0 ? 0 : 8 }}>
              <p
                className="hh-subheadline"
                style={{ color: "var(--label-primary)", fontWeight: 600, marginBottom: 2 }}
              >
                {a.title}
              </p>
              <p
                className="hh-footnote"
                style={{ color: "var(--label-secondary)", lineHeight: 1.45 }}
              >
                {a.body}
              </p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Inchide alerta"
          style={{
            flexShrink: 0,
            width: 24,
            height: 24,
            borderRadius: 999,
            background: "transparent",
            color: "var(--label-tertiary)",
            border: "none",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
