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
      title: "Semnale convergente de efort fiziologic",
      body: `In ultimele 3 zile, ${reasons.join(" + ")}. Studiul Stanford DETECT (${cite("radin2020")}) a demonstrat ca aceasta combinatie de semnale precede debutul simptomelor infectioase cu 3-5 zile. Recomandare concreta: reduceti efortul fizic cu 50%, cresteti hidratarea la 2.5L/zi, si adaugati 1-2 ore de somn in urmatoarele 2 nopti.`,
    });
  } else if (alarms === 1) {
    out.push({
      id: "illness-watch",
      category: "cardio",
      severity: "warning",
      priority: 65,
      title: "Un semnal fiziologic iesit din tipar",
      body: `${reasons[0]} — un singur semnal nu e diagnostic, dar merita urmarit maine. Daca apare si un al doilea semnal (RHR, HRV, temperatura sau respiratie), devine semnificativ clinic (${cite("radin2020")}).`,
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
      title: "Pattern de supraantrenament detectat",
      body: `In ultimele 14 zile: HRV-ul scade (τ=${hrvMk.tau.toFixed(2)}), pulsul de repaus creste (τ=${rhrMk.tau.toFixed(2)}), si volumul de antrenament ramane ridicat (media ${roundRo(mean(ex!.slice(-14).map(d => d.sum)))} min/zi). Aceasta tripleta este semnatura clasica a supraantrenarii functionale (${cite("meeusen2013")}). Solutia: 7-10 zile de deload — reduceti volumul cu 50% si intensitatea cu 30%. Fara deload, recuperarea poate dura luni (${cite("halson2014")}).`,
    });
  } else if (hrvDeclining && rhrRising) {
    out.push({
      id: "overtraining-watch",
      category: "training",
      severity: "warning",
      priority: 70,
      title: "HRV scade si pulsul de repaus creste simultan",
      body: `Combinatia de HRV in scadere (τ=${hrvMk.tau.toFixed(2)}) si RHR in crestere (τ=${rhrMk.tau.toFixed(2)}) pe 14 zile sugereaza ca sistemul tau autonom este sub presiune. Cauze posibile: stres cronic, deficit de somn acumulat, sau volum de antrenament prea mare. Monitorizati si adaugati 1 zi de odihna completa pe saptamana (${cite("meeusen2013")}).`,
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
          title: `VO2 Max de ${v.toFixed(1)} — top ${Math.round(100 - pct)}%`,
          body: `La ${v.toFixed(1)} mL/kg/min, te plaseaza in percentila ${Math.round(pct)} pentru ${sexRo} de ${profile.age} ani (${cite("acsm2021")}). VO2 Max este cel mai puternic predictor singular al mortalitatii de orice cauza — fiecare MET (3.5 mL/kg/min) in plus reduce riscul cardiovascular cu ~13% (${cite("kodama2009")}). La nivelul tau, ai un avantaj semnificativ de longevitate fata de media populatiei.`,
        });
      } else if (pct < 30) {
        out.push({
          id: "vo2-low",
          category: "cardio",
          severity: "warning",
          priority: 72,
          title: `VO2 Max sub media cohortei tale`,
          body: `${v.toFixed(1)} mL/kg/min te plaseaza la percentila ${Math.round(pct)} pentru ${sexRo} de ${profile.age} ani (${cite("acsm2021")}). Vestea buna: VO2 Max raspunde rapid la antrenament. Protocolul cu cel mai mare impact stiintific: 3 sesiuni/saptamana de 30-45 min in zona 2 (65-75% HR max) + 1 sesiune de intervale 4x4 min la 90% HR max. Asteptati prima crestere masurabile in 6-8 saptamani.`,
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
        title: `Puls repaus de ${Math.round(rhrVal)} bpm — nivel de atlet`,
        body: `Percentila ${Math.round(pct)} pentru ${sexRo} de ${profile.age} ani (${cite("nauman2011")}). Un puls sub 60 bpm reflecta volum sistolic crescut si tonus parasimpatic puternic. In studiul HUNT (n=50,000), acest nivel a fost asociat cu 21% mai putin risc cardiovascular comparativ cu grupa 70-79 bpm.`,
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
          title: `HRV-ul tau e in sfertul inferior pentru varsta ta`,
          body: `Media ta de ${roundRo(hrvVal)} ms te plaseaza la percentila ${Math.round(pct)} pentru ${sexRo} de ${profile.age} ani (${cite("nunan2010")}). Asta nu e o sentinta — e o oportunitate. Cele 3 interventii cu cel mai mare impact pe HRV: (1) regularitate bedtime ±30 min, (2) reducerea alcoolului seara, (3) volum aerob in zona 2 in loc de HIIT. In 8-12 saptamani, cei cu HRV initial scazut au cel mai mult de castigat (${cite("buchheit2014")}).`,
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
        crossMetricNote = ` Concret pe datele tale: HRV-ul tau e cu ${Math.abs(pctDiff).toFixed(0)}% mai mic in diminetile dupa nopti sub 6.5h vs. peste 7h.`;
      }
    }
  }

  if (avg < 6.5) {
    out.push({
      id: "sleep-chronic-deficit",
      category: "sleep",
      severity: "warning",
      priority: 75,
      title: `Media de somn: ${avg.toFixed(1)}h — deficit cronic`,
      body: `In ultimele 14 nopti dormi in medie ${avg.toFixed(1)}h, cu ${(7.5 - avg).toFixed(1)}h sub recomandarea de 7-9h (${cite("nsf2015")}). Cercetarea de la UPenn (${cite("vanDongen2003")}) a demonstrat ca dupa 14 zile la 6h/noapte, performanta cognitiva scade la nivelul a 2 nopti fara somn — dar subiectii nu constientizeaza degradarea.${crossMetricNote}`,
    });
  } else if (avg >= 7.5 && avg <= 8.5) {
    out.push({
      id: "sleep-optimal",
      category: "sleep",
      severity: "positive",
      priority: 12,
      title: `Durata de somn optima: ${avg.toFixed(1)}h medie`,
      body: `Esti in zona optima de 7-9h recomandata de ${cite("nsf2015")}. Consistenta este la fel de importanta ca durata — un bedtime variabil cu mai mult de ±60 min creste riscul cardiovascular independent de durata (${cite("wittmann2006")}).`,
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
        title: `Puls repaus in scadere: ${Math.round(first)} → ${Math.round(last)} bpm`,
        body: `O scadere de ${Math.abs(delta).toFixed(0)} bpm in aceasta perioada (Mann-Kendall τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). Rata estimata: ${slopeMonth.toFixed(1)} bpm/luna. O scadere a pulsului reflecta de obicei adaptare la volum aerob sau imbunatatirea somnului. In studiul HUNT (${cite("nauman2011")}), o reducere de 5 bpm a fost asociata cu 12% mai putin risc cardiovascular.`,
      });
    } else if (c.key === "restingHeartRate" && !improving) {
      out.push({
        id: `trend-rhr-rising`,
        category: "cardio",
        severity: "warning",
        priority: 55,
        title: `Puls repaus in crestere: ${Math.round(first)} → ${Math.round(last)} bpm`,
        body: `Crestere de ${delta.toFixed(0)} bpm (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). Cauze frecvente: stres cronic, deficit de somn acumulat, deshidratare, sau volum crescut de antrenament fara recuperare adecvata. Daca tendinta persista 2+ saptamani, prioritizeaza odihna (${cite("palatini2006")}).`,
      });
    } else if (c.key === "hrv") {
      out.push({
        id: `trend-hrv-${improving ? "up" : "down"}`,
        category: "cardio",
        severity: improving ? "positive" : "warning",
        priority: improving ? 35 : 60,
        title: `HRV ${improving ? "in crestere" : "in scadere"}: ${roundRo(first)} → ${roundRo(last)} ms`,
        body: improving
          ? `Tendinta ascendenta semnificativa (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). HRV-ul in crestere indica adaptare parasimpatica — sistemul tau nervos autonom devine mai eficient la recuperare. Tipic pentru adaptare la zona 2, reducere stres, sau imbunatatirea calitatii somnului (${cite("buchheit2014")}).`
          : `Tendinta descendenta semnificativa (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). HRV in scadere reflecta dominanta simpatica — stres cronic, somn insuficient, alcool, sau supraantrenament. Daca trendul CV pe 7 zile depaseste 10%, este un indicator mai puternic de overreaching decat valoarea absoluta (${cite("plews2013")}).`,
      });
    } else if (c.key === "stepCount") {
      out.push({
        id: `trend-steps-${improving ? "up" : "down"}`,
        category: "activity",
        severity: improving ? "positive" : "info",
        priority: improving ? 20 : 30,
        title: `Pasi zilnici ${improving ? "in crestere" : "in scadere"}`,
        body: improving
          ? `Tendinta pozitiva (τ=${mk.tau.toFixed(2)}). Cresterea volumului de mers are beneficii disproportionate pe mortalitate intre 4,000-8,000 pasi/zi — dupa 10,000, curba se aplatizeaza (${cite("paluch2022")}).`
          : `Tendinta de scadere (τ=${mk.tau.toFixed(2)}). O reducere a pasilor sub 5,000/zi este asociata cu risc metabolic crescut. Cel mai simplu fix: o plimbare de 15 min dupa pranz adauga ~1,500 pasi si imbunatateste sensibilitatea la insulina (${cite("paluch2022")}).`,
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
      title: "Forma negativa — oboseala depaseste fitness-ul",
      body: `Forma ta (Fitness − Fatigue) este ${last.form.toFixed(0)}, cu fitness ${last.fitness.toFixed(0)} si oboseala ${last.fatigue.toFixed(0)}. Modelul Banister (${cite("banister1975")}) indica ca acumulezi oboseala mai rapid decat te recuperezi. Protocolul standard: reduceti volumul cu 40-50% si intensitatea cu 30% pentru 7-10 zile. Supercompensarea (peak de performanta) apare de obicei la 10-14 zile dupa inceputul deload-ului.`,
    });
  } else if (state.tone === "rested") {
    out.push({
      id: "banister-peak",
      category: "training",
      severity: "positive",
      priority: 30,
      title: "Esti in forma de varf — fereastra de performanta",
      body: `Forma +${last.form.toFixed(0)}: odihnit, cu fitness-ul inca ridicat (${last.fitness.toFixed(0)}). Aceasta este fereastra optima pentru competitie sau testare. Dureaza de obicei 7-14 zile (${cite("banister1975")}).`,
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
      title: `Somnul si HRV-ul tau sunt corelate (r=${r.toFixed(2)})`,
      body: `Pe datele tale din ultimele 90 zile, HRV-ul de dimineata ${direction} proportional cu durata somnului din noaptea precedenta (corelatie Pearson r=${r.toFixed(2)}, ${pairs.length} perechi). Practic, fiecare ora in plus de somn se traduce in ~${Math.abs((r * std(ys)) / std(xs)).toFixed(0)} ms mai mult HRV a doua zi. Somnul este parghia numarul 1 pentru recuperarea autonoma (${cite("walker2017")}).`,
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
      title: `HRV foarte instabil (CV ${cv.toFixed(0)}%)`,
      body: `Coeficientul de variatie este ${cv.toFixed(0)}% — mult peste pragul de 14%. Asta inseamna ca de la o zi la alta HRV-ul variaza enorm, ceea ce e un marker de overreaching mai puternic decat HRV-ul absolut (${cite("plews2013")}). Cauze tipice: variatii mari in ora de culcare, alcool, caldura, stres acut. Primul pas: stabilizati bedtime-ul (±30 min) timp de 7 zile.`,
    });
  } else if (cv < 5) {
    out.push({
      id: "hrv-very-stable",
      category: "cardio",
      severity: "positive",
      priority: 15,
      title: "HRV ultra-stabil — homeostazie excelenta",
      body: `Variabilitatea zilnica este doar ${cv.toFixed(1)}% (CV). Corpul tau opereaza intr-un echilibru fiziologic remarcabil de constant — tonus autonom sanatos, somn regulat, stres controlat.`,
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
      title: `Fingerprint de stres saptamanal detectat`,
      body: `HRV-ul tau urmeaza un tipar saptamanal clar: cel mai bun in ${days[best.dow]} (+${best.deviation.toFixed(0)} ms), cel mai slab in ${days[worst.dow]} (${worst.deviation.toFixed(0)} ms). Diferenta de ${Math.abs(best.deviation - worst.deviation).toFixed(0)} ms intre cele doua zile sugereaza un factor consistent — program social de weekend, antrenamente grele intr-o anumita zi, sau stres profesional recurent.`,
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
      title: "Ritm saptamanal structurat detectat",
      body: `Autocorelatia la lag 7 zile: ${(cycle.strength * 100).toFixed(0)}% — zilele tale active si de odihna se repeta consistent. Tipic pentru un program de antrenament structurat sau un ritm profesional regulat.`,
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
      title: `VO2 Max in crestere: +${change.toFixed(1)} mL/kg/min`,
      body: `Apple iti estimeaza VO2 Max in crestere pe aceasta perioada. Fiecare 3.5 mL/kg/min castigat (1 MET) reduce riscul de mortalitate cardiovasculara cu ~13% (${cite("kodama2009")}). Continua rutina actuala.`,
    });
  } else {
    out.push({
      id: "vo2-declining",
      category: "cardio",
      severity: "warning",
      priority: 55,
      title: `VO2 Max in scadere: ${change.toFixed(1)} mL/kg/min`,
      body: `Declinul natural al VO2 Max este ~1 mL/kg/min pe an dupa 25 ani. Daca scaderea ta este peste acest ritm, nu e imbatranire ci decondtionare. Cel mai puternic motor de imbunatatire: zona 2 aerob (65-75% HR max) 3x/saptamana cate 30-45 min + 1 sesiune de intervale. Raspunsul incepe in 6-8 saptamani (${cite("acsm2021")}).`,
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
      title: "Imbatranesti mai incet decat media populatiei",
      body: `HRV-ul tau creste semnificativ pe perioada lunga (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}). In mod normal, HRV scade cu ~0.5 ms/an dupa 25 ani (${cite("umetani1998")}). Tu mergi in directia opusa — adaptare autonoma pozitiva, probabil datorita antrenamentului aerob sau reducerii stresului cronic.`,
    });
  } else {
    out.push({
      id: "aging-pace-faster",
      category: "cardio",
      severity: "warning",
      priority: 60,
      title: "Ritm de imbatranire autonoma accelerat",
      body: `HRV-ul tau scade semnificativ pe perioada lunga (τ=${mk.tau.toFixed(2)}, p=${mk.pValue.toFixed(3)}) — peste ritmul natural de ~0.5 ms/an (${cite("umetani1998")}). Cauze comune la acest nivel de accelerare: stres cronic prelungit, deficit de somn persistent, alcool regulat, sau sedentarism. Interventie prioritara: somnul (cel mai mare ROI pe HRV) si zona 2 aerob.`,
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
      ? `De la ${p.toFixed(1)} la ${r.toFixed(1)} mL/kg/min. O crestere de ${delta.toFixed(1)} mL/kg/min la un adult este semnificativa — reflecta imbunatatire reala a capacitatii aerobe, nu doar variatie de masurare (${cite("kodama2009")}).`
      : `De la ${p.toFixed(1)} la ${r.toFixed(1)} mL/kg/min. Declinul natural este ~1 mL/kg/min pe an dupa 25 ani. ${Math.abs(delta) > 2 ? "Scaderea ta este peste acest ritm, ceea ce indica decondtionare activa." : "Esti in ritmul normal de imbatranire."} (${cite("acsm2021")})`,
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
