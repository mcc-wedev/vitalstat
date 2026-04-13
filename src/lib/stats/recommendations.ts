/**
 * Personal Recommendations Engine
 * Generates actionable advice based on all available health signals.
 */

import type { DailySummary, SleepNight } from "../parser/healthTypes";
import type { ReadinessResult } from "./deepAnalysis";
import { meanStd } from "./zScore";

export interface Recommendation {
  priority: "high" | "medium" | "low";
  icon: string;
  title: string;
  body: string;
  category: "recovery" | "sleep" | "training" | "health";
}

export function generateRecommendations(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
  readiness: ReadinessResult | null,
): Recommendation[] {
  const recs: Recommendation[] = [];

  // 1. Readiness-based training advice
  if (readiness) {
    if (readiness.score < 40) {
      recs.push({
        priority: "high", icon: "🛑", category: "recovery",
        title: "Zi de recuperare",
        body: `Readiness ${readiness.score}/100 — evita antrenamentul intens. Stretching, hidratare, somn.`,
      });
    } else if (readiness.score < 60) {
      recs.push({
        priority: "medium", icon: "⚡", category: "training",
        title: "Antrenament moderat",
        body: `Readiness ${readiness.score}/100 — ok pentru exercitiu usor, nu forta intensitatea.`,
      });
    } else if (readiness.score >= 80) {
      recs.push({
        priority: "low", icon: "🚀", category: "training",
        title: "Zi optima pentru antrenament",
        body: `Readiness ${readiness.score}/100 — corpul tau e pregatit pentru efort intens.`,
      });
    }
  }

  // 2. Sleep deficit
  const sortedSleep = [...sleepNights].sort((a, b) => a.date.localeCompare(b.date));
  if (sortedSleep.length >= 3) {
    const recent3 = sortedSleep.slice(-3);
    const avgH = recent3.reduce((s, n) => s + n.totalMinutes, 0) / recent3.length / 60;

    if (avgH < 6.5) {
      recs.push({
        priority: "high", icon: "😴", category: "sleep",
        title: "Deficit de somn",
        body: `Media ultimelor 3 nopti: ${avgH.toFixed(1)}h. Sub 7h creste riscul cardiovascular. Tinteste 7.5h.`,
      });
    }

    // Personal sleep→HRV threshold
    const hrvData = metrics.hrv;
    if (hrvData && hrvData.length >= 14 && sortedSleep.length >= 14) {
      const hrvMap = new Map(hrvData.map(d => [d.date, d.mean]));
      const pairs = sortedSleep
        .map(n => ({ sleepH: n.totalMinutes / 60, hrv: hrvMap.get(n.date) }))
        .filter((p): p is { sleepH: number; hrv: number } => p.hrv !== undefined);

      if (pairs.length >= 10) {
        const over7 = pairs.filter(p => p.sleepH >= 7);
        const under7 = pairs.filter(p => p.sleepH < 7);
        if (over7.length >= 3 && under7.length >= 3) {
          const hrvOver = over7.reduce((s, p) => s + p.hrv, 0) / over7.length;
          const hrvUnder = under7.reduce((s, p) => s + p.hrv, 0) / under7.length;
          const diff = Math.round(((hrvOver - hrvUnder) / hrvUnder) * 100);
          if (diff > 5 && avgH < 7) {
            recs.push({
              priority: "medium", icon: "📈", category: "sleep",
              title: `+${diff}% HRV cu somn peste 7h`,
              body: `La tine, somnul >7h creste HRV-ul cu ${diff}%. Culca-te cu 30 min mai devreme.`,
            });
          }
        }
      }
    }
  }

  // 3. Training volume spike
  const exData = metrics.exerciseTime;
  if (exData && exData.length >= 14) {
    const sorted = [...exData].sort((a, b) => a.date.localeCompare(b.date));
    const recent7 = sorted.slice(-7).reduce((s, d) => s + d.sum, 0);
    const prev7 = sorted.slice(-14, -7).reduce((s, d) => s + d.sum, 0);
    const ratio = prev7 > 0 ? recent7 / prev7 : 1;

    if (ratio > 1.5) {
      recs.push({
        priority: "high", icon: "⚠️", category: "training",
        title: "Salt brusc in volum",
        body: `Exercitiul +${Math.round((ratio - 1) * 100)}% vs saptamana trecuta. Include o zi de odihna.`,
      });
    } else if (ratio < 0.5 && recent7 < 60) {
      recs.push({
        priority: "low", icon: "🏃", category: "training",
        title: "Volum scazut",
        body: `Doar ${Math.round(recent7)} min exercitiu. OMS recomanda minim 150 min/sapt.`,
      });
    }
  }

  // 4. RHR elevated
  const rhrData = metrics.restingHeartRate;
  if (rhrData && rhrData.length >= 10) {
    const sorted = [...rhrData].sort((a, b) => a.date.localeCompare(b.date));
    const recent3 = sorted.slice(-3);
    const baseline = sorted.slice(-14, -3);
    if (baseline.length >= 7) {
      const recentAvg = recent3.reduce((s, d) => s + d.mean, 0) / recent3.length;
      const { mean, std } = meanStd(baseline.map(d => d.mean));
      if (std > 0 && recentAvg > mean + 1.5 * std) {
        recs.push({
          priority: "medium", icon: "❤️", category: "health",
          title: "Puls de repaus crescut",
          body: `RHR ${Math.round(recentAvg)} bpm — peste media ta de ${Math.round(mean)}. Posibil stres sau oboseala.`,
        });
      }
    }
  }

  // 5. SpO2 low
  const spo2Data = metrics.oxygenSaturation;
  if (spo2Data && spo2Data.length >= 3) {
    const sorted = [...spo2Data].sort((a, b) => a.date.localeCompare(b.date));
    const avg = sorted.slice(-3).reduce((s, d) => s + d.mean, 0) / 3;
    if (avg < 95) {
      recs.push({
        priority: "high", icon: "🫁", category: "health",
        title: "SpO2 scazut",
        body: `Saturatie ${avg.toFixed(1)}% — sub 95% merita investigat. Consulta un medic daca persista.`,
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  recs.sort((a, b) => order[a.priority] - order[b.priority]);
  return recs.slice(0, 5);
}
