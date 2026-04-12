/**
 * ═══════════════════════════════════════════════════════════════
 *  SMART INSIGHTS ENGINE v2 — Narrative, evidence-cited,
 *  cross-metric, period-aware.
 *
 *  Design principles:
 *   1. Every insight cites a real study (via references.ts)
 *   2. Each insight generates UNIQUE prose (no template reuse)
 *   3. Narrative over bullet points — explain what, why, and what to do
 *   4. Cross-metric insights combine 2-3 signals
 *   5. Period-aware — different insights for 7d vs 1y
 *   6. Tiered priority: Safety > Actionable > Contextual > Positive
 * ═══════════════════════════════════════════════════════════════
 */

import type { DailySummary, SleepNight } from "../parser/healthTypes";
import {
  mannKendall,
  smoothCMA,
  coefficientOfVariation,
  banister,
  formState,
  detectWeeklyCycle,
  dayOfWeekSeasonality,
} from "./advanced";
import { rhrPercentile, hrvPercentile, vo2MaxPercentile } from "./norms";
import { cite } from "./references";
import { loadProfile } from "../userProfile";

export type SmartSeverity = "critical" | "warning" | "positive" | "info";

export interface SmartInsight {
  id: string;
  title: string;
  body: string;
  severity: SmartSeverity;
  priority: number;
  category: string;
}

/* ───────────── public API ───────────── */

export function generateSmartInsights(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
  allMetrics: Record<string, DailySummary[]>,
  allSleep: SleepNight[],
  windowDays: number,
  profileOverride?: import("../userProfile").UserProfile | null,
): SmartInsight[] {
  const out: SmartInsight[] = [];

  const mode: "acute" | "trend" | "progression" | "longevity" =
    windowDays <= 14 ? "acute" :
    windowDays <= 60 ? "trend" :
    windowDays <= 180 ? "progression" :
    "longevity";

  // ── Tier 1: Safety (always-on) ──
  out.push(...illnessEarlyWarning(allMetrics, allSleep));
  out.push(...overtrainingDetection(allMetrics, allSleep));

  // ── Tier 2: Actionable ──
  out.push(...personalNorms(allMetrics, profileOverride));
  out.push(...sleepDebtNarrative(allSleep, sleepNights, allMetrics));

  if (mode === "acute") {
    out.push(...volatilityNarrative(metrics));
  }

  if (mode === "trend" || mode === "progression") {
    out.push(...trendNarrative(metrics, sleepNights, windowDays));
    out.push(...fitnessFormNarrative(allMetrics));
    out.push(...sleepHrvCorrelation(allMetrics, allSleep));
  }

  if (mode === "trend") {
    out.push(...dayOfWeekNarrative(metrics, sleepNights));
    out.push(...weeklyCycleNarrative(metrics));
  }

  if (mode === "progression" || mode === "longevity") {
    out.push(...vo2Trajectory(metrics, allMetrics));
  }

  if (mode === "longevity") {
    out.push(...agingPaceNarrative(allMetrics, profileOverride));
    out.push(...yearOverYearNarrative(allMetrics));
  }

  // Dedupe and sort
  const seen = new Set<string>();
  return out
    .filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; })
    .sort((a, b) => b.priority - a.priority);
}

/* ════════════════════ helpers ════════════════════ */

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function roundRo(n: number, d = 0): string {
  return n.toLocaleString("ro-RO", { maximumFractionDigits: d, minimumFractionDigits: d });
}

/* ══════════════════════════════════════════════════
 *  TIER 1 — SAFETY SIGNALS (priority 90-100)
 * ══════════════════════════════════════════════════ */

function illnessEarlyWarning(metrics: Record<string, DailySummary[]>, sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  if (!rhr || rhr.length < 14 || !hrv || hrv.length < 14) return out;

  const last3 = rhr.slice(-3);
  const baseline = rhr.slice(-30, -3);
  if (baseline.length < 14) return out;

  const rhrBaselineMean = mean(baseline.map(d => d.mean));
  const rhrRecent = mean(last3.map(d => d.mean));
  const rhrDelta = rhrRecent - rhrBaselineMean;

  const hrvBaseline = hrv.slice(-30, -3).filter(d => d.mean >= 5);
  const hrvRecent = hrv.slice(-3).filter(d => d.mean >= 5);
  if (hrvBaseline.length < 10 || hrvRecent.length < 2) return out;
  const hrvBaselineMean = mean(hrvBaseline.map(d => d.mean));
  const hrvRecentMean = mean(hrvRecent.map(d => d.mean));
  const hrvDeltaPct = ((hrvRecentMean - hrvBaselineMean) / hrvBaselineMean) * 100;

  const resp = metrics.respiratoryRate;
  let respElevated = false;
  if (resp && resp.length >= 14) {
    const rBase = mean(resp.slice(-30, -3).map(d => d.mean));
    const rRecent = mean(resp.slice(-3).map(d => d.mean));
    respElevated = rRecent - rBase > 1.5;
  }

  const temp = metrics.wristTemperature;
  let tempElevated = false;
  if (temp && temp.length >= 7) {
    tempElevated = temp.slice(-3).some(d => d.mean > 0.4);
  }

  let alarms = 0;
  const reasons: string[] = [];
  if (rhrDelta > 3) { alarms++; reasons.push(`puls repaus +${rhrDelta.toFixed(0)} bpm fata de baseline`); }
  if (hrvDeltaPct < -15) { alarms++; reasons.push(`HRV ${hrvDeltaPct.toFixed(0)}% sub baseline`); }
  if (respElevated) { alarms++; reasons.push("rata respiratorie crescuta"); }
  if (tempElevated) { alarms++; reasons.push("temperatura de piele elevata"); }

  if (alarms >= 2) {
    out.push({
      id: "illness-early",
      category: "cardio",
      severity: "critical",
      priority: 100,
      title: "Semnal de alerta fiziologica",
      body: `${reasons.join(", ")}. Convergenta a ${alarms} semnale in 3 zile precede frecvent debutul infectios cu 3-5 zile (${cite("radin2020")}). Reduceti efortul cu 50% si dormiti 1-2h in plus.`,
    });
  } else if (alarms === 1) {
    out.push({
      id: "illness-watch",
      category: "cardio",
      severity: "warning",
      priority: 65,
      title: "Semnal fiziologic de monitorizat",
      body: `${reasons[0]}. Un singur semnal nu e diagnostic, dar urmariti evolutia in urmatoarele 48h (${cite("radin2020")}).`,
    });
  }

  return out;
}

function overtrainingDetection(metrics: Record<string, DailySummary[]>, sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  const ex = metrics.exerciseTime;
  if (!rhr || !hrv || rhr.length < 30 || hrv.length < 30) return out;

  // Check 14-day HRV trend + RHR trend
  const hrv14 = hrv.slice(-14).filter(d => d.mean >= 5).map(d => d.mean);
  const rhr14 = rhr.slice(-14).map(d => d.mean);
  if (hrv14.length < 10 || rhr14.length < 10) return out;

  const hrvMk = mannKendall(hrv14);
  const rhrMk = mannKendall(rhr14);
  if (!hrvMk || !rhrMk) return out;

  const hrvDeclining = hrvMk.tau < -0.25;
  const rhrRising = rhrMk.tau > 0.2;
  const highLoad = ex && ex.length >= 14 && mean(ex.slice(-14).map(d => d.sum)) > 45;

  if (hrvDeclining && rhrRising && highLoad) {
    out.push({
      id: "overtraining-alert",
      category: "training",
      severity: "critical",
      priority: 95,
      title: "Pattern de supraantrenament",
      body: `14 zile: HRV ↓ (τ=${hrvMk.tau.toFixed(2)}), RHR ↑ (τ=${rhrMk.tau.toFixed(2)}), volum mediu ${roundRo(mean(ex!.slice(-14).map(d => d.sum)))} min/zi. Tripleta clasica de overreaching functional (${cite("meeusen2013")}). Deload 7-10 zile: volum −50%, intensitate −30% (${cite("halson2014")}).`,
    });
  } else if (hrvDeclining && rhrRising) {
    out.push({
      id: "overtraining-watch",
      category: "training",
      severity: "warning",
      priority: 70,
      title: "HRV ↓ + RHR ↑ simultan pe 14 zile",
      body: `HRV τ=${hrvMk.tau.toFixed(2)}, RHR τ=${rhrMk.tau.toFixed(2)}. Sistem autonom sub presiune — stres, somn insuficient sau volum excesiv. Adaugati 1 zi de odihna completa/saptamana (${cite("meeusen2013")}).`,
    });
  }

  return out;
}

/* ══════════════════════════════════════════════════
 *  TIER 2 — ACTIONABLE (priority 60-80)
 * ══════════════════════════════════════════════════ */

function personalNorms(
  metrics: Record<string, DailySummary[]>,
  profileOverride?: import("../userProfile").UserProfile | null,
): SmartInsight[] {
  const out: SmartInsight[] = [];
  const profile = profileOverride !== undefined ? profileOverride : loadProfile();
  if (!profile) return out;

  const sexRo = profile.sex === "male" ? "barbati" : "femei";

  // VO2 Max — strongest mortality predictor
  if (metrics.vo2Max && metrics.vo2Max.length >= 3) {
    const recent = metrics.vo2Max.slice(-10).filter(d => d.mean > 15);
    if (recent.length >= 3) {
      const v = mean(recent.map(d => d.mean));
      const pct = vo2MaxPercentile(v, profile.age, profile.sex);

      if (pct >= 80) {
        out.push({
          id: "vo2-top-tier",
          category: "cardio",
          severity: "positive",
          priority: 35,
          title: `VO2 Max ${v.toFixed(1)} — percentila ${Math.round(pct)}`,
          body: `Top ${Math.round(100 - pct)}% pentru ${sexRo} ${profile.age} ani (${cite("acsm2021")}). Fiecare +1 MET reduce riscul cardiovascular cu 13% (${cite("kodama2009")}).`,
        });
      } else if (pct < 30) {
        out.push({
          id: "vo2-low",
          category: "cardio",
          severity: "warning",
          priority: 72,
          title: `VO2 Max ${v.toFixed(1)} — percentila ${Math.round(pct)}`,
          body: `Sub media pentru ${sexRo} ${profile.age} ani (${cite("acsm2021")}). Protocol recomandat: 3×/sapt zona 2 (30-45 min) + 1× intervale 4×4 min la 90% HR max. Prima crestere masurabile in 6-8 saptamani.`,
        });
      }
    }
  }

  // RHR
  if (metrics.restingHeartRate && metrics.restingHeartRate.length >= 14) {
    const rhrVal = mean(metrics.restingHeartRate.slice(-14).map(d => d.mean));
    const pct = rhrPercentile(rhrVal, profile.age, profile.sex);
    if (pct >= 85) {
      out.push({
        id: "rhr-elite",
        category: "cardio",
        severity: "positive",
        priority: 25,
        title: `RHR ${Math.round(rhrVal)} bpm — percentila ${Math.round(pct)}`,
        body: `Nivel atletic pentru ${sexRo} ${profile.age} ani. Sub 60 bpm = volum sistolic crescut, tonus parasimpatic puternic. Asociat cu −21% risc cardiovascular vs 70-79 bpm (${cite("nauman2011")}).`,
      });
    }
  }

  // HRV percentile
  if (metrics.hrv && metrics.hrv.length >= 14) {
    const hrvVal = mean(metrics.hrv.slice(-14).filter(d => d.mean >= 5).map(d => d.mean));
    if (hrvVal > 0) {
      const pct = hrvPercentile(hrvVal, profile.age, profile.sex);
      if (pct < 25) {
        out.push({
          id: "hrv-low-pct",
          category: "cardio",
          severity: "warning",
          priority: 60,
          title: `HRV ${roundRo(hrvVal)} ms — percentila ${Math.round(pct)}`,
          body: `Sfertul inferior pentru ${sexRo} ${profile.age} ani (${cite("nunan2010")}). Interventii cu impact maxim: bedtime constant ±30 min, reducere alcool seara, zona 2 aerob. Raspuns HRV in 8-12 saptamani (${cite("buchheit2014")}).`,
        });
      }
    }
  }

  return out;
}

function sleepDebtNarrative(allSleep: SleepNight[], periodSleep: SleepNight[], metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  if (allSleep.length < 7) return out;

  const last14 = allSleep.slice(-14);
  if (last14.length < 7) return out;

  const durations = last14.map(n => n.totalMinutes / 60);
  const avg = mean(durations);

  // Cross-metric: compute HRV on low-sleep vs high-sleep nights
  let crossMetricNote = "";
  const hrv = metrics.hrv;
  if (hrv && hrv.length >= 14 && allSleep.length >= 14) {
    const hrvByDate: Record<string, number> = {};
    for (const d of hrv) if (d.mean >= 5) hrvByDate[d.date] = d.mean;

    const lowSleepHrv: number[] = [];
    const highSleepHrv: number[] = [];
    for (const n of allSleep.slice(-60)) {
      const nextDate = nextDay(n.date);
      if (!hrvByDate[nextDate]) continue;
      if (n.totalMinutes / 60 < 6.5) lowSleepHrv.push(hrvByDate[nextDate]);
      else if (n.totalMinutes / 60 >= 7) highSleepHrv.push(hrvByDate[nextDate]);
    }
    if (lowSleepHrv.length >= 3 && highSleepHrv.length >= 3) {
      const lowAvg = mean(lowSleepHrv);
      const highAvg = mean(highSleepHrv);
      const pctDiff = ((lowAvg - highAvg) / highAvg) * 100;
      if (pctDiff < -5) {
        crossMetricNote = ` HRV −${Math.abs(pctDiff).toFixed(0)}% dupa nopti <6.5h vs >7h pe datele tale.`;
      }
    }
  }

  if (avg < 6.5) {
    out.push({
      id: "sleep-chronic-deficit",
      category: "sleep",
      severity: "warning",
      priority: 75,
      title: `Somn ${avg.toFixed(1)}h/noapte — deficit cronic`,
      body: `Media 14 nopti: ${avg.toFixed(1)}h, cu ${(7.5 - avg).toFixed(1)}h sub zona optima 7-9h (${cite("nsf2015")}). 14 zile la 6h/noapte = performanta cognitiva echivalenta cu 2 nopti fara somn, fara constientizare subiectiva (${cite("vanDongen2003")}).${crossMetricNote}`,
    });
  } else if (avg >= 7.5 && avg <= 8.5) {
    out.push({
      id: "sleep-optimal",
      category: "sleep",
      severity: "positive",
      priority: 12,
      title: `Somn ${avg.toFixed(1)}h — zona optima`,
      body: `In intervalul 7-9h recomandat (${cite("nsf2015")}). Mentineti si consistenta bedtime-ului — variatie >60 min creste riscul cardiovascular independent de durata (${cite("wittmann2006")}).`,
    });
  }

  return out;
}

/* ══════════════════════════════════════════════════
 *  TIER 2-3 — TREND & CONTEXTUAL (priority 30-60)
 * ══════════════════════════════════════════════════ */

function trendNarrative(metrics: Record<string, DailySummary[]>, sleep: SleepNight[], windowDays: number): SmartInsight[] {
  const out: SmartInsight[] = [];
  const checks: { key: string; label: string; higherBetter: boolean; unit: string }[] = [
    { key: "restingHeartRate", label: "pulsul de repaus", higherBetter: false, unit: "bpm" },
    { key: "hrv", label: "HRV-ul", higherBetter: true, unit: "ms" },
    { key: "stepCount", label: "numarul de pasi", higherBetter: true, unit: "" },
  ];

  for (const c of checks) {
    const d = metrics[c.key];
    if (!d || d.length < 14) continue;
    const vals = d.map(x => c.key === "stepCount" ? x.sum : x.mean).filter(v => v > 0);
    if (vals.length < 14) continue;
    const mk = mannKendall(vals);
    if (!mk || !mk.significant || Math.abs(mk.tau) < 0.15) continue;

    const improving = (mk.tau > 0) === c.higherBetter;
    const slopeMonth = mk.sensSlope * 30;
    const first = vals[0];
    const last = vals[vals.length - 1];
    const delta = last - first;

    if (c.key === "restingHeartRate" && improving) {
      out.push({
        id: `trend-rhr-improving`,
        category: "cardio",
        severity: "positive",
        priority: 40,
        title: `RHR ↓ ${Math.round(first)} → ${Math.round(last)} bpm`,
        body: `−${Math.abs(delta).toFixed(0)} bpm (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}), rata ${slopeMonth.toFixed(1)} bpm/luna. Adaptare aeroba sau somn imbunatatit. −5 bpm = −12% risc cardiovascular (${cite("nauman2011")}).`,
      });
    } else if (c.key === "restingHeartRate" && !improving) {
      out.push({
        id: `trend-rhr-rising`,
        category: "cardio",
        severity: "warning",
        priority: 55,
        title: `RHR ↑ ${Math.round(first)} → ${Math.round(last)} bpm`,
        body: `+${delta.toFixed(0)} bpm (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). Cauze: stres, deficit somn, deshidratare, volum fara recuperare. Daca persista >2 sapt, prioritizati odihna (${cite("palatini2006")}).`,
      });
    } else if (c.key === "hrv") {
      out.push({
        id: `trend-hrv-${improving ? "up" : "down"}`,
        category: "cardio",
        severity: improving ? "positive" : "warning",
        priority: improving ? 35 : 60,
        title: `HRV ${improving ? "↑" : "↓"} ${roundRo(first)} → ${roundRo(last)} ms`,
        body: improving
          ? `Tendinta semnificativa (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). Adaptare parasimpatica — recuperare autonoma mai eficienta. Tipic: zona 2, somn imbunatatit, stres redus (${cite("buchheit2014")}).`
          : `Tendinta semnificativa (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). Dominanta simpatica — stres, somn insuficient, alcool sau supraantrenament. CV >10% pe 7 zile = marker mai puternic de overreaching (${cite("plews2013")}).`,
      });
    } else if (c.key === "stepCount") {
      out.push({
        id: `trend-steps-${improving ? "up" : "down"}`,
        category: "activity",
        severity: improving ? "positive" : "info",
        priority: improving ? 20 : 30,
        title: `Pasi ${improving ? "↑" : "↓"} ${roundRo(first, 0)} → ${roundRo(last, 0)}/zi`,
        body: improving
          ? `Trend pozitiv (τ=${mk.tau.toFixed(2)}). Beneficiu maxim pe mortalitate: 4,000-8,000 pasi/zi, platou dupa 10,000 (${cite("paluch2022")}).`
          : `Trend negativ (τ=${mk.tau.toFixed(2)}). Sub 5,000/zi = risc metabolic crescut. 15 min mers dupa pranz = +1,500 pasi + insulino-sensibilitate (${cite("paluch2022")}).`,
      });
    }
  }
  return out;
}

function fitnessFormNarrative(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const source = metrics.activeEnergy || metrics.exerciseTime;
  if (!source || source.length < 30) return out;
  const loads = source.map(d => (metrics.activeEnergy ? d.sum / 40 : d.sum * 5 / 40));
  const bn = banister(loads);
  const last = bn[bn.length - 1];
  const state = formState(last.form, last.fitness);

  if (state.tone === "overreaching") {
    out.push({
      id: "banister-overreach",
      category: "training",
      severity: "critical",
      priority: 88,
      title: "Forma negativa — oboseala > fitness",
      body: `Form=${last.form.toFixed(0)} (fitness ${last.fitness.toFixed(0)}, fatigue ${last.fatigue.toFixed(0)}). Acumulare oboseala peste capacitate de recuperare (${cite("banister1975")}). Deload 7-10 zile: −50% volum, −30% intensitate. Supercompensare la 10-14 zile.`,
    });
  } else if (state.tone === "rested") {
    out.push({
      id: "banister-peak",
      category: "training",
      severity: "positive",
      priority: 30,
      title: "Forma de varf — fereastra de performanta",
      body: `Form=+${last.form.toFixed(0)}, fitness ${last.fitness.toFixed(0)}. Fereastra optima pentru competitie/testare, durata tipica 7-14 zile (${cite("banister1975")}).`,
    });
  }

  return out;
}

function sleepHrvCorrelation(metrics: Record<string, DailySummary[]>, sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  const hrv = metrics.hrv;
  if (!hrv || hrv.length < 30 || sleep.length < 30) return out;

  const hrvByDate: Record<string, number> = {};
  for (const d of hrv) if (d.mean >= 5) hrvByDate[d.date] = d.mean;

  const pairs: [number, number][] = [];
  for (const n of sleep.slice(-90)) {
    const nd = nextDay(n.date);
    if (hrvByDate[nd] && n.totalMinutes > 0) {
      pairs.push([n.totalMinutes / 60, hrvByDate[nd]]);
    }
  }
  if (pairs.length < 15) return out;

  const xs = pairs.map(p => p[0]);
  const ys = pairs.map(p => p[1]);
  const r = pearsonR(xs, ys);

  if (Math.abs(r) > 0.3) {
    const direction = r > 0 ? "creste" : "scade";
    out.push({
      id: "sleep-hrv-corr",
      category: "sleep",
      severity: "info",
      priority: 35,
      title: `Somn → HRV: r=${r.toFixed(2)}`,
      body: `Corelatie Pearson pe ${pairs.length} perechi (90 zile). +1h somn ≈ ${r > 0 ? "+" : ""}${Math.round((r * std(ys)) / std(xs))} ms HRV a doua zi. Somnul ramane parghia #1 pentru recuperare autonoma (${cite("walker2017")}).`,
    });
  }

  return out;
}

function volatilityNarrative(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const hrv = metrics.hrv;
  if (!hrv || hrv.length < 7) return out;
  const vals = hrv.map(d => d.mean).filter(v => v >= 5);
  if (vals.length < 7) return out;
  const cv = coefficientOfVariation(vals) * 100;

  if (cv > 20) {
    out.push({
      id: "hrv-unstable",
      category: "cardio",
      severity: "warning",
      priority: 50,
      title: `HRV instabil — CV ${cv.toFixed(0)}%`,
      body: `Peste pragul de 14%. Variabilitate zi-de-zi ridicata = marker de overreaching mai puternic decat media absoluta (${cite("plews2013")}). Stabilizati bedtime ±30 min, 7 zile.`,
    });
  } else if (cv < 5) {
    out.push({
      id: "hrv-very-stable",
      category: "cardio",
      severity: "positive",
      priority: 15,
      title: `HRV stabil — CV ${cv.toFixed(1)}%`,
      body: `Variabilitate zilnica sub 5%. Echilibru autonom excelent: somn regulat, stres controlat.`,
    });
  }
  return out;
}

/* ══════════════════════════════════════════════════
 *  TIER 3 — CONTEXTUAL (priority 15-35)
 * ══════════════════════════════════════════════════ */

function dayOfWeekNarrative(metrics: Record<string, DailySummary[]>, sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  const hrv = metrics.hrv;
  if (!hrv || hrv.length < 21) return out;

  const vals = hrv.map(d => d.mean);
  const dow = hrv.map(d => new Date(d.date + "T00:00:00").getDay());
  const dowData = dayOfWeekSeasonality(vals, dow);
  const worst = dowData.filter(x => x.deviation < 0).sort((a, b) => a.deviation - b.deviation)[0];
  const best = dowData.filter(x => x.deviation > 0).sort((a, b) => b.deviation - a.deviation)[0];

  if (worst && best && Math.abs(worst.deviation) + Math.abs(best.deviation) > 5) {
    const days = ["duminica", "luni", "marti", "miercuri", "joi", "vineri", "sambata"];
    out.push({
      id: "dow-hrv",
      category: "cardio",
      severity: "info",
      priority: 22,
      title: `Tipar saptamanal HRV`,
      body: `Maxim: ${days[best.dow]} (+${best.deviation.toFixed(0)} ms), minim: ${days[worst.dow]} (${worst.deviation.toFixed(0)} ms). Diferenta de ${Math.abs(best.deviation - worst.deviation).toFixed(0)} ms — factor recurent (antrenament, stres profesional, program social).`,
    });
  }
  return out;
}

function weeklyCycleNarrative(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const d = metrics.stepCount;
  if (!d || d.length < 21) return out;
  const cycle = detectWeeklyCycle(d.map(x => x.sum));
  if (cycle.hasCycle && cycle.strength > 0.4) {
    out.push({
      id: "weekly-cycle",
      category: "activity",
      severity: "info",
      priority: 15,
      title: "Ciclu saptamanal detectat",
      body: `Autocorelatia lag-7: ${(cycle.strength * 100).toFixed(0)}%. Zile active/odihna se repeta consistent — program structurat.`,
    });
  }
  return out;
}

/* ══════════════════════════════════════════════════
 *  TIER 2-3 — LONGEVITY (priority 30-55)
 * ══════════════════════════════════════════════════ */

function vo2Trajectory(metrics: Record<string, DailySummary[]>, allMetrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const vo2 = metrics.vo2Max || allMetrics.vo2Max;
  if (!vo2 || vo2.length < 10) return out;

  const valid = vo2.filter(d => d.mean > 15).map(d => d.mean);
  if (valid.length < 10) return out;

  const mk = mannKendall(valid);
  if (!mk || !mk.significant || Math.abs(mk.tau) < 0.2) return out;

  const change = valid[valid.length - 1] - valid[0];

  if (mk.tau > 0) {
    out.push({
      id: "vo2-improving",
      category: "cardio",
      severity: "positive",
      priority: 42,
      title: `VO2 Max ↑ +${change.toFixed(1)} mL/kg/min`,
      body: `Trend ascendent semnificativ. +1 MET (3.5 mL/kg/min) = −13% mortalitate cardiovasculara (${cite("kodama2009")}).`,
    });
  } else {
    out.push({
      id: "vo2-declining",
      category: "cardio",
      severity: "warning",
      priority: 55,
      title: `VO2 Max ↓ ${change.toFixed(1)} mL/kg/min`,
      body: `Declin natural: ~1 mL/kg/min/an dupa 25 ani. Peste acest ritm = deconditonare, nu imbatranire. Zona 2 aerob 3×/sapt + 1× intervale, raspuns in 6-8 sapt (${cite("acsm2021")}).`,
    });
  }
  return out;
}

function agingPaceNarrative(metrics: Record<string, DailySummary[]>, profileOverride?: import("../userProfile").UserProfile | null): SmartInsight[] {
  const out: SmartInsight[] = [];
  const hrv = metrics.hrv;
  if (!hrv || hrv.length < 180) return out;

  const valid = hrv.filter(d => d.mean >= 5).slice(-365);
  if (valid.length < 180) return out;

  const smoothed = smoothCMA(valid.map(d => Math.log(d.mean)), 14);
  const mk = mannKendall(smoothed);
  if (!mk || !mk.significant || Math.abs(mk.tau) < 0.15) return out;

  if (mk.tau > 0) {
    out.push({
      id: "aging-pace-slower",
      category: "cardio",
      severity: "positive",
      priority: 40,
      title: "Ritm de imbatranire autonoma incetinit",
      body: `HRV ↑ pe termen lung (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). Normal: −0.5 ms/an dupa 25 ani (${cite("umetani1998")}). Directie opusa = adaptare autonoma pozitiva.`,
    });
  } else {
    out.push({
      id: "aging-pace-faster",
      category: "cardio",
      severity: "warning",
      priority: 60,
      title: "Ritm de imbatranire autonoma accelerat",
      body: `HRV ↓ pe termen lung (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}), peste ritmul natural de −0.5 ms/an (${cite("umetani1998")}). Prioritati: somn (ROI maxim pe HRV) + zona 2 aerob.`,
    });
  }
  return out;
}

function yearOverYearNarrative(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const vo2 = metrics.vo2Max;
  if (!vo2 || vo2.length < 60) return out;

  const sorted = [...vo2].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-30).map(d => d.mean);
  const oneYearAgo = sorted.slice(Math.max(0, sorted.length - 395), sorted.length - 365).map(d => d.mean);
  if (oneYearAgo.length < 3 || recent.length < 3) return out;

  const r = mean(recent);
  const p = mean(oneYearAgo);
  const delta = r - p;
  if (Math.abs(delta) < 1) return out;

  out.push({
    id: "vo2-yoy",
    category: "cardio",
    severity: delta > 0 ? "positive" : "warning",
    priority: delta > 0 ? 35 : 50,
    title: `VO2 Max ${delta > 0 ? "+" : ""}${delta.toFixed(1)} fata de acum 1 an`,
    body: delta > 0
      ? `${p.toFixed(1)} → ${r.toFixed(1)} mL/kg/min. +${delta.toFixed(1)} = imbunatatire reala a capacitatii aerobe (${cite("kodama2009")}).`
      : `${p.toFixed(1)} → ${r.toFixed(1)} mL/kg/min. ${Math.abs(delta) > 2 ? "Peste ritmul natural de −1/an = deconditonare activa." : "In ritmul normal de imbatranire."} (${cite("acsm2021")})`,
  });
  return out;
}

/* ════════════════════ utility ════════════════════ */

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().substring(0, 10);
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 5) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den > 0 ? num / den : 0;
}
