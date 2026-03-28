import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { METRIC_CONFIG } from "../parser/healthTypes";
import { meanStd } from "./zScore";
import { pearson, pearsonPValue } from "./correlation";

export type InsightSeverity = "good" | "warning" | "alert" | "info";

export interface Insight {
  id: string;
  title: string;
  body: string;
  severity: InsightSeverity;
  category: "recovery" | "cardio" | "sleep" | "activity" | "correlation" | "trend" | "mobility" | "body" | "nutrition" | "audio";
  metric?: string;
}

/**
 * Generate all insights — Romanian, exhaustive, statistically rigorous
 */
export function generateInsights(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[]
): Insight[] {
  const insights: Insight[] = [];

  // Cardiovascular
  if (metrics.restingHeartRate?.length >= 14) insights.push(...rhrInsights(metrics.restingHeartRate));
  if (metrics.hrv?.length >= 14) insights.push(...hrvInsights(metrics.hrv));
  if (metrics.oxygenSaturation?.length >= 7) insights.push(...spo2Insights(metrics.oxygenSaturation));
  if (metrics.vo2Max?.length >= 7) insights.push(...vo2Insights(metrics.vo2Max));
  if (metrics.respiratoryRate?.length >= 14) insights.push(...respInsights(metrics.respiratoryRate));
  if (metrics.walkingHeartRateAverage?.length >= 14) insights.push(...walkingHRInsights(metrics.walkingHeartRateAverage));

  // Sleep
  if (sleepNights.length >= 7) insights.push(...sleepInsights(sleepNights));

  // Activity
  insights.push(...activityInsights(metrics));

  // Mobility
  insights.push(...mobilityInsights(metrics));

  // Body
  insights.push(...bodyInsights(metrics));

  // Audio / hearing
  insights.push(...audioInsights(metrics));

  // Temperature
  if (metrics.wristTemperature?.length >= 7) insights.push(...tempInsights(metrics.wristTemperature));

  // Multi-metric illness detection
  insights.push(...illnessDetection(metrics));

  // Exhaustive cross-correlations with Bonferroni correction
  insights.push(...exhaustiveCorrelations(metrics, sleepNights));

  // Weekly comparison
  insights.push(...weeklyComparison(metrics, sleepNights));

  return insights;
}

// ====================== CARDIOVASCULAR ======================

function rhrInsights(data: DailySummary[]): Insight[] {
  const out: Insight[] = [];
  const today = data[data.length - 1].mean;
  const last30 = data.slice(-30).map(d => d.mean);
  const prev30 = data.slice(-60, -30).map(d => d.mean);
  const { mean: avg30, std: std30 } = meanStd(last30);
  const z = std30 > 0 ? (today - avg30) / std30 : 0;

  if (z > 2) {
    out.push({ id: "rhr-elevated", title: "Puls in repaus ridicat", severity: "alert", category: "cardio", metric: "restingHeartRate",
      body: `Pulsul tau in repaus azi (${today.toFixed(0)} bpm) este semnificativ peste media ta pe 30 zile (${avg30.toFixed(0)} ± ${std30.toFixed(1)} bpm, z=${z.toFixed(1)}). Cauze posibile: stres, deshidratare, alcool aseara, debut de boala, sau overtraining. Daca persista 2-3 zile, ia o pauza de la antrenament intens.` });
  } else if (z < -1.5) {
    out.push({ id: "rhr-low", title: "Puls in repaus sub medie — bine recuperat", severity: "good", category: "cardio", metric: "restingHeartRate",
      body: `Pulsul in repaus (${today.toFixed(0)} bpm) e sub media ta (${avg30.toFixed(0)} bpm). Asta indica recuperare buna si adaptare cardiovasculara. Zi buna pentru antrenament intens.` });
  }

  if (prev30.length >= 14) {
    const { mean: prevAvg } = meanStd(prev30);
    const changePct = ((avg30 - prevAvg) / prevAvg) * 100;
    if (changePct < -3) {
      out.push({ id: "rhr-improving", title: "Fitness cardiovascular in crestere", severity: "good", category: "trend", metric: "restingHeartRate",
        body: `Media pulsului in repaus a scazut de la ${prevAvg.toFixed(0)} la ${avg30.toFixed(0)} bpm in 30 zile (${changePct.toFixed(1)}%). Un trend descendent al pulsului in repaus este unul dintre cei mai puternici indicatori de imbunatatire a fitness-ului cardiovascular.` });
    } else if (changePct > 5) {
      out.push({ id: "rhr-rising", title: "Puls in repaus in crestere", severity: "warning", category: "trend", metric: "restingHeartRate",
        body: `Media pulsului in repaus a crescut de la ${prevAvg.toFixed(0)} la ${avg30.toFixed(0)} bpm (+${changePct.toFixed(1)}%). Poate indica oboseala acumulata, stres cronic, sau scaderea fitness-ului. Monitorizeaza somnul si recovery-ul.` });
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
  const cv = avg30 > 0 ? (std30 / avg30) * 100 : 0;

  if (z < -2) {
    out.push({ id: "hrv-drop", title: "HRV semnificativ sub baseline", severity: "alert", category: "recovery", metric: "hrv",
      body: `HRV-ul tau azi (${today.toFixed(0)} ms) e cu ${Math.abs(z).toFixed(1)} deviatii standard sub media ta pe 30 zile (${avg30.toFixed(0)} ms). HRV scazut indica ca sistemul nervos autonom e sub stres. Acesta este adesea PRIMUL semnal de boala, overtraining, sau stres acumulat — apare cu 1-2 zile inainte de simptome. Recomandare: odihna, hidratare, somn suplimentar.` });
  } else if (z > 1.5) {
    out.push({ id: "hrv-high", title: "HRV peste medie — recuperare excelenta", severity: "good", category: "recovery", metric: "hrv",
      body: `HRV-ul (${today.toFixed(0)} ms) e peste media ta (${avg30.toFixed(0)} ms). HRV ridicat reflecta tonus parasimpatic bun si recuperare completa. Zi optima pentru antrenament intens.` });
  }

  if (cv > 25) {
    out.push({ id: "hrv-cv", title: "HRV foarte variabil zilnic", severity: "warning", category: "cardio", metric: "hrv",
      body: `Coeficientul de variatie al HRV-ului tau e ${cv.toFixed(0)}% (peste 25% = variabilitate mare). Inconsistenta HRV de la zi la zi sugereaza pattern-uri de recuperare neregulate. Focus pe: ora fixa de culcare, gestionarea stresului, evitarea alcoolului inainte de somn.` });
  }

  if (prev30.length >= 14) {
    const { mean: prevAvg } = meanStd(prev30);
    const pct = ((avg30 - prevAvg) / prevAvg) * 100;
    if (pct > 10) {
      out.push({ id: "hrv-up", title: "HRV in crestere pe 30 zile", severity: "good", category: "trend", metric: "hrv",
        body: `Media HRV a crescut de la ${prevAvg.toFixed(0)} la ${avg30.toFixed(0)} ms (+${pct.toFixed(0)}%). Un trend ascendent pe saptamani indica imbunatatirea sanatatii autonome si adaptare la antrenament.` });
    } else if (pct < -10) {
      out.push({ id: "hrv-down", title: "HRV in scadere pe 30 zile", severity: "warning", category: "trend", metric: "hrv",
        body: `HRV-ul mediu a scazut de la ${prevAvg.toFixed(0)} la ${avg30.toFixed(0)} ms (${pct.toFixed(0)}%). O scadere sustinuta sugereaza oboseala acumulata sau stres cronic. Reduceti intensitatea antrenamentului si prioritizati somnul.` });
    }
  }

  return out;
}

function spo2Insights(data: DailySummary[]): Insight[] {
  const out: Insight[] = [];
  const today = data[data.length - 1].mean * 100;
  if (today < 94) {
    out.push({ id: "spo2-low", title: "Oxigen in sange critic scazut", severity: "alert", category: "cardio", metric: "oxygenSaturation",
      body: `SpO2 (${today.toFixed(1)}%) e sub 94%. Normal: 95-100%. SpO2 persistent sub 94% poate indica probleme respiratorii. Consultati un medic daca persista.` });
  } else if (today < 95) {
    out.push({ id: "spo2-border", title: "Oxigen in sange la limita", severity: "warning", category: "cardio", metric: "oxygenSaturation",
      body: `SpO2 (${today.toFixed(1)}%) e la limita inferioara a normalului (95-100%). Poate fi normal la altitudine sau in somnul profund. Monitorizeaza daca e persistent sub 95% in timpul zilei.` });
  }
  return out;
}

function vo2Insights(data: DailySummary[]): Insight[] {
  const out: Insight[] = [];
  const latest = data[data.length - 1].mean;
  const cls = latest >= 50 ? "Excelent" : latest >= 42 ? "Bun" : latest >= 35 ? "Mediu" : "Sub medie";
  out.push({ id: "vo2-level", title: `VO2 Max: ${cls} (${latest.toFixed(1)})`, severity: latest >= 42 ? "good" : latest >= 35 ? "info" : "warning", category: "cardio", metric: "vo2Max",
    body: `VO2 Max-ul tau e ${latest.toFixed(1)} mL/min/kg — clasificat "${cls}". VO2 Max este cel mai puternic predictor individual de longevitate din cercetarea clinica. Fiecare punct in plus reduce riscul de mortalitate cu ~9% (studiu meta-analiza, N>750,000). Imbunatatire: cardio Zona 2 (ritm usor, poti tine o conversatie) 150+ min/saptamana.` });

  if (data.length >= 30) {
    const early = data.slice(0, Math.min(10, data.length)).map(d => d.mean);
    const recent = data.slice(-10).map(d => d.mean);
    const { mean: e } = meanStd(early);
    const { mean: r } = meanStd(recent);
    const diff = r - e;
    if (Math.abs(diff) >= 1) {
      out.push({ id: "vo2-trend", title: diff > 0 ? "VO2 Max in crestere" : "VO2 Max in scadere", severity: diff > 0 ? "good" : "warning", category: "trend", metric: "vo2Max",
        body: diff > 0 ? `VO2 Max a crescut cu ${diff.toFixed(1)} puncte. Sistemul cardiovascular se adapteaza pozitiv la antrenament.` : `VO2 Max a scazut cu ${Math.abs(diff).toFixed(1)} puncte. Poate fi cauzat de reducerea antrenamentului sau variabilitate de masurare.` });
    }
  }
  return out;
}

function respInsights(data: DailySummary[]): Insight[] {
  const out: Insight[] = [];
  const today = data[data.length - 1].mean;
  const last30 = data.slice(-30).map(d => d.mean);
  const { mean: avg, std } = meanStd(last30);
  const z = std > 0 ? (today - avg) / std : 0;

  if (z > 2) {
    out.push({ id: "resp-high", title: "Frecventa respiratorie crescuta", severity: "warning", category: "cardio", metric: "respiratoryRate",
      body: `Frecventa respiratorie (${today.toFixed(1)}/min) e peste media ta (${avg.toFixed(1)} ± ${std.toFixed(1)}). Poate indica stres, anxietate, boala respiratorie incipiente, sau efort fizic rezidual. Normal in repaus: 12-20/min.` });
  }
  return out;
}

function walkingHRInsights(data: DailySummary[]): Insight[] {
  const out: Insight[] = [];
  if (data.length < 30) return out;
  const prev30 = data.slice(-60, -30).map(d => d.mean);
  const last30 = data.slice(-30).map(d => d.mean);
  if (prev30.length < 14) return out;

  const { mean: prev } = meanStd(prev30);
  const { mean: curr } = meanStd(last30);
  const pct = ((curr - prev) / prev) * 100;

  if (pct < -3) {
    out.push({ id: "walkhr-improving", title: "Puls de mers in scadere", severity: "good", category: "trend", metric: "walkingHeartRateAverage",
      body: `Pulsul mediu in timpul mersului a scazut de la ${prev.toFixed(0)} la ${curr.toFixed(0)} bpm (${pct.toFixed(1)}%). Un puls de mers mai scazut la aceeasi intensitate indica imbunatatirea eficientei cardiovasculare.` });
  }
  return out;
}

// ====================== SLEEP ======================

function sleepInsights(nights: SleepNight[]): Insight[] {
  const out: Insight[] = [];
  const last7 = nights.slice(-7);
  const last30 = nights.slice(-30);

  const durations7 = last7.map(n => n.totalMinutes / 60);
  const { mean: avgDur } = meanStd(durations7);

  if (avgDur < 6) {
    out.push({ id: "sleep-short", title: "Somn critic insuficient", severity: "alert", category: "sleep",
      body: `Ai dormit in medie doar ${avgDur.toFixed(1)} ore saptamana asta. Adultii au nevoie de 7-9 ore. Privarea cronica de somn (<6h) creste riscul de boli cardiovasculare cu 48%, slabeste imunitatea si afecteaza functia cognitiva. Aceasta ar trebui sa fie prioritatea #1.` });
  } else if (avgDur < 7) {
    out.push({ id: "sleep-below", title: "Somn sub optim", severity: "warning", category: "sleep",
      body: `Media somnului pe 7 zile: ${avgDur.toFixed(1)} ore — sub cele 7-9h recomandate. Chiar si 30 minute in plus pe noapte pot imbunatati semnificativ recuperarea, dispozitia si performanta.` });
  } else if (avgDur >= 7 && avgDur <= 9) {
    out.push({ id: "sleep-ok", title: "Durata somn in tinta", severity: "good", category: "sleep",
      body: `Media: ${avgDur.toFixed(1)} ore — in intervalul optim 7-9h. Durata adecvata a somnului este fundatia recuperarii.` });
  }

  // Deep sleep %
  const totalDeep = last7.reduce((s, n) => s + n.stages.deep, 0);
  const totalSleep = last7.reduce((s, n) => s + n.totalMinutes, 0);
  const deepPct = totalSleep > 0 ? (totalDeep / totalSleep) * 100 : 0;

  if (deepPct < 10) {
    out.push({ id: "deep-low", title: "Somn profund insuficient", severity: "warning", category: "sleep",
      body: `Doar ${deepPct.toFixed(0)}% din somn e profund (tinta: 15-20%). Somnul profund e critic pentru recuperarea fizica, functia imunitara si consolidarea memoriei. Sfaturi: evita alcoolul, mentine dormitorul racoros (18-19°C), exercitiu fizic mai devreme in zi, nu tarziu.` });
  } else if (deepPct >= 15) {
    out.push({ id: "deep-good", title: "Somn profund adecvat", severity: "good", category: "sleep",
      body: `${deepPct.toFixed(0)}% somn profund — peste pragul de 15%. Asta inseamna recuperare fizica buna si eliberare de hormon de crestere.` });
  }

  // REM
  const totalREM = last7.reduce((s, n) => s + n.stages.rem, 0);
  const remPct = totalSleep > 0 ? (totalREM / totalSleep) * 100 : 0;
  if (remPct < 15 && remPct > 0) {
    out.push({ id: "rem-low", title: "Somn REM sub tinta", severity: "warning", category: "sleep",
      body: `Somnul REM e ${remPct.toFixed(0)}% (tinta: 20-25%). REM e esential pentru procesarea emotionala, invatare si creativitate. Cauze frecvente de REM scazut: alcool, canabis, cafeina tarzie, program de somn inconsistent.` });
  }

  // Efficiency
  const efficiencies = last7.map(n => n.efficiency * 100);
  const { mean: avgEff } = meanStd(efficiencies);
  if (avgEff < 80) {
    out.push({ id: "eff-low", title: "Eficienta somnului slaba", severity: "warning", category: "sleep",
      body: `Eficienta somnului: ${avgEff.toFixed(0)}% (timp dormit vs timp in pat). Sub 80% inseamna timp excesiv treaz in pat. Sfat: daca nu adormi in 20 min, ridica-te si fa ceva relaxant, apoi revino in pat. Asta antreneaza creierul sa asocieze patul cu somnul.` });
  } else if (avgEff >= 90) {
    out.push({ id: "eff-good", title: "Eficienta somnului excelenta", severity: "good", category: "sleep",
      body: `${avgEff.toFixed(0)}% eficienta — adormi repede si ramai adormit. Indica igiena de somn sanatoasa.` });
  }

  // Social jet lag
  const weekdayMids: number[] = [];
  const weekendMids: number[] = [];
  last30.forEach(n => {
    const dow = new Date(n.date).getDay();
    if (dow === 0 || dow === 5 || dow === 6) weekendMids.push(n.sleepMidpoint);
    else weekdayMids.push(n.sleepMidpoint);
  });

  if (weekdayMids.length >= 5 && weekendMids.length >= 3) {
    const wdAvg = weekdayMids.reduce((a, b) => a + b, 0) / weekdayMids.length;
    const weAvg = weekendMids.reduce((a, b) => a + b, 0) / weekendMids.length;
    const jetLag = Math.abs(weAvg - wdAvg);
    if (jetLag > 1.5) {
      out.push({ id: "jet-lag", title: "Jet lag social semnificativ", severity: "warning", category: "sleep",
        body: `Punctul median al somnului se muta cu ${jetLag.toFixed(1)} ore intre zilele de lucru si weekend. Studiile arata ca >1h de jet lag social e asociat cu risc crescut de obezitate, probleme metabolice si sanatate cardiovasculara mai slaba (meta-analiza, Wittmann et al.). Incercati sa mentineti un program consistent, chiar si in weekend.` });
    } else if (jetLag < 0.5) {
      out.push({ id: "jet-lag-ok", title: "Program de somn consistent", severity: "good", category: "sleep",
        body: `Diferenta weekend-lucru: doar ${jetLag.toFixed(1)} ore. Consistenta programului de somn e unul dintre cei mai puternici predictori ai calitatii somnului.` });
    }
  }

  // Regularity
  const allMids = last30.map(n => n.sleepMidpoint);
  const { std: midStd } = meanStd(allMids);
  if (midStd > 1.5) {
    out.push({ id: "sleep-irreg", title: "Ora de culcare foarte variabila", severity: "warning", category: "sleep",
      body: `Ora de somn variaza cu ±${midStd.toFixed(1)} ore. Programul neregulat perturba ritmul circadian si reduce calitatea somnului chiar si cand durata e suficienta. Cea mai impactanta schimbare: culca-te si trezeste-te la aceeasi ora in fiecare zi.` });
  }

  return out;
}

// ====================== ACTIVITY ======================

function activityInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  const steps = metrics.stepCount;
  if (!steps || steps.length < 14) return out;

  const last7 = steps.slice(-7).map(d => d.sum);
  const prev7 = steps.slice(-14, -7).map(d => d.sum);
  const { mean: avg7 } = meanStd(last7);
  const { mean: prevAvg } = meanStd(prev7);

  if (avg7 < 5000) {
    out.push({ id: "steps-sed", title: "Nivel activitate foarte scazut", severity: "alert", category: "activity",
      body: `Media: ${avg7.toFixed(0)} pasi/zi — clasificat „sedentar" (<5,000). Cercetarile arata ca si cresteri modeste (la 7,000-8,000) reduc semnificativ mortalitatea de orice cauza. Incepe cu 1,000 pasi in plus fata de media curenta.` });
  } else if (avg7 >= 8000) {
    out.push({ id: "steps-good", title: "Nivel activitate bun", severity: "good", category: "activity",
      body: `${avg7.toFixed(0)} pasi/zi — peste pragul de 7,500 unde beneficiile majore de sanatate se stabilizeaza (Paluch et al., 2022, JAMA).` });
  }

  if (prevAvg > 0) {
    const pct = ((avg7 - prevAvg) / prevAvg) * 100;
    if (pct < -30) {
      out.push({ id: "steps-drop", title: "Scadere brusca de activitate", severity: "warning", category: "activity",
        body: `Pasii au scazut cu ${Math.abs(pct).toFixed(0)}% fata de saptamana trecuta (${avg7.toFixed(0)} vs ${prevAvg.toFixed(0)}). O scadere brusca poate indica boala, accidentare, sau schimbare de stil de viata.` });
    } else if (pct > 40) {
      out.push({ id: "steps-spike", title: "Crestere brusca de activitate", severity: "info", category: "activity",
        body: `Pasii au crescut cu ${pct.toFixed(0)}% fata de saptamana trecuta. Cresteri bruste cresc riscul de accidentare. Regula 10%: nu creste volumul saptamanal cu mai mult de 10%.` });
    }
  }

  // Exercise minutes
  if (metrics.exerciseTime?.length >= 7) {
    const exLast7 = metrics.exerciseTime.slice(-7).map(d => d.sum);
    const weeklyTotal = exLast7.reduce((a, b) => a + b, 0);
    if (weeklyTotal < 150) {
      out.push({ id: "ex-low", title: "Exercitiu sub recomandarile OMS", severity: "warning", category: "activity",
        body: `${weeklyTotal.toFixed(0)} min exercitiu saptamana asta — sub cele 150 min/sapt recomandate de OMS. 150 min de activitate moderata pe saptamana reduce riscul de boli cardiovasculare cu 30-40%.` });
    } else {
      out.push({ id: "ex-good", title: "Exercitiu in tinta OMS", severity: "good", category: "activity",
        body: `${weeklyTotal.toFixed(0)} min exercitiu saptamana asta — peste tinta de 150 min/sapt recomandata de OMS.` });
    }
  }

  return out;
}

// ====================== MOBILITY ======================

function mobilityInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];

  // Walking speed — strongest single predictor of mortality in older adults
  if (metrics.walkingSpeed?.length >= 14) {
    const last30 = metrics.walkingSpeed.slice(-30).map(d => d.mean);
    const prev30 = metrics.walkingSpeed.slice(-60, -30).map(d => d.mean);
    const { mean: curr } = meanStd(last30);

    if (curr < 0.8) { // m/s, ~2.9 km/h
      out.push({ id: "walk-speed-low", title: "Viteza de mers scazuta", severity: "warning", category: "mobility", metric: "walkingSpeed",
        body: `Viteza medie de mers (${(curr * 3.6).toFixed(1)} km/h) e sub 3 km/h. In studii cu >50,000 participanti, viteza de mers sub 0.8 m/s este cel mai puternic predictor individual de declin functional la adulti. Exercitiile de forta si echilibru pot imbunatati aceasta metrica.` });
    }

    if (prev30.length >= 14) {
      const { mean: prev } = meanStd(prev30);
      const pct = ((curr - prev) / prev) * 100;
      if (pct < -5) {
        out.push({ id: "walk-speed-decline", title: "Viteza mers in scadere", severity: "warning", category: "trend", metric: "walkingSpeed",
          body: `Viteza de mers a scazut cu ${Math.abs(pct).toFixed(1)}% in 30 zile. O scadere sustinuta poate indica probleme musculoskeletale sau declin general. Merita monitorizat.` });
      }
    }
  }

  // Walking asymmetry
  if (metrics.walkingAsymmetry?.length >= 14) {
    const last = metrics.walkingAsymmetry.slice(-7).map(d => d.mean);
    const { mean: avg } = meanStd(last);
    if (avg > 10) {
      out.push({ id: "asymmetry", title: "Asimetrie de mers semnificativa", severity: "warning", category: "mobility", metric: "walkingAsymmetry",
        body: `Asimetria mersului e ${avg.toFixed(1)}% (tinta: <8%). O asimetrie persistenta poate indica o accidentare compensata, diferenta de forta intre picioare, sau o problema articulara. Daca e noua, consulta un fizioterapeut.` });
    }
  }

  // Double support time
  if (metrics.doubleSupportPct?.length >= 14) {
    const last = metrics.doubleSupportPct.slice(-7).map(d => d.mean);
    const { mean: avg } = meanStd(last);
    if (avg > 30) {
      out.push({ id: "dbl-support", title: "Timp dublu sprijin ridicat", severity: "warning", category: "mobility", metric: "doubleSupportPct",
        body: `Timpul cu ambele picioare pe sol (${avg.toFixed(0)}%) e peste normal (20-30%). Valori ridicate indica probleme de echilibru si stabilitate, asociate cu risc crescut de cadere.` });
    }
  }

  return out;
}

// ====================== BODY ======================

function bodyInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  if (!metrics.bodyMass || metrics.bodyMass.length < 14) return out;

  const last30 = metrics.bodyMass.slice(-30).map(d => d.mean);
  const prev30 = metrics.bodyMass.slice(-60, -30).map(d => d.mean);
  const { mean: curr, std: currStd } = meanStd(last30);

  if (prev30.length >= 14) {
    const { mean: prev } = meanStd(prev30);
    const change = curr - prev;
    const weeklyRate = change / 4; // ~4 weeks

    if (Math.abs(weeklyRate) > 0.3) {
      const dir = weeklyRate > 0 ? "crestere" : "scadere";
      out.push({ id: "weight-change", title: `Greutate in ${dir}`, severity: Math.abs(weeklyRate) > 1 ? "warning" : "info", category: "body", metric: "bodyMass",
        body: `Greutatea a ${weeklyRate > 0 ? "crescut" : "scazut"} cu ${Math.abs(change).toFixed(1)} kg in 30 zile (${Math.abs(weeklyRate).toFixed(2)} kg/sapt). ${Math.abs(weeklyRate) > 1 ? "O rata peste 1 kg/saptamana este considerata nesustenabila si poate indica pierdere de masa musculara sau retentie de lichide." : "Rata moderata de schimbare."}` });
    }
  }

  // Daily fluctuation
  if (currStd > 1) {
    out.push({ id: "weight-fluct", title: "Fluctuatie zilnica mare de greutate", severity: "info", category: "body", metric: "bodyMass",
      body: `Fluctuatia zilnica e ±${currStd.toFixed(1)} kg. E normal sa variezi 1-2 kg zilnic din cauza apei, mancarii si sodiului. Urmareste trendul pe 7 zile, nu valorile zilnice.` });
  }

  return out;
}

// ====================== AUDIO ======================

function audioInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  if (metrics.headphoneAudio?.length >= 7) {
    const last7 = metrics.headphoneAudio.slice(-7).map(d => d.mean);
    const { mean: avg } = meanStd(last7);
    if (avg > 85) {
      out.push({ id: "audio-high", title: "Volum casti periculos", severity: "alert", category: "audio", metric: "headphoneAudio",
        body: `Volumul mediu al castilor (${avg.toFixed(0)} dB) depaseste 85 dB — pragul la care deteriorarea auzului poate incepe dupa 2 ore de expunere zilnica (OMS). Reduceti volumul sau limitati durata.` });
    } else if (avg > 75) {
      out.push({ id: "audio-moderate", title: "Volum casti moderat-ridicat", severity: "info", category: "audio", metric: "headphoneAudio",
        body: `Volumul mediu (${avg.toFixed(0)} dB) e moderat. Sub 85 dB e considerat sigur pentru expunere prelungita. Continuati sa monitorizati.` });
    }
  }

  if (metrics.noiseExposure?.length >= 7) {
    const last7 = metrics.noiseExposure.slice(-7).map(d => d.mean);
    const { mean: avg } = meanStd(last7);
    if (avg > 80) {
      out.push({ id: "noise-high", title: "Expunere ridicata la zgomot ambiental", severity: "warning", category: "audio", metric: "noiseExposure",
        body: `Nivelul mediu de zgomot (${avg.toFixed(0)} dB) e peste 80 dB. Expunerea cronica la zgomot >80 dB e asociata cu stres cardiovascular si probleme de auz.` });
    }
  }

  return out;
}

// ====================== TEMPERATURE ======================

function tempInsights(data: DailySummary[]): Insight[] {
  const out: Insight[] = [];
  const last7 = data.slice(-7).map(d => d.mean);
  const { mean: avg, std } = meanStd(last7);

  if (Math.abs(avg) > 0.5) {
    out.push({ id: "temp-dev", title: avg > 0 ? "Temperatura incheietura ridicata" : "Temperatura incheietura scazuta", severity: Math.abs(avg) > 1 ? "warning" : "info", category: "cardio", metric: "wristTemperature",
      body: `Deviatia medie a temperaturii e ${avg > 0 ? "+" : ""}${avg.toFixed(2)}°C fata de baseline. Deviatii pozitive persistente pot indica inflamatie, boala incipiente, sau faza luteala a ciclului menstrual. Deviatii negative pot indica deshidratare.` });
  }
  return out;
}

// ====================== ILLNESS DETECTION ======================

function illnessDetection(metrics: Record<string, DailySummary[]>): Insight[] {
  const out: Insight[] = [];
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  if (!rhr || rhr.length < 30 || !hrv || hrv.length < 30) return out;

  const { mean: rhrAvg, std: rhrStd } = meanStd(rhr.slice(-30).map(d => d.mean));
  const { mean: hrvAvg, std: hrvStd } = meanStd(hrv.slice(-30).map(d => d.mean));
  const rhrZ = rhrStd > 0 ? (rhr[rhr.length - 1].mean - rhrAvg) / rhrStd : 0;
  const hrvZ = hrvStd > 0 ? (hrv[hrv.length - 1].mean - hrvAvg) / hrvStd : 0;

  let spo2Low = false;
  if (metrics.oxygenSaturation?.length > 0) spo2Low = metrics.oxygenSaturation[metrics.oxygenSaturation.length - 1].mean * 100 < 95;

  let respHigh = false;
  if (metrics.respiratoryRate?.length > 14) {
    const { mean: rAvg, std: rStd } = meanStd(metrics.respiratoryRate.slice(-30).map(d => d.mean));
    const rZ = rStd > 0 ? (metrics.respiratoryRate[metrics.respiratoryRate.length - 1].mean - rAvg) / rStd : 0;
    respHigh = rZ > 1.5;
  }

  let tempHigh = false;
  if (metrics.wristTemperature?.length > 0) {
    tempHigh = metrics.wristTemperature[metrics.wristTemperature.length - 1].mean > 0.5;
  }

  const flags = [rhrZ > 1.5, hrvZ < -1.5, spo2Low, respHigh, tempHigh].filter(Boolean).length;

  if (flags >= 3) {
    out.push({ id: "illness-high", title: "ATENTIE: Multiple metrici indica stres/boala", severity: "alert", category: "recovery",
      body: `${flags} din 5 indicatori de boala sunt activi simultan: ${rhrZ > 1.5 ? "puls ridicat, " : ""}${hrvZ < -1.5 ? "HRV scazut, " : ""}${spo2Low ? "SpO2 scazut, " : ""}${respHigh ? "respiratie rapida, " : ""}${tempHigh ? "temperatura crescuta" : ""}. Acest pattern multi-metric apare de obicei cu 1-2 zile INAINTE de simptome. Recomandare: odihna completa, hidratare agresiva, somn suplimentar. Evita antrenamentul intens.` });
  } else if (flags === 2) {
    out.push({ id: "illness-mod", title: "Semne initiale de stres fiziologic", severity: "warning", category: "recovery",
      body: `2 indicatori de stres sunt activi: ${rhrZ > 1.5 ? "puls crescut, " : ""}${hrvZ < -1.5 ? "HRV scazut, " : ""}${spo2Low ? "SpO2 sub normal, " : ""}${respHigh ? "respiratie mai rapida, " : ""}${tempHigh ? "temperatura usor crescuta" : ""}. Nu e neaparat boala — poate fi stres, somn slab, sau overtraining. Monitorizeaza in urmatoarele 24h.` });
  }

  return out;
}

// ====================== EXHAUSTIVE CORRELATIONS ======================

function exhaustiveCorrelations(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[]
): Insight[] {
  const out: Insight[] = [];

  // Build date-aligned arrays for all metrics
  const metricKeys = Object.keys(metrics).filter(k => metrics[k].length >= 30);
  const dateMap: Record<string, Record<string, number>> = {};

  for (const key of metricKeys) {
    for (const d of metrics[key]) {
      if (!dateMap[d.date]) dateMap[d.date] = {};
      dateMap[d.date][key] = key === "stepCount" || key === "activeEnergy" || key === "exerciseTime" || key === "distance" || key === "flightsClimbed"
        ? d.sum : d.mean;
    }
  }

  // Add sleep data
  for (const n of sleepNights) {
    if (!dateMap[n.date]) dateMap[n.date] = {};
    dateMap[n.date]["sleepDuration"] = n.totalMinutes / 60;
    dateMap[n.date]["sleepEfficiency"] = n.efficiency * 100;
    dateMap[n.date]["deepSleepPct"] = n.totalMinutes > 0 ? (n.stages.deep / n.totalMinutes) * 100 : 0;
  }

  const allKeys = [...metricKeys];
  if (sleepNights.length >= 30) allKeys.push("sleepDuration", "sleepEfficiency", "deepSleepPct");

  const dates = Object.keys(dateMap).sort();
  if (dates.length < 30) return out;

  // Compute all pairwise correlations (including lagged: X[day] → Y[day+1])
  const LABELS: Record<string, string> = {
    restingHeartRate: "puls repaus",
    hrv: "HRV",
    oxygenSaturation: "SpO2",
    stepCount: "pasi",
    activeEnergy: "calorii active",
    exerciseTime: "exercitiu",
    vo2Max: "VO2 Max",
    sleepDuration: "durata somn",
    sleepEfficiency: "eficienta somn",
    deepSleepPct: "% somn profund",
    respiratoryRate: "frecventa respiratorie",
    bodyMass: "greutate",
    walkingSpeed: "viteza mers",
    wristTemperature: "temperatura",
    headphoneAudio: "volum casti",
    noiseExposure: "zgomot",
    dietaryCaffeine: "cafeina",
    distance: "distanta",
  };

  const significantCorrs: { keyX: string; keyY: string; r: number; p: number; lag: number }[] = [];

  // Test interesting pairs (not all NxN — would be too many)
  const interestingPairs = [
    // Sleep → recovery next day
    ["sleepDuration", "hrv", 1],
    ["sleepDuration", "restingHeartRate", 1],
    ["sleepEfficiency", "hrv", 1],
    ["deepSleepPct", "hrv", 1],
    // Activity → recovery
    ["stepCount", "restingHeartRate", 1],
    ["exerciseTime", "hrv", 1],
    ["activeEnergy", "restingHeartRate", 1],
    // Same-day correlations
    ["stepCount", "activeEnergy", 0],
    ["sleepDuration", "stepCount", 0],
    ["restingHeartRate", "hrv", 0],
    ["bodyMass", "restingHeartRate", 0],
    ["bodyMass", "stepCount", 0],
    // Caffeine
    ["dietaryCaffeine", "sleepDuration", 0],
    ["dietaryCaffeine", "sleepEfficiency", 0],
    ["dietaryCaffeine", "hrv", 1],
    // Temperature
    ["wristTemperature", "hrv", 0],
    ["wristTemperature", "restingHeartRate", 0],
    // Exercise → sleep
    ["exerciseTime", "sleepDuration", 0],
    ["exerciseTime", "deepSleepPct", 0],
    ["stepCount", "sleepDuration", 0],
    // Noise
    ["noiseExposure", "restingHeartRate", 0],
  ] as [string, string, number][];

  const numTests = interestingPairs.length;
  const bonferroniAlpha = 0.05 / numTests; // Bonferroni correction

  for (const [keyX, keyY, lag] of interestingPairs) {
    const xVals: number[] = [];
    const yVals: number[] = [];

    for (let i = 0; i < dates.length - lag; i++) {
      const xDate = dates[i];
      const yDate = dates[i + lag];
      const x = dateMap[xDate]?.[keyX];
      const y = dateMap[yDate]?.[keyY];
      if (x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) {
        xVals.push(x);
        yVals.push(y);
      }
    }

    if (xVals.length < 20) continue;

    const r = pearson(xVals, yVals);
    const p = pearsonPValue(r, xVals.length);

    // Only report if statistically significant after Bonferroni correction
    if (Math.abs(r) > 0.15 && p < bonferroniAlpha) {
      significantCorrs.push({ keyX, keyY, r, p, lag });
    }
  }

  // Sort by |r| descending and take top 5
  significantCorrs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  for (const corr of significantCorrs.slice(0, 5)) {
    const labelX = LABELS[corr.keyX] || corr.keyX;
    const labelY = LABELS[corr.keyY] || corr.keyY;
    const strength = Math.abs(corr.r) > 0.5 ? "puternica" : Math.abs(corr.r) > 0.3 ? "moderata" : "slaba";
    const dir = corr.r > 0 ? "pozitiva" : "negativa";
    const lagText = corr.lag > 0 ? ` (cu efect in ziua urmatoare)` : "";
    const effectSize = `r=${corr.r.toFixed(2)}, p=${corr.p < 0.001 ? "<0.001" : corr.p.toFixed(3)}`;
    const bonNote = `Semnificativ dupa corectia Bonferroni (α=${bonferroniAlpha.toFixed(4)}, n=${significantCorrs.length} teste).`;

    let interpretation = "";
    if (corr.keyX.includes("sleep") && corr.keyY === "hrv" && corr.r > 0) {
      interpretation = "Mai mult somn → HRV mai mare a doua zi. Prioritizarea somnului iti imbunatateste direct recuperarea.";
    } else if (corr.keyX === "stepCount" && corr.keyY === "restingHeartRate" && corr.r > 0) {
      interpretation = "Zilele mai active sunt urmate de puls in repaus mai ridicat — corpul tau se recupereaza dupa efort.";
    } else if (corr.keyX === "exerciseTime" && corr.keyY.includes("sleep") && corr.r > 0) {
      interpretation = "Exercitiul e asociat cu somn mai bun. Antrenamentul regulat imbunatateste calitatea somnului.";
    } else if (corr.keyX === "dietaryCaffeine") {
      interpretation = corr.r < 0 ? "Cafeina e asociata negativ — reducerea sau oprirea consumului dupa ora 14 poate ajuta." : "";
    } else {
      interpretation = `Cand ${labelX} creste, ${labelY} tinde sa ${corr.r > 0 ? "creasca" : "scada"}${lagText}.`;
    }

    out.push({
      id: `corr-${corr.keyX}-${corr.keyY}`,
      title: `Corelatie ${strength}: ${labelX} → ${labelY}`,
      body: `${interpretation}\n\nStatistic: corelatie ${dir} ${strength} (${effectSize}). ${bonNote}`,
      severity: "info",
      category: "correlation",
    });
  }

  return out;
}

// ====================== WEEKLY COMPARISON ======================

function weeklyComparison(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[]
): Insight[] {
  const out: Insight[] = [];
  const lines: string[] = [];

  const pairs: { key: string; label: string; unit: string; better: "up" | "down"; useSum: boolean }[] = [
    { key: "stepCount", label: "Pasi", unit: "", better: "up", useSum: true },
    { key: "restingHeartRate", label: "Puls repaus", unit: "bpm", better: "down", useSum: false },
    { key: "hrv", label: "HRV", unit: "ms", better: "up", useSum: false },
    { key: "exerciseTime", label: "Exercitiu", unit: "min", better: "up", useSum: true },
    { key: "activeEnergy", label: "Calorii active", unit: "kcal", better: "up", useSum: true },
    { key: "walkingSpeed", label: "Viteza mers", unit: "km/h", better: "up", useSum: false },
  ];

  for (const { key, label, unit, better, useSum } of pairs) {
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
    lines.push(`${label}: ${t.toFixed(key === "walkingSpeed" ? 1 : 0)}${unit ? " " + unit : ""} ${arrow} ${Math.abs(pct).toFixed(0)}% (${status})`);
  }

  if (sleepNights.length >= 14) {
    const tw = sleepNights.slice(-7).map(n => n.totalMinutes / 60);
    const lw = sleepNights.slice(-14, -7).map(n => n.totalMinutes / 60);
    const { mean: t } = meanStd(tw);
    const { mean: l } = meanStd(lw);
    if (l > 0) {
      const pct = ((t - l) / l) * 100;
      const arrow = pct > 2 ? "↑" : pct < -2 ? "↓" : "→";
      lines.push(`Somn: ${t.toFixed(1)}h ${arrow} ${Math.abs(pct).toFixed(0)}% (${Math.abs(pct) < 3 ? "stabil" : pct > 0 ? "mai bine" : "mai rau"})`);
    }
  }

  if (lines.length >= 3) {
    out.push({ id: "weekly", title: "Saptamana asta vs saptamana trecuta", body: lines.join("\n"), severity: "info", category: "trend" });
  }

  return out;
}
