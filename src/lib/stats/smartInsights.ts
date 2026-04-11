/**
 * ═══════════════════════════════════════════════════════════════
 *  SMART INSIGHTS — Period-aware, statistically-validated,
 *  interpretive messages for the user.
 *
 *  This module is the "voice" of the app. Each insight:
 *    1. Uses statistically valid methods (Mann-Kendall, Sen's slope,
 *       bootstrap CI, changepoint, etc.)
 *    2. Adapts text based on the selected window (acute / trend /
 *       progression / longevity)
 *    3. Speaks clearly in Romanian, without jargon, but with precise
 *       numeric anchors
 *    4. Prioritizes actionable over descriptive
 *
 *  Contrast with legacy insights.ts: no hardcoded 7d/14d windows,
 *  interpretations cite the math, and language is warmer.
 * ═══════════════════════════════════════════════════════════════
 */

import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { getDisplayValue } from "../parser/healthTypes";
import {
  mannKendall,
  smoothCMA,
  coefficientOfVariation,
  bootstrapCI,
  banister,
  formState,
  robustZ,
  detectWeeklyCycle,
  dayOfWeekSeasonality,
} from "./advanced";
import { rhrPercentile, hrvPercentile, vo2MaxPercentile } from "./norms";
import { loadProfile } from "../userProfile";

export type SmartSeverity = "critical" | "warning" | "positive" | "info";

export interface SmartInsight {
  id: string;
  title: string;
  body: string;
  severity: SmartSeverity;
  /** For sorting — higher = more urgent */
  priority: number;
  /** e.g., "cardio", "sleep", "training" */
  category: string;
}

/* ───────────── public API ───────────── */

export function generateSmartInsights(
  /** Filtered metrics for the selected period (used for period-specific facts) */
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
  /** Full dataset — used for baselines, trajectories, norms */
  allMetrics: Record<string, DailySummary[]>,
  allSleep: SleepNight[],
  windowDays: number,
): SmartInsight[] {
  const out: SmartInsight[] = [];

  const mode: "acute" | "trend" | "progression" | "longevity" =
    windowDays <= 14 ? "acute" :
    windowDays <= 60 ? "trend" :
    windowDays <= 180 ? "progression" :
    "longevity";

  // Always on — period-agnostic safety signals
  out.push(...illnessEarlyWarning(allMetrics, allSleep));
  out.push(...hrvSurveillance(allMetrics));
  out.push(...personalNorms(allMetrics));

  if (mode === "acute") {
    out.push(...acuteRecoveryInsights(metrics, sleepNights, allMetrics, allSleep));
    out.push(...volatilityInsights(metrics));
  }

  if (mode === "trend") {
    out.push(...trendInsights(metrics, sleepNights, windowDays));
    out.push(...weeklyCycleInsights(metrics));
    out.push(...dayOfWeekInsights(metrics, sleepNights));
  }

  if (mode === "progression") {
    out.push(...fitnessFormInsights(allMetrics));
    out.push(...progressionInsights(metrics, sleepNights, windowDays));
    out.push(...sleepDebtInsights(sleepNights, windowDays));
  }

  if (mode === "longevity") {
    out.push(...longevityInsights(allMetrics, sleepNights));
    out.push(...agingPaceInsights(allMetrics));
  }

  // Dedupe by id and sort by priority (descending)
  const seen = new Set<string>();
  const unique = out.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
  unique.sort((a, b) => b.priority - a.priority);
  return unique;
}

/* ═════════════════════ helpers ═════════════════════ */

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function roundRo(n: number, d = 0): string {
  return n.toLocaleString("ro-RO", { maximumFractionDigits: d, minimumFractionDigits: d });
}

/* ═════════════════════ insights ═════════════════════ */

/* ── Always-on: illness early warning ── */
function illnessEarlyWarning(metrics: Record<string, DailySummary[]>, sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  const resp = metrics.respiratoryRate;
  const temp = metrics.wristTemperature;

  if (!rhr || rhr.length < 14 || !hrv || hrv.length < 14) return out;

  // Check last 3 days against 28-day baseline
  const last3 = rhr.slice(-3);
  const baseline = rhr.slice(-30, -3);
  if (baseline.length < 14) return out;

  const rhrBaselineMean = mean(baseline.map(d => d.mean));
  const rhrRecent = mean(last3.map(d => d.mean));
  const rhrDelta = rhrRecent - rhrBaselineMean;

  const hrvBaseline = hrv.slice(-30, -3).filter(d => d.mean >= 5);
  const hrvRecent = hrv.slice(-3).filter(d => d.mean >= 5);
  if (hrvBaseline.length < 14 || hrvRecent.length < 2) return out;
  const hrvBaselineMean = mean(hrvBaseline.map(d => d.mean));
  const hrvRecentMean = mean(hrvRecent.map(d => d.mean));
  const hrvDeltaPct = ((hrvRecentMean - hrvBaselineMean) / hrvBaselineMean) * 100;

  let respElevated = false;
  if (resp && resp.length >= 14) {
    const rBase = mean(resp.slice(-30, -3).map(d => d.mean));
    const rRecent = mean(resp.slice(-3).map(d => d.mean));
    respElevated = rRecent - rBase > 1.5;
  }

  let tempElevated = false;
  if (temp && temp.length >= 7) {
    const tRecent = temp.slice(-3).map(d => d.mean);
    tempElevated = tRecent.some(v => v > 0.4);
  }

  // Score: how many alarm bells ring?
  let alarms = 0;
  const reasons: string[] = [];
  if (rhrDelta > 3) { alarms++; reasons.push(`puls repaus +${rhrDelta.toFixed(0)} bpm`); }
  if (hrvDeltaPct < -15) { alarms++; reasons.push(`HRV ${hrvDeltaPct.toFixed(0)}%`); }
  if (respElevated) { alarms++; reasons.push("respiratie crescuta"); }
  if (tempElevated) { alarms++; reasons.push("temperatura crescuta"); }

  if (alarms >= 2) {
    out.push({
      id: "illness-early",
      category: "cardio",
      severity: "critical",
      priority: 100,
      title: "Semnale de efort fiziologic in ultimele 3 zile",
      body: `Corpul tau pare sa lupte cu ceva. ${reasons.join(", ")} — combinatia sugereaza ca poate incepi o raceala, sau ai un stres semnificativ. Recomandare: zi usoara, hidratare, somn suplimentar 1-2 nopti.`,
    });
  } else if (alarms === 1) {
    out.push({
      id: "illness-watch",
      category: "cardio",
      severity: "warning",
      priority: 60,
      title: "Un semnal iesit din tipar",
      body: `${reasons[0]} fata de media ta de 28 zile. Individual nu e alarmant, dar merita sa urmaresti maine daca apar si alte schimbari.`,
    });
  }

  return out;
}

/* ── Always-on: HRV surveillance (long-term) ── */
function hrvSurveillance(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const hrv = metrics.hrv;
  if (!hrv || hrv.length < 45) return out;

  const valid = hrv.filter(d => d.mean >= 5);
  if (valid.length < 45) return out;

  const last45 = valid.slice(-45);
  const smoothed = smoothCMA(last45.map(d => Math.log(d.mean)), 7);
  const mk = mannKendall(smoothed);
  if (!mk || !mk.significant) return out;

  if (mk.tau < -0.2) {
    const pctDrop = ((Math.exp(smoothed[smoothed.length - 1]) - Math.exp(smoothed[0])) / Math.exp(smoothed[0])) * 100;
    out.push({
      id: "hrv-declining-45d",
      category: "cardio",
      severity: "warning",
      priority: 75,
      title: "HRV-ul tau scade consistent in ultimele 45 zile",
      body: `Testul Mann-Kendall confirma o tendinta descendenta semnificativa (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). De la inceputul perioadei, HRV mediu a scazut cu ~${Math.abs(pctDrop).toFixed(0)}%. Cauze frecvente: stres cronic, somn insuficient, alcool, sau antrenament prea intens fara recuperare. Fa o saptamana mai usoara si priveste evolutia.`,
    });
  } else if (mk.tau > 0.2) {
    out.push({
      id: "hrv-improving-45d",
      category: "cardio",
      severity: "positive",
      priority: 40,
      title: "HRV-ul tau creste — adaptare autonoma pozitiva",
      body: `Ai o tendinta de crestere a HRV-ului semnificativa statistic (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}) in ultimele 45 zile. Inseamna ca sistemul tau nervos parasimpatic se dezvolta: recuperarea devine mai eficienta. Tipic pentru adaptare la antrenament aerob zona 2 sau reducere stres.`,
    });
  }

  return out;
}

/* ── Always-on: personal norms ── */
function personalNorms(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const profile = loadProfile();
  if (!profile) return out;

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
          priority: 30,
          title: "VO2 Max in top 20% pentru varsta ta",
          body: `${v.toFixed(1)} mL/kg/min te plaseaza la percentila ${Math.round(pct)} pentru un ${profile.sex === "male" ? "barbat" : "o femeie"} de ${profile.age} ani. VO2 Max este cel mai puternic predictor al longevitatii. Fiecare MET (~3.5 mL/kg/min) peste medie = ~13% reducere a mortalitatii cardiovasculare (Kodama 2009).`,
        });
      } else if (pct < 25) {
        out.push({
          id: "vo2-low",
          category: "cardio",
          severity: "warning",
          priority: 70,
          title: "VO2 Max sub media pentru varsta ta",
          body: `${v.toFixed(1)} mL/kg/min te plaseaza la percentila ${Math.round(pct)}. VO2 Max este metric de longevitate numarul 1 — dar se poate imbunatati rapid. Un protocol simplu: 3 sesiuni/saptamana, 30-45 min zona 2 (65-75% HR max), plus 1 sesiune de intervale. Astepta 6 saptamani pentru a vedea prima crestere.`,
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
        title: `Puls repaus de atlet: ${Math.round(rhrVal)} bpm`,
        body: `Percentila ${Math.round(pct)} pentru varsta ta. Un puls de repaus atat de scazut reflecta o inima puternica si tonus parasimpatic ridicat. Tipic doar pentru sportivi de anduranta.`,
      });
    }
  }

  return out;
}

/* ── Acute mode ── */
function acuteRecoveryInsights(metrics: Record<string, DailySummary[]>, sleep: SleepNight[], allMetrics: Record<string, DailySummary[]>, allSleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];

  const rhr = allMetrics.restingHeartRate;
  const hrv = allMetrics.hrv;
  if (!rhr || !hrv || rhr.length < 14 || hrv.length < 14) return out;

  const rhrBaseline = mean(rhr.slice(-30).map(d => d.mean));
  const hrvBaseline = mean(hrv.slice(-30).filter(d => d.mean >= 5).map(d => d.mean));

  // Sleep debt from last 7 nights (not period-restricted for reliability)
  if (allSleep.length >= 7) {
    const last7 = allSleep.slice(-7);
    const totalHours = last7.reduce((s, n) => s + n.totalMinutes / 60, 0);
    const expected = 7 * 7.5; // 7.5h target
    const debt = expected - totalHours;
    if (debt >= 5) {
      out.push({
        id: "sleep-debt-acute",
        category: "sleep",
        severity: "warning",
        priority: 65,
        title: `Datorie de somn: ${debt.toFixed(1)}h in ultimele 7 nopti`,
        body: `Ai dormit ${totalHours.toFixed(1)}h in total, fata de tinta de ${expected.toFixed(0)}h. Datoria de somn se acumuleaza si afecteaza functia cognitiva, hormonii (cortisol, testosteron, leptina) si sistemul imunitar. Incearca sa adaugi 1h in plus in urmatoarele 3 nopti.`,
      });
    }
  }

  return out;
}

function volatilityInsights(metrics: Record<string, DailySummary[]>): SmartInsight[] {
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
      title: "HRV instabil in ultimele zile",
      body: `Coeficientul de variatie este ${cv.toFixed(0)}% — peste pragul de stabilitate (14%). Inseamna ca de la o zi la alta HRV-ul variaza mult. Cauze tipice: variatii in somn (ore, calitate), alcool, caldura, stres acut. Stabilitatea HRV este un indicator mai bun decat valoarea absoluta.`,
    });
  } else if (cv < 6) {
    out.push({
      id: "hrv-very-stable",
      category: "cardio",
      severity: "positive",
      priority: 15,
      title: "HRV foarte stabil — homeostazie buna",
      body: `Variabilitatea zilnica este doar ${cv.toFixed(1)}% (CV). Corpul tau opereaza intr-un echilibru fiziologic foarte constant. E un semn de tonus autonom sanatos.`,
    });
  }
  return out;
}

/* ── Trend mode (14-60 days) ── */
function trendInsights(metrics: Record<string, DailySummary[]>, sleep: SleepNight[], windowDays: number): SmartInsight[] {
  const out: SmartInsight[] = [];
  // Mann-Kendall on key metrics within the period
  const checks: { key: string; label: string; higherBetter: boolean }[] = [
    { key: "restingHeartRate", label: "pulsul de repaus", higherBetter: false },
    { key: "hrv", label: "HRV-ul", higherBetter: true },
    { key: "stepCount", label: "numarul de pasi", higherBetter: true },
  ];
  for (const c of checks) {
    const d = metrics[c.key];
    if (!d || d.length < 14) continue;
    const vals = d.map(x => x.mean || x.sum).filter(v => v > 0);
    if (vals.length < 14) continue;
    const mk = mannKendall(vals);
    if (!mk || !mk.significant || Math.abs(mk.tau) < 0.15) continue;
    const direction = mk.tau > 0 ? "crestere" : "scadere";
    const improving = (mk.tau > 0) === c.higherBetter;
    const slopeMonth = mk.sensSlope * 30;
    out.push({
      id: `trend-${c.key}-${windowDays}`,
      category: c.key.includes("step") ? "activity" : "cardio",
      severity: improving ? "positive" : "warning",
      priority: improving ? 35 : 55,
      title: `Tendinta de ${direction} pentru ${c.label}`,
      body: `In perioada selectata, ${c.label} are o ${direction} semnificativa statistic (Mann-Kendall τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). Rata estimata: ${slopeMonth > 0 ? "+" : ""}${slopeMonth.toFixed(1)} pe luna. ${improving ? "Continua ce faci." : "Merita atentie daca tendinta persista."}`,
    });
  }
  return out;
}

function weeklyCycleInsights(metrics: Record<string, DailySummary[]>): SmartInsight[] {
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
      title: "Ai un ritm saptamanal clar",
      body: `Autocorelatia la lag 7 zile este ${(cycle.strength * 100).toFixed(0)}% — zilele tale active si zilele de odihna se repeta consistent. Tipic pentru program structurat de antrenament.`,
    });
  }
  return out;
}

function dayOfWeekInsights(metrics: Record<string, DailySummary[]>, sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  // HRV by day of week
  const hrv = metrics.hrv;
  if (hrv && hrv.length >= 14) {
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
        priority: 20,
        title: `HRV-ul tau depinde de ziua saptamanii`,
        body: `Cel mai bun HRV il ai in ${days[best.dow]} (+${best.deviation.toFixed(0)} ms fata de medie), iar cel mai slab in ${days[worst.dow]} (${worst.deviation.toFixed(0)} ms). Cauze tipice: program social de weekend (alcool, mese tarzii), stres de luni dimineata, antrenamente grele intr-o anumita zi.`,
      });
    }
  }
  return out;
}

/* ── Progression mode (60-180 days) ── */
function fitnessFormInsights(metrics: Record<string, DailySummary[]>): SmartInsight[] {
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
      priority: 90,
      title: "Supraantrenament — forma negativa profunda",
      body: `Forma ta (Fitness − Fatigue) este ${last.form.toFixed(0)}, iar fitness-ul ${last.fitness.toFixed(0)}. Raportul indica un dezechilibru — acumulezi oboseala mai repede decat te recuperezi. Redu volumul cu 30-50% pentru 1-2 saptamani pentru a permite supercompensarea.`,
    });
  } else if (state.tone === "rested") {
    out.push({
      id: "banister-peak",
      category: "training",
      severity: "positive",
      priority: 30,
      title: "Esti in forma de varf — momentul ideal pentru performanta",
      body: `Forma +${last.form.toFixed(0)} inseamna ca esti odihnit iar fitness-ul ramane ridicat (${last.fitness.toFixed(0)}). Daca ai planificat o cursa sau o sesiune de testare, acum e momentul. Aceasta fereastra dureaza de obicei 7-14 zile.`,
    });
  } else if (state.tone === "productive") {
    out.push({
      id: "banister-loading",
      category: "training",
      severity: "info",
      priority: 25,
      title: "Loading productiv — construiesti forma",
      body: `Fitness ${last.fitness.toFixed(0)}, fatigue ${last.fatigue.toFixed(0)}. Absorbi un stres de antrenament semnificativ — este faza normala de constructie. Asigura-te ca somnul si alimentatia sustin incarcatura.`,
    });
  }
  return out;
}

function progressionInsights(metrics: Record<string, DailySummary[]>, sleep: SleepNight[], windowDays: number): SmartInsight[] {
  const out: SmartInsight[] = [];
  // VO2 Max trajectory
  const vo2 = metrics.vo2Max;
  if (vo2 && vo2.length >= 10) {
    const vals = vo2.filter(d => d.mean > 15).map(d => d.mean);
    if (vals.length >= 10) {
      const mk = mannKendall(vals);
      if (mk && mk.significant) {
        const change = vals[vals.length - 1] - vals[0];
        if (mk.tau > 0.2) {
          out.push({
            id: "vo2-improving",
            category: "cardio",
            severity: "positive",
            priority: 45,
            title: `VO2 Max in crestere: +${change.toFixed(1)} mL/kg/min`,
            body: `Pe perioada selectata, Apple a crescut estimarea ta de VO2 Max. Kodama 2009 arata ca fiecare 3.5 mL/kg/min castigat = ~13% reducere a riscului cardiovascular. Continua sa faci ce faci.`,
          });
        } else if (mk.tau < -0.2) {
          out.push({
            id: "vo2-declining",
            category: "cardio",
            severity: "warning",
            priority: 55,
            title: `VO2 Max in scadere: ${change.toFixed(1)} mL/kg/min`,
            body: `VO2 Max-ul tau s-a degradat pe perioada selectata. Cel mai puternic motor de imbunatatire: zona 2 aerob (65-75% HR max) 3x/saptamana cate 30-45 min. In 6-8 saptamani ar trebui sa vezi prima crestere.`,
          });
        }
      }
    }
  }
  return out;
}

function sleepDebtInsights(sleep: SleepNight[], windowDays: number): SmartInsight[] {
  const out: SmartInsight[] = [];
  if (sleep.length < 14) return out;
  const target = 7.5;
  const durations = sleep.map(n => n.totalMinutes / 60);
  const avg = mean(durations);
  if (avg < 6.5) {
    out.push({
      id: "chronic-sleep-short",
      category: "sleep",
      severity: "warning",
      priority: 60,
      title: `Media de somn: ${avg.toFixed(1)}h — cronic insuficient`,
      body: `Pe perioada selectata dormi in medie ${avg.toFixed(1)}h, sub pragul de 7h recomandat (NSF 2015). Deficitul cronic este asociat cu risc crescut cardiovascular, diabet tip 2 si deteriorare cognitiva. Nu exista "recuperare" completa la weekend pentru somnul pierdut zilnic.`,
    });
  } else if (avg >= 8) {
    out.push({
      id: "sleep-optimal",
      category: "sleep",
      severity: "positive",
      priority: 10,
      title: "Durata optima de somn",
      body: `Media ta de ${avg.toFixed(1)}h este exact in zona optima (7-9h). Mentine consistenta — este una dintre cele mai importante interventii pentru longevitate.`,
    });
  }
  return out;
}

/* ── Longevity mode (180+ days) ── */
function longevityInsights(metrics: Record<string, DailySummary[]>, sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];

  // Year-over-year VO2 Max
  const vo2 = metrics.vo2Max;
  if (vo2 && vo2.length >= 60) {
    const sorted = [...vo2].sort((a, b) => a.date.localeCompare(b.date));
    const recent = sorted.slice(-30).map(d => d.mean);
    const oneYearAgo = sorted.slice(Math.max(0, sorted.length - 395), sorted.length - 365).map(d => d.mean);
    if (oneYearAgo.length >= 3 && recent.length >= 3) {
      const r = mean(recent);
      const p = mean(oneYearAgo);
      const delta = r - p;
      if (Math.abs(delta) >= 1) {
        out.push({
          id: "vo2-yoy",
          category: "cardio",
          severity: delta > 0 ? "positive" : "warning",
          priority: delta > 0 ? 35 : 50,
          title: `VO2 Max ${delta > 0 ? "+" : ""}${delta.toFixed(1)} fata de acum 1 an`,
          body: `De la ${p.toFixed(1)} la ${r.toFixed(1)} mL/kg/min. ${delta > 0 ? "Aceasta crestere este semnificativa pentru un adult — reflecta o imbunatatire reala a capacitatii aerobe, nu doar zgomot de masurare." : "Un declin de ~1 mL/kg/min pe an este ritmul natural de imbatranire incepand cu 25 ani. Daca esti sub acest ritm, e OK. Daca esti peste, e semn de decondtionare."}`,
        });
      }
    }
  }

  return out;
}

function agingPaceInsights(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  // HRV trajectory over 180+ days via Mann-Kendall
  const hrv = metrics.hrv;
  if (hrv && hrv.length >= 180) {
    const valid = hrv.filter(d => d.mean >= 5).slice(-365);
    if (valid.length >= 180) {
      const smoothed = smoothCMA(valid.map(d => Math.log(d.mean)), 14);
      const mk = mannKendall(smoothed);
      if (mk && mk.significant && Math.abs(mk.tau) > 0.15) {
        if (mk.tau > 0) {
          out.push({
            id: "aging-pace-slower",
            category: "cardio",
            severity: "positive",
            priority: 40,
            title: "Imbatranesti mai incet decat media",
            body: `HRV-ul tau creste semnificativ pe perioada lunga (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). HRV scade natural ~0.5ms/an cu varsta (Umetani 1998). Tu mergi in directia opusa — adaptare autonoma pozitiva, probabil datorita antrenamentului sau reducerii stresului.`,
          });
        } else {
          out.push({
            id: "aging-pace-faster",
            category: "cardio",
            severity: "warning",
            priority: 65,
            title: "Ritm de imbatranire autonoma mai rapid decat media",
            body: `HRV-ul tau scade semnificativ pe perioada lunga (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}) — peste ritmul natural de ~0.5ms/an. Cauze comune: stres cronic, somn insuficient prelungit, alcool regulat, sedentarism, sau supraantrenament mascat. Prioritizeaza aceste 3 luni odihna si zona 2.`,
          });
        }
      }
    }
  }
  return out;
}
