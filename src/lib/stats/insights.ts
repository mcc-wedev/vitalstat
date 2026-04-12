import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { METRIC_CONFIG, getDisplayValue } from "../parser/healthTypes";
import { meanStd } from "./zScore";
import { pearson, pearsonPValue } from "./correlation";
import { trendRegression } from "./regression";

export type InsightSeverity = "good" | "warning" | "alert" | "info";

export interface Insight {
  id: string;
  title: string;
  body: string;
  severity: InsightSeverity;
  category: string;
  metric?: string;
}

// Helper: safe last N
function lastN<T>(arr: T[], n: number): T[] { return arr.slice(-n); }
function vals(data: DailySummary[], field: "mean" | "sum" = "mean"): number[] { return data.map(d => d[field]); }

// ═══════════════════════════════════════════════════════════
// MAIN GENERATOR
// ═══════════════════════════════════════════════════════════

export function generateInsights(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[]
): Insight[] {
  const out: Insight[] = [];

  // ── Recovery & daily ──
  out.push(...dailyRecommendation(metrics, sleepNights));
  out.push(...scoreDriver(metrics, sleepNights));
  out.push(...illnessDetection(metrics));

  // ── Training load ──
  out.push(...strainInsights(metrics));
  out.push(...trainingBalance(metrics));

  // ── Sleep deep analysis ──
  out.push(...sleepDebtInsights(sleepNights));
  if (sleepNights.length >= 7) out.push(...sleepInsights(sleepNights));
  out.push(...sleepConsistency(sleepNights));
  out.push(...socialJetLag(sleepNights));
  out.push(...sleepStagesTrend(sleepNights));

  // ── Cardiovascular ──
  if (metrics.restingHeartRate?.length >= 14) out.push(...rhrInsights(metrics.restingHeartRate));
  if (metrics.hrv?.length >= 14) out.push(...hrvInsights(metrics.hrv));
  if (metrics.oxygenSaturation?.length >= 7) out.push(...spo2Insights(metrics.oxygenSaturation));
  if (metrics.vo2Max?.length >= 7) out.push(...vo2Insights(metrics.vo2Max));
  out.push(...bloodPressureInsights(metrics));
  out.push(...respiratoryInsights(metrics));

  // ── Activity ──
  out.push(...activityInsights(metrics));
  out.push(...exerciseEfficiency(metrics));

  // ── Mobility ──
  out.push(...mobilityInsights(metrics));

  // ── Body composition ──
  out.push(...bodyInsights(metrics));

  // ── Audio & wellbeing ──
  out.push(...audioInsights(metrics));
  out.push(...wellbeingInsights(metrics));

  // ── Patterns & correlations ──
  out.push(...patternDetection(metrics, sleepNights));
  out.push(...dayOfWeekAnalysis(metrics, sleepNights));
  out.push(...correlationInsights(metrics, sleepNights));
  out.push(...weeklyComparison(metrics, sleepNights));
  out.push(...monthlyTrend(metrics, sleepNights));

  // ── Personalized records ──
  out.push(...personalRecords(metrics, sleepNights));

  // ── ADVANCED INSIGHTS v2 ──
  out.push(...illnessPrediction48h(metrics, sleepNights));
  out.push(...overtrainingSyndromeDetection(metrics, sleepNights));
  out.push(...chronotypeDetection(sleepNights, metrics));
  out.push(...stressFingerprint(metrics));
  out.push(...sleepDebtImpactCalculator(metrics, sleepNights));
  out.push(...seasonalPatternDetection(metrics));
  out.push(...personalRecoveryFormula(metrics, sleepNights));
  out.push(...fitnessAgeTrajectory(metrics, sleepNights));

  return out;
}

// ═══════════════════════════════════════════════════════════
// DAILY RECOMMENDATION
// ═══════════════════════════════════════════════════════════

function dailyRecommendation(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  if (!rhr || rhr.length < 14 || !hrv || hrv.length < 14) return [];

  const { mean: rhrAvg, std: rhrStd } = meanStd(vals(lastN(rhr, 30)));
  const { mean: hrvAvg, std: hrvStd } = meanStd(vals(lastN(hrv, 30)));
  const rhrToday = rhr[rhr.length - 1].mean;
  const hrvToday = hrv[hrv.length - 1].mean;
  const rhrZ = rhrStd > 0 ? (rhrToday - rhrAvg) / rhrStd : 0;
  const hrvZ = hrvStd > 0 ? (hrvToday - hrvAvg) / hrvStd : 0;

  const lastSleep = sleepNights.length > 0 ? sleepNights[sleepNights.length - 1] : null;
  const sleptWell = lastSleep ? lastSleep.totalMinutes >= 420 && lastSleep.efficiency >= 0.85 : true;
  const sleepHours = lastSleep ? (lastSleep.totalMinutes / 60).toFixed(1) : "?";

  if (rhrZ > 1.5 && hrvZ < -1.5) {
    return [{ id: "daily-rec", severity: "alert", category: "recovery",
      title: "Recomandare: odihna completa",
      body: `Pulsul tau e cu ${(rhrToday - rhrAvg).toFixed(0)} bpm peste normal (${rhrToday.toFixed(0)} vs ${rhrAvg.toFixed(0)} bpm), iar HRV-ul e cu ${(hrvAvg - hrvToday).toFixed(0)} ms sub media ta. Aceasta combinatie indica stres fiziologic semnificativ. Evita efortul fizic, hidrateaza-te bine si culca-te cu cel putin 1 ora mai devreme.` }];
  }

  if (hrvZ < -1 || rhrZ > 1 || !sleptWell) {
    const reasons: string[] = [];
    if (hrvZ < -1) reasons.push(`HRV sub medie (${hrvToday.toFixed(0)} vs ${hrvAvg.toFixed(0)} ms)`);
    if (rhrZ > 1) reasons.push(`puls ridicat (${rhrToday.toFixed(0)} vs ${rhrAvg.toFixed(0)} bpm)`);
    if (!sleptWell) reasons.push(`somn insuficient (${sleepHours}h)`);
    return [{ id: "daily-rec", severity: "warning", category: "recovery",
      title: "Recomandare: zi usoara",
      body: `Corpul nu e complet recuperat: ${reasons.join(", ")}. O plimbare sau stretching sunt ok, dar evita antrenamentul intens. Prioritizeaza somnul azi noapte.` }];
  }

  if (hrvZ > 1 && rhrZ < -0.5 && sleptWell) {
    return [{ id: "daily-rec", severity: "good", category: "recovery",
      title: "Zi ideala pentru performanta",
      body: `HRV e cu ${(hrvToday - hrvAvg).toFixed(0)} ms peste medie, pulsul e scazut la ${rhrToday.toFixed(0)} bpm, ai dormit ${sleepHours}h. Toate semnalele indica recuperare excelenta — profita de aceasta zi pentru un antrenament intens sau provocator.` }];
  }

  return [{ id: "daily-rec", severity: "good", category: "recovery",
    title: "Totul normal — antrenament moderat",
    body: `Valorile sunt in zona bazala (RHR ${rhrToday.toFixed(0)} bpm, HRV ${hrvToday.toFixed(0)} ms). Poti face orice tip de activitate la intensitate moderata.` }];
}

// ═══════════════════════════════════════════════════════════
// SCORE DRIVER
// ═══════════════════════════════════════════════════════════

function scoreDriver(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  if (!rhr || rhr.length < 14 || !hrv || hrv.length < 14) return [];

  const { mean: rhrAvg, std: rhrStd } = meanStd(vals(lastN(rhr, 30)));
  const { mean: hrvAvg, std: hrvStd } = meanStd(vals(lastN(hrv, 30)));
  const rhrZ = rhrStd > 0 ? (rhr[rhr.length - 1].mean - rhrAvg) / rhrStd : 0;
  const hrvZ = hrvStd > 0 ? (hrv[hrv.length - 1].mean - hrvAvg) / hrvStd : 0;
  const lastSleep = sleepNights.length > 0 ? sleepNights[sleepNights.length - 1] : null;
  const sleepHours = lastSleep ? lastSleep.totalMinutes / 60 : 7;

  const factors = [
    { name: "HRV-ul", impact: -hrvZ, issue: hrvZ < -1,
      detail: `HRV ${hrv[hrv.length-1].mean.toFixed(0)} ms (media ta: ${hrvAvg.toFixed(0)} ms, deviatia: ${(hrvZ).toFixed(1)}σ)` },
    { name: "Pulsul in repaus", impact: rhrZ, issue: rhrZ > 1,
      detail: `RHR ${rhr[rhr.length-1].mean.toFixed(0)} bpm (media ta: ${rhrAvg.toFixed(0)} bpm, deviatia: +${rhrZ.toFixed(1)}σ)` },
    { name: "Somnul", impact: sleepHours < 6.5 ? 2 : 0, issue: sleepHours < 6.5,
      detail: `Ai dormit ${sleepHours.toFixed(1)}h — ${(7 - sleepHours).toFixed(1)}h sub minimul de 7h` },
  ].sort((a, b) => b.impact - a.impact);

  const worst = factors.find(f => f.issue);
  if (!worst) return [];

  return [{ id: "score-driver", severity: "info", category: "recovery",
    title: `Factor principal care limiteaza recuperarea: ${worst.name}`,
    body: `${worst.detail}. Asta e cel mai mare obstacol din datele tale de azi. Restu indicatorilor sunt in parametri.` }];
}

// ═══════════════════════════════════════════════════════════
// ILLNESS DETECTION (multi-signal)
// ═══════════════════════════════════════════════════════════

function illnessDetection(metrics: Record<string, DailySummary[]>): Insight[] {
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  if (!rhr || rhr.length < 30 || !hrv || hrv.length < 30) return [];

  const { mean: rhrAvg, std: rhrStd } = meanStd(vals(lastN(rhr, 30)));
  const { mean: hrvAvg, std: hrvStd } = meanStd(vals(lastN(hrv, 30)));
  const rhrZ = rhrStd > 0 ? (rhr[rhr.length - 1].mean - rhrAvg) / rhrStd : 0;
  const hrvZ = hrvStd > 0 ? (hrv[hrv.length - 1].mean - hrvAvg) / hrvStd : 0;

  let spo2Low = false;
  if (metrics.oxygenSaturation?.length > 0) {
    const raw = metrics.oxygenSaturation[metrics.oxygenSaturation.length - 1].mean;
    const spo2Pct = raw > 50 ? raw : raw * 100; // Apple stores as 0.0-1.0
    spo2Low = spo2Pct < 95;
  }

  let respHigh = false;
  if (metrics.respiratoryRate?.length > 7) {
    const { mean: rAvg, std: rStd } = meanStd(vals(lastN(metrics.respiratoryRate, 30)));
    const rToday = metrics.respiratoryRate[metrics.respiratoryRate.length - 1].mean;
    respHigh = rStd > 0 ? (rToday - rAvg) / rStd > 1.5 : false;
  }

  const flags = [rhrZ > 1.5, hrvZ < -1.5, spo2Low, respHigh].filter(Boolean).length;

  if (flags >= 2) {
    const signals: string[] = [];
    if (rhrZ > 1.5) signals.push(`puls crescut (+${(rhrZ).toFixed(1)}σ)`);
    if (hrvZ < -1.5) signals.push(`HRV scazut (${(hrvZ).toFixed(1)}σ)`);
    if (spo2Low) signals.push("SpO2 sub 95%");
    if (respHigh) signals.push("ritm respirator crescut");

    return [{ id: "illness", severity: "alert", category: "recovery",
      title: "Semnal de alarma: posibila boala sau suprasolicitare extrema",
      body: `${signals.length} indicatori sunt simultan in zona rosie: ${signals.join(", ")}. Acest tipar precede de obicei simptomele cu 24-48h. Recomandare imediata: anuleaza orice antrenament, hidrateaza-te abundent, dormi 9+ ore. Daca simptomele persista 3+ zile, consulta un medic.` }];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════
// STRAIN & TRAINING BALANCE
// ═══════════════════════════════════════════════════════════

function strainInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  const ex = metrics.exerciseTime;
  const active = metrics.activeEnergy;
  const steps = metrics.stepCount;
  if (!ex || ex.length < 7) return out;

  const todayEx = ex[ex.length - 1].sum;
  const todayCal = active ? active[active.length - 1]?.sum || 0 : 0;
  const todaySteps = steps ? steps[steps.length - 1]?.sum || 0 : 0;

  const strain = Math.min(21, Math.round(
    (todayEx / 60) * 7 + (todayCal / 500) * 3 + (todaySteps / 10000) * 2
  ));

  const level = strain >= 18 ? "maximal" : strain >= 14 ? "ridicat" : strain >= 10 ? "moderat" : strain >= 5 ? "usor" : "minim";

  let advice = "";
  if (strain >= 18) advice = "Efort la limita — asigura-te ca dormi 8+ ore si consumi suficiente proteine si carbohidrati pentru recuperare.";
  else if (strain >= 14) advice = "Zi intensa. Urmatoarele 24-48h sunt critice pentru recuperare. Evita alt antrenament intens maine.";
  else if (strain >= 8) advice = "Nivel de efort echilibrat. Poti repeta maine daca ai dormit bine.";
  else advice = "Activitate scazuta. Daca nu e zi de odihna planificata, o sesiune moderata ar ajuta la mentinerea formei.";

  out.push({ id: "strain-today", severity: strain >= 18 ? "warning" : "info", category: "activity",
    title: `Efort azi: ${strain}/21 (${level})`,
    body: `${todayEx.toFixed(0)} min exercitiu, ${todayCal.toFixed(0)} kcal arse activ, ${todaySteps.toLocaleString()} pasi. ${advice}` });

  // Week-over-week spike detection
  const last7 = ex.slice(-7);
  const prev7 = ex.slice(-14, -7);
  if (prev7.length >= 5) {
    const weekStrain = last7.reduce((s, d) => s + d.sum, 0);
    const prevWeekStrain = prev7.reduce((s, d) => s + d.sum, 0);
    if (prevWeekStrain > 0) {
      const ratio = weekStrain / prevWeekStrain;
      if (ratio > 1.3) {
        out.push({ id: "strain-spike", severity: "warning", category: "activity",
          title: `Volumul de antrenament a crescut cu ${((ratio - 1) * 100).toFixed(0)}% fata de saptamana trecuta`,
          body: `${weekStrain.toFixed(0)} min vs ${prevWeekStrain.toFixed(0)} min saptamana trecuta. Regula 10%: cresterea volumului cu mai mult de 10%/saptamana este cel mai frecvent factor de accidentare la sportivi amatori. Redu intensitatea in urmatoarele zile.` });
      }
    }
  }
  return out;
}

function trainingBalance(metrics: Record<string, DailySummary[]>): Insight[] {
  const ex = metrics.exerciseTime;
  if (!ex || ex.length < 42) return [];

  // Banister model: Acute (7d) vs Chronic (42d) Training Load
  const acute = lastN(ex, 7).reduce((s, d) => s + d.sum, 0) / 7;
  const chronic = lastN(ex, 42).reduce((s, d) => s + d.sum, 0) / 42;
  const ratio = chronic > 0 ? acute / chronic : 1;

  if (ratio > 1.5) {
    return [{ id: "acr-high", severity: "alert", category: "activity",
      title: `Raport efort acut/cronic: ${ratio.toFixed(2)} — zona de risc`,
      body: `Efortul din ultima saptamana (${acute.toFixed(0)} min/zi) e cu ${((ratio - 1) * 100).toFixed(0)}% peste ce ai facut in ultimele 6 saptamani (${chronic.toFixed(0)} min/zi). Un raport peste 1.5 este asociat cu risc crescut de accidentare. Redu volumul la ~${(chronic * 1.1).toFixed(0)} min/zi in urmatoarele zile.` }];
  }

  if (ratio < 0.6 && chronic > 15) {
    return [{ id: "acr-low", severity: "info", category: "activity",
      title: "Detraining detectat",
      body: `Efortul recent (${acute.toFixed(0)} min/zi) e mult sub nivelul tau obisnuit (${chronic.toFixed(0)} min/zi). Daca nu e intentionat (accidentare, vacanta), risc de pierdere a formei. Revino treptat.` }];
  }

  return [];
}

// ═══════════════════════════════════════════════════════════
// SLEEP — debt, consistency, jet lag, stages
// ═══════════════════════════════════════════════════════════

function sleepDebtInsights(sleepNights: SleepNight[]): Insight[] {
  if (sleepNights.length < 7) return [];
  const last7 = lastN(sleepNights, 7);
  const TARGET = 8;

  let debt = 0;
  for (const night of last7) debt += TARGET - night.totalMinutes / 60;

  const debtH = Math.max(0, debt);
  const creditH = Math.max(0, -debt);
  const avgH = last7.reduce((s, n) => s + n.totalMinutes, 0) / last7.length / 60;

  if (debtH > 5) {
    return [{ id: "sleep-debt", severity: "alert", category: "sleep",
      title: `Datorie de somn critica: ${debtH.toFixed(1)} ore`,
      body: `In 7 zile ai dormit in medie ${avgH.toFixed(1)}h/noapte — cu ${(TARGET - avgH).toFixed(1)}h sub tinta de ${TARGET}h. Datoria de somn nu se recupereaza dormind o noapte lunga — ai nevoie de 3-4 nopti consecutive de 9+ ore. Somnul insuficient cronic afecteaza: imunitate (-40%), timp de reactie, reglare emotionala, si crestere in greutate.` }];
  }
  if (debtH > 2) {
    return [{ id: "sleep-debt", severity: "warning", category: "sleep",
      title: `Deficit moderat de somn: ${debtH.toFixed(1)} ore`,
      body: `Media ultimelor 7 nopti: ${avgH.toFixed(1)}h. Adauga 30-45 minute la fiecare noapte urmatoare — cel mai simplu mod e sa pui un alarm de culcare.` }];
  }
  if (creditH > 3) {
    return [{ id: "sleep-credit", severity: "good", category: "sleep",
      title: "Somn excelent saptamana asta",
      body: `Media: ${avgH.toFixed(1)}h/noapte, cu ${creditH.toFixed(1)}h in plus fata de minimul de ${TARGET}h. Acest surplus se traduce direct in recuperare mai buna, concentrare superioara si sistem imunitar puternic.` }];
  }
  return [];
}

function sleepInsights(nights: SleepNight[]): Insight[] {
  const out: Insight[] = [];
  const last7 = lastN(nights, 7);
  const durations = last7.map(n => n.totalMinutes / 60);
  const { mean: avg } = meanStd(durations);
  const totalMin = last7.reduce((s, n) => s + n.totalMinutes, 0);
  const deepPct = totalMin > 0 ? (last7.reduce((s, n) => s + n.stages.deep, 0) / totalMin) * 100 : 0;
  const remPct = totalMin > 0 ? (last7.reduce((s, n) => s + n.stages.rem, 0) / totalMin) * 100 : 0;
  const efficiencies = last7.map(n => n.efficiency * 100);
  const { mean: avgEff } = meanStd(efficiencies);

  if (avg < 6) {
    out.push({ id: "sleep-short", severity: "alert", category: "sleep",
      title: `Dormi prea putin: ${avg.toFixed(1)}h/noapte`,
      body: `Sub 6 ore creste riscul cardiovascular cu 48% (meta-analiza Cappuccio 2010, 470,000 participanti). Afecteaza si: memoria de lucru (-30%), reglarea glucozei (rezistenta la insulina dupa doar 4 nopti), si productia de hormoni de crestere. Prioritatea #1 e sa ajungi la 7h.` });
  } else if (avg < 7) {
    out.push({ id: "sleep-below", severity: "warning", category: "sleep",
      title: `Somn sub optim: ${avg.toFixed(1)}h`,
      body: `Esti in zona gri — nu critic, dar sub cele 7-9h recomandate de American Academy of Sleep Medicine. Chiar +30 min/noapte imbunatateste vizibil HRV-ul si concentrarea.` });
  }

  if (deepPct > 0 && deepPct < 10) {
    out.push({ id: "deep-low", severity: "warning", category: "sleep",
      title: `Somn profund insuficient: ${deepPct.toFixed(0)}% (ideal: 15-20%)`,
      body: `Somnul profund (deep/NREM3) e faza in care corpul repara tesuturi, consolideaza memoria si elibereaza hormon de crestere. Factori care il reduc: alcool (chiar si 1 pahar), temperatura camerei >22°C, cafeina dupa ora 14, ecrane in ultimele 60 min. Cel mai eficient interventie: exercitiu fizic dimineata.` });
  }

  if (remPct > 0 && remPct < 15) {
    out.push({ id: "rem-low", severity: "warning", category: "sleep",
      title: `REM insuficient: ${remPct.toFixed(0)}% (ideal: 20-25%)`,
      body: `REM-ul proceseaza emotiile si consolideaza invatarea procedurala. REM-ul are loc predominant in a doua jumatate a noptii — daca te trezesti devreme, pierzi disproportionat din REM. Alcoolul e cel mai puternic supresor de REM (reduce cu pana la 50%).` });
  }

  if (avgEff < 80 && avgEff > 0) {
    out.push({ id: "eff-low", severity: "warning", category: "sleep",
      title: `Eficienta somnului scazuta: ${avgEff.toFixed(0)}%`,
      body: `Petreci ${((1 - avgEff / 100) * avg * 60).toFixed(0)} minute/noapte treaz in pat. Terapia cognitiv-comportamentala pentru insomnie (CBT-I) recomanda: mergi in pat DOAR cand esti somnoros, daca nu adormi in 20 min ridica-te, si nu folosi patul pentru altceva decat somn.` });
  }

  return out;
}

function sleepConsistency(nights: SleepNight[]): Insight[] {
  if (nights.length < 14) return [];
  const last14 = lastN(nights, 14);

  // Sleep midpoint consistency (circadian regularity)
  const midpoints = last14.map(n => {
    const bed = new Date(n.bedtime).getTime();
    return (bed + n.totalMinutes * 30000) / 3600000 % 24; // midpoint hour
  });

  const { std: midStd } = meanStd(midpoints);

  if (midStd > 1.5) {
    return [{ id: "sleep-irregular", severity: "warning", category: "sleep",
      title: "Program de somn neregulat",
      body: `Ora medie de somn variaza cu ±${(midStd * 60).toFixed(0)} minute. Un studiu Harvard (2017) pe 61,000 participanti a aratat ca inconsistenta somnului creste riscul cardiovascular independent de durata. Incearca sa te culci si sa te trezesti la aceeasi ora (±30 min) inclusiv in weekend.` }];
  }

  return [];
}

function socialJetLag(nights: SleepNight[]): Insight[] {
  if (nights.length < 28) return [];

  const weekday: number[] = [], weekend: number[] = [];
  for (const n of lastN(nights, 28)) {
    const dow = new Date(n.date).getDay();
    const bedHour = new Date(n.bedtime).getHours() + new Date(n.bedtime).getMinutes() / 60;
    const midpoint = bedHour + (n.totalMinutes / 60) / 2;
    if (dow === 0 || dow === 5 || dow === 6) weekend.push(midpoint);
    else weekday.push(midpoint);
  }

  if (weekday.length < 8 || weekend.length < 4) return [];
  const { mean: wkAvg } = meanStd(weekday);
  const { mean: weAvg } = meanStd(weekend);
  const diff = Math.abs(weAvg - wkAvg);

  if (diff > 1) {
    return [{ id: "social-jetlag", severity: "warning", category: "sleep",
      title: `Social jet lag: ${diff.toFixed(1)} ore`,
      body: `Diferenta intre programul de somn din weekend si cel din cursul saptamanii e de ${(diff * 60).toFixed(0)} minute. Echivalent cu a calatori ${diff.toFixed(1)} fusuri orare in fiecare weekend. Social jet lag >1h e asociat cu risc metabolic crescut, obezitate si depresie (Wittmann et al., 2006). Solutie: trezeste-te la aceeasi ora si sambata/duminica.` }];
  }

  return [];
}

function sleepStagesTrend(nights: SleepNight[]): Insight[] {
  if (nights.length < 30) return [];
  const first15 = nights.slice(-30, -15);
  const last15 = lastN(nights, 15);

  const deepFirst = first15.reduce((s, n) => s + n.stages.deep, 0) / first15.reduce((s, n) => s + n.totalMinutes, 0) * 100;
  const deepLast = last15.reduce((s, n) => s + n.stages.deep, 0) / last15.reduce((s, n) => s + n.totalMinutes, 0) * 100;

  const diff = deepLast - deepFirst;
  if (Math.abs(diff) > 3 && deepFirst > 0) {
    return [{ id: "deep-trend", severity: diff > 0 ? "good" : "warning", category: "sleep",
      title: diff > 0
        ? `Somnul profund s-a imbunatatit: +${diff.toFixed(1)}pp`
        : `Somnul profund scade: ${diff.toFixed(1)}pp`,
      body: diff > 0
        ? `Proportia de somn profund a crescut de la ${deepFirst.toFixed(0)}% la ${deepLast.toFixed(0)}%. Asta inseamna o recuperare fizica mai buna si un sistem imunitar mai puternic.`
        : `Proportia de somn profund a scazut de la ${deepFirst.toFixed(0)}% la ${deepLast.toFixed(0)}%. Verificeaza: nivel de stres, consum de alcool, temperatura camerei, activitate fizica.` }];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════
// CARDIOVASCULAR
// ═══════════════════════════════════════════════════════════

function rhrInsights(data: DailySummary[]): Insight[] {
  const out: Insight[] = [];
  const today = data[data.length - 1].mean;
  const last30 = vals(lastN(data, 30));
  const prev30 = data.length >= 60 ? vals(data.slice(-60, -30)) : [];
  const { mean: avg30, std: std30 } = meanStd(last30);
  const z = std30 > 0 ? (today - avg30) / std30 : 0;

  if (z > 2) {
    out.push({ id: "rhr-high", severity: "alert", category: "cardio", metric: "restingHeartRate",
      title: `Puls in repaus anormal: ${today.toFixed(0)} bpm (+${(z).toFixed(1)}σ)`,
      body: `Asta e o deviere semnificativa de la media ta de ${avg30.toFixed(0)} bpm. Cauze posibile: deshidratare, stres emotional, alcool consumat ieri, incubatie de boala, sau overtraining. Daca nu exista o cauza evidenta si persista 3+ zile, discuta cu medicul.` });
  } else if (z < -1.5) {
    out.push({ id: "rhr-low", severity: "good", category: "cardio", metric: "restingHeartRate",
      title: `Puls in repaus excelent: ${today.toFixed(0)} bpm`,
      body: `Cu ${(avg30 - today).toFixed(0)} bpm sub media ta — semn clar de recuperare completa. Corpul e pregatit pentru efort maxim.` });
  }

  // Long-term trend
  if (data.length >= 30) {
    const reg = trendRegression(last30);
    if (reg && reg.significant && Math.abs(reg.slopePerMonth) > 1) {
      const improving = reg.slopePerMonth < 0;
      out.push({ id: "rhr-trend", severity: improving ? "good" : "warning", category: "trend", metric: "restingHeartRate",
        title: improving
          ? `Puls in repaus in scadere: ${reg.slopePerMonth.toFixed(1)} bpm/luna`
          : `Puls in repaus in crestere: +${reg.slopePerMonth.toFixed(1)} bpm/luna`,
        body: improving
          ? `Trend confirmat statistic (R²=${reg.r2.toFixed(2)}, p<0.05). Un RHR in scadere e cel mai fiabil indicator ca fitness-ul cardiovascular se imbunatateste. Fiecare bpm in minus echivaleaza cu ~15% mai putine batai pe zi.`
          : `Trend confirmat statistic (R²=${reg.r2.toFixed(2)}, p<0.05). Cauze posibile: supraantrenament, stres cronic, calitate scazuta a somnului, sau sedentarism crescut. Compara cu nivelul de activitate si somn din aceeasi perioada.` });
    }
  }

  return out;
}

function hrvInsights(data: DailySummary[]): Insight[] {
  const out: Insight[] = [];
  const today = data[data.length - 1].mean;
  const last30 = vals(lastN(data, 30));
  const { mean: avg30, std: std30 } = meanStd(last30);
  const z = std30 > 0 ? (today - avg30) / std30 : 0;

  if (z < -2) {
    out.push({ id: "hrv-low", severity: "alert", category: "recovery", metric: "hrv",
      title: `HRV critic: ${today.toFixed(0)} ms (${z.toFixed(1)}σ sub medie)`,
      body: `HRV-ul sub -2σ indica activare puternica a sistemului nervos simpatic (fight-or-flight). Corpul tau e in mod de supravietuire, nu de recuperare. Prioriteaza: respiratia controlata (4s inspir, 6s expir — 10 min), evita stimulantii si efortul fizic.` });
  } else if (z > 1.5) {
    out.push({ id: "hrv-high", severity: "good", category: "recovery", metric: "hrv",
      title: `HRV optim: ${today.toFixed(0)} ms (+${z.toFixed(1)}σ)`,
      body: `Sistemul nervos parasimpatic (rest-and-digest) e dominant. Asta inseamna recuperare completa. Zi ideala pentru efort maxim sau provocari cognitive.` });
  }

  // Trend
  if (data.length >= 30) {
    const reg = trendRegression(last30);
    if (reg && reg.significant && Math.abs(reg.slopePerMonth) > 2) {
      const up = reg.slopePerMonth > 0;
      out.push({ id: "hrv-trend", severity: up ? "good" : "warning", category: "trend", metric: "hrv",
        title: up
          ? `HRV in crestere: +${reg.slopePerMonth.toFixed(1)} ms/luna`
          : `HRV in scadere: ${reg.slopePerMonth.toFixed(1)} ms/luna`,
        body: up
          ? `Trend pozitiv confirmat (R²=${reg.r2.toFixed(2)}). HRV-ul in crestere pe termen lung reflecta adaptare la antrenament, management mai bun al stresului si calitate imbunatatita a somnului.`
          : `Trend negativ confirmat (R²=${reg.r2.toFixed(2)}). HRV-ul in scadere pe mai multe saptamani e un semn de acumulare de oboseala. Redu volumul de antrenament cu 30-40% pentru 1-2 saptamani (deload).` });
    }
  }

  // HRV variability (CV) — low CV might indicate overreaching
  if (last30.length >= 14) {
    const { mean, std } = meanStd(last30);
    const cv = mean > 0 ? (std / mean) * 100 : 0;
    if (cv < 5 && mean > 0) {
      out.push({ id: "hrv-cv-low", severity: "info", category: "cardio", metric: "hrv",
        title: `HRV foarte constant (CV=${cv.toFixed(0)}%)`,
        body: `Un HRV cu variabilitate zilnica foarte mica poate indica overreaching functional. Un HRV sanatos variaza natural cu 10-15% zi de zi, reflectand capacitatea corpului de a se adapta la stimuli diferiti.` });
    }
  }

  return out;
}

function spo2Insights(data: DailySummary[]): Insight[] {
  const today = data[data.length - 1].mean;
  const pct = today > 50 ? today : today * 100; // Apple stores 0.0-1.0, use >50 to distinguish

  if (pct < 94) {
    return [{ id: "spo2-low", severity: "alert", category: "cardio", metric: "oxygenSaturation",
      title: `SpO2 scazut: ${pct.toFixed(1)}%`,
      body: `Sub 94% este considerat hipoxemie. Cauze posibile: apnee de somn, probleme pulmonare, altitudine. Daca nu esti la altitudine si nu ai simptome respiratorii, senzorul poate da erori (purtare laxa, miscare). Daca se repeta 3+ zile, consulta un pneumolog.` }];
  }
  if (pct < 96 && pct >= 94) {
    return [{ id: "spo2-borderline", severity: "warning", category: "cardio", metric: "oxygenSaturation",
      title: `SpO2 la limita: ${pct.toFixed(1)}%`,
      body: `Normal e 96-100%. Valoarea ta e la limita inferioara. Monitorizat — daca scade sub 94% consistent, necesita evaluare medicala. Cauza frecventa: apnee de somn nedetectata.` }];
  }
  return [];
}

function vo2Insights(data: DailySummary[]): Insight[] {
  const latest = data[data.length - 1].mean;
  // VO2 Max classification (general adult)
  const cls = latest >= 50 ? "excelent" : latest >= 42 ? "foarte bun" : latest >= 35 ? "bun" : latest >= 30 ? "mediu" : "sub medie";

  const out: Insight[] = [{ id: "vo2", severity: latest >= 35 ? "good" : "info", category: "cardio", metric: "vo2Max",
    title: `VO2 Max: ${latest.toFixed(1)} ml/kg/min — ${cls}`,
    body: `VO2 Max e cel mai puternic predictor de longevitate din medicina (meta-analiza Kodama 2009, 100,000+ participanti). Fiecare 3.5 ml/kg/min in plus reduce mortalitatea cu ~13%. Cel mai eficient mod de crestere: 2-3 sesiuni/saptamana de HIIT (4x4 min la 85-95% din FC maxima, cu 3 min pauza).` }];

  // Trend
  if (data.length >= 30) {
    const reg = trendRegression(vals(lastN(data, 90)));
    if (reg && reg.significant) {
      out.push({ id: "vo2-trend", severity: reg.slopePerMonth > 0 ? "good" : "warning", category: "trend", metric: "vo2Max",
        title: reg.slopePerMonth > 0
          ? `VO2 Max creste: +${reg.slopePerMonth.toFixed(1)}/luna`
          : `VO2 Max scade: ${reg.slopePerMonth.toFixed(1)}/luna`,
        body: reg.slopePerMonth > 0
          ? `Progres confirmat statistic. Continua ce faci — rezultatele sunt vizibile.`
          : `Scadere confirmata. Verifica: ai redus cardio-ul? Ai luat in greutate? O interventie de 6-8 saptamani de cardio consistent poate inversa trendul.` });
    }
  }
  return out;
}

function bloodPressureInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const sys = metrics.bloodPressureSystolic;
  const dia = metrics.bloodPressureDiastolic;
  if (!sys?.length || !dia?.length) return [];

  const sVal = sys[sys.length - 1].mean;
  const dVal = dia[dia.length - 1].mean;

  if (sVal >= 140 || dVal >= 90) {
    return [{ id: "bp-high", severity: "alert", category: "cardio",
      title: `Tensiune ridicata: ${sVal.toFixed(0)}/${dVal.toFixed(0)} mmHg`,
      body: `Valori in zona de hipertensiune stadiul 1+ (peste 140/90). Daca se repeta la mai multe masuratori in zile diferite, necesita evaluare medicala. Intre timp: reduce sarea, creste activitatea fizica, gestioneaza stresul.` }];
  }
  if (sVal >= 130 || dVal >= 80) {
    return [{ id: "bp-elevated", severity: "warning", category: "cardio",
      title: `Tensiune pre-hipertensiune: ${sVal.toFixed(0)}/${dVal.toFixed(0)} mmHg`,
      body: `Zona 130-139/80-89 e pre-hipertensiune. Interventii non-farmacologice eficiente: reducerea sodiului (<2g/zi), dieta DASH, 150 min exercitiu/saptamana, pierdere in greutate daca e cazul.` }];
  }
  return [];
}

function respiratoryInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const rr = metrics.respiratoryRate;
  if (!rr || rr.length < 14) return [];

  const { mean: avg, std } = meanStd(vals(lastN(rr, 30)));
  const today = rr[rr.length - 1].mean;
  const z = std > 0 ? (today - avg) / std : 0;

  if (z > 2) {
    return [{ id: "resp-high", severity: "warning", category: "cardio", metric: "respiratoryRate",
      title: `Rata respiratorie crescuta: ${today.toFixed(1)} resp/min`,
      body: `Cu ${(z).toFixed(1)}σ peste media ta de ${avg.toFixed(1)}. O rata respiratorie crescuta in somn poate indica: stres, congestie, sau inceputul unei infectii respiratorii. Monitorizeaza in combinatie cu RHR si HRV.` }];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════
// ACTIVITY
// ═══════════════════════════════════════════════════════════

function activityInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  const steps = metrics.stepCount;
  if (!steps || steps.length < 7) return out;

  const last7 = lastN(steps, 7).map(d => d.sum);
  const { mean: avg, std } = meanStd(last7);
  const { mean: avg30 } = steps.length >= 30 ? meanStd(lastN(steps, 30).map(d => d.sum)) : { mean: avg };

  if (avg < 5000) {
    out.push({ id: "steps-low", severity: "alert", category: "activity",
      title: `Sedentar: ${avg.toFixed(0)} pasi/zi`,
      body: `Sub 5,000 pasi/zi e clasificat ca sedentar. Meta-analiza Lee (2019, JAMA) pe 17,000 femei a aratat ca beneficiile pentru longevitate incep de la 4,400 pasi/zi si cresc pana la ~7,500. Nu trebuie sa ajungi la 10,000 — chiar 2,000 pasi in plus fata de nivelul actual fac diferenta.` });
  } else if (avg >= 10000) {
    out.push({ id: "steps-great", severity: "good", category: "activity",
      title: `Foarte activ: ${avg.toFixed(0)} pasi/zi`,
      body: `Peste 10,000 pasi/zi te plaseaza in top 20% populatie. Beneficiile cardiovasculare sunt near-maximal la acest nivel.` });
  }

  // Consistency
  if (std > avg * 0.5 && avg > 2000) {
    out.push({ id: "steps-inconsistent", severity: "info", category: "activity",
      title: "Activitate inconsistenta",
      body: `Variezi intre ${Math.min(...last7).toLocaleString()} si ${Math.max(...last7).toLocaleString()} pasi/zi. Consistenta zilnica (chiar la nivel mai scazut) e mai benefica decat zile foarte active alternate cu zile sedentare.` });
  }

  // Exercise minutes vs WHO target
  if (metrics.exerciseTime?.length >= 7) {
    const weekTotal = lastN(metrics.exerciseTime, 7).reduce((s, d) => s + d.sum, 0);
    if (weekTotal < 150) {
      out.push({ id: "ex-who", severity: "warning", category: "activity",
        title: `Sub recomandarea OMS: ${weekTotal.toFixed(0)}/150 min`,
        body: `OMS recomanda 150-300 min/saptamana de activitate moderata. ${weekTotal.toFixed(0)} minute e ${(weekTotal / 150 * 100).toFixed(0)}% din tinta. Iti lipsesc ${(150 - weekTotal).toFixed(0)} minute — echivalent cu ${Math.ceil((150 - weekTotal) / 30)} plimbari de 30 min.` });
    } else {
      out.push({ id: "ex-who-ok", severity: "good", category: "activity",
        title: `Tinta OMS atinsa: ${weekTotal.toFixed(0)} min exercitiu`,
        body: `Felicitari — depasesti pragul de 150 min/saptamana. Studiile arata beneficii aditionale pana la 300 min.` });
    }
  }

  return out;
}

function exerciseEfficiency(metrics: Record<string, DailySummary[]>): Insight[] {
  const ex = metrics.exerciseTime;
  const cal = metrics.activeEnergy;
  if (!ex || !cal || ex.length < 14) return [];

  const exMap = new Map(ex.map(d => [d.date, d.sum]));
  const calMap = new Map(cal.map(d => [d.date, d.sum]));

  const efficiencies: number[] = [];
  for (const [date, mins] of exMap) {
    if (mins > 10) {
      const c = calMap.get(date);
      if (c && c > 0) efficiencies.push(c / mins); // cal per minute
    }
  }

  if (efficiencies.length < 7) return [];
  const first = efficiencies.slice(0, Math.floor(efficiencies.length / 2));
  const last = efficiencies.slice(Math.floor(efficiencies.length / 2));
  const { mean: fAvg } = meanStd(first);
  const { mean: lAvg } = meanStd(last);

  if (fAvg > 0 && lAvg > fAvg * 1.1) {
    return [{ id: "ex-efficiency", severity: "good", category: "activity",
      title: "Eficienta antrenamentului creste",
      body: `Arzi ${lAvg.toFixed(1)} kcal/min de exercitiu comparativ cu ${fAvg.toFixed(1)} kcal/min anterior. Asta sugereaza ca antrenamentele devin mai intense sau ca ai crescut masa musculara.` }];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════
// MOBILITY
// ═══════════════════════════════════════════════════════════

function mobilityInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];

  if (metrics.walkingSpeed?.length >= 14) {
    const last30 = vals(lastN(metrics.walkingSpeed, 30));
    const { mean: avg } = meanStd(last30);
    const kmh = avg * 3.6;

    if (kmh < 3) {
      out.push({ id: "walk-slow", severity: "warning", category: "mobility", metric: "walkingSpeed",
        title: `Viteza de mers scazuta: ${kmh.toFixed(1)} km/h`,
        body: `In cel mai mare studiu pe mobilitate (Studenski 2011, JAMA, 34,000 adulti), viteza de mers sub 3 km/h la varste >65 a fost asociata cu mortalitate semnificativ crescuta. La varste mai tinere, poate indica deconditioning sau probleme musculoscheletice. Exercitiile de forta a picioarelor pot ajuta.` });
    }

    // Trend
    const reg = trendRegression(last30);
    if (reg && reg.significant && Math.abs(reg.slopePerMonth) > 0.02) {
      out.push({ id: "walk-trend", severity: reg.slopePerMonth > 0 ? "good" : "warning", category: "mobility", metric: "walkingSpeed",
        title: reg.slopePerMonth > 0
          ? `Viteza de mers creste: +${(reg.slopePerMonth * 3.6).toFixed(2)} km/h pe luna`
          : `Viteza de mers scade: ${(reg.slopePerMonth * 3.6).toFixed(2)} km/h pe luna`,
        body: `Trend confirmat statistic (R²=${reg.r2.toFixed(2)}). Viteza de mers e un biomarker integrat — reflecta forta musculara, balans, functie pulmonara si cardiaca simultan.` });
    }
  }

  if (metrics.walkingAsymmetry?.length >= 14) {
    const { mean: avg } = meanStd(vals(lastN(metrics.walkingAsymmetry, 7)));
    if (avg > 10) {
      out.push({ id: "asymm", severity: "warning", category: "mobility", metric: "walkingAsymmetry",
        title: `Asimetrie in mers: ${avg.toFixed(1)}%`,
        body: `Asimetrie >10% sugereaza compensare (un picior lucreaza diferit). Cauze: accidentare veche, dezechilibru muscular, durere articulara. Un fizioterapeut poate identifica cauza si prescrie exercitii corective.` });
    }
  }

  if (metrics.doubleSupportTime?.length >= 14) {
    const { mean: avg } = meanStd(vals(lastN(metrics.doubleSupportTime, 14)));
    if (avg > 30) {
      out.push({ id: "balance", severity: "warning", category: "mobility", metric: "doubleSupportTime",
        title: `Timp dublu sprijin crescut: ${avg.toFixed(0)}%`,
        body: `Petreci ${avg.toFixed(0)}% din pasul de mers cu ambele picioare pe sol (normal: <27%). Asta indica probleme de balans. Exercitii recomandate: statul pe un picior (30s x 3/zi), mers pe calcaie-varf, tai chi.` });
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// BODY COMPOSITION
// ═══════════════════════════════════════════════════════════

function bodyInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  const weight = metrics.bodyMass;
  if (!weight || weight.length < 14) return out;

  const last30 = vals(lastN(weight, 30));
  const reg = trendRegression(last30);

  if (reg && reg.significant) {
    const monthlyKg = reg.slopePerMonth;
    if (Math.abs(monthlyKg) > 0.5) {
      out.push({ id: "weight-trend", severity: "info", category: "body", metric: "bodyMass",
        title: monthlyKg > 0
          ? `Greutate in crestere: +${monthlyKg.toFixed(1)} kg/luna`
          : `Greutate in scadere: ${monthlyKg.toFixed(1)} kg/luna`,
        body: monthlyKg > 0
          ? `Trend confirmat (R²=${reg.r2.toFixed(2)}). Rata de ${monthlyKg.toFixed(1)} kg/luna. Daca nu e intentionat (muscle gain), verifica: aport caloric, nivel de activitate, calitatea somnului (somnul scurt creste grelina — hormonul foamei).`
          : `Pierdere de ${Math.abs(monthlyKg).toFixed(1)} kg/luna. Rata sanatoasa: 0.5-1 kg/saptamana. ${Math.abs(monthlyKg) > 4 ? "Rata ta e prea rapida — risc de pierdere musculara. Asigura-te ca mananci suficiente proteine (1.6g/kg corp)." : "Rata ta e in zona sanatoasa."}` });
    }
  }

  // Body fat
  if (metrics.bodyFatPercentage?.length >= 7) {
    const bf = metrics.bodyFatPercentage[metrics.bodyFatPercentage.length - 1].mean;
    // Rough categories
    if (bf > 30) {
      out.push({ id: "bf-high", severity: "warning", category: "body", metric: "bodyFatPercentage",
        title: `Procentaj grasime: ${bf.toFixed(1)}%`,
        body: `Peste 30% la barbati / 35% la femei creste riscurile metabolice. Cea mai eficienta strategie: combinatie de deficit caloric moderat (300-500 kcal/zi) + antrenament de forta (mentine masa musculara) + proteine adecvate.` });
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// AUDIO & WELLBEING
// ═══════════════════════════════════════════════════════════

function audioInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  if (metrics.headphoneAudio?.length >= 7) {
    const { mean: avg } = meanStd(vals(lastN(metrics.headphoneAudio, 7)));
    if (avg > 85) {
      out.push({ id: "audio-danger", severity: "alert", category: "wellbeing", metric: "headphoneAudio",
        title: `Volumul castilor e periculos: ${avg.toFixed(0)} dB`,
        body: `Peste 85 dB, deteriorarea auzului incepe dupa 2 ore de expunere zilnica (NIOSH). La 95 dB, dupa doar 50 minute. Pierderea auzului e IREVERSIBILA. Redu volumul la 60-70% din maxim. Foloseste casti cu noise-canceling pentru a nu compensa zgomotul ambiental.` });
    } else if (avg > 75) {
      out.push({ id: "audio-warn", severity: "info", category: "wellbeing", metric: "headphoneAudio",
        title: `Volum casti: ${avg.toFixed(0)} dB — zona sigura`,
        body: `Sub 80 dB poti asculta ore intregi fara risc. Bine!` });
    }
  }

  // Noise exposure
  if (metrics.environmentalNoise?.length >= 7) {
    const { mean: avg } = meanStd(vals(lastN(metrics.environmentalNoise, 7)));
    if (avg > 70) {
      out.push({ id: "noise-high", severity: "warning", category: "wellbeing", metric: "environmentalNoise",
        title: `Expunere la zgomot ambiental: ${avg.toFixed(0)} dB`,
        body: `Media de ${avg.toFixed(0)} dB e peste pragul OMS de 65 dB pentru expunere prelungita. Zgomotul cronic creste cortizolul, tensiunea arteriala si perturba somnul chiar daca nu esti constient de el. Ia in considerare dopuri de urechi sau white noise pentru somn.` });
    }
  }

  return out;
}

function wellbeingInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];

  // Mindful minutes
  if (metrics.mindfulMinutes?.length >= 7) {
    const weekTotal = lastN(metrics.mindfulMinutes, 7).reduce((s, d) => s + d.sum, 0);
    if (weekTotal > 0) {
      out.push({ id: "mindful", severity: "good", category: "wellbeing",
        title: `Meditatie saptamana asta: ${weekTotal.toFixed(0)} minute`,
        body: weekTotal >= 70
          ? `10+ min/zi — excelent. Meta-analizele arata ca meditatia regulata reduce cortizolul cu 14% si imbunatateste HRV-ul cu 4-5 ms in medie.`
          : `${(weekTotal / 7).toFixed(0)} min/zi in medie. Studiile arata beneficii semnificative de la 10 min/zi. Incearca sa cresti treptat.` });
    }
  }

  // Water intake
  if (metrics.dietaryWater?.length >= 7) {
    const { mean: avg } = meanStd(lastN(metrics.dietaryWater, 7).map(d => d.sum));
    if (avg < 1500) {
      out.push({ id: "water-low", severity: "warning", category: "wellbeing", metric: "dietaryWater",
        title: `Hidratare insuficienta: ${(avg / 1000).toFixed(1)}L/zi`,
        body: `Recomandarea generala: 2-3L/zi (mai mult daca faci sport sau e cald). Deshidratarea de doar 2% reduce performanta cognitiva cu 25% si creste pulsul.` });
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// PATTERNS (sleep→HRV, strain→RHR)
// ═══════════════════════════════════════════════════════════

function patternDetection(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const out: Insight[] = [];

  // Short sleep → next day HRV drop
  if (sleepNights.length >= 30 && metrics.hrv?.length >= 30) {
    const sleepMap = new Map(sleepNights.map(n => [n.date, n.totalMinutes / 60]));
    const hrvMap = new Map(metrics.hrv.map(d => [d.date, d.mean]));
    const dates = [...hrvMap.keys()].sort();

    let shortHRV = 0, shortN = 0, normalHRV = 0, normalN = 0;
    for (let i = 1; i < dates.length; i++) {
      const sleep = sleepMap.get(dates[i - 1]);
      const hrv = hrvMap.get(dates[i]);
      if (sleep === undefined || hrv === undefined) continue;
      if (sleep < 6) { shortHRV += hrv; shortN++; }
      else { normalHRV += hrv; normalN++; }
    }

    if (shortN >= 5 && normalN >= 10) {
      const shortAvg = shortHRV / shortN;
      const normalAvg = normalHRV / normalN;
      const dropPct = ((normalAvg - shortAvg) / normalAvg) * 100;
      if (dropPct > 5) {
        out.push({ id: "pattern-sleep-hrv", severity: "info", category: "correlation",
          title: `Pattern personal: somn <6h → HRV scade cu ${dropPct.toFixed(0)}%`,
          body: `Bazat pe ${shortN} nopti scurte vs ${normalN} nopti normale din datele tale: HRV mediu dupa somn scurt = ${shortAvg.toFixed(0)} ms vs ${normalAvg.toFixed(0)} ms dupa somn normal. Asta e o dovada directa, din corpul tau, ca somnul afecteaza masurabil recuperarea.` });
      }
    }
  }

  // Consecutive high strain → RHR elevation
  if (metrics.exerciseTime?.length >= 30 && metrics.restingHeartRate?.length >= 30) {
    const exMap = new Map(metrics.exerciseTime.map(d => [d.date, d.sum]));
    const rhrMap = new Map(metrics.restingHeartRate.map(d => [d.date, d.mean]));
    const dates = [...rhrMap.keys()].sort();

    let afterHighRHR = 0, afterHighN = 0, afterNormalRHR = 0, afterNormalN = 0;
    for (let i = 2; i < dates.length; i++) {
      const ex1 = exMap.get(dates[i - 2]) || 0;
      const ex2 = exMap.get(dates[i - 1]) || 0;
      const rhr = rhrMap.get(dates[i]);
      if (rhr === undefined) continue;
      if (ex1 > 60 && ex2 > 60) { afterHighRHR += rhr; afterHighN++; }
      else { afterNormalRHR += rhr; afterNormalN++; }
    }

    if (afterHighN >= 3 && afterNormalN >= 10) {
      const diff = afterHighRHR / afterHighN - afterNormalRHR / afterNormalN;
      if (diff > 2) {
        out.push({ id: "pattern-strain-rhr", severity: "info", category: "correlation",
          title: `Pattern: 2+ zile intense → RHR +${diff.toFixed(0)} bpm`,
          body: `Dupa 2 zile consecutive de exercitiu >60 min, pulsul tau in repaus creste cu ~${diff.toFixed(0)} bpm. Corpul tau cere o zi de recuperare dupa efort intens consecutiv.` });
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

  if (sleepNights.length >= 28) {
    const byDay: number[][] = [[], [], [], [], [], [], []];
    sleepNights.forEach(n => byDay[new Date(n.date).getDay()].push(n.totalMinutes / 60));

    const avgs = byDay.map((v, i) => ({ day: dayNames[i], avg: v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0, count: v.length })).filter(d => d.count >= 3);

    if (avgs.length >= 5) {
      const worst = avgs.reduce((a, b) => a.avg < b.avg ? a : b);
      const best = avgs.reduce((a, b) => a.avg > b.avg ? a : b);
      const diff = best.avg - worst.avg;
      if (diff > 0.5) {
        out.push({ id: "dow-sleep", severity: diff > 1 ? "warning" : "info", category: "sleep",
          title: `Cel mai putin somn: ${worst.day.toLowerCase()} noapte (${worst.avg.toFixed(1)}h)`,
          body: `${worst.day}: ${worst.avg.toFixed(1)}h vs ${best.day}: ${best.avg.toFixed(1)}h — diferenta de ${(diff * 60).toFixed(0)} min. Programeaza-ti ${worst.day.toLowerCase()} cu mai putin timp pe ecran seara si o ora de culcare mai stricta.` });
      }
    }
  }

  if (metrics.stepCount?.length >= 28) {
    const byDay: number[][] = [[], [], [], [], [], [], []];
    metrics.stepCount.forEach(d => byDay[new Date(d.date).getDay()].push(d.sum));

    const avgs = byDay.map((v, i) => ({ day: dayNames[i], avg: v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0, count: v.length })).filter(d => d.count >= 3);

    if (avgs.length >= 5) {
      const best = avgs.reduce((a, b) => a.avg > b.avg ? a : b);
      const worst = avgs.reduce((a, b) => a.avg < b.avg ? a : b);
      out.push({ id: "dow-steps", severity: "info", category: "activity",
        title: `Cel mai activ: ${best.day} (${best.avg.toFixed(0)} pasi)`,
        body: `${worst.day}: doar ${worst.avg.toFixed(0)} pasi. O plimbare de 20 min adauga ~2,500 pasi. Programeaz-o ${worst.day.toLowerCase()} ca obicei fix.` });
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// CORRELATIONS
// ═══════════════════════════════════════════════════════════

function correlationInsights(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const out: Insight[] = [];

  // Sleep → HRV (lagged)
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
      if (Math.abs(r) > 0.2 && p < 0.05) {
        const strength = Math.abs(r) > 0.5 ? "puternica" : Math.abs(r) > 0.3 ? "moderata" : "mica";
        out.push({ id: "corr-sleep-hrv", severity: "info", category: "correlation",
          title: `Somn → HRV: corelatie ${strength} (r=${r.toFixed(2)})`,
          body: `${r > 0 ? "Mai mult somn = HRV mai mare a doua zi" : "Legatura inversa surprinzatoare"}. Bazat pe ${xs.length} perechi de zile, p=${p.toFixed(4)}. ${Math.abs(r) > 0.4 ? "Somnul e probabil cel mai puternic levier pe care il ai pentru HRV." : "Efectul exista dar e moderat — alti factori (stres, exercitiu) conteaza si ei."}` });
      }
    }
  }

  // Exercise → RHR next day
  if (metrics.exerciseTime?.length >= 30 && metrics.restingHeartRate?.length >= 30) {
    const exMap = new Map(metrics.exerciseTime.map(d => [d.date, d.sum]));
    const rhrMap = new Map(metrics.restingHeartRate.map(d => [d.date, d.mean]));
    const dates = [...rhrMap.keys()].sort();

    const xs: number[] = [], ys: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const e = exMap.get(dates[i - 1]);
      const r = rhrMap.get(dates[i]);
      if (e !== undefined && r !== undefined) { xs.push(e); ys.push(r); }
    }

    if (xs.length >= 20) {
      const r = pearson(xs, ys);
      const p = pearsonPValue(r, xs.length);
      if (Math.abs(r) > 0.2 && p < 0.05) {
        out.push({ id: "corr-ex-rhr", severity: "info", category: "correlation",
          title: `Exercitiu → RHR a doua zi (r=${r.toFixed(2)})`,
          body: r > 0
            ? `Zilele cu mai mult exercitiu sunt urmate de RHR mai ridicat. Normal — corpul se recupereaza. Daca RHR ramane ridicat 48h+, e semn de overtraining.`
            : `Exercitiul iti scade pulsul in repaus a doua zi — asta indica o buna capacitate de recuperare.` });
      }
    }
  }

  // Sleep efficiency → deep sleep %
  if (sleepNights.length >= 30) {
    const xs: number[] = [], ys: number[] = [];
    for (const n of lastN(sleepNights, 60)) {
      if (n.totalMinutes > 0) {
        xs.push(n.efficiency * 100);
        ys.push(n.stages.deep / n.totalMinutes * 100);
      }
    }
    if (xs.length >= 20) {
      const r = pearson(xs, ys);
      const p = pearsonPValue(r, xs.length);
      if (r > 0.25 && p < 0.05) {
        out.push({ id: "corr-eff-deep", severity: "info", category: "correlation",
          title: `Eficienta somnului coreleaza cu somnul profund (r=${r.toFixed(2)})`,
          body: `Noptile in care adormi mai repede si te trezesti mai putin au mai mult somn profund. Sfat: elimina ecranele cu 30 min inainte de culcare si mentine camera intunecata si racoros.` });
      }
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// WEEKLY + MONTHLY COMPARISON
// ═══════════════════════════════════════════════════════════

function weeklyComparison(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const lines: string[] = [];

  const items: { key: string; label: string; useSum: boolean; unit: string; better: "up" | "down" }[] = [
    { key: "stepCount", label: "Pasi", useSum: true, unit: "", better: "up" },
    { key: "restingHeartRate", label: "RHR", useSum: false, unit: " bpm", better: "down" },
    { key: "hrv", label: "HRV", useSum: false, unit: " ms", better: "up" },
    { key: "exerciseTime", label: "Exercitiu", useSum: true, unit: " min", better: "up" },
    { key: "activeEnergy", label: "Calorii active", useSum: true, unit: " kcal", better: "up" },
  ];

  for (const { key, label, useSum, unit, better } of items) {
    const data = metrics[key];
    if (!data || data.length < 14) continue;
    const tw = lastN(data, 7).map(d => useSum ? d.sum : d.mean);
    const lw = data.slice(-14, -7).map(d => useSum ? d.sum : d.mean);
    const { mean: t } = meanStd(tw);
    const { mean: l } = meanStd(lw);
    if (l === 0) continue;

    const pct = ((t - l) / l) * 100;
    const arrow = pct > 3 ? "↑" : pct < -3 ? "↓" : "→";
    const isGood = (pct > 0 && better === "up") || (pct < 0 && better === "down");
    const emoji = Math.abs(pct) < 3 ? "⚖️" : isGood ? "✅" : "⚠️";
    const val = useSum ? t.toFixed(0) : t.toFixed(1);
    lines.push(`${emoji} ${label}: ${val}${unit} ${arrow} ${Math.abs(pct).toFixed(0)}%`);
  }

  if (sleepNights.length >= 14) {
    const tw = lastN(sleepNights, 7).map(n => n.totalMinutes / 60);
    const lw = sleepNights.slice(-14, -7).map(n => n.totalMinutes / 60);
    const { mean: t } = meanStd(tw);
    const { mean: l } = meanStd(lw);
    if (l > 0) {
      const pct = ((t - l) / l) * 100;
      const arrow = pct > 3 ? "↑" : pct < -3 ? "↓" : "→";
      const emoji = Math.abs(pct) < 3 ? "⚖️" : pct > 0 ? "✅" : "⚠️";
      lines.push(`${emoji} Somn: ${t.toFixed(1)}h ${arrow} ${Math.abs(pct).toFixed(0)}%`);
    }
  }

  if (lines.length >= 3) {
    return [{ id: "weekly", severity: "info", category: "trend",
      title: "Comparatie: aceasta saptamana vs anterioara",
      body: lines.join("\n") }];
  }
  return [];
}

function monthlyTrend(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const lines: string[] = [];

  const items: { key: string; label: string; useSum: boolean; unit: string; better: "up" | "down" }[] = [
    { key: "restingHeartRate", label: "RHR", useSum: false, unit: " bpm", better: "down" },
    { key: "hrv", label: "HRV", useSum: false, unit: " ms", better: "up" },
    { key: "vo2Max", label: "VO2 Max", useSum: false, unit: "", better: "up" },
  ];

  for (const { key, label, useSum, unit, better } of items) {
    const data = metrics[key];
    if (!data || data.length < 60) continue;
    const thisMonth = lastN(data, 30).map(d => useSum ? d.sum : d.mean);
    const lastMonth = data.slice(-60, -30).map(d => useSum ? d.sum : d.mean);
    const { mean: t } = meanStd(thisMonth);
    const { mean: l } = meanStd(lastMonth);
    if (l === 0) continue;

    const diff = t - l;
    const isGood = (diff > 0 && better === "up") || (diff < 0 && better === "down");
    const emoji = Math.abs(diff) < 0.5 ? "⚖️" : isGood ? "✅" : "⚠️";
    lines.push(`${emoji} ${label}: ${t.toFixed(1)}${unit} (${diff > 0 ? "+" : ""}${diff.toFixed(1)} fata de luna trecuta)`);
  }

  if (sleepNights.length >= 60) {
    const thisM = lastN(sleepNights, 30).map(n => n.totalMinutes / 60);
    const lastM = sleepNights.slice(-60, -30).map(n => n.totalMinutes / 60);
    const { mean: t } = meanStd(thisM);
    const { mean: l } = meanStd(lastM);
    const diff = t - l;
    const emoji = Math.abs(diff) < 0.1 ? "⚖️" : diff > 0 ? "✅" : "⚠️";
    lines.push(`${emoji} Somn: ${t.toFixed(1)}h (${diff > 0 ? "+" : ""}${(diff * 60).toFixed(0)} min/noapte)`);
  }

  if (lines.length >= 2) {
    return [{ id: "monthly", severity: "info", category: "trend",
      title: "Evolutie lunara: aceasta luna vs anterioara",
      body: lines.join("\n") }];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════
// PERSONAL RECORDS
// ═══════════════════════════════════════════════════════════

function personalRecords(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const out: Insight[] = [];

  // Best HRV in last 90 days
  if (metrics.hrv?.length >= 30) {
    const last90 = lastN(metrics.hrv, 90);
    const best = last90.reduce((a, b) => a.mean > b.mean ? a : b);
    const today = metrics.hrv[metrics.hrv.length - 1];
    if (today.date === best.date) {
      out.push({ id: "record-hrv", severity: "good", category: "recovery",
        title: `Record personal HRV: ${best.mean.toFixed(0)} ms`,
        body: `Cel mai bun HRV din ultimele 90 de zile! Asta inseamna ca tot ce ai facut recent (somn, exercitiu, management stres) functioneaza. Noteaza ce ai facut diferit in ultimele zile — repeta.` });
    }
  }

  // Best sleep in last 30 days
  if (sleepNights.length >= 14) {
    const last30 = lastN(sleepNights, 30);
    const best = last30.reduce((a, b) => a.efficiency > b.efficiency ? a : b);
    const today = sleepNights[sleepNights.length - 1];
    if (today.date === best.date && today.efficiency > 0.9) {
      out.push({ id: "record-sleep", severity: "good", category: "sleep",
        title: `Cel mai bun somn din luna: ${(today.efficiency * 100).toFixed(0)}% eficienta`,
        body: `${(today.totalMinutes / 60).toFixed(1)}h dormite cu eficienta de ${(today.efficiency * 100).toFixed(0)}%. Ce a fost diferit? Ora de culcare, temperatura, fara ecrane? Incearca sa reproduci conditiile.` });
    }
  }

  // Most steps in last 30 days
  if (metrics.stepCount?.length >= 14) {
    const last30 = lastN(metrics.stepCount, 30);
    const best = last30.reduce((a, b) => a.sum > b.sum ? a : b);
    const today = metrics.stepCount[metrics.stepCount.length - 1];
    if (today.date === best.date && today.sum > 12000) {
      out.push({ id: "record-steps", severity: "good", category: "activity",
        title: `Cel mai activ din luna: ${today.sum.toLocaleString()} pasi`,
        body: `Record de pasi din ultimele 30 de zile! Zi excelenta pentru sanatatea cardiovasculara.` });
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════
// ADVANCED INSIGHT 1: Illness Prediction (48h lookahead)
// Detects simultaneous: RHR↑ + HRV↓ + SpO2↓ + Temp↑
// Evidence: Radin 2020, Mishra 2020 (DETECT study, Stanford)
// ═══════════════════════════════════════════════════════════

function illnessPrediction48h(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  const spo2 = metrics.oxygenSaturation;
  const temp = metrics.wristTemperature;
  if (!rhr || rhr.length < 30 || !hrv || hrv.length < 30) return [];

  const rhrBase = meanStd(rhr.slice(-30, -2).map(d => d.mean));
  const hrvBase = meanStd(hrv.slice(-30, -2).map(d => d.mean));

  const last3rhr = lastN(rhr, 3);
  const last3hrv = lastN(hrv, 3);

  let signals = 0;
  const signalDetails: string[] = [];

  const rhrElevated = last3rhr.every(d => rhrBase.std > 0 && (d.mean - rhrBase.mean) / rhrBase.std > 1.0);
  if (rhrElevated) {
    const delta = last3rhr[last3rhr.length - 1].mean - rhrBase.mean;
    signals++;
    signalDetails.push(`RHR +${delta.toFixed(0)} bpm vs baseline`);
  }

  const hrvDepressed = last3hrv.every(d => hrvBase.std > 0 && (d.mean - hrvBase.mean) / hrvBase.std < -1.0);
  if (hrvDepressed) {
    const pctDrop = ((hrvBase.mean - last3hrv[last3hrv.length - 1].mean) / hrvBase.mean * 100);
    signals++;
    signalDetails.push(`HRV -${pctDrop.toFixed(0)}% vs baseline`);
  }

  if (spo2 && spo2.length >= 14) {
    const baseSlice = spo2.slice(-14, -2);
    const spo2Base = baseSlice.length >= 5 ? meanStd(baseSlice.map(d => d.mean > 50 ? d.mean : d.mean * 100)) : { mean: 0, std: 0 };
    const lastSpo2 = spo2[spo2.length - 1];
    const pct = lastSpo2.mean > 50 ? lastSpo2.mean : lastSpo2.mean * 100;
    if (spo2Base.mean > 0 && pct < spo2Base.mean - 1.5) {
      signals++;
      signalDetails.push(`SpO2 ${pct.toFixed(1)}% (sub baseline de ${spo2Base.mean.toFixed(1)}%)`);
    }
  }

  if (temp && temp.length >= 7) {
    const lastTemp = temp[temp.length - 1];
    if (lastTemp.mean > 0.4) {
      signals++;
      signalDetails.push(`Temperatura +${lastTemp.mean.toFixed(1)}°C vs baseline`);
    }
  }

  if (sleepNights.length >= 7) {
    const last3sleep = lastN(sleepNights, 3);
    const avgEff = last3sleep.reduce((s, n) => s + n.efficiency, 0) / last3sleep.length;
    if (avgEff < 0.8) {
      signals++;
      signalDetails.push(`Eficienta somn ${(avgEff * 100).toFixed(0)}% (sub 80%)`);
    }
  }

  if (signals >= 3) {
    return [{
      id: "illness-prediction-48h", severity: "alert", category: "recovery",
      title: `Atentie: ${signals} semne de raspuns imunitar detectate`,
      body: `Corpul tau arata un tipar consistent cu stadiul pre-boala (${signalDetails.join("; ")}). Studiile (Stanford DETECT, Radin 2020) arata ca aceste semne apar cu 24-48h inainte de simptome. Recomandari: odihna suplimentara, hidratare crescuta, evita antrenament intens, somn prelungit.`
    }];
  }

  if (signals === 2) {
    return [{
      id: "illness-early-warning", severity: "warning", category: "recovery",
      title: `Monitorizare: 2 indicatori deviaza de la normal`,
      body: `${signalDetails.join(" si ")}. Nu e suficient pentru alerta, dar merita urmarit maine. Daca adaugi un al treilea semn, probabilitatea de imbolnavire creste semnificativ.`
    }];
  }

  return [];
}

// ═══════════════════════════════════════════════════════════
// ADVANCED INSIGHT 2: Overtraining Syndrome Detection
// Evidence: Meeusen 2013 (ECSS), Halson 2014
// ═══════════════════════════════════════════════════════════

function overtrainingSyndromeDetection(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const hrv = metrics.hrv;
  const rhr = metrics.restingHeartRate;
  const exercise = metrics.exerciseTime;
  if (!hrv || hrv.length < 28 || !rhr || rhr.length < 28) return [];

  const last14hrv = lastN(hrv, 14).map((d, i) => ({ x: i, y: d.mean }));
  const last14rhr = lastN(rhr, 14).map((d, i) => ({ x: i, y: d.mean }));

  const hrvSlope = simpleSlope(last14hrv);
  const rhrSlope = simpleSlope(last14rhr);

  const hrvDeclining = hrvSlope < -0.3;
  const rhrRising = rhrSlope > 0.15;

  let highTrainingLoad = false;
  if (exercise && exercise.length >= 14) {
    const avgMinutes = lastN(exercise, 14).reduce((s, d) => s + d.sum, 0) / 14;
    highTrainingLoad = avgMinutes > 60;
  }

  let sleepDegrading = false;
  if (sleepNights.length >= 14) {
    const sleepSlope = simpleSlope(lastN(sleepNights, 14).map((d, i) => ({ x: i, y: d.efficiency })));
    sleepDegrading = sleepSlope < -0.005;
  }

  const signs = [hrvDeclining, rhrRising, highTrainingLoad, sleepDegrading].filter(Boolean).length;

  if (signs >= 3) {
    return [{
      id: "overtraining-syndrome", severity: "alert", category: "activity",
      title: `Atentie: Semne de supraantrenament (${signs}/4 indicatori)`,
      body: `In ultimele 2 saptamani: HRV scade ~${Math.abs(hrvSlope * 14).toFixed(0)}ms, RHR creste ~${(rhrSlope * 14).toFixed(1)}bpm${sleepDegrading ? ", somn degradat" : ""}${highTrainingLoad ? ", volum >60min/zi" : ""}. Tipar clasic de overtraining (Meeusen 2013). Recomandare: 3-5 zile deload (intensitate -50%), somn prioritizat.`
    }];
  }

  if (hrvDeclining && rhrRising) {
    return [{
      id: "overreaching-warning", severity: "warning", category: "activity",
      title: `HRV in scadere si RHR in crestere de 2 saptamani`,
      body: `Tendinta negativa pe ambii indicatori de recovery. Poate fi overreaching functional (se rezolva cu odihna) sau nonfunctional. Recomandare: reduce volumul cu 30-40% saptamana asta.`
    }];
  }

  return [];
}

// ═══════════════════════════════════════════════════════════
// ADVANCED INSIGHT 3: Chronotype Detection
// Evidence: Roenneberg 2003, Horne & Ostberg 1976
// ═══════════════════════════════════════════════════════════

function chronotypeDetection(sleepNights: SleepNight[], metrics: Record<string, DailySummary[]>): Insight[] {
  if (sleepNights.length < 14) return [];

  const midpoints = sleepNights
    .filter(n => n.sleepMidpoint != null && n.sleepMidpoint > 0)
    .map(n => n.sleepMidpoint);
  if (midpoints.length < 7) return [];

  const avgMidpoint = midpoints.reduce((s, m) => s + m, 0) / midpoints.length;
  const bedtimes = sleepNights.filter(n => n.bedtime).slice(-30)
    .map(n => { const d = new Date(n.bedtime!); return d.getHours() + d.getMinutes() / 60; });
  const avgBedtime = bedtimes.length > 0 ? bedtimes.reduce((s, h) => s + h, 0) / bedtimes.length : 0;

  let chronotype: string, description: string, optimalWindow: string;

  if (avgMidpoint < 2.5) {
    chronotype = "matinal (lark)"; description = "Te trezesti natural devreme si ai energie maxima dimineata.";
    optimalWindow = "06:00-11:00 (cognitiv) si 08:00-10:00 (fizic)";
  } else if (avgMidpoint < 3.5) {
    chronotype = "intermediar usor matinal"; description = "Ritm echilibrat cu preferinta pentru dimineata.";
    optimalWindow = "08:00-12:00 (cognitiv) si 10:00-12:00 (fizic)";
  } else if (avgMidpoint < 4.5) {
    chronotype = "intermediar"; description = "Cronotip neutru, adaptat la programul social standard.";
    optimalWindow = "10:00-13:00 si 16:00-19:00 (ambele ferestre)";
  } else if (avgMidpoint < 5.5) {
    chronotype = "intermediar nocturn"; description = "Functionezi mai bine dupa-amiaza si seara.";
    optimalWindow = "11:00-14:00 si 17:00-20:00 (cognitiv)";
  } else {
    chronotype = "nocturn (owl)"; description = "Ritmul tau natural e deplasat spre seara.";
    optimalWindow = "13:00-16:00 si 19:00-22:00 (performanta maxima)";
  }

  return [{
    id: "chronotype", severity: "info", category: "sleep",
    title: `Cronotip detectat: ${chronotype}`,
    body: `Bazat pe ${midpoints.length} nopti (midpoint somn: ${avgMidpoint.toFixed(1)}h, culcare medie: ${fmtHour(avgBedtime)}). ${description} Fereastra optima de performanta: ${optimalWindow}. Planificarea in aceasta fereastra creste productivitatea cu 15-20% (Roenneberg 2003).`
  }];
}

// ═══════════════════════════════════════════════════════════
// ADVANCED INSIGHT 4: Stress Fingerprint
// HRV↓ + RHR↑ WITHOUT exercise = psychological stress
// ═══════════════════════════════════════════════════════════

function stressFingerprint(metrics: Record<string, DailySummary[]>): Insight[] {
  const hrv = metrics.hrv;
  const rhr = metrics.restingHeartRate;
  const exercise = metrics.exerciseTime;
  if (!hrv || hrv.length < 30 || !rhr || rhr.length < 30) return [];

  const { mean: hrvMean, std: hrvStd } = meanStd(hrv.slice(-60).map(d => d.mean));
  const { mean: rhrMean, std: rhrStd } = meanStd(rhr.slice(-60).map(d => d.mean));

  const dayNames = ["Duminica", "Luni", "Marti", "Miercuri", "Joi", "Vineri", "Sambata"];
  const stressByDay: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const totalByDay: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  for (const day of lastN(hrv, 60)) {
    const dow = new Date(day.date).getDay();
    totalByDay[dow]++;

    const rhrDay = rhr.find(d => d.date === day.date);
    const exDay = exercise?.find(d => d.date === day.date);

    const lowEx = !exDay || exDay.sum < 20;
    const hrvLow = hrvStd > 0 && (day.mean - hrvMean) / hrvStd < -0.8;
    const rhrHigh = rhrDay && rhrStd > 0 && (rhrDay.mean - rhrMean) / rhrStd > 0.8;

    if (hrvLow && rhrHigh && lowEx) stressByDay[dow]++;
  }

  const rates = dayNames.map((name, i) => ({
    name, rate: totalByDay[i] > 2 ? stressByDay[i] / totalByDay[i] : 0, count: stressByDay[i]
  }));

  const mostStressful = rates.filter(d => d.rate > 0.3 && d.count >= 2).sort((a, b) => b.rate - a.rate);
  const calmest = rates.filter(d => d.rate < 0.1).sort((a, b) => a.rate - b.rate);

  if (mostStressful.length === 0) return [];

  return [{
    id: "stress-fingerprint", severity: "info", category: "recovery",
    title: `Harta stresului: ${mostStressful[0].name} e ziua ta cea mai stresanta`,
    body: `Zilele cu cel mai mult stres (HRV scazut + RHR crescut fara exercitiu): ${mostStressful.map(d => `${d.name} (${(d.rate * 100).toFixed(0)}%)`).join(", ")}. ${calmest.length > 0 ? `Cele mai calme: ${calmest.slice(0, 2).map(d => d.name).join(" si ")}.` : ""} Recomandare: planifica activitati de recuperare in zilele stresante.`
  }];
}

// ═══════════════════════════════════════════════════════════
// ADVANCED INSIGHT 5: Sleep Debt Impact Calculator
// Evidence: Van Dongen 2003, Dinges 2003
// ═══════════════════════════════════════════════════════════

function sleepDebtImpactCalculator(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  if (sleepNights.length < 14) return [];

  const durations = lastN(sleepNights, 90).map(n => n.totalMinutes / 60).sort((a, b) => a - b);
  const personalNeed = durations[Math.floor(durations.length * 0.85)] || 8;

  const last7 = lastN(sleepNights, 7);
  const weeklyDebt = last7.reduce((sum, n) => sum + Math.max(0, personalNeed - n.totalMinutes / 60), 0);
  const biweeklyDebt = lastN(sleepNights, 14).reduce((sum, n) => sum + Math.max(0, personalNeed - n.totalMinutes / 60), 0);

  if (weeklyDebt < 2) return [];

  const hrvImpact = Math.min(weeklyDebt * 3, 25);
  const reactionImpact = Math.min(weeklyDebt * 4, 30);
  const injuryRisk = Math.min(weeklyDebt * 5, 40);

  // Check actual HRV correlation with sleep
  let actualDrop = "";
  const hrv = metrics.hrv;
  if (hrv && hrv.length >= 14) {
    const hrvByDate: Record<string, number> = {};
    for (const d of hrv) hrvByDate[d.date] = d.mean;

    const wellRested = sleepNights.filter(n => n.totalMinutes / 60 >= personalNeed).map(n => hrvByDate[nxtDate(n.date)]).filter(Boolean);
    const deprived = sleepNights.filter(n => n.totalMinutes / 60 < personalNeed - 1).map(n => hrvByDate[nxtDate(n.date)]).filter(Boolean);

    if (wellRested.length >= 5 && deprived.length >= 5) {
      const wm = wellRested.reduce((s, v) => s + v, 0) / wellRested.length;
      const dm = deprived.reduce((s, v) => s + v, 0) / deprived.length;
      actualDrop = ` In datele tale, HRV scade cu ${((wm - dm) / wm * 100).toFixed(0)}% dupa nopti cu deficit.`;
    }
  }

  return [{
    id: "sleep-debt-impact", severity: weeklyDebt >= 7 ? "alert" : "warning", category: "sleep",
    title: `Deficit somn: ${weeklyDebt.toFixed(1)}h/saptamana (necesar: ${personalNeed.toFixed(1)}h/noapte)`,
    body: `Deficit 14 zile: ${biweeklyDebt.toFixed(1)}h. Impact estimat (Van Dongen 2003): HRV -${hrvImpact.toFixed(0)}%, reactie +${reactionImpact.toFixed(0)}%, risc accidentare +${injuryRisk.toFixed(0)}%.${actualDrop} Recuperarea: ~2 nopti prelungite per noapte cu deficit major.`
  }];
}

// ═══════════════════════════════════════════════════════════
// ADVANCED INSIGHT 6: Seasonal Pattern Detection
// Evidence: Brennan 2018 (seasonal HRV)
// ═══════════════════════════════════════════════════════════

function seasonalPatternDetection(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  const monthNames = ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const check = (key: string, label: string, unit: string) => {
    const data = metrics[key];
    if (!data || data.length < 180) return;

    const byMonth: Record<number, number[]> = {};
    for (let i = 0; i < 12; i++) byMonth[i] = [];
    for (const d of data) byMonth[new Date(d.date).getMonth()].push(d.mean);

    const valid = Object.entries(byMonth).filter(([, v]) => v.length >= 5);
    if (valid.length < 4) return;

    const means = valid.map(([m, v]) => ({ month: Number(m), mean: v.reduce((s, x) => s + x, 0) / v.length }));
    const overall = means.reduce((s, m) => s + m.mean, 0) / means.length;
    const sorted = [...means].sort((a, b) => a.mean - b.mean);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    const pct = ((hi.mean - lo.mean) / overall * 100);

    if (pct < 5) return;

    out.push({
      id: `seasonal-${key}`, severity: "info", category: "recovery",
      title: `Tipar sezonier ${label}: ${monthNames[hi.month]} vs ${monthNames[lo.month]}`,
      body: `${label} variaza sezonier cu ${pct.toFixed(0)}%: maxim in ${monthNames[hi.month]} (${hi.mean.toFixed(1)}${unit}), minim in ${monthNames[lo.month]} (${lo.mean.toFixed(1)}${unit}). Normal (Brennan 2018).`
    });
  };

  check("restingHeartRate", "RHR", " bpm");
  check("hrv", "HRV", " ms");
  check("stepCount", "Pasi zilnici", "");

  return out;
}

// ═══════════════════════════════════════════════════════════
// ADVANCED INSIGHT 7: Personal Recovery Formula
// ═══════════════════════════════════════════════════════════

function personalRecoveryFormula(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const hrv = metrics.hrv;
  if (!hrv || hrv.length < 30 || sleepNights.length < 30) return [];

  const hrvByDate: Record<string, number> = {};
  for (const d of hrv) hrvByDate[d.date] = d.mean;

  const factors: { name: string; r: number; p: number; dir: string }[] = [];

  const tryCorrelate = (name: string, pairs: [number, number][], posDir: string, negDir: string) => {
    if (pairs.length < 20) return;
    const r = pearson(pairs.map(p => p[0]), pairs.map(p => p[1]));
    const p = pearsonPValue(r, pairs.length);
    if (p < 0.05) factors.push({ name, r, p, dir: r > 0 ? posDir : negDir });
  };

  // Sleep duration → next day HRV
  tryCorrelate("Durata somn",
    sleepNights.filter(n => hrvByDate[nxtDate(n.date)]).map(n => [n.totalMinutes / 60, hrvByDate[nxtDate(n.date)]]),
    "mai mult somn → HRV mai bun", "mai mult somn → HRV mai slab");

  // Deep sleep % → next day HRV
  tryCorrelate("Somn profund %",
    sleepNights.filter(n => n.totalMinutes > 0 && hrvByDate[nxtDate(n.date)]).map(n => [n.stages.deep / n.totalMinutes * 100, hrvByDate[nxtDate(n.date)]]),
    "mai mult deep sleep → HRV mai bun", "invers");

  // Exercise → next day HRV
  if (metrics.exerciseTime?.length >= 20) {
    tryCorrelate("Exercitiu (min)",
      metrics.exerciseTime.filter(d => hrvByDate[nxtDate(d.date)]).map(d => [d.sum, hrvByDate[nxtDate(d.date)]]),
      "exercitiu → HRV mai bun maine", "exercitiu → HRV mai slab maine (recuperare)");
  }

  // Steps → next day HRV
  if (metrics.stepCount?.length >= 20) {
    tryCorrelate("Pasi",
      metrics.stepCount.filter(d => hrvByDate[nxtDate(d.date)]).map(d => [d.sum, hrvByDate[nxtDate(d.date)]]),
      "mai multi pasi → HRV mai bun", "mai multi pasi → HRV mai slab");
  }

  // Bedtime → next day HRV
  tryCorrelate("Ora culcare",
    sleepNights.filter(n => n.bedtime && hrvByDate[nxtDate(n.date)]).map(n => {
      const h = new Date(n.bedtime!).getHours() + new Date(n.bedtime!).getMinutes() / 60;
      return [h < 12 ? h + 24 : h, hrvByDate[nxtDate(n.date)]] as [number, number];
    }),
    "culcare tarzie → HRV mai bun", "culcare devreme → HRV mai bun");

  if (factors.length === 0) return [];
  factors.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  const top = factors.slice(0, 3);
  const formula = top.map((f, i) => `${i + 1}. ${f.name} (r=${f.r.toFixed(2)}, p=${f.p < 0.001 ? "<0.001" : f.p.toFixed(3)}) — ${f.dir}`).join("; ");

  return [{
    id: "personal-recovery-formula", severity: "good", category: "recovery",
    title: `Formula ta de recuperare (top ${top.length} factori)`,
    body: `Corelatia factor azi → HRV maine: ${formula}. Sunt unici pentru tine. Concentreaza-te pe #1 pentru cel mai mare impact.`
  }];
}

// ═══════════════════════════════════════════════════════════
// ADVANCED INSIGHT 8: Fitness Age Trajectory
// ═══════════════════════════════════════════════════════════

function fitnessAgeTrajectory(metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[]): Insight[] {
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  if (!rhr || rhr.length < 90 || !hrv || hrv.length < 90) return [];

  const win = (data: DailySummary[], offset: number, size: number) => {
    const end = data.length - offset;
    const start = Math.max(0, end - size);
    if (start >= end) return null;
    const s = data.slice(start, end);
    return s.reduce((sum, d) => sum + d.mean, 0) / s.length;
  };

  const rhrNow = win(rhr, 0, 14), hrvNow = win(hrv, 0, 14);
  const rhr3m = win(rhr, 76, 14), hrv3m = win(hrv, 76, 14);
  if (!rhrNow || !hrvNow || !rhr3m || !hrv3m) return [];

  const now = hrvNow / rhrNow, m3 = hrv3m / rhr3m;
  const change = ((now - m3) / m3 * 100);

  let trajectory: string, severity: "good" | "warning" | "info";
  if (change > 5) { trajectory = "in crestere"; severity = "good"; }
  else if (change < -5) { trajectory = "in scadere"; severity = "warning"; }
  else { trajectory = "stabila"; severity = "info"; }

  let body = `Indice fitness (HRV/RHR): acum ${now.toFixed(2)} vs 3 luni ${m3.toFixed(2)} (${change > 0 ? "+" : ""}${change.toFixed(1)}%).`;

  const rhr6m = rhr.length >= 180 ? win(rhr, 166, 14) : null;
  const hrv6m = hrv.length >= 180 ? win(hrv, 166, 14) : null;
  if (rhr6m && hrv6m) {
    const m6 = hrv6m / rhr6m;
    body += ` vs 6 luni: ${((now - m6) / m6 * 100) > 0 ? "+" : ""}${((now - m6) / m6 * 100).toFixed(1)}%.`;
  }

  const vo2 = metrics.vo2Max;
  if (vo2 && vo2.length >= 90) {
    const v2now = win(vo2, 0, 14), v23m = win(vo2, 76, 14);
    if (v2now && v23m) body += ` VO2 Max: ${v2now.toFixed(1)} (${v2now - v23m > 0 ? "+" : ""}${(v2now - v23m).toFixed(1)} vs 3 luni).`;
  }

  if (change > 10) body += ` Progres excelent! Continua asa.`;
  else if (change < -10) body += ` Scadere semnificativa — verifica antrenament, stres, somn.`;

  return [{
    id: "fitness-trajectory", severity, category: "cardio",
    title: `Traiectoria fitness: ${trajectory} (${change > 0 ? "+" : ""}${change.toFixed(0)}% in 3 luni)`,
    body
  }];
}

// ═══════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════

function simpleSlope(pts: { x: number; y: number }[]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const d = n * sxx - sx * sx;
  return d === 0 ? 0 : (n * sxy - sx * sy) / d;
}

function nxtDate(date: string): string {
  const d = new Date(date); d.setDate(d.getDate() + 1); return d.toISOString().substring(0, 10);
}

function fmtHour(h: number): string {
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}
