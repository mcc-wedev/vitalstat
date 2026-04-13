/**
 * Weekly Digest — Narrative summary of the last 7 days.
 */

import type { DailySummary, SleepNight } from "../parser/healthTypes";
import { METRIC_CONFIG, getDisplayValue } from "../parser/healthTypes";

export interface WeeklyDigest {
  headline: string;
  periodLabel: string;
  stats: { label: string; value: string; delta: string; deltaColor: string }[];
  highlights: string[];
  lowlights: string[];
  sleepSummary: string;
  narrative: string;
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function fmtDate(d: string): string {
  const dt = new Date(d);
  return `${dt.getDate()} ${["ian","feb","mar","apr","mai","iun","iul","aug","sep","oct","nov","dec"][dt.getMonth()]}`;
}

export function generateWeeklyDigest(
  metrics: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
): WeeklyDigest | null {
  // Collect all dates
  const allDates = new Set<string>();
  for (const arr of Object.values(metrics)) {
    for (const d of arr) allDates.add(d.date);
  }
  const dates = [...allDates].sort();
  if (dates.length < 7) return null;

  const last7 = new Set(dates.slice(-7));
  const prev7 = new Set(dates.slice(-14, -7));

  // Key stats
  const statKeys = ["restingHeartRate", "hrv", "stepCount", "exerciseTime"];
  const stats: WeeklyDigest["stats"] = [];

  for (const key of statKeys) {
    const data = metrics[key];
    const cfg = METRIC_CONFIG[key];
    if (!data || !cfg) continue;

    const cur = data.filter(d => last7.has(d.date));
    const prev = data.filter(d => prev7.has(d.date));
    if (cur.length < 3) continue;

    const curAvg = avg(cur.map(d => getDisplayValue(d, key)));
    const prevAvg = prev.length >= 3 ? avg(prev.map(d => getDisplayValue(d, key))) : curAvg;
    const deltaPct = prevAvg !== 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : 0;
    const improving = cfg.higherIsBetter ? deltaPct > 0 : deltaPct < 0;

    stats.push({
      label: cfg.label,
      value: `${key === "stepCount" ? Math.round(curAvg).toLocaleString("ro-RO") : curAvg.toFixed(cfg.decimals)} ${cfg.unit}`,
      delta: `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`,
      deltaColor: Math.abs(deltaPct) < 2 ? "var(--label-tertiary)" : improving ? "#34C759" : "#FF3B30",
    });
  }

  // Sleep
  const recentSleep = sleepNights.filter(n => last7.has(n.date));
  const prevSleep = sleepNights.filter(n => prev7.has(n.date));
  const avgSleepH = avg(recentSleep.map(n => n.totalMinutes / 60));
  const prevSleepH = avg(prevSleep.map(n => n.totalMinutes / 60));

  let sleepSummary = "";
  if (avgSleepH > 0) {
    sleepSummary = `Media somn: ${avgSleepH.toFixed(1)}h`;
    if (prevSleepH > 0) {
      const diff = (avgSleepH - prevSleepH) * 60;
      sleepSummary += ` (${diff >= 0 ? "+" : ""}${diff.toFixed(0)} min vs sapt. trecuta)`;
    }
  }

  // Highlights & lowlights
  const highlights: string[] = [];
  const lowlights: string[] = [];

  const hrvWeek = (metrics.hrv || []).filter(d => last7.has(d.date));
  if (hrvWeek.length >= 3) {
    const best = hrvWeek.reduce((a, b) => b.mean > a.mean ? b : a, hrvWeek[0]);
    highlights.push(`Cel mai bun HRV: ${Math.round(best.mean)} ms (${fmtDate(best.date)})`);
  }

  const stepsWeek = (metrics.stepCount || []).filter(d => last7.has(d.date));
  if (stepsWeek.length >= 3) {
    const over10k = stepsWeek.filter(d => d.sum >= 10000).length;
    if (over10k >= 5) highlights.push(`${over10k}/7 zile cu 10.000+ pasi`);
    else if (over10k <= 1) lowlights.push(`Doar ${over10k}/7 zile cu 10.000+ pasi`);
  }

  const exWeek = (metrics.exerciseTime || []).filter(d => last7.has(d.date));
  if (exWeek.length >= 3) {
    const totalMin = exWeek.reduce((s, d) => s + d.sum, 0);
    if (totalMin >= 150) highlights.push(`${Math.round(totalMin)} min exercitiu — peste recomandarea OMS`);
    else if (totalMin < 75) lowlights.push(`Doar ${Math.round(totalMin)} min exercitiu saptamanal`);
  }

  if (avgSleepH >= 7.5) highlights.push(`Somn excelent: ${avgSleepH.toFixed(1)}h medie`);
  else if (avgSleepH > 0 && avgSleepH < 6.5) lowlights.push(`Somn insuficient: ${avgSleepH.toFixed(1)}h medie`);

  // Headline
  const pos = highlights.length;
  const neg = lowlights.length;
  const headline = pos >= 3 && neg === 0
    ? "Saptamana excelenta! 🌟"
    : pos > neg ? "Saptamana buna, cu loc de imbunatatire"
    : neg > pos ? "Saptamana sub potential — focuseaza pe recuperare"
    : "Saptamana echilibrata";

  // Narrative
  const parts: string[] = [];
  if (avgSleepH > 0) {
    parts.push(avgSleepH >= 7
      ? `Somnul a fost adecvat (${avgSleepH.toFixed(1)}h medie)`
      : `Somnul a fost insuficient (${avgSleepH.toFixed(1)}h — tinteste 7-8h)`);
  }
  const imp = stats.filter(s => s.deltaColor === "#34C759");
  const dec = stats.filter(s => s.deltaColor === "#FF3B30");
  if (imp.length > 0) parts.push(`Imbunatatiri: ${imp.map(s => s.label).join(", ")}`);
  if (dec.length > 0) parts.push(`De urmarit: ${dec.map(s => s.label).join(", ")}`);

  return {
    headline,
    periodLabel: `${fmtDate(dates[dates.length - 7])} – ${fmtDate(dates[dates.length - 1])}`,
    stats, highlights, lowlights, sleepSummary,
    narrative: parts.join(". ") + ".",
  };
}
