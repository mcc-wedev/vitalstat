/**
 * SMART INSIGHTS ENGINE v3
 *
 * Comprehensive health intelligence using all available Apple Health signals.
 * Every insight is evidence-based, concise, and actionable.
 */

import type { DailySummary, SleepNight } from "../parser/healthTypes";
import {
  mannKendall,
  coefficientOfVariation,
  banister,
  formState,
  detectWeeklyCycle,
  dayOfWeekSeasonality,
} from "./advanced";
import { rhrPercentile, hrvPercentile, vo2MaxPercentile, walkingSpeedPercentile, predictedMaxHR } from "./norms";
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

  const profile = profileOverride !== undefined ? profileOverride : loadProfile();

  // ── TIER 1: Safety (always-on) ──
  out.push(...illnessEarlyWarning(allMetrics, allSleep));
  out.push(...overtrainingDetection(allMetrics, allSleep));
  out.push(...spo2Screening(allMetrics));

  // ── TIER 2: Actionable health signals ──
  out.push(...autonomicBalance(metrics, allMetrics));
  out.push(...sleepArchitecture(allSleep, metrics));
  out.push(...sleepLatency(allSleep));
  out.push(...circadianStability(allSleep));
  out.push(...sleepDebtNarrative(allSleep, metrics));
  out.push(...stressComposite(metrics, allSleep));
  out.push(...recoveryCapacity(allMetrics, allSleep));

  if (profile) {
    out.push(...personalNorms(allMetrics, profile));
    out.push(...mobilityAge(allMetrics, profile));
    out.push(...cardiacEfficiency(allMetrics, profile));
  }

  // ── TIER 2-3: Trends (need multi-day data) ──
  if (mode === "acute") {
    out.push(...volatilityNarrative(metrics));
  }

  if (mode === "trend" || mode === "progression") {
    out.push(...trendNarrative(metrics));
    out.push(...fitnessFormNarrative(allMetrics));
    out.push(...sleepHrvCorrelation(allMetrics, allSleep));
    out.push(...trainingEffectiveness(allMetrics));
  }

  if (mode === "trend") {
    out.push(...dayOfWeekNarrative(metrics));
    out.push(...weekendWeekdayGap(allSleep));
    out.push(...weeklyCycleNarrative(metrics));
    out.push(...activityConsistency(metrics));
  }

  if (mode === "progression" || mode === "longevity") {
    out.push(...vo2Trajectory(metrics, allMetrics));
    out.push(...respiratoryFitness(metrics));
    out.push(...bodyCompositionTrend(metrics));
  }

  if (mode === "longevity") {
    out.push(...agingPaceNarrative(allMetrics));
    out.push(...yearOverYearNarrative(allMetrics));
  }

  // ── TIER 4: Positive / Contextual ──
  out.push(...noiseExposure(metrics));

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

type Profile = NonNullable<ReturnType<typeof loadProfile>>;

/* ═══════════════════════════════════════════════════
 *  TIER 1 — SAFETY SIGNALS (priority 90-100)
 * ═══════════════════════════════════════════════════ */

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

  let alarms = 0;
  const reasons: string[] = [];
  if (rhrDelta > 3) { alarms++; reasons.push(`RHR +${rhrDelta.toFixed(0)} bpm`); }
  if (hrvDeltaPct < -15) { alarms++; reasons.push(`HRV ${hrvDeltaPct.toFixed(0)}%`); }

  const resp = metrics.respiratoryRate;
  if (resp && resp.length >= 14) {
    const rBase = mean(resp.slice(-30, -3).map(d => d.mean));
    const rRecent = mean(resp.slice(-3).map(d => d.mean));
    if (rRecent - rBase > 1.5) { alarms++; reasons.push("respiratie elevata"); }
  }
  const temp = metrics.wristTemperature;
  if (temp && temp.length >= 7 && temp.slice(-3).some(d => d.mean > 0.4)) {
    alarms++; reasons.push("temp. piele elevata");
  }

  if (alarms >= 2) {
    out.push({
      id: "illness-early", category: "cardio", severity: "critical", priority: 100,
      title: "Semnal de alerta fiziologica",
      body: `${reasons.join(", ")} — ${alarms} semnale convergente in 3 zile. Precede frecvent debutul infectios cu 3-5 zile (${cite("radin2020")}). Reduceti efortul 50%, dormiti +1-2h.`,
    });
  } else if (alarms === 1) {
    out.push({
      id: "illness-watch", category: "cardio", severity: "warning", priority: 65,
      title: "Semnal fiziologic de monitorizat",
      body: `${reasons[0]}. Un singur semnal — urmariti evolutia 48h (${cite("radin2020")}).`,
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
      id: "overtraining-alert", category: "training", severity: "critical", priority: 95,
      title: "Pattern de supraantrenament",
      body: `14 zile: HRV ↓ (τ=${hrvMk.tau.toFixed(2)}), RHR ↑ (τ=${rhrMk.tau.toFixed(2)}), volum ${roundRo(mean(ex!.slice(-14).map(d => d.sum)))} min/zi. Tripleta clasica de overreaching (${cite("meeusen2013")}). Deload 7-10 zile: −50% volum, −30% intensitate (${cite("halson2014")}).`,
    });
  } else if (hrvDeclining && rhrRising) {
    out.push({
      id: "overtraining-watch", category: "training", severity: "warning", priority: 70,
      title: "HRV ↓ + RHR ↑ simultan",
      body: `HRV τ=${hrvMk.tau.toFixed(2)}, RHR τ=${rhrMk.tau.toFixed(2)} pe 14 zile. Sistem autonom sub presiune — stres, somn insuficient sau volum excesiv. +1 zi odihna/saptamana (${cite("meeusen2013")}).`,
    });
  }
  return out;
}

function spo2Screening(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const spo2 = metrics.oxygenSaturation;
  if (!spo2 || spo2.length < 7) return out;

  const recent = spo2.slice(-7);
  const vals = recent.map(d => d.mean > 50 ? d.mean : d.mean * 100);
  const minVals = recent.map(d => d.min > 50 ? d.min : d.min > 0 ? d.min * 100 : 100);
  const avgPct = mean(vals);
  const minPct = Math.min(...minVals.filter(v => v > 0));

  if (avgPct < 94) {
    out.push({
      id: "spo2-critical", category: "cardio", severity: "critical", priority: 98,
      title: `SpO2 mediu ${avgPct.toFixed(1)}% — sub pragul clinic`,
      body: `SpO2 <94% necesita evaluare medicala. Cauze: altitudine, afectiune pulmonara, apnee severa. Consultati un medic.`,
    });
  } else if (minPct < 90 && minPct > 0) {
    out.push({
      id: "spo2-dips", category: "sleep", severity: "warning", priority: 82,
      title: `SpO2 nocturn scade sub 90%`,
      body: `Minim ${minPct.toFixed(0)}% inregistrat in ultimele 7 nopti. Desaturari sub 90% sunt marker de screening pentru apnee obstructiva de somn. Daca sforaiti sau aveti somnolenta diurna, discutati cu un medic somnolog.`,
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════
 *  TIER 2 — ACTIONABLE HEALTH SIGNALS (priority 55-85)
 * ═══════════════════════════════════════════════════ */

function autonomicBalance(metrics: Record<string, DailySummary[]>, allMetrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const rhr = allMetrics.restingHeartRate;
  const hrv = allMetrics.hrv;
  if (!rhr || !hrv || rhr.length < 14 || hrv.length < 14) return out;

  const rhrRecent = mean(rhr.slice(-7).map(d => d.mean));
  const hrvRecent = mean(hrv.slice(-7).filter(d => d.mean >= 5).map(d => d.mean));
  if (hrvRecent === 0) return out;

  // Autonomic ratio: HRV/RHR — higher = better parasympathetic dominance
  const ratio = hrvRecent / rhrRecent;
  const rhr28 = mean(rhr.slice(-28).map(d => d.mean));
  const hrv28 = mean(hrv.slice(-28).filter(d => d.mean >= 5).map(d => d.mean));
  const ratioBaseline = hrv28 > 0 && rhr28 > 0 ? hrv28 / rhr28 : ratio;
  const ratioPctChange = ratioBaseline > 0 ? ((ratio - ratioBaseline) / ratioBaseline) * 100 : 0;

  if (ratioPctChange < -20) {
    out.push({
      id: "autonomic-shift", category: "cardio", severity: "warning", priority: 72,
      title: `Echilibru autonom perturbat`,
      body: `Raportul HRV/RHR a scazut ${Math.abs(ratioPctChange).toFixed(0)}% fata de baseline-ul tau (${ratio.toFixed(2)} vs ${ratioBaseline.toFixed(2)}). Dominanta simpatica crescuta — stres acut, somn slab sau boala incipienta. Prioritati: somn ≥7h, reducere stimulente seara.`,
    });
  } else if (rhrRecent < 55 && hrvRecent > 50) {
    out.push({
      id: "autonomic-elite", category: "cardio", severity: "positive", priority: 20,
      title: `Tonus parasimpatic excelent`,
      body: `RHR ${Math.round(rhrRecent)} bpm + HRV ${Math.round(hrvRecent)} ms = dominanta vagala puternica. Capacitate de recuperare superioara.`,
    });
  }
  return out;
}

function sleepArchitecture(sleep: SleepNight[], metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  if (sleep.length < 7) return out;

  const recent = sleep.slice(-14);
  const withStages = recent.filter(n => n.totalMinutes > 0 && (n.stages.deep > 0 || n.stages.rem > 0));
  if (withStages.length < 5) return out;

  const deepPcts = withStages.map(n => (n.stages.deep / n.totalMinutes) * 100);
  const remPcts = withStages.map(n => (n.stages.rem / n.totalMinutes) * 100);
  const avgDeep = mean(deepPcts);
  const avgRem = mean(remPcts);
  const avgEff = mean(withStages.map(n => n.efficiency * 100));

  // Deep sleep: target 15-25% (Walker 2017)
  if (avgDeep < 12) {
    out.push({
      id: "sleep-deep-low", category: "sleep", severity: "warning", priority: 74,
      title: `Somn profund ${avgDeep.toFixed(0)}% — sub optim`,
      body: `Target: 15-25%. Somnul profund (N3) este esential pentru reparatie musculara, consolidare memorie si curatare metabolica cerebrala (${cite("walker2017")}). Factori: alcool seara (reduce deep cu 20-40%), temperatura camerei >20°C, ecrane inainte de somn. Cel mai eficient: camera la 18°C + fara alcool 3h inainte.`,
    });
  } else if (avgDeep >= 20) {
    out.push({
      id: "sleep-deep-good", category: "sleep", severity: "positive", priority: 15,
      title: `Somn profund ${avgDeep.toFixed(0)}% — zona optima`,
      body: `In intervalul 15-25% recomandat. Recuperare fizica si consolidare memorie neafectate (${cite("walker2017")}).`,
    });
  }

  // REM: target 20-25%
  if (avgRem < 15) {
    out.push({
      id: "sleep-rem-low", category: "sleep", severity: "warning", priority: 68,
      title: `REM ${avgRem.toFixed(0)}% — sub optim`,
      body: `Target: 20-25%. REM este critic pentru procesare emotionala, creativitate si consolidare procedurala. Deficit de REM asociat cu reactivitate emotionala crescuta si dificultati de concentrare. Cauze frecvente: trezire cu alarma (REM domina a doua jumatate a noptii), alcool, antidepresive.`,
    });
  }

  // Efficiency: target >85% (Ohayon 2017)
  if (avgEff < 80) {
    out.push({
      id: "sleep-eff-low", category: "sleep", severity: "warning", priority: 66,
      title: `Eficienta somn ${avgEff.toFixed(0)}% — sub 85%`,
      body: `Petreceti prea mult timp treaz in pat. Criteriu calitate: eficienta >85% (${cite("ohayon2017")}). Cauze: anxietate/ruminare la culcare, ecran in pat, somn nealiniat cu ritmul circadian. Regula: patul doar pentru somn, nu TV/telefon.`,
    });
  }

  return out;
}

function sleepLatency(sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  if (sleep.length < 7) return out;

  const recent = sleep.slice(-14).filter(n => n.inBedMinutes > 0 && n.totalMinutes > 0);
  if (recent.length < 5) return out;

  // Latency proxy: inBed - total sleep (includes awake periods)
  const latencies = recent.map(n => n.inBedMinutes - n.totalMinutes);
  const avgLatency = mean(latencies);

  if (avgLatency > 45) {
    out.push({
      id: "sleep-latency-high", category: "sleep", severity: "warning", priority: 70,
      title: `~${Math.round(avgLatency)} min treaz in pat/noapte`,
      body: `Timp mediu treaz in pat: ${Math.round(avgLatency)} min (tinta: <20 min, ${cite("ohayon2017")}). Latenta de adormire prelungita este marker de hiperactivare cognitiva (anxietate, ruminare). Interventii: tehnica 4-7-8 de respiratie, regula "daca nu adormi in 20 min, ridica-te", journaling inainte de culcare.`,
    });
  } else if (avgLatency < 5 && mean(recent.map(n => n.totalMinutes / 60)) < 7) {
    out.push({
      id: "sleep-latency-instant", category: "sleep", severity: "info", priority: 45,
      title: `Adormire instantanee (<5 min)`,
      body: `Latenta <5 min + durata <7h = deficit de somn acumulat, nu "somn bun". Corpul compenseaza prin somn instantaneu cand e epuizat. Adormirea normala sanatoasa: 10-20 min.`,
    });
  }
  return out;
}

function circadianStability(sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  if (sleep.length < 14) return out;

  const recent = sleep.slice(-14).filter(n => n.bedtime);
  if (recent.length < 10) return out;

  const bedtimeHours = recent.map(n => {
    const d = new Date(n.bedtime);
    let h = d.getHours() + d.getMinutes() / 60;
    if (h < 12) h += 24; // normalize to 12-36 range
    return h;
  });

  const wakeHours = recent.map(n => {
    const d = new Date(n.wakeTime);
    return d.getHours() + d.getMinutes() / 60;
  });

  const bedtimeStd = std(bedtimeHours);
  const wakeStd = std(wakeHours);

  // Social jet lag: weekend vs weekday bedtime difference
  const weekdayBedtimes: number[] = [];
  const weekendBedtimes: number[] = [];
  recent.forEach(n => {
    const d = new Date(n.bedtime);
    let h = d.getHours() + d.getMinutes() / 60;
    if (h < 12) h += 24;
    const dow = d.getDay();
    if (dow === 0 || dow === 5 || dow === 6) weekendBedtimes.push(h);
    else weekdayBedtimes.push(h);
  });

  if (bedtimeStd > 1.5) {
    out.push({
      id: "circadian-unstable", category: "sleep", severity: "warning", priority: 71,
      title: `Ora de culcare instabila (±${(bedtimeStd * 60).toFixed(0)} min)`,
      body: `Deviatie standard: ${bedtimeStd.toFixed(1)}h. Variatie >1h este asociata cu risc metabolic si cardiovascular crescut independent de durata somnului (${cite("wittmann2006")}). Obiectiv: bedtime constant ±30 min, inclusiv weekend.`,
    });
  }

  if (weekdayBedtimes.length >= 3 && weekendBedtimes.length >= 2) {
    const sjl = Math.abs(mean(weekendBedtimes) - mean(weekdayBedtimes));
    if (sjl > 1) {
      out.push({
        id: "social-jetlag", category: "sleep", severity: "warning", priority: 64,
        title: `Social jet lag: ${(sjl * 60).toFixed(0)} min`,
        body: `Diferenta bedtime weekend vs weekday: ${sjl.toFixed(1)}h. Social jet lag >1h este asociat cu obezitate, depresie si performanta cognitiva redusa (${cite("wittmann2006")}). Reduceti treptat: 15 min/saptamana.`,
      });
    }
  }

  return out;
}

function sleepDebtNarrative(sleep: SleepNight[], metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  if (sleep.length < 7) return out;

  const last14 = sleep.slice(-14);
  if (last14.length < 7) return out;

  const durations = last14.map(n => n.totalMinutes / 60);
  const avg = mean(durations);

  // Cross-metric: HRV on low-sleep vs high-sleep nights
  let crossNote = "";
  const hrv = metrics.hrv;
  if (hrv && hrv.length >= 14) {
    const hrvByDate: Record<string, number> = {};
    for (const d of hrv) if (d.mean >= 5) hrvByDate[d.date] = d.mean;
    const lowHrv: number[] = [];
    const highHrv: number[] = [];
    for (const n of sleep.slice(-60)) {
      const nd = nextDay(n.date);
      if (!hrvByDate[nd]) continue;
      if (n.totalMinutes / 60 < 6.5) lowHrv.push(hrvByDate[nd]);
      else if (n.totalMinutes / 60 >= 7) highHrv.push(hrvByDate[nd]);
    }
    if (lowHrv.length >= 3 && highHrv.length >= 3) {
      const pctDiff = ((mean(lowHrv) - mean(highHrv)) / mean(highHrv)) * 100;
      if (pctDiff < -5) crossNote = ` HRV −${Math.abs(pctDiff).toFixed(0)}% dupa nopti <6.5h vs >7h.`;
    }
  }

  if (avg < 6.5) {
    out.push({
      id: "sleep-chronic-deficit", category: "sleep", severity: "warning", priority: 75,
      title: `Somn ${avg.toFixed(1)}h/noapte — deficit cronic`,
      body: `Media 14 nopti sub zona 7-9h (${cite("nsf2015")}). 14 zile la 6h = performanta cognitiva echivalenta cu 2 nopti fara somn, fara constientizare subiectiva (${cite("vanDongen2003")}).${crossNote}`,
    });
  } else if (avg >= 7.5 && avg <= 8.5) {
    out.push({
      id: "sleep-optimal", category: "sleep", severity: "positive", priority: 12,
      title: `Somn ${avg.toFixed(1)}h — zona optima`,
      body: `In intervalul 7-9h (${cite("nsf2015")}). Mentineti consistenta bedtime ±30 min (${cite("wittmann2006")}).`,
    });
  }
  return out;
}

function stressComposite(metrics: Record<string, DailySummary[]>, sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  if (!rhr || !hrv || rhr.length < 14 || hrv.length < 14) return out;

  // Build composite stress score from multiple markers
  let stressSignals = 0;
  let totalSignals = 0;
  const details: string[] = [];

  // 1. RHR above personal baseline
  const rhrBaseline = mean(rhr.slice(-28).map(d => d.mean));
  const rhrNow = mean(rhr.slice(-3).map(d => d.mean));
  totalSignals++;
  if (rhrNow - rhrBaseline > 3) { stressSignals++; details.push(`RHR +${(rhrNow - rhrBaseline).toFixed(0)} bpm`); }

  // 2. HRV below personal baseline
  const hrvBaseline = mean(hrv.slice(-28).filter(d => d.mean >= 5).map(d => d.mean));
  const hrvNow = mean(hrv.slice(-3).filter(d => d.mean >= 5).map(d => d.mean));
  totalSignals++;
  if (hrvNow > 0 && (hrvNow - hrvBaseline) / hrvBaseline < -0.15) { stressSignals++; details.push(`HRV −${Math.abs(((hrvNow - hrvBaseline) / hrvBaseline) * 100).toFixed(0)}%`); }

  // 3. Sleep duration below 6.5h
  if (sleep.length >= 3) {
    const sleepRecent = mean(sleep.slice(-3).map(n => n.totalMinutes / 60));
    totalSignals++;
    if (sleepRecent < 6.5) { stressSignals++; details.push(`somn ${sleepRecent.toFixed(1)}h`); }
  }

  // 4. Respiratory rate elevated
  const resp = metrics.respiratoryRate;
  if (resp && resp.length >= 14) {
    const rBaseline = mean(resp.slice(-28).map(d => d.mean));
    const rNow = mean(resp.slice(-3).map(d => d.mean));
    totalSignals++;
    if (rNow - rBaseline > 1.5) { stressSignals++; details.push(`respiratie +${(rNow - rBaseline).toFixed(1)}/min`); }
  }

  // 5. HRV CV very high (instability)
  const hrvVals = hrv.slice(-7).filter(d => d.mean >= 5).map(d => d.mean);
  if (hrvVals.length >= 5) {
    const cv = coefficientOfVariation(hrvVals) * 100;
    totalSignals++;
    if (cv > 18) { stressSignals++; details.push(`HRV CV ${cv.toFixed(0)}%`); }
  }

  const stressPct = totalSignals > 0 ? (stressSignals / totalSignals) * 100 : 0;

  if (stressPct >= 60) {
    out.push({
      id: "stress-high", category: "cardio", severity: "warning", priority: 78,
      title: `Nivel de stres fiziologic ridicat (${stressSignals}/${totalSignals} semnale)`,
      body: `${details.join(", ")}. Multiple markere indica activare simpatica sustinuta. Prioritati: somn ≥7.5h, reducere cafeina dupa ora 14, 20 min mers in natura, respiratie diafragmatica 5 min seara.`,
    });
  } else if (stressPct === 0 && totalSignals >= 3) {
    out.push({
      id: "stress-low", category: "cardio", severity: "positive", priority: 15,
      title: `Stres fiziologic scazut — toti markerii in parametri`,
      body: `0/${totalSignals} semnale de stres. Echilibru autonom bun, somn adecvat, recuperare normala.`,
    });
  }
  return out;
}

function recoveryCapacity(metrics: Record<string, DailySummary[]>, sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  const hrv = metrics.hrv;
  const ex = metrics.exerciseTime || metrics.activeEnergy;
  if (!hrv || !ex || hrv.length < 30 || ex.length < 30) return out;

  // Find high-strain days (>1 SD above mean) and measure HRV bounce-back
  const exVals = ex.map(d => d.sum);
  const exMean = mean(exVals);
  const exStd = std(exVals);
  if (exStd === 0) return out;

  const hrvByDate: Record<string, number> = {};
  for (const d of hrv) if (d.mean >= 5) hrvByDate[d.date] = d.mean;

  const bouncebacks: number[] = [];
  for (let i = 1; i < ex.length - 2; i++) {
    const strain = (ex[i].sum - exMean) / exStd;
    if (strain < 1) continue; // only high-strain days

    const dayBefore = ex[i - 1]?.date;
    const dayAfter1 = nextDay(ex[i].date);
    const dayAfter2 = nextDay(dayAfter1);

    const hrvBefore = hrvByDate[dayBefore] || hrvByDate[ex[i].date];
    const hrvAfter = hrvByDate[dayAfter1] || hrvByDate[dayAfter2];

    if (hrvBefore && hrvAfter && hrvBefore > 0) {
      bouncebacks.push((hrvAfter - hrvBefore) / hrvBefore * 100);
    }
  }

  if (bouncebacks.length >= 3) {
    const avgBounce = mean(bouncebacks);
    if (avgBounce < -10) {
      out.push({
        id: "recovery-slow", category: "cardio", severity: "warning", priority: 58,
        title: `Capacitate de recuperare redusa`,
        body: `Dupa zile intense, HRV-ul tau scade in medie cu ${Math.abs(avgBounce).toFixed(0)}% si nu revine rapid (${bouncebacks.length} episoade analizate). Rezerva parasimpatica scazuta — posibil oboseala acumulata. Adaugati 1 zi usoara dupa fiecare zi intensa.`,
      });
    } else if (avgBounce > -3) {
      out.push({
        id: "recovery-fast", category: "cardio", severity: "positive", priority: 22,
        title: `Recuperare rapida dupa efort`,
        body: `HRV-ul revine in 24h dupa zile intense (variatie medie ${avgBounce > 0 ? "+" : ""}${avgBounce.toFixed(0)}%, ${bouncebacks.length} episoade). Rezerva parasimpatica buna — toleranta de antrenament ridicata.`,
      });
    }
  }
  return out;
}

function personalNorms(metrics: Record<string, DailySummary[]>, profile: Profile): SmartInsight[] {
  const out: SmartInsight[] = [];
  const sexRo = profile.sex === "male" ? "barbati" : "femei";

  // VO2 Max
  if (metrics.vo2Max && metrics.vo2Max.length >= 3) {
    const recent = metrics.vo2Max.slice(-10).filter(d => d.mean > 15);
    if (recent.length >= 3) {
      const v = mean(recent.map(d => d.mean));
      const pct = vo2MaxPercentile(v, profile.age, profile.sex);
      if (pct >= 80) {
        out.push({
          id: "vo2-top", category: "cardio", severity: "positive", priority: 35,
          title: `VO2 Max ${v.toFixed(1)} — P${Math.round(pct)}`,
          body: `Top ${Math.round(100 - pct)}% ${sexRo} ${profile.age} ani (${cite("acsm2021")}). +1 MET = −13% mortalitate cardiovasculara (${cite("kodama2009")}).`,
        });
      } else if (pct < 30) {
        out.push({
          id: "vo2-low", category: "cardio", severity: "warning", priority: 72,
          title: `VO2 Max ${v.toFixed(1)} — P${Math.round(pct)}`,
          body: `Sub media ${sexRo} ${profile.age} ani (${cite("acsm2021")}). Protocol: 3×/sapt zona 2 (30-45 min) + 1× intervale 4×4 min. Raspuns in 6-8 sapt.`,
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
        id: "rhr-elite", category: "cardio", severity: "positive", priority: 25,
        title: `RHR ${Math.round(rhrVal)} bpm — P${Math.round(pct)}`,
        body: `Nivel atletic ${sexRo} ${profile.age} ani. <60 bpm = −21% risc cardiovascular vs 70-79 bpm (${cite("nauman2011")}).`,
      });
    } else if (pct < 20) {
      out.push({
        id: "rhr-high", category: "cardio", severity: "warning", priority: 62,
        title: `RHR ${Math.round(rhrVal)} bpm — P${Math.round(pct)}`,
        body: `Peste media ${sexRo} ${profile.age} ani. RHR ridicat = factor de risc cardiovascular independent (${cite("palatini2006")}). Activitate aeroba regulata si somn suficient sunt cele mai eficiente interventii.`,
      });
    }
  }

  // HRV
  if (metrics.hrv && metrics.hrv.length >= 14) {
    const hrvVal = mean(metrics.hrv.slice(-14).filter(d => d.mean >= 5).map(d => d.mean));
    if (hrvVal > 0) {
      const pct = hrvPercentile(hrvVal, profile.age, profile.sex);
      if (pct < 25) {
        out.push({
          id: "hrv-low-pct", category: "cardio", severity: "warning", priority: 60,
          title: `HRV ${roundRo(hrvVal)} ms — P${Math.round(pct)}`,
          body: `Sfertul inferior ${sexRo} ${profile.age} ani (${cite("nunan2010")}). Bedtime constant, reducere alcool, zona 2 aerob. Raspuns in 8-12 sapt (${cite("buchheit2014")}).`,
        });
      } else if (pct >= 75) {
        out.push({
          id: "hrv-high-pct", category: "cardio", severity: "positive", priority: 20,
          title: `HRV ${roundRo(hrvVal)} ms — P${Math.round(pct)}`,
          body: `Sfertul superior ${sexRo} ${profile.age} ani (${cite("nunan2010")}). Capacitate de recuperare excelenta.`,
        });
      }
    }
  }

  return out;
}

function mobilityAge(metrics: Record<string, DailySummary[]>, profile: Profile): SmartInsight[] {
  const out: SmartInsight[] = [];

  // Walking speed — strongest single predictor of 10-year survival in elderly
  const ws = metrics.walkingSpeed;
  if (ws && ws.length >= 10) {
    const avgKmh = mean(ws.slice(-14).filter(d => d.mean > 0).map(d => d.mean));
    if (avgKmh > 0) {
      const avgMs = avgKmh / 3.6;
      const pct = walkingSpeedPercentile(avgMs, profile.age, profile.sex);

      if (pct < 25) {
        out.push({
          id: "walk-speed-low", category: "mobility", severity: "warning", priority: 55,
          title: `Viteza mers ${avgKmh.toFixed(1)} km/h — P${Math.round(pct)}`,
          body: `Sub media cohortei tale. Viteza de mers prezice mortalitatea la 10 ani mai bine decat orice alt indicator clinic singular (${cite("studenski2011")}). Crestere: mers in panta, squat-uri, echilibru unipodal.`,
        });
      } else if (pct >= 80) {
        out.push({
          id: "walk-speed-high", category: "mobility", severity: "positive", priority: 18,
          title: `Viteza mers ${avgKmh.toFixed(1)} km/h — P${Math.round(pct)}`,
          body: `Indicator excelent de capacitate functionala si prognoza de longevitate (${cite("studenski2011")}).`,
        });
      }
    }
  }

  // Walking asymmetry
  const asym = metrics.walkingAsymmetry;
  if (asym && asym.length >= 10) {
    const avgAsym = mean(asym.slice(-14).filter(d => d.mean > 0).map(d => d.mean));
    if (avgAsym > 10) {
      out.push({
        id: "gait-asymmetry", category: "mobility", severity: "info", priority: 42,
        title: `Asimetrie mers ${avgAsym.toFixed(0)}%`,
        body: `Normal: <8%. Asimetrie >10% poate indica diferenta de forta/mobilitate intre membre, problema articulara sau compensatie posturala. Daca e noua sau in crestere, evaluare fizioterapeutica recomandata.`,
      });
    }
  }

  // Double support time — higher = less stability
  const ds = metrics.doubleSupportPct;
  if (ds && ds.length >= 10) {
    const avgDs = mean(ds.slice(-14).filter(d => d.mean > 0).map(d => d.mean));
    if (avgDs > 30) {
      out.push({
        id: "stability-low", category: "mobility", severity: "info", priority: 38,
        title: `Dublu sprijin ${avgDs.toFixed(0)}% — stabilitate redusa`,
        body: `Normal: 20-28%. Timp crescut in dublu sprijin indica echilibru redus sau forta scazuta la nivelul membrelor inferioare. Exercitii de echilibru unipodal 2 min/zi au efect rapid.`,
      });
    }
  }

  return out;
}

function cardiacEfficiency(metrics: Record<string, DailySummary[]>, profile: Profile): SmartInsight[] {
  const out: SmartInsight[] = [];

  const walkHR = metrics.walkingHeartRateAverage;
  const walkSpeed = metrics.walkingSpeed;
  if (!walkHR || !walkSpeed || walkHR.length < 14 || walkSpeed.length < 14) return out;

  const hrVals = walkHR.slice(-14).filter(d => d.mean > 0);
  const speedVals = walkSpeed.slice(-14).filter(d => d.mean > 0);
  if (hrVals.length < 7 || speedVals.length < 7) return out;

  const avgWalkHR = mean(hrVals.map(d => d.mean));
  const maxHR = predictedMaxHR(profile.age);
  const pctMaxHR = (avgWalkHR / maxHR) * 100;

  if (pctMaxHR > 65) {
    out.push({
      id: "cardiac-cost-high", category: "cardio", severity: "warning", priority: 56,
      title: `Puls de mers ${Math.round(avgWalkHR)} bpm (${pctMaxHR.toFixed(0)}% din HR max)`,
      body: `Costul cardiac al mersului este ridicat — ar trebui sa fie sub 60% din HR max estimat (${Math.round(maxHR)} bpm, Tanaka 2001). Posibil: deconditonare, stres termic, deshidratare. Imbunatatire: mers progresiv 30 min/zi, 5×/sapt.`,
    });
  } else if (pctMaxHR < 45) {
    out.push({
      id: "cardiac-cost-low", category: "cardio", severity: "positive", priority: 18,
      title: `Eficienta cardiaca excelenta la mers`,
      body: `Puls ${Math.round(avgWalkHR)} bpm = ${pctMaxHR.toFixed(0)}% din HR max. Cost cardiac scazut indica capacitate aeroba buna.`,
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════
 *  TIER 2-3 — TRENDS (priority 30-65)
 * ═══════════════════════════════════════════════════ */

function trendNarrative(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const checks: { key: string; label: string; higherBetter: boolean; unit: string }[] = [
    { key: "restingHeartRate", label: "RHR", higherBetter: false, unit: "bpm" },
    { key: "hrv", label: "HRV", higherBetter: true, unit: "ms" },
    { key: "stepCount", label: "Pasi", higherBetter: true, unit: "" },
  ];

  for (const c of checks) {
    const d = metrics[c.key];
    if (!d || d.length < 14) continue;
    const vals = d.map(x => c.key === "stepCount" ? x.sum : x.mean).filter(v => v > 0);
    if (vals.length < 14) continue;
    const mk = mannKendall(vals);
    if (!mk || !mk.significant || Math.abs(mk.tau) < 0.15) continue;

    const improving = (mk.tau > 0) === c.higherBetter;
    const first = vals[0], last = vals[vals.length - 1];
    const delta = last - first;

    let ref = "";
    if (c.key === "restingHeartRate") ref = cite("nauman2011");
    else if (c.key === "hrv") ref = improving ? cite("buchheit2014") : cite("plews2013");
    else ref = cite("paluch2022");

    out.push({
      id: `trend-${c.key}-${improving ? "up" : "down"}`,
      category: c.key === "stepCount" ? "activity" : "cardio",
      severity: improving ? "positive" : "warning",
      priority: improving ? 30 : 55,
      title: `${c.label} ${improving ? "↑" : "↓"} ${roundRo(first)} → ${roundRo(last)} ${c.unit}`,
      body: `${delta > 0 ? "+" : ""}${roundRo(delta)} ${c.unit} (Mann-Kendall τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}) (${ref}).`,
    });
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
      id: "banister-overreach", category: "training", severity: "critical", priority: 88,
      title: "Forma negativa — oboseala > fitness",
      body: `Form=${last.form.toFixed(0)} (fitness ${last.fitness.toFixed(0)}, fatigue ${last.fatigue.toFixed(0)}). Deload 7-10 zile: −50% volum, −30% intensitate. Supercompensare la 10-14 zile (${cite("banister1975")}).`,
    });
  } else if (state.tone === "rested") {
    out.push({
      id: "banister-peak", category: "training", severity: "positive", priority: 30,
      title: "Forma de varf",
      body: `Form=+${last.form.toFixed(0)}, fitness ${last.fitness.toFixed(0)}. Fereastra optima competitie/testare, 7-14 zile (${cite("banister1975")}).`,
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
    if (hrvByDate[nd] && n.totalMinutes > 0) pairs.push([n.totalMinutes / 60, hrvByDate[nd]]);
  }
  if (pairs.length < 15) return out;

  const xs = pairs.map(p => p[0]);
  const ys = pairs.map(p => p[1]);
  const r = pearsonR(xs, ys);

  if (Math.abs(r) > 0.3) {
    const slope = std(xs) > 0 ? Math.round((r * std(ys)) / std(xs)) : 0;
    out.push({
      id: "sleep-hrv-corr", category: "sleep", severity: "info", priority: 35,
      title: `Somn → HRV: r=${r.toFixed(2)}`,
      body: `${pairs.length} perechi, 90 zile. +1h somn ≈ ${r > 0 ? "+" : ""}${slope} ms HRV a doua zi (${cite("walker2017")}).`,
    });
  }
  return out;
}

function trainingEffectiveness(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const ex = metrics.exerciseTime;
  const rhr = metrics.restingHeartRate;
  const vo2 = metrics.vo2Max;

  if (!ex || ex.length < 60 || !rhr || rhr.length < 60) return out;

  // Compare first 30 days vs last 30 days
  const exFirst = mean(ex.slice(0, 30).map(d => d.sum));
  const exLast = mean(ex.slice(-30).map(d => d.sum));
  const rhrFirst = mean(rhr.slice(0, 30).map(d => d.mean));
  const rhrLast = mean(rhr.slice(-30).map(d => d.mean));

  const exChange = exLast - exFirst;
  const rhrChange = rhrLast - rhrFirst;

  // Training more but RHR not improving = inefficient
  if (exChange > 5 && rhrChange > 1) {
    out.push({
      id: "training-inefficient", category: "training", severity: "info", priority: 48,
      title: `Volum ↑ dar RHR nu se imbunatateste`,
      body: `Exercitiu +${exChange.toFixed(0)} min/zi dar RHR +${rhrChange.toFixed(0)} bpm. Posibil: intensitate prea mare fara baza aeroba, somn insuficient, sau stres cronic care anuleaza adaptarea. Pivotati spre zona 2 (65-75% HR max).`,
    });
  }

  // Training and VO2 improving = effective
  if (vo2 && vo2.length >= 60) {
    const vo2First = mean(vo2.slice(0, 30).filter(d => d.mean > 15).map(d => d.mean));
    const vo2Last = mean(vo2.slice(-30).filter(d => d.mean > 15).map(d => d.mean));
    if (vo2First > 0 && vo2Last > 0 && vo2Last - vo2First > 1 && exChange > 3) {
      out.push({
        id: "training-effective", category: "training", severity: "positive", priority: 28,
        title: `Antrenament eficient: VO2 +${(vo2Last - vo2First).toFixed(1)}`,
        body: `Volumul crescut de exercitiu se reflecta in imbunatatire VO2 Max reala. Continuati protocolul actual.`,
      });
    }
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
      id: "hrv-unstable", category: "cardio", severity: "warning", priority: 50,
      title: `HRV instabil — CV ${cv.toFixed(0)}%`,
      body: `Peste pragul de 14%. Variabilitate zi-de-zi = marker overreaching mai puternic decat media absoluta (${cite("plews2013")}). Stabilizati bedtime ±30 min.`,
    });
  }
  return out;
}

function dayOfWeekNarrative(metrics: Record<string, DailySummary[]>): SmartInsight[] {
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
      id: "dow-hrv", category: "cardio", severity: "info", priority: 22,
      title: `Tipar saptamanal HRV`,
      body: `Max: ${days[best.dow]} (+${best.deviation.toFixed(0)} ms), min: ${days[worst.dow]} (${worst.deviation.toFixed(0)} ms). Diferenta ${Math.abs(best.deviation - worst.deviation).toFixed(0)} ms — factor recurent (antrenament, stres, social).`,
    });
  }
  return out;
}

function weekendWeekdayGap(sleep: SleepNight[]): SmartInsight[] {
  const out: SmartInsight[] = [];
  if (sleep.length < 21) return out;

  const recent = sleep.slice(-30);
  const weekday: number[] = [];
  const weekend: number[] = [];

  for (const n of recent) {
    const dow = new Date(n.date + "T00:00:00").getDay();
    const hours = n.totalMinutes / 60;
    if (dow === 0 || dow === 6) weekend.push(hours);
    else weekday.push(hours);
  }

  if (weekday.length < 5 || weekend.length < 3) return out;

  const wdAvg = mean(weekday);
  const weAvg = mean(weekend);
  const gap = weAvg - wdAvg;

  if (gap > 1) {
    out.push({
      id: "weekend-oversleep", category: "sleep", severity: "info", priority: 40,
      title: `Weekend +${gap.toFixed(1)}h somn vs weekday`,
      body: `Weekday ${wdAvg.toFixed(1)}h vs weekend ${weAvg.toFixed(1)}h. Gap >1h indica deficit acumulat in cursul saptamanii. Nu se "recupereaza" — efectele cognitive sunt cumulative (${cite("vanDongen2003")}). Solutia: +30 min in fiecare noapte weekday.`,
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
      id: "weekly-cycle", category: "activity", severity: "info", priority: 15,
      title: "Ciclu saptamanal detectat",
      body: `Autocorelatia lag-7: ${(cycle.strength * 100).toFixed(0)}%. Program structurat.`,
    });
  }
  return out;
}

function activityConsistency(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const steps = metrics.stepCount;
  if (!steps || steps.length < 14) return out;

  const vals = steps.slice(-30).map(d => d.sum);
  const cv = coefficientOfVariation(vals) * 100;

  if (cv > 70) {
    out.push({
      id: "activity-erratic", category: "activity", severity: "info", priority: 38,
      title: `Activitate foarte variabila (CV ${cv.toFixed(0)}%)`,
      body: `Alternati zile foarte active cu zile sedentare. Pattern-uri "feast or famine" sunt mai putin benefice decat activitate constanta moderata. Obiectiv: minim 5,000 pasi in fiecare zi, inclusiv zilele "de odihna" (${cite("paluch2022")}).`,
    });
  } else if (cv < 25) {
    out.push({
      id: "activity-consistent", category: "activity", severity: "positive", priority: 12,
      title: `Activitate constanta (CV ${cv.toFixed(0)}%)`,
      body: `Pattern regulat de miscare — mai benefic pentru sanatatea metabolica decat volumul total (${cite("paluch2022")}).`,
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════
 *  TIER 2-3 — LONGEVITY (priority 30-55)
 * ═══════════════════════════════════════════════════ */

function vo2Trajectory(metrics: Record<string, DailySummary[]>, allMetrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const vo2 = metrics.vo2Max || allMetrics.vo2Max;
  if (!vo2 || vo2.length < 10) return out;

  const valid = vo2.filter(d => d.mean > 15).map(d => d.mean);
  if (valid.length < 10) return out;
  const mk = mannKendall(valid);
  if (!mk || !mk.significant || Math.abs(mk.tau) < 0.2) return out;

  const change = valid[valid.length - 1] - valid[0];
  out.push({
    id: `vo2-${mk.tau > 0 ? "up" : "down"}`, category: "cardio",
    severity: mk.tau > 0 ? "positive" : "warning", priority: mk.tau > 0 ? 42 : 55,
    title: `VO2 Max ${mk.tau > 0 ? "↑" : "↓"} ${change > 0 ? "+" : ""}${change.toFixed(1)}`,
    body: mk.tau > 0
      ? `+1 MET = −13% mortalitate cardiovasculara (${cite("kodama2009")}).`
      : `Declin natural: ~1/an dupa 25 ani. Peste acest ritm = deconditonare. Zona 2 aerob 3×/sapt (${cite("acsm2021")}).`,
  });
  return out;
}

function respiratoryFitness(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const resp = metrics.respiratoryRate;
  if (!resp || resp.length < 30) return out;

  const vals = resp.filter(d => d.mean > 0).map(d => d.mean);
  if (vals.length < 30) return out;
  const mk = mannKendall(vals);
  if (!mk || !mk.significant) return out;

  if (mk.tau > 0.2) {
    out.push({
      id: "resp-rising", category: "cardio", severity: "info", priority: 42,
      title: `Rata respiratorie in crestere`,
      body: `Trend ascendent semnificativ (τ=${mk.tau.toFixed(2)}). Cauze posibile: deconditonare, anxietate cronica, anemie. Daca nu se explica prin altceva, merit investigat.`,
    });
  } else if (mk.tau < -0.2) {
    out.push({
      id: "resp-falling", category: "cardio", severity: "positive", priority: 20,
      title: `Rata respiratorie in scadere`,
      body: `Trend descendent (τ=${mk.tau.toFixed(2)}). Indica imbunatatire a eficientei ventilatorii — tipic: adaptare aeroba.`,
    });
  }
  return out;
}

function bodyCompositionTrend(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const weight = metrics.bodyMass;
  if (!weight || weight.length < 14) return out;

  const vals = weight.filter(d => d.mean > 0).map(d => d.mean);
  if (vals.length < 14) return out;
  const mk = mannKendall(vals);
  if (!mk || !mk.significant || Math.abs(mk.tau) < 0.2) return out;

  const first = vals[0], last = vals[vals.length - 1];
  const delta = last - first;
  const weeklyRate = mk.sensSlope * 7;

  if (Math.abs(weeklyRate) > 0.5) {
    out.push({
      id: `weight-${mk.tau > 0 ? "up" : "down"}`, category: "body", severity: "info", priority: 40,
      title: `Greutate ${mk.tau > 0 ? "↑" : "↓"} ${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`,
      body: `Rata: ${weeklyRate > 0 ? "+" : ""}${weeklyRate.toFixed(2)} kg/saptamana. ${Math.abs(weeklyRate) > 1 ? "Rata rapida — verificati daca e intentionata." : "Progresie graduala."} Modificari >0.5 kg/sapt merita monitorizare nutritionala.`,
    });
  }
  return out;
}

function agingPaceNarrative(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const hrv = metrics.hrv;
  if (!hrv || hrv.length < 180) return out;

  const valid = hrv.filter(d => d.mean >= 5).slice(-365);
  if (valid.length < 180) return out;

  const mk = mannKendall(valid.map(d => Math.log(d.mean)));
  if (!mk || !mk.significant || Math.abs(mk.tau) < 0.15) return out;

  out.push({
    id: `aging-${mk.tau > 0 ? "slow" : "fast"}`, category: "cardio",
    severity: mk.tau > 0 ? "positive" : "warning", priority: mk.tau > 0 ? 40 : 60,
    title: mk.tau > 0 ? "Imbatranire autonoma incetinita" : "Imbatranire autonoma accelerata",
    body: `ln(HRV) ${mk.tau > 0 ? "↑" : "↓"} (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). Normal: −0.5 ms/an dupa 25 ani (${cite("umetani1998")}). ${mk.tau > 0 ? "Directie opusa = adaptare pozitiva." : "Prioritati: somn + zona 2 aerob."}`,
  });
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
    id: "vo2-yoy", category: "cardio",
    severity: delta > 0 ? "positive" : "warning", priority: delta > 0 ? 35 : 50,
    title: `VO2 Max ${delta > 0 ? "+" : ""}${delta.toFixed(1)} vs acum 1 an`,
    body: delta > 0
      ? `${p.toFixed(1)} → ${r.toFixed(1)} mL/kg/min. Imbunatatire reala (${cite("kodama2009")}).`
      : `${p.toFixed(1)} → ${r.toFixed(1)}. ${Math.abs(delta) > 2 ? "Peste ritmul natural = deconditonare." : "Ritm normal imbatranire."} (${cite("acsm2021")})`,
  });
  return out;
}

/* ═══════════════════════════════════════════════════
 *  TIER 4 — ENVIRONMENTAL / CONTEXTUAL
 * ═══════════════════════════════════════════════════ */

function noiseExposure(metrics: Record<string, DailySummary[]>): SmartInsight[] {
  const out: SmartInsight[] = [];
  const noise = metrics.noiseExposure;
  if (!noise || noise.length < 7) return out;

  const avgDb = mean(noise.slice(-7).filter(d => d.mean > 0).map(d => d.mean));
  if (avgDb > 80) {
    out.push({
      id: "noise-high", category: "wellbeing", severity: "warning", priority: 45,
      title: `Zgomot ambiental ${avgDb.toFixed(0)} dB — nivel ridicat`,
      body: `OMS: expunere >85 dB sustinuta creste cortizolul si afecteaza somnul. Folositi protectie auditiva sau reduceti expunerea. Zgomotul cronic este factor de risc cardiovascular independent.`,
    });
  }

  const headphones = metrics.headphoneAudio;
  if (headphones && headphones.length >= 7) {
    const avgHp = mean(headphones.slice(-7).filter(d => d.mean > 0).map(d => d.mean));
    if (avgHp > 80) {
      out.push({
        id: "headphone-loud", category: "wellbeing", severity: "info", priority: 35,
        title: `Volum casti ${avgHp.toFixed(0)} dB`,
        body: `Peste 80 dB timp prelungit cauzeaza pierdere auditiva permanenta. OMS recomanda max 85 dB, max 1h/zi. Reduceti cu 10-15%.`,
      });
    }
  }
  return out;
}
