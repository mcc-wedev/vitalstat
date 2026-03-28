import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { meanStd } from "./zScore";
import { pearson, pearsonPValue } from "./correlation";

export type InsightSeverity = "good" | "warning" | "alert" | "info";

export interface Insight {
  id: string;
  title: string;
  body: string;
  severity: InsightSeverity;
  category: "recovery" | "cardio" | "sleep" | "activity" | "correlation" | "trend";
  metric?: string;
}

/**
 * Generate all insights from health data
 */
export function generateInsights(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[]
): Insight[] {
  const insights: Insight[] = [];

  // RHR insights
  if (metrics.restingHeartRate?.length >= 14) {
    insights.push(...rhrInsights(metrics.restingHeartRate));
  }

  // HRV insights
  if (metrics.hrv?.length >= 14) {
    insights.push(...hrvInsights(metrics.hrv));
  }

  // SpO2 insights
  if (metrics.oxygenSaturation?.length >= 7) {
    insights.push(...spo2Insights(metrics.oxygenSaturation));
  }

  // Sleep insights
  if (sleepNights.length >= 7) {
    insights.push(...sleepInsights(sleepNights));
  }

  // Activity insights
  if (metrics.stepCount?.length >= 14) {
    insights.push(...activityInsights(metrics));
  }

  // VO2 Max insights
  if (metrics.vo2Max?.length >= 7) {
    insights.push(...vo2Insights(metrics.vo2Max));
  }

  // Cross-metric correlations
  insights.push(...correlationInsights(metrics, sleepNights));

  // Weekly comparison
  insights.push(...weeklyComparison(metrics, sleepNights));

  // Multi-metric anomaly detection (illness)
  insights.push(...illnessDetection(metrics));

  return insights;
}

// --- RHR ---
function rhrInsights(data: DailySummary[]): Insight[] {
  const insights: Insight[] = [];
  const last7 = data.slice(-7).map((d) => d.mean);
  const last30 = data.slice(-30).map((d) => d.mean);
  const prev30 = data.slice(-60, -30).map((d) => d.mean);

  const { mean: avg7 } = meanStd(last7);
  const { mean: avg30, std: std30 } = meanStd(last30);

  // Today vs baseline
  const today = data[data.length - 1].mean;
  const z = std30 > 0 ? (today - avg30) / std30 : 0;

  if (z > 2) {
    insights.push({
      id: "rhr-elevated",
      title: "Resting HR elevated",
      body: `Your resting heart rate today (${today.toFixed(0)} bpm) is significantly above your 30-day average (${avg30.toFixed(0)} bpm). This can indicate stress, dehydration, illness onset, or overtraining. If this persists for 2-3 days, consider resting.`,
      severity: "alert",
      category: "cardio",
      metric: "restingHeartRate",
    });
  } else if (z < -1.5) {
    insights.push({
      id: "rhr-low",
      title: "Resting HR below baseline",
      body: `Your resting heart rate (${today.toFixed(0)} bpm) is below your average (${avg30.toFixed(0)} bpm). This typically indicates good recovery and cardiovascular adaptation.`,
      severity: "good",
      category: "cardio",
      metric: "restingHeartRate",
    });
  }

  // 30-day trend
  if (prev30.length >= 14) {
    const { mean: prevAvg } = meanStd(prev30);
    const change = avg30 - prevAvg;
    const changePct = (change / prevAvg) * 100;

    if (changePct < -3) {
      insights.push({
        id: "rhr-trend-improving",
        title: "Cardiovascular fitness improving",
        body: `Your average resting heart rate dropped from ${prevAvg.toFixed(0)} to ${avg30.toFixed(0)} bpm over the past 30 days (${changePct.toFixed(1)}%). A declining RHR trend is one of the strongest indicators of improving cardiovascular fitness.`,
        severity: "good",
        category: "trend",
        metric: "restingHeartRate",
      });
    } else if (changePct > 5) {
      insights.push({
        id: "rhr-trend-rising",
        title: "Resting HR trending upward",
        body: `Your average resting heart rate increased from ${prevAvg.toFixed(0)} to ${avg30.toFixed(0)} bpm over 30 days (+${changePct.toFixed(1)}%). This could indicate accumulated fatigue, stress, or declining fitness. Monitor your sleep and recovery.`,
        severity: "warning",
        category: "trend",
        metric: "restingHeartRate",
      });
    }
  }

  return insights;
}

// --- HRV ---
function hrvInsights(data: DailySummary[]): Insight[] {
  const insights: Insight[] = [];
  const last7 = data.slice(-7).map((d) => d.mean);
  const last30 = data.slice(-30).map((d) => d.mean);
  const prev30 = data.slice(-60, -30).map((d) => d.mean);

  const { mean: avg7 } = meanStd(last7);
  const { mean: avg30, std: std30 } = meanStd(last30);
  const today = data[data.length - 1].mean;
  const z = std30 > 0 ? (today - avg30) / std30 : 0;

  // Coefficient of variation — consistency matters
  const cv = avg30 > 0 ? (std30 / avg30) * 100 : 0;

  if (z < -2) {
    insights.push({
      id: "hrv-drop",
      title: "HRV significantly below baseline",
      body: `Your HRV today (${today.toFixed(0)} ms) is well below your 30-day average (${avg30.toFixed(0)} ms). Low HRV indicates your autonomic nervous system is under stress. This is often the earliest signal of illness, overtraining, or accumulated stress — before you feel symptoms.`,
      severity: "alert",
      category: "recovery",
      metric: "hrv",
    });
  } else if (z > 1.5) {
    insights.push({
      id: "hrv-high",
      title: "HRV above baseline — well recovered",
      body: `Your HRV today (${today.toFixed(0)} ms) is above your average (${avg30.toFixed(0)} ms). High HRV reflects strong parasympathetic tone and good recovery. This is a good day for intense training.`,
      severity: "good",
      category: "recovery",
      metric: "hrv",
    });
  }

  if (cv > 25) {
    insights.push({
      id: "hrv-inconsistent",
      title: "HRV highly variable",
      body: `Your HRV coefficient of variation is ${cv.toFixed(0)}% (over 25% is high). Inconsistent HRV day-to-day suggests irregular recovery patterns. Focus on consistent sleep times, stress management, and avoiding alcohol before bed.`,
      severity: "warning",
      category: "cardio",
      metric: "hrv",
    });
  }

  // Trend
  if (prev30.length >= 14) {
    const { mean: prevAvg } = meanStd(prev30);
    const changePct = ((avg30 - prevAvg) / prevAvg) * 100;

    if (changePct > 10) {
      insights.push({
        id: "hrv-trend-up",
        title: "HRV trending upward",
        body: `Your 30-day HRV average increased from ${prevAvg.toFixed(0)} to ${avg30.toFixed(0)} ms (+${changePct.toFixed(0)}%). Rising HRV over weeks indicates improving autonomic health and adaptation to training load.`,
        severity: "good",
        category: "trend",
        metric: "hrv",
      });
    } else if (changePct < -10) {
      insights.push({
        id: "hrv-trend-down",
        title: "HRV declining over 30 days",
        body: `Your HRV average dropped from ${prevAvg.toFixed(0)} to ${avg30.toFixed(0)} ms (${changePct.toFixed(0)}%). A sustained HRV decline suggests accumulated fatigue or chronic stress. Consider reducing training intensity and prioritizing sleep.`,
        severity: "warning",
        category: "trend",
        metric: "hrv",
      });
    }
  }

  return insights;
}

// --- SpO2 ---
function spo2Insights(data: DailySummary[]): Insight[] {
  const insights: Insight[] = [];
  const last7 = data.slice(-7).map((d) => d.mean * 100);
  const { mean: avg7, std: std7 } = meanStd(last7);
  const today = data[data.length - 1].mean * 100;

  if (today < 94) {
    insights.push({
      id: "spo2-low",
      title: "Blood oxygen critically low",
      body: `Your SpO2 reading (${today.toFixed(1)}%) is below 94%. Normal range is 95-100%. Consistently low SpO2 may indicate respiratory issues. If this persists, consider consulting a doctor.`,
      severity: "alert",
      category: "cardio",
      metric: "oxygenSaturation",
    });
  } else if (today < 95) {
    insights.push({
      id: "spo2-borderline",
      title: "Blood oxygen borderline",
      body: `Your SpO2 (${today.toFixed(1)}%) is at the lower edge of normal (95-100%). This can be normal at altitude or during deep sleep. If consistently below 95% during the day, worth monitoring.`,
      severity: "warning",
      category: "cardio",
      metric: "oxygenSaturation",
    });
  }

  return insights;
}

// --- Sleep ---
function sleepInsights(nights: SleepNight[]): Insight[] {
  const insights: Insight[] = [];
  const last7 = nights.slice(-7);
  const last30 = nights.slice(-30);

  // Duration
  const durations7 = last7.map((n) => n.totalMinutes / 60);
  const { mean: avgDuration } = meanStd(durations7);

  if (avgDuration < 6) {
    insights.push({
      id: "sleep-short",
      title: "Sleep critically short",
      body: `You averaged only ${avgDuration.toFixed(1)} hours of sleep this week. Adults need 7-9 hours. Chronic sleep deprivation (<6h) increases risk of cardiovascular disease, weakens immunity, and impairs cognitive function. This should be your #1 priority to fix.`,
      severity: "alert",
      category: "sleep",
    });
  } else if (avgDuration < 7) {
    insights.push({
      id: "sleep-below-target",
      title: "Sleep below optimal",
      body: `Your 7-day sleep average is ${avgDuration.toFixed(1)} hours — below the recommended 7-9h. Even 30 minutes more per night can meaningfully improve recovery, mood, and performance.`,
      severity: "warning",
      category: "sleep",
    });
  } else if (avgDuration >= 7 && avgDuration <= 9) {
    insights.push({
      id: "sleep-optimal",
      title: "Sleep duration on target",
      body: `You're averaging ${avgDuration.toFixed(1)} hours — within the optimal 7-9 hour range. Good sleep duration is the foundation of recovery.`,
      severity: "good",
      category: "sleep",
    });
  }

  // Deep sleep percentage
  const totalDeep = last7.reduce((s, n) => s + n.stages.deep, 0);
  const totalSleep = last7.reduce((s, n) => s + n.totalMinutes, 0);
  const deepPct = totalSleep > 0 ? (totalDeep / totalSleep) * 100 : 0;

  if (deepPct < 10) {
    insights.push({
      id: "deep-sleep-low",
      title: "Deep sleep insufficient",
      body: `Only ${deepPct.toFixed(0)}% of your sleep is deep sleep (target: 15-20%). Deep sleep is critical for physical recovery, immune function, and memory consolidation. To improve: avoid alcohol, keep a cool bedroom (18-19°C), exercise earlier in the day.`,
      severity: "warning",
      category: "sleep",
    });
  } else if (deepPct >= 15) {
    insights.push({
      id: "deep-sleep-good",
      title: "Deep sleep proportion healthy",
      body: `${deepPct.toFixed(0)}% of your sleep is deep sleep — above the 15% threshold. This means strong physical recovery and growth hormone release.`,
      severity: "good",
      category: "sleep",
    });
  }

  // REM sleep
  const totalREM = last7.reduce((s, n) => s + n.stages.rem, 0);
  const remPct = totalSleep > 0 ? (totalREM / totalSleep) * 100 : 0;

  if (remPct < 15) {
    insights.push({
      id: "rem-low",
      title: "REM sleep below target",
      body: `Your REM sleep is ${remPct.toFixed(0)}% (target: 20-25%). REM is essential for emotional processing, learning, and creativity. Low REM is often caused by alcohol, cannabis, late caffeine, or inconsistent sleep schedule.`,
      severity: "warning",
      category: "sleep",
    });
  }

  // Efficiency
  const efficiencies = last7.map((n) => n.efficiency * 100);
  const { mean: avgEff } = meanStd(efficiencies);

  if (avgEff < 80) {
    insights.push({
      id: "sleep-eff-low",
      title: "Sleep efficiency poor",
      body: `Your sleep efficiency is ${avgEff.toFixed(0)}% (time asleep vs time in bed). Below 80% means excessive time awake in bed. Tip: if you can't sleep after 20 minutes, get up and do something relaxing, then return to bed. This retrains your brain to associate bed with sleep.`,
      severity: "warning",
      category: "sleep",
    });
  } else if (avgEff >= 90) {
    insights.push({
      id: "sleep-eff-excellent",
      title: "Sleep efficiency excellent",
      body: `${avgEff.toFixed(0)}% sleep efficiency is excellent — you fall asleep quickly and stay asleep. This indicates healthy sleep hygiene.`,
      severity: "good",
      category: "sleep",
    });
  }

  // Social jet lag
  const weekdayMids: number[] = [];
  const weekendMids: number[] = [];
  last30.forEach((n) => {
    const dow = new Date(n.date).getDay();
    if (dow === 0 || dow === 5 || dow === 6) weekendMids.push(n.sleepMidpoint);
    else weekdayMids.push(n.sleepMidpoint);
  });

  if (weekdayMids.length >= 5 && weekendMids.length >= 3) {
    const wdAvg = weekdayMids.reduce((a, b) => a + b, 0) / weekdayMids.length;
    const weAvg = weekendMids.reduce((a, b) => a + b, 0) / weekendMids.length;
    const jetLag = Math.abs(weAvg - wdAvg);

    if (jetLag > 1.5) {
      insights.push({
        id: "social-jetlag-high",
        title: "Significant social jet lag",
        body: `Your sleep midpoint shifts by ${jetLag.toFixed(1)} hours between weekdays and weekends. Studies show >1h of social jet lag is associated with increased obesity risk, metabolic issues, and poorer cardiovascular health. Try to keep a consistent sleep schedule, even on weekends.`,
        severity: "warning",
        category: "sleep",
      });
    } else if (jetLag < 0.5) {
      insights.push({
        id: "social-jetlag-low",
        title: "Consistent sleep schedule",
        body: `Your weekday-weekend sleep timing differs by only ${jetLag.toFixed(1)} hours. Consistent sleep schedules are one of the strongest predictors of sleep quality and overall health.`,
        severity: "good",
        category: "sleep",
      });
    }
  }

  // Sleep regularity (std dev of midpoint)
  const allMids = last30.map((n) => n.sleepMidpoint);
  const { std: midStd } = meanStd(allMids);

  if (midStd > 1.5) {
    insights.push({
      id: "sleep-irregular",
      title: "Irregular sleep timing",
      body: `Your sleep timing varies by ±${midStd.toFixed(1)} hours. Irregular sleep schedules disrupt your circadian rhythm and reduce sleep quality even when you get enough hours. The most impactful change you can make: go to bed and wake up at the same time every day.`,
      severity: "warning",
      category: "sleep",
    });
  }

  return insights;
}

// --- Activity ---
function activityInsights(metrics: Record<string, DailySummary[]>): Insight[] {
  const insights: Insight[] = [];
  const steps = metrics.stepCount;
  if (!steps || steps.length < 14) return insights;

  const last7 = steps.slice(-7).map((d) => d.sum);
  const prev7 = steps.slice(-14, -7).map((d) => d.sum);
  const { mean: avg7 } = meanStd(last7);
  const { mean: prevAvg } = meanStd(prev7);

  if (avg7 < 5000) {
    insights.push({
      id: "steps-sedentary",
      title: "Activity level very low",
      body: `You're averaging ${avg7.toFixed(0)} steps/day this week — classified as "sedentary" (<5,000). Research shows that even modest increases (to 7,000-8,000) significantly reduce all-cause mortality. Start with 1,000 more steps than your current average.`,
      severity: "alert",
      category: "activity",
    });
  } else if (avg7 >= 8000 && avg7 < 10000) {
    insights.push({
      id: "steps-active",
      title: "Good activity level",
      body: `${avg7.toFixed(0)} steps/day is above the 7,500 threshold where major health benefits plateau. You're in a healthy range.`,
      severity: "good",
      category: "activity",
    });
  } else if (avg7 >= 10000) {
    insights.push({
      id: "steps-very-active",
      title: "Excellent activity level",
      body: `${avg7.toFixed(0)} daily steps — well above average. The latest research shows health benefits continue up to ~12,000 steps, with diminishing returns beyond that.`,
      severity: "good",
      category: "activity",
    });
  }

  // Week-over-week change
  if (prevAvg > 0) {
    const changePct = ((avg7 - prevAvg) / prevAvg) * 100;
    if (changePct < -30) {
      insights.push({
        id: "steps-drop",
        title: "Sharp activity drop this week",
        body: `Your steps dropped ${Math.abs(changePct).toFixed(0)}% vs last week (${avg7.toFixed(0)} vs ${prevAvg.toFixed(0)}). A sudden drop may indicate illness, injury, or lifestyle change. Monitor your recovery metrics.`,
        severity: "warning",
        category: "activity",
      });
    } else if (changePct > 30) {
      insights.push({
        id: "steps-spike",
        title: "Activity spike this week",
        body: `Steps up ${changePct.toFixed(0)}% vs last week. Sudden increases in activity can be great, but monitor your recovery — large jumps increase injury risk. The 10% rule: don't increase weekly load by more than 10%.`,
        severity: "info",
        category: "activity",
      });
    }
  }

  return insights;
}

// --- VO2 Max ---
function vo2Insights(data: DailySummary[]): Insight[] {
  const insights: Insight[] = [];
  const latest = data[data.length - 1].mean;

  // General fitness classification (rough, age-independent)
  let classification = "";
  if (latest >= 50) classification = "Excellent";
  else if (latest >= 42) classification = "Good";
  else if (latest >= 35) classification = "Fair";
  else classification = "Below average";

  insights.push({
    id: "vo2-level",
    title: `VO2 Max: ${classification}`,
    body: `Your VO2 Max is ${latest.toFixed(1)} mL/min/kg — classified as "${classification}". VO2 Max is the single strongest predictor of longevity in clinical research. Every 1-point improvement reduces all-cause mortality risk by approximately 9%. Improve it with Zone 2 cardio (easy pace you can hold a conversation at) for 150+ min/week.`,
    severity: latest >= 42 ? "good" : latest >= 35 ? "info" : "warning",
    category: "cardio",
    metric: "vo2Max",
  });

  // Trend
  if (data.length >= 30) {
    const first10 = data.slice(0, 10).map((d) => d.mean);
    const last10 = data.slice(-10).map((d) => d.mean);
    const { mean: early } = meanStd(first10);
    const { mean: recent } = meanStd(last10);
    const change = recent - early;

    if (Math.abs(change) >= 1) {
      insights.push({
        id: "vo2-trend",
        title: change > 0 ? "VO2 Max improving" : "VO2 Max declining",
        body: change > 0
          ? `Your VO2 Max increased by ${change.toFixed(1)} points over your data range. Your cardiovascular system is adapting positively to your training.`
          : `Your VO2 Max dropped ${Math.abs(change).toFixed(1)} points. This may be due to reduced training, illness, or measurement variability. Consistent aerobic exercise is the primary driver.`,
        severity: change > 0 ? "good" : "warning",
        category: "trend",
        metric: "vo2Max",
      });
    }
  }

  return insights;
}

// --- Correlations ---
function correlationInsights(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[]
): Insight[] {
  const insights: Insight[] = [];

  // Sleep duration → next day HRV
  if (sleepNights.length >= 30 && metrics.hrv?.length >= 30) {
    const sleepMap = new Map(sleepNights.map((n) => [n.date, n.totalMinutes / 60]));
    const hrvMap = new Map(metrics.hrv.map((d) => [d.date, d.mean]));

    const pairs: { sleep: number; hrv: number }[] = [];
    const sortedDates = [...hrvMap.keys()].sort();

    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = sortedDates[i - 1];
      const currDate = sortedDates[i];
      const sleepVal = sleepMap.get(prevDate);
      const hrvVal = hrvMap.get(currDate);
      if (sleepVal !== undefined && hrvVal !== undefined) {
        pairs.push({ sleep: sleepVal, hrv: hrvVal });
      }
    }

    if (pairs.length >= 20) {
      const r = pearson(
        pairs.map((p) => p.sleep),
        pairs.map((p) => p.hrv)
      );
      const p = pearsonPValue(r, pairs.length);

      if (Math.abs(r) > 0.2 && p < 0.05) {
        const direction = r > 0 ? "positive" : "negative";
        const strength = Math.abs(r) > 0.5 ? "strong" : Math.abs(r) > 0.3 ? "moderate" : "weak";
        insights.push({
          id: "corr-sleep-hrv",
          title: "Sleep duration affects your HRV",
          body: `In your data, there's a ${strength} ${direction} correlation (r=${r.toFixed(2)}, p=${p.toFixed(3)}) between sleep duration and next-day HRV. ${r > 0 ? "Longer sleep is associated with higher HRV the next day. Prioritizing sleep directly improves your recovery." : "This is unexpected — consider other factors like alcohol or late exercise."}`,
          severity: "info",
          category: "correlation",
        });
      }
    }
  }

  // Steps → RHR (next day)
  if (metrics.stepCount?.length >= 30 && metrics.restingHeartRate?.length >= 30) {
    const stepsMap = new Map(metrics.stepCount.map((d) => [d.date, d.sum]));
    const rhrMap = new Map(metrics.restingHeartRate.map((d) => [d.date, d.mean]));

    const pairs: { steps: number; rhr: number }[] = [];
    const dates = [...rhrMap.keys()].sort();

    for (let i = 1; i < dates.length; i++) {
      const prevDate = dates[i - 1];
      const currDate = dates[i];
      const stepsVal = stepsMap.get(prevDate);
      const rhrVal = rhrMap.get(currDate);
      if (stepsVal !== undefined && rhrVal !== undefined) {
        pairs.push({ steps: stepsVal, rhr: rhrVal });
      }
    }

    if (pairs.length >= 20) {
      const r = pearson(
        pairs.map((p) => p.steps),
        pairs.map((p) => p.rhr)
      );
      const p = pearsonPValue(r, pairs.length);

      if (Math.abs(r) > 0.2 && p < 0.05) {
        insights.push({
          id: "corr-steps-rhr",
          title: "Activity impacts your resting heart rate",
          body: `Your data shows a ${Math.abs(r) > 0.3 ? "moderate" : "weak"} correlation (r=${r.toFixed(2)}) between daily steps and next-day resting HR. ${r > 0 ? "Higher activity days are followed by elevated RHR — your body is recovering from the effort." : "More active days are followed by lower RHR, suggesting your cardiovascular system responds well to activity."}`,
          severity: "info",
          category: "correlation",
        });
      }
    }
  }

  return insights;
}

// --- Weekly comparison ---
function weeklyComparison(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[]
): Insight[] {
  const insights: Insight[] = [];
  const comparisons: string[] = [];

  // Compare this week vs last week for key metrics
  const pairs: { label: string; data: DailySummary[]; unit: string; higherBetter: boolean; useSum: boolean }[] = [
    { label: "Steps", data: metrics.stepCount || [], unit: "", higherBetter: true, useSum: true },
    { label: "Resting HR", data: metrics.restingHeartRate || [], unit: "bpm", higherBetter: false, useSum: false },
    { label: "HRV", data: metrics.hrv || [], unit: "ms", higherBetter: true, useSum: false },
    { label: "Exercise", data: metrics.exerciseTime || [], unit: "min", higherBetter: true, useSum: true },
  ];

  for (const { label, data, unit, higherBetter, useSum } of pairs) {
    if (data.length < 14) continue;
    const thisWeek = data.slice(-7).map((d) => useSum ? d.sum : d.mean);
    const lastWeek = data.slice(-14, -7).map((d) => useSum ? d.sum : d.mean);
    const { mean: tw } = meanStd(thisWeek);
    const { mean: lw } = meanStd(lastWeek);
    if (lw === 0) continue;

    const pct = ((tw - lw) / lw) * 100;
    const arrow = pct > 2 ? "↑" : pct < -2 ? "↓" : "→";
    const good = (pct > 0 && higherBetter) || (pct < 0 && !higherBetter);
    const color = Math.abs(pct) < 3 ? "stable" : good ? "better" : "worse";

    comparisons.push(
      `${label}: ${tw.toFixed(label === "Resting HR" || label === "HRV" ? 0 : 0)}${unit ? " " + unit : ""} ${arrow} ${Math.abs(pct).toFixed(0)}% (${color})`
    );
  }

  // Sleep comparison
  if (sleepNights.length >= 14) {
    const tw = sleepNights.slice(-7).map((n) => n.totalMinutes / 60);
    const lw = sleepNights.slice(-14, -7).map((n) => n.totalMinutes / 60);
    const { mean: twAvg } = meanStd(tw);
    const { mean: lwAvg } = meanStd(lw);
    if (lwAvg > 0) {
      const pct = ((twAvg - lwAvg) / lwAvg) * 100;
      const arrow = pct > 2 ? "↑" : pct < -2 ? "↓" : "→";
      comparisons.push(
        `Sleep: ${twAvg.toFixed(1)}h ${arrow} ${Math.abs(pct).toFixed(0)}% (${Math.abs(pct) < 3 ? "stable" : pct > 0 ? "better" : "worse"})`
      );
    }
  }

  if (comparisons.length >= 3) {
    insights.push({
      id: "weekly-summary",
      title: "This week vs last week",
      body: comparisons.join("\n"),
      severity: "info",
      category: "trend",
    });
  }

  return insights;
}

// --- Illness detection ---
function illnessDetection(metrics: Record<string, DailySummary[]>): Insight[] {
  const insights: Insight[] = [];
  const rhr = metrics.restingHeartRate;
  const hrv = metrics.hrv;
  const spo2 = metrics.oxygenSaturation;

  if (!rhr || rhr.length < 30 || !hrv || hrv.length < 30) return insights;

  const rhr30 = rhr.slice(-30).map((d) => d.mean);
  const hrv30 = hrv.slice(-30).map((d) => d.mean);
  const { mean: rhrAvg, std: rhrStd } = meanStd(rhr30);
  const { mean: hrvAvg, std: hrvStd } = meanStd(hrv30);

  const rhrToday = rhr[rhr.length - 1].mean;
  const hrvToday = hrv[hrv.length - 1].mean;

  const rhrZ = rhrStd > 0 ? (rhrToday - rhrAvg) / rhrStd : 0;
  const hrvZ = hrvStd > 0 ? (hrvToday - hrvAvg) / hrvStd : 0;

  let spo2Low = false;
  if (spo2 && spo2.length > 0) {
    spo2Low = spo2[spo2.length - 1].mean * 100 < 95;
  }

  // Multi-metric anomaly
  if (rhrZ > 1.5 && hrvZ < -1.5) {
    insights.push({
      id: "illness-warning",
      title: "Multiple metrics indicate stress/illness",
      body: `Your RHR is elevated (+${rhrZ.toFixed(1)}σ) AND HRV is depressed (${hrvZ.toFixed(1)}σ) simultaneously${spo2Low ? ", with SpO2 also below normal" : ""}. This pattern is the classic early indicator of illness, often appearing 1-2 days before symptoms. Consider: rest, hydration, extra sleep. If you feel unwell, skip intense training.`,
      severity: "alert",
      category: "recovery",
    });
  }

  return insights;
}
