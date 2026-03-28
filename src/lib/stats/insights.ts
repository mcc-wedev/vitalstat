import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { METRIC_CONFIG, getDisplayValue } from "../parser/healthTypes";
import { meanStd } from "./zScore";
import { pearson, pearsonPValue } from "./correlation";

export type InsightSeverity = "good" | "warning" | "alert" | "info";

export interface Insight {
  id: string;
  title: string;
  body: string;
  severity: InsightSeverity;
  category: string;
  metric?: string;
}

// ═══════════════════════════════════════════════════════════
// MAIN GENERATOR
// ═══════════════════════════════════════════════════════════

export function generateInsights(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[]
): Insight[] {
  const out: Insight[] = [];

  // Daily recommendation (always first)
  out.push(...dailyRecommendation(metrics, sleepNights));

  // Score driver
  out.push(...scoreDriver(metrics, sleepNights));

  // Strain score
  out.push(...strainInsights(metrics));

  // Sleep debt
  out.push(...sleepDebtInsights(sleepNights));

  // Cardio
  if (metrics.restingHeartRate?.length >= 14) out.push(...rhrInsights(metrics.restingHeartRate));
  if (metrics.hrv?.length >= 14) out.push(...hrvInsights(metrics.hrv));
  if (metrics.oxygenSaturation?.length >= 7) out.push(...spo2Insights(metrics.oxygenSaturation));
  if (metrics.vo2Max?.length >= 7) out.push(...vo2Insights(metrics.vo2Max));

  // Sleep
  if (sleepNights.length >= 7) out.push(...sleepInsights(sleepNights));

  // Activity
  out.push(...activityInsights(metrics));

  // Mobility
  out.push(...mobilityInsights(metrics));

  // Audio
  out.push(...audioInsights(metrics));

  // Illness detection
  out.push(...illnessDetection(metrics));

  // Patterns
  out.push(...patternDetection(metrics, sleepNights));

  // Day-of-week
  out.push(...dayOfWeekAnalysis(metrics, sleepNights));

  // Correlations
  out.push(...correlationInsights(metrics, sleepNights));

  // Weekly comparison
  out.push(...weeklyComparison(metrics, sleepNights));

  return out;
}

// ═══════════════════════════════════════════════════════════
// DAILY RECOMMENDATION — what to do today
// ═══════════════════════════════════════════════════════════

function dailyRecommendation(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  if (!rhr || rhr.length < 14 || !hrv || hrv.length < 14) return [];

  const { mean: rhrAvg, std: rhrStd } = meanStd(rhr.slice(-30).map(d => d.mean));
  const { mean: hrvAvg, std: hrvStd } = meanStd(hrv.slice(-30).map(d => d.mean));
  const rhrToday = rhr[rhr.length - 1].mean;
  const hrvToday = hrv[hrv.length - 1].mean;
  const rhrZ = rhrStd > 0 ? (rhrToday - rhrAvg) / rhrStd : 0;
  const hrvZ = hrvStd > 0 ? (hrvToday - hrvAvg) / hrvStd : 0;

  // Sleep last night
  const lastSleep = sleepNights.length > 0 ? sleepNights[sleepNights.length - 1] : null;
  const sleptWell = lastSleep ? lastSleep.totalMinutes >= 420 && lastSleep.efficiency >= 0.85 : true;

  let title = "";
  let body = "";
  let severity: InsightSeverity = "info";

  if (rhrZ > 1.5 && hrvZ < -1.5) {
    title = "Azi: odihna completa";
    body = "Corpul tau arata semne clare de oboseala — pulsul e ridicat si HRV-ul e scazut. Cel mai bun lucru pe care il poti face azi e sa te odihnesti, sa bei multa apa si sa dormi devreme.";
    severity = "alert";
  } else if (hrvZ < -1 || rhrZ > 1 || !sleptWell) {
    title = "Azi: ia-o usor";
    body = `Recuperarea ta nu e completa${!sleptWell ? " si ai dormit mai putin decat ai nevoie" : ""}. O plimbare usoara sau stretching sunt ok, dar evita antrenamentul intens. Maine va fi mai bine daca te odihnesti azi.`;
    severity = "warning";
  } else if (hrvZ > 1 && rhrZ < -0.5 && sleptWell) {
    title = "Azi: zi perfecta pentru antrenament intens";
    body = "Toate semnele sunt verzi — HRV peste medie, puls in repaus scazut, somn bun. Corpul tau e gata pentru efort maxim. Profita de ziua asta!";
    severity = "good";
  } else {
    title = "Azi: antrenament moderat";
    body = "Valorile tale sunt in zona normala. Poti face antrenament moderat — cardio, forta, sau sport. Asculta-ti corpul si nu forta peste limita.";
    severity = "good";
  }

  return [{ id: "daily-rec", title, body, severity, category: "recovery" }];
}

// ═══════════════════════════════════════════════════════════
// SCORE DRIVER — what's affecting your recovery most
// ═══════════════════════════════════════════════════════════

function scoreDriver(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  if (!rhr || rhr.length < 14 || !hrv || hrv.length < 14) return [];

  const { mean: rhrAvg, std: rhrStd } = meanStd(rhr.slice(-30).map(d => d.mean));
  const { mean: hrvAvg, std: hrvStd } = meanStd(hrv.slice(-30).map(d => d.mean));
  const rhrZ = rhrStd > 0 ? (rhr[rhr.length - 1].mean - rhrAvg) / rhrStd : 0;
  const hrvZ = hrvStd > 0 ? (hrv[hrv.length - 1].mean - hrvAvg) / hrvStd : 0;

  const lastSleep = sleepNights.length > 0 ? sleepNights[sleepNights.length - 1] : null;
  const sleepHours = lastSleep ? lastSleep.totalMinutes / 60 : 7;
  const sleepIssue = sleepHours < 6.5;

  // Find the weakest link
  const factors = [
    { name: "HRV-ul", impact: -hrvZ, issue: hrvZ < -1, detail: `HRV-ul tau e sub medie (${hrv[hrv.length-1].mean.toFixed(0)} ms vs ${hrvAvg.toFixed(0)} ms normal)` },
    { name: "Pulsul in repaus", impact: rhrZ, issue: rhrZ > 1, detail: `Pulsul e mai ridicat decat de obicei (${rhr[rhr.length-1].mean.toFixed(0)} bpm vs ${rhrAvg.toFixed(0)} bpm normal)` },
    { name: "Somnul", impact: sleepIssue ? 2 : 0, issue: sleepIssue, detail: `Ai dormit doar ${sleepHours.toFixed(1)}h — sub cele 7h recomandate` },
  ].sort((a, b) => b.impact - a.impact);

  const worst = factors.find(f => f.issue);
  if (!worst) return [];

  return [{
    id: "score-driver",
    title: `Ce iti afecteaza recuperarea: ${worst.name}`,
    body: `${worst.detail}. Acesta e factorul principal care iti trage scorul in jos azi. Concentreaza-te pe imbunatatirea lui.`,
    severity: "info",
    category: "recovery",
  }];
}

// ═══════════════════════════════════════════════════════════
// STRAIN SCORE
// ═══════════════════════════════════════════════════════════

function strainInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  const ex = metrics.exerciseTime;
  const active = metrics.activeEnergy;
  const steps = metrics.stepCount;
  if (!ex || ex.length < 7) return out;

  // Simple strain: exercise minutes + active calories normalized
  const last7 = ex.slice(-7);
  const prev7 = ex.slice(-14, -7);
  const todayEx = last7[last7.length - 1].sum;
  const todayCal = active ? active[active.length - 1]?.sum || 0 : 0;
  const todaySteps = steps ? steps[steps.length - 1]?.sum || 0 : 0;

  // Strain 0-21 (like WHOOP): based on exercise + activity
  const strain = Math.min(21, Math.round(
    (todayEx / 60) * 7 +  // 1h exercise = 7 strain
    (todayCal / 500) * 3 + // 500 cal = 3 strain
    (todaySteps / 10000) * 2 // 10k steps = 2 strain
  ));

  const strainLabel = strain >= 18 ? "Maximal" : strain >= 14 ? "Ridicat" : strain >= 10 ? "Moderat" : strain >= 5 ? "Usor" : "Minim";

  out.push({
    id: "strain-today",
    title: `Efort azi: ${strain}/21 — ${strainLabel}`,
    body: strain >= 14
      ? `Ai avut o zi foarte intensa (${todayEx.toFixed(0)} min exercitiu, ${todayCal.toFixed(0)} kcal arse). Corpul tau va avea nevoie de recuperare buna — prioritizeaza somnul azi noapte.`
      : strain >= 8
        ? `Nivel de efort moderat azi (${todayEx.toFixed(0)} min exercitiu). Un echilibru bun intre activitate si recuperare.`
        : `Zi cu efort redus (${todayEx.toFixed(0)} min exercitiu). Daca te simti bine, maine ar fi o zi buna pentru un antrenament mai intens.`,
    severity: strain >= 18 ? "warning" : "info",
    category: "activity",
  });

  // 7-day strain load
  if (prev7.length >= 5) {
    const weekStrain = last7.reduce((s, d) => s + d.sum, 0);
    const prevWeekStrain = prev7.reduce((s, d) => s + d.sum, 0);
    if (prevWeekStrain > 0) {
      const ratio = weekStrain / prevWeekStrain;
      if (ratio > 1.3) {
        out.push({
          id: "strain-spike",
          title: "Ai crescut efortul prea repede",
          body: `Volumul de exercitiu din aceasta saptamana e cu ${((ratio - 1) * 100).toFixed(0)}% mai mare decat saptamana trecuta. Regula de aur: nu creste volumul cu mai mult de 10% pe saptamana, altfel creste riscul de accidentare.`,
          severity: "warning",
          category: "activity",
        });
      }
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// SLEEP DEBT
// ═══════════════════════════════════════════════════════════

function sleepDebtInsights(sleepNights: SleepNight[]): Insight[] {
  if (sleepNights.length < 7) return [];
  const last7 = sleepNights.slice(-7);
  const TARGET_HOURS = 8; // recommended for most adults

  // Sleep debt = sum of (target - actual) over 7 days
  let debt = 0;
  for (const night of last7) {
    const hours = night.totalMinutes / 60;
    debt += TARGET_HOURS - hours; // positive = you owe sleep
  }

  const debtHours = Math.max(0, debt);
  const creditHours = Math.max(0, -debt);

  if (debtHours > 5) {
    return [{
      id: "sleep-debt",
      title: `Datorie de somn: ${debtHours.toFixed(1)} ore`,
      body: `In ultima saptamana, ai dormit cu ${debtHours.toFixed(1)} ore mai putin decat ai nevoie. Datoria de somn se acumuleaza si afecteaza concentrarea, imunitatea si dispozitia. Nu o poti recupera intr-o singura noapte — ai nevoie de 2-3 nopti cu 1-2 ore in plus.`,
      severity: "alert",
      category: "sleep",
    }];
  } else if (debtHours > 2) {
    return [{
      id: "sleep-debt",
      title: `Datorie usoara de somn: ${debtHours.toFixed(1)} ore`,
      body: `Ai un mic deficit de somn acumulat. Incearca sa adormi cu 30 minute mai devreme in urmatoarele nopti.`,
      severity: "warning",
      category: "sleep",
    }];
  } else if (creditHours > 3) {
    return [{
      id: "sleep-credit",
      title: "Somn excelent saptamana asta",
      body: `Ai dormit cu ${creditHours.toFixed(1)} ore mai mult decat minimul necesar. Corpul tau e bine odihnit — vei simti beneficiile in energie si concentrare.`,
      severity: "good",
      category: "sleep",
    }];
  }

  return [];
}

// ═══════════════════════════════════════════════════════════
// PATTERN DETECTION
// ═══════════════════════════════════════════════════════════

function patternDetection(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const out: Insight[] = [];

  // Pattern: short sleep → next day HRV drop
  if (sleepNights.length >= 30 && metrics.hrv?.length >= 30) {
    const sleepMap = new Map(sleepNights.map(n => [n.date, n.totalMinutes / 60]));
    const hrvMap = new Map(metrics.hrv.map(d => [d.date, d.mean]));
    const dates = [...hrvMap.keys()].sort();

    let shortSleepHRVDrop = 0;
    let shortSleepCount = 0;
    let normalSleepHRVMean = 0;
    let normalCount = 0;

    for (let i = 1; i < dates.length; i++) {
      const sleep = sleepMap.get(dates[i - 1]);
      const hrv = hrvMap.get(dates[i]);
      if (sleep === undefined || hrv === undefined) continue;

      if (sleep < 6) {
        shortSleepHRVDrop += hrv;
        shortSleepCount++;
      } else {
        normalSleepHRVMean += hrv;
        normalCount++;
      }
    }

    if (shortSleepCount >= 5 && normalCount >= 10) {
      const shortAvg = shortSleepHRVDrop / shortSleepCount;
      const normalAvg = normalSleepHRVMean / normalCount;
      const dropPct = ((normalAvg - shortAvg) / normalAvg) * 100;

      if (dropPct > 5) {
        out.push({
          id: "pattern-sleep-hrv",
          title: "Pattern gasit: somn scurt → HRV scazut",
          body: `Am analizat datele tale si am gasit un tipar clar: de fiecare data cand dormi sub 6 ore, HRV-ul scade cu ~${dropPct.toFixed(0)}% a doua zi (${shortAvg.toFixed(0)} ms vs ${normalAvg.toFixed(0)} ms dupa somn normal). Asta inseamna ca somnul tau are un impact direct si masurabil asupra recuperarii.`,
          severity: "info",
          category: "correlation",
        });
      }
    }
  }

  // Pattern: consecutive high strain → RHR elevation
  if (metrics.exerciseTime?.length >= 30 && metrics.restingHeartRate?.length >= 30) {
    const exMap = new Map(metrics.exerciseTime.map(d => [d.date, d.sum]));
    const rhrMap = new Map(metrics.restingHeartRate.map(d => [d.date, d.mean]));
    const dates = [...rhrMap.keys()].sort();

    let afterHighDays = 0;
    let afterHighRHR = 0;
    let afterNormalDays = 0;
    let afterNormalRHR = 0;

    for (let i = 2; i < dates.length; i++) {
      const ex1 = exMap.get(dates[i - 2]) || 0;
      const ex2 = exMap.get(dates[i - 1]) || 0;
      const rhr = rhrMap.get(dates[i]);
      if (rhr === undefined) continue;

      if (ex1 > 60 && ex2 > 60) { // 2 consecutive days of 60+ min
        afterHighRHR += rhr;
        afterHighDays++;
      } else {
        afterNormalRHR += rhr;
        afterNormalDays++;
      }
    }

    if (afterHighDays >= 3 && afterNormalDays >= 10) {
      const highAvg = afterHighRHR / afterHighDays;
      const normalAvg = afterNormalRHR / afterNormalDays;
      const diff = highAvg - normalAvg;

      if (diff > 2) {
        out.push({
          id: "pattern-strain-rhr",
          title: "Pattern gasit: efort consecutiv → puls crescut",
          body: `Cand ai 2+ zile consecutive cu exercitiu intens (>60 min), pulsul in repaus creste cu ~${diff.toFixed(0)} bpm in ziua urmatoare. E un semn ca corpul tau cere o pauza dupa efort intens consecutiv.`,
          severity: "info",
          category: "correlation",
        });
      }
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// DAY-OF-WEEK ANALYSIS
// ═══════════════════════════════════════════════════════════

function dayOfWeekAnalysis(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const out: Insight[] = [];
  const dayNames = ["Duminica", "Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata"];

  // Sleep by day of week
  if (sleepNights.length >= 28) {
    const byDay: number[][] = [[], [], [], [], [], [], []];
    sleepNights.forEach(n => {
      const dow = new Date(n.date).getDay();
      byDay[dow].push(n.totalMinutes / 60);
    });

    const avgs = byDay.map((vals, i) => ({
      day: dayNames[i],
      avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      count: vals.length,
    })).filter(d => d.count >= 3);

    if (avgs.length >= 5) {
      const worst = avgs.reduce((a, b) => a.avg < b.avg ? a : b);
      const best = avgs.reduce((a, b) => a.avg > b.avg ? a : b);
      const diff = best.avg - worst.avg;

      if (diff > 0.5) {
        out.push({
          id: "dow-sleep",
          title: `Dormi cel mai putin ${worst.day.toLowerCase()} noapte`,
          body: `Media ta: ${worst.avg.toFixed(1)}h ${worst.day.toLowerCase()} vs ${best.avg.toFixed(1)}h ${best.day.toLowerCase()} — o diferenta de ${(diff * 60).toFixed(0)} minute. Incearca sa pastrezi un program consistent in fiecare noapte.`,
          severity: diff > 1 ? "warning" : "info",
          category: "sleep",
        });
      }
    }
  }

  // Steps by day of week
  if (metrics.stepCount?.length >= 28) {
    const byDay: number[][] = [[], [], [], [], [], [], []];
    metrics.stepCount.forEach(d => {
      const dow = new Date(d.date).getDay();
      byDay[dow].push(d.sum);
    });

    const avgs = byDay.map((vals, i) => ({
      day: dayNames[i],
      avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      count: vals.length,
    })).filter(d => d.count >= 3);

    if (avgs.length >= 5) {
      const best = avgs.reduce((a, b) => a.avg > b.avg ? a : b);
      const worst = avgs.reduce((a, b) => a.avg < b.avg ? a : b);

      out.push({
        id: "dow-steps",
        title: `Cel mai activ: ${best.day}`,
        body: `Faci in medie ${best.avg.toFixed(0)} pasi ${best.day.toLowerCase()} si doar ${worst.avg.toFixed(0)} ${worst.day.toLowerCase()}. Incearca sa adaugi o plimbare scurta in zilele mai putin active.`,
        severity: "info",
        category: "activity",
      });
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// CARDIO INSIGHTS (friendly language)
// ═══════════════════════════════════════════════════════════

function rhrInsights(data: DailySummary[]): Insight[] {
  const out: Insight[] = [];
  const today = data[data.length - 1].mean;
  const last30 = data.slice(-30).map(d => d.mean);
  const prev30 = data.slice(-60, -30).map(d => d.mean);
  const { mean: avg30, std: std30 } = meanStd(last30);
  const z = std30 > 0 ? (today - avg30) / std30 : 0;

  if (z > 2) {
    out.push({ id: "rhr-high", title: "Puls in repaus neobisnuit de ridicat", severity: "alert", category: "cardio", metric: "restingHeartRate",
      body: `Pulsul tau in repaus azi (${today.toFixed(0)} bpm) e mult peste ce e normal pentru tine (${avg30.toFixed(0)} bpm). Asta poate insemna ca esti obosit, deshidratat, stresat, sau ca se pregateste o raceala. Bea apa, evita efortul intens si dormi devreme.` });
  } else if (z < -1.5) {
    out.push({ id: "rhr-low", title: "Puls in repaus excelent azi", severity: "good", category: "cardio", metric: "restingHeartRate",
      body: `Pulsul tau (${today.toFixed(0)} bpm) e sub media ta (${avg30.toFixed(0)} bpm). Asta inseamna ca esti bine recuperat. Zi buna pentru efort fizic!` });
  }

  if (prev30.length >= 14) {
    const { mean: prevAvg } = meanStd(prev30);
    const pct = ((avg30 - prevAvg) / prevAvg) * 100;
    if (pct < -3) {
      out.push({ id: "rhr-trend-good", title: "Fitness-ul tau cardiovascular se imbunatateste", severity: "good", category: "trend", metric: "restingHeartRate",
        body: `In ultima luna, pulsul tau in repaus a scazut de la ${prevAvg.toFixed(0)} la ${avg30.toFixed(0)} bpm. Un puls in repaus in scadere e unul dintre cele mai clare semne ca inima ta devine mai eficienta.` });
    } else if (pct > 5) {
      out.push({ id: "rhr-trend-bad", title: "Pulsul in repaus creste de cateva saptamani", severity: "warning", category: "trend", metric: "restingHeartRate",
        body: `Media pulsului a crescut de la ${prevAvg.toFixed(0)} la ${avg30.toFixed(0)} bpm. Poate fi oboseala acumulata, stres la munca, sau lipsa de somn. Ia in considerare o saptamana mai usoara.` });
    }
  }

  return out;
}

function hrvInsights(data: DailySummary[]): Insight[] {
  const out: Insight[] = [];
  const today = data[data.length - 1].mean;
  const last30 = data.slice(-30).map(d => d.mean);
  const prev30 = data.slice(-60, -30).map(d => d.mean);
  const { mean: avg30, std: std30 } = meanStd(last30);
  const z = std30 > 0 ? (today - avg30) / std30 : 0;

  if (z < -2) {
    out.push({ id: "hrv-low", title: "HRV mult sub normal — corpul tau e sub stres", severity: "alert", category: "recovery", metric: "hrv",
      body: `HRV-ul tau (${today.toFixed(0)} ms) e mult sub ce e obisnuit pentru tine (${avg30.toFixed(0)} ms). HRV-ul scazut e adesea primul semn ca ceva nu e in regula — stres, oboseala, sau o boala care urmeaza. Ia-o usor si acorda-ti grija suplimentara.` });
  } else if (z > 1.5) {
    out.push({ id: "hrv-high", title: "HRV peste medie — esti excelent recuperat", severity: "good", category: "recovery", metric: "hrv",
      body: `HRV-ul tau (${today.toFixed(0)} ms) e peste media ta. Asta inseamna ca sistemul nervos e relaxat si pregatit de efort. Profita!` });
  }

  if (prev30.length >= 14) {
    const { mean: prevAvg } = meanStd(prev30);
    const pct = ((avg30 - prevAvg) / prevAvg) * 100;
    if (pct > 10) {
      out.push({ id: "hrv-up", title: "HRV-ul tau creste de la luna la luna", severity: "good", category: "trend", metric: "hrv",
        body: `De la ${prevAvg.toFixed(0)} la ${avg30.toFixed(0)} ms (+${pct.toFixed(0)}%). HRV in crestere pe termen lung inseamna ca corpul tau se adapteaza bine la antrenament si stres.` });
    } else if (pct < -10) {
      out.push({ id: "hrv-down", title: "HRV-ul scade de cateva saptamani", severity: "warning", category: "trend", metric: "hrv",
        body: `HRV-ul mediu a scazut de la ${prevAvg.toFixed(0)} la ${avg30.toFixed(0)} ms. O scadere sustinuta poate insemna oboseala acumulata sau stres cronic. Incearca sa dormi mai mult si sa reduci antrenamentul intens.` });
    }
  }

  return out;
}

function spo2Insights(data: DailySummary[]): Insight[] {
  const today = data[data.length - 1].mean * 100;
  if (today < 94) {
    return [{ id: "spo2-low", title: "Oxigen in sange scazut", severity: "alert", category: "cardio", metric: "oxygenSaturation",
      body: `SpO2 (${today.toFixed(1)}%) e sub 94%. Daca te simti ameteala, oboseala, sau ai dificultati de respiratie, ar fi bine sa consulti un medic.` }];
  }
  return [];
}

function vo2Insights(data: DailySummary[]): Insight[] {
  const latest = data[data.length - 1].mean;
  const cls = latest >= 50 ? "excelent" : latest >= 42 ? "bun" : latest >= 35 ? "mediu" : "sub medie";
  return [{
    id: "vo2",
    title: `VO2 Max: ${latest.toFixed(1)} — nivel ${cls}`,
    body: latest >= 42
      ? `Capacitatea ta aeroba e ${cls}. VO2 Max e cel mai important predictor de longevitate din medicina — fiecare punct in plus reduce riscul de mortalitate cu ~9%.`
      : `VO2 Max-ul tau poate fi imbunatatit. Cel mai eficient mod: 150+ minute pe saptamana de cardio la intensitate moderata (ritmul la care poti tine o conversatie). In 6-8 saptamani vei vedea progres.`,
    severity: latest >= 42 ? "good" : "info",
    category: "cardio",
    metric: "vo2Max",
  }];
}

// ═══════════════════════════════════════════════════════════
// SLEEP INSIGHTS (friendly language)
// ═══════════════════════════════════════════════════════════

function sleepInsights(nights: SleepNight[]): Insight[] {
  const out: Insight[] = [];
  const last7 = nights.slice(-7);
  const durations = last7.map(n => n.totalMinutes / 60);
  const { mean: avg } = meanStd(durations);
  const totalMin = last7.reduce((s, n) => s + n.totalMinutes, 0);
  const deepPct = totalMin > 0 ? (last7.reduce((s, n) => s + n.stages.deep, 0) / totalMin) * 100 : 0;
  const remPct = totalMin > 0 ? (last7.reduce((s, n) => s + n.stages.rem, 0) / totalMin) * 100 : 0;
  const efficiencies = last7.map(n => n.efficiency * 100);
  const { mean: avgEff } = meanStd(efficiencies);

  if (avg < 6) {
    out.push({ id: "sleep-short", title: "Dormi prea putin", severity: "alert", category: "sleep",
      body: `Media ta e de doar ${avg.toFixed(1)} ore. Sub 6 ore pe noapte creste riscul de boli de inima cu 48% si slabeste imunitatea. Cel mai important lucru pe care il poti face e sa pui un alarm de culcare cu 8 ore inainte de trezire.` });
  } else if (avg < 7) {
    out.push({ id: "sleep-below", title: "Somnul tau e sub optim", severity: "warning", category: "sleep",
      body: `${avg.toFixed(1)} ore pe noapte — sub cele 7-9h recomandate. Chiar si 30 minute in plus pe noapte fac o diferenta mare in energie si concentrare.` });
  } else {
    out.push({ id: "sleep-ok", title: "Durata somnului e buna", severity: "good", category: "sleep",
      body: `${avg.toFixed(1)} ore pe noapte — in tinta. Somnul suficient e fundatia pe care se construieste totul.` });
  }

  if (deepPct < 10 && deepPct > 0) {
    out.push({ id: "deep-low", title: "Somnul profund e insuficient", severity: "warning", category: "sleep",
      body: `Doar ${deepPct.toFixed(0)}% din somnul tau e profund (ideal: 15-20%). Somnul profund e cel care repara muschii si consolideaza memoria. Sfaturi: evita alcoolul, mentine camera racoros (18°C), si fa exercitiu dimineata, nu seara.` });
  }

  if (remPct < 15 && remPct > 0) {
    out.push({ id: "rem-low", title: "Somnul REM e sub tinta", severity: "warning", category: "sleep",
      body: `REM-ul tau e ${remPct.toFixed(0)}% (ideal: 20-25%). Somnul REM e esential pentru procesarea emotiilor si invatare. Cafeina dupa ora 14 si alcoolul sunt cei mai comuni "ucigasi" de REM.` });
  }

  if (avgEff < 80) {
    out.push({ id: "eff-low", title: "Petreci prea mult timp treaz in pat", severity: "warning", category: "sleep",
      body: `Eficienta somnului: ${avgEff.toFixed(0)}%. Asta inseamna ca stai in pat dar nu dormi. Sfat de la specialisti: daca nu adormi in 20 minute, ridica-te si fa ceva relaxant. Intoarce-te in pat doar cand simti somnolos.` });
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// ACTIVITY
// ═══════════════════════════════════════════════════════════

function activityInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  const steps = metrics.stepCount;
  if (!steps || steps.length < 14) return out;

  const last7 = steps.slice(-7).map(d => d.sum);
  const { mean: avg } = meanStd(last7);

  if (avg < 5000) {
    out.push({ id: "steps-low", title: "Nivel de activitate foarte scazut", severity: "alert", category: "activity",
      body: `${avg.toFixed(0)} pasi pe zi — sub pragul de 5,000 (sedentar). Nu e nevoie sa alergi maratoane — o plimbare de 30 min zilnic te duce la 7,000+ pasi si face o diferenta enorma pentru sanatate.` });
  } else if (avg >= 8000) {
    out.push({ id: "steps-good", title: "Esti activ — bravo!", severity: "good", category: "activity",
      body: `${avg.toFixed(0)} pasi pe zi — peste pragul unde beneficiile pentru sanatate sunt cele mai mari.` });
  }

  if (metrics.exerciseTime?.length >= 7) {
    const weekTotal = metrics.exerciseTime.slice(-7).reduce((s, d) => s + d.sum, 0);
    if (weekTotal < 150) {
      out.push({ id: "ex-low", title: "Exercitiu sub recomandarea OMS", severity: "warning", category: "activity",
        body: `${weekTotal.toFixed(0)} minute de exercitiu saptamana asta. OMS recomanda 150 min/saptamana — reduce riscul de boli cardiovasculare cu 30-40%. Chiar si 3 plimbari rapide de 15 min pe zi te duc acolo.` });
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// MOBILITY
// ═══════════════════════════════════════════════════════════

function mobilityInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];

  if (metrics.walkingSpeed?.length >= 14) {
    const { mean: avg } = meanStd(metrics.walkingSpeed.slice(-30).map(d => d.mean));
    if (avg < 0.8) {
      out.push({ id: "walk-slow", title: "Viteza de mers e scazuta", severity: "warning", category: "mobility", metric: "walkingSpeed",
        body: `Viteza medie (${(avg * 3.6).toFixed(1)} km/h) e sub 3 km/h. In studii cu zeci de mii de participanti, viteza de mers e cel mai puternic indicator de sanatate generala. Exercitiile de forta si echilibru pot ajuta.` });
    }
  }

  if (metrics.walkingAsymmetry?.length >= 14) {
    const { mean: avg } = meanStd(metrics.walkingAsymmetry.slice(-7).map(d => d.mean));
    if (avg > 10) {
      out.push({ id: "asymm", title: "Mergi asimetric", severity: "warning", category: "mobility", metric: "walkingAsymmetry",
        body: `Asimetria mersului tau (${avg.toFixed(1)}%) sugereaza ca un picior lucreaza diferit de celalalt. Asta poate fi un semn de accidentare compensata sau dezechilibru muscular. Daca e persistent, merita o vizita la fizioterapeut.` });
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// AUDIO
// ═══════════════════════════════════════════════════════════

function audioInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  if (metrics.headphoneAudio?.length >= 7) {
    const { mean: avg } = meanStd(metrics.headphoneAudio.slice(-7).map(d => d.mean));
    if (avg > 85) {
      out.push({ id: "audio-danger", title: "Volumul castilor iti poate afecta auzul", severity: "alert", category: "wellbeing", metric: "headphoneAudio",
        body: `Volumul mediu (${avg.toFixed(0)} dB) depaseste 85 dB — pragul la care deteriorarea auzului poate incepe dupa 2 ore de expunere zilnica. Da volumul mai incet — auzul pierdut nu se recupereaza.` });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════
// ILLNESS DETECTION
// ═══════════════════════════════════════════════════════════

function illnessDetection(metrics: Record<string, DailySummary[]>): Insight[] {
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  if (!rhr || rhr.length < 30 || !hrv || hrv.length < 30) return [];

  const { mean: rhrAvg, std: rhrStd } = meanStd(rhr.slice(-30).map(d => d.mean));
  const { mean: hrvAvg, std: hrvStd } = meanStd(hrv.slice(-30).map(d => d.mean));
  const rhrZ = rhrStd > 0 ? (rhr[rhr.length - 1].mean - rhrAvg) / rhrStd : 0;
  const hrvZ = hrvStd > 0 ? (hrv[hrv.length - 1].mean - hrvAvg) / hrvStd : 0;

  let spo2Low = false;
  if (metrics.oxygenSaturation?.length > 0) spo2Low = metrics.oxygenSaturation[metrics.oxygenSaturation.length - 1].mean * 100 < 95;

  const flags = [rhrZ > 1.5, hrvZ < -1.5, spo2Low].filter(Boolean).length;

  if (flags >= 2) {
    return [{
      id: "illness",
      title: "Atentie: corpul tau arata semne de boala sau suprasolicitare",
      body: `Mai multi indicatori sunt in zona rosie simultan${rhrZ > 1.5 ? " (puls crescut)" : ""}${hrvZ < -1.5 ? " (HRV scazut)" : ""}${spo2Low ? " (oxigen scazut)" : ""}. Acest tipar apare de obicei cu 1-2 zile INAINTE de simptome. Recomandare: odihna, hidratare, somn suplimentar. Sari peste antrenament.`,
      severity: "alert",
      category: "recovery",
    }];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════
// CORRELATIONS (with friendly explanation)
// ═══════════════════════════════════════════════════════════

function correlationInsights(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const out: Insight[] = [];

  // Sleep → HRV
  if (sleepNights.length >= 30 && metrics.hrv?.length >= 30) {
    const sleepMap = new Map(sleepNights.map(n => [n.date, n.totalMinutes / 60]));
    const hrvMap = new Map(metrics.hrv.map(d => [d.date, d.mean]));
    const dates = [...hrvMap.keys()].sort();

    const xs: number[] = [], ys: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const s = sleepMap.get(dates[i - 1]);
      const h = hrvMap.get(dates[i]);
      if (s !== undefined && h !== undefined) { xs.push(s); ys.push(h); }
    }

    if (xs.length >= 20) {
      const r = pearson(xs, ys);
      const p = pearsonPValue(r, xs.length);
      if (r > 0.25 && p < 0.01) {
        out.push({
          id: "corr-sleep-hrv",
          title: "Somnul tau imbunatateste direct recuperarea",
          body: `Am gasit o legatura clara in datele tale: noptile in care dormi mai mult sunt urmate de HRV mai mare a doua zi. Cu cat dormi mai bine, cu atat te recuperezi mai repede. Aceasta legatura e confirmata statistic (r=${r.toFixed(2)}).`,
          severity: "info",
          category: "correlation",
        });
      }
    }
  }

  // Steps → RHR
  if (metrics.stepCount?.length >= 30 && metrics.restingHeartRate?.length >= 30) {
    const stepsMap = new Map(metrics.stepCount.map(d => [d.date, d.sum]));
    const rhrMap = new Map(metrics.restingHeartRate.map(d => [d.date, d.mean]));
    const dates = [...rhrMap.keys()].sort();

    const xs: number[] = [], ys: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const s = stepsMap.get(dates[i - 1]);
      const h = rhrMap.get(dates[i]);
      if (s !== undefined && h !== undefined) { xs.push(s); ys.push(h); }
    }

    if (xs.length >= 20) {
      const r = pearson(xs, ys);
      const p = pearsonPValue(r, xs.length);
      if (Math.abs(r) > 0.25 && p < 0.01) {
        out.push({
          id: "corr-steps-rhr",
          title: r > 0 ? "Zilele active iti cresc pulsul a doua zi" : "Activitatea iti scade pulsul in repaus",
          body: r > 0
            ? `Dupa zilele cu multi pasi, pulsul tau in repaus tinde sa fie putin mai ridicat a doua zi. E normal — corpul se recupereaza dupa efort.`
            : `Zilele mai active sunt urmate de puls mai scazut. Asta sugereaza ca activitatea fizica te ajuta sa te relaxezi mai bine.`,
          severity: "info",
          category: "correlation",
        });
      }
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// WEEKLY COMPARISON
// ═══════════════════════════════════════════════════════════

function weeklyComparison(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const lines: string[] = [];

  const items: { key: string; label: string; useSum: boolean; better: "up" | "down" }[] = [
    { key: "stepCount", label: "Pasi", useSum: true, better: "up" },
    { key: "restingHeartRate", label: "Puls repaus", useSum: false, better: "down" },
    { key: "hrv", label: "HRV", useSum: false, better: "up" },
    { key: "exerciseTime", label: "Exercitiu", useSum: true, better: "up" },
  ];

  for (const { key, label, useSum, better } of items) {
    const data = metrics[key];
    if (!data || data.length < 14) continue;
    const tw = data.slice(-7).map(d => useSum ? d.sum : d.mean);
    const lw = data.slice(-14, -7).map(d => useSum ? d.sum : d.mean);
    const { mean: t } = meanStd(tw);
    const { mean: l } = meanStd(lw);
    if (l === 0) continue;

    const pct = ((t - l) / l) * 100;
    const arrow = pct > 2 ? "↑" : pct < -2 ? "↓" : "→";
    const isGood = (pct > 0 && better === "up") || (pct < 0 && better === "down");
    const status = Math.abs(pct) < 3 ? "stabil" : isGood ? "mai bine" : "mai rau";
    lines.push(`${label}: ${arrow} ${Math.abs(pct).toFixed(0)}% (${status})`);
  }

  if (sleepNights.length >= 14) {
    const tw = sleepNights.slice(-7).map(n => n.totalMinutes / 60);
    const lw = sleepNights.slice(-14, -7).map(n => n.totalMinutes / 60);
    const { mean: t } = meanStd(tw);
    const { mean: l } = meanStd(lw);
    if (l > 0) {
      const pct = ((t - l) / l) * 100;
      const arrow = pct > 2 ? "↑" : pct < -2 ? "↓" : "→";
      lines.push(`Somn: ${arrow} ${Math.abs(pct).toFixed(0)}% (${Math.abs(pct) < 3 ? "stabil" : pct > 0 ? "mai bine" : "mai rau"})`);
    }
  }

  if (lines.length >= 3) {
    return [{
      id: "weekly",
      title: "Saptamana asta vs saptamana trecuta",
      body: lines.join("\n"),
      severity: "info",
      category: "trend",
    }];
  }
  return [];
}
