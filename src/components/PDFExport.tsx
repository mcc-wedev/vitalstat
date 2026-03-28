"use client";

import { useCallback } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";
import { generateInsights } from "@/lib/stats/insights";
import { calculateRecovery } from "@/lib/stats/recovery";
import { meanStd } from "@/lib/stats/zScore";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

export function PDFExport({ metrics, sleepNights }: Props) {
  const handleExport = useCallback(() => {
    // Get latest date
    const allDates = Object.values(metrics).flatMap(d => d.map(x => x.date));
    const latestDate = allDates.sort().pop() || new Date().toISOString().substring(0, 10);

    // Recovery
    const recovery = calculateRecovery(
      metrics.restingHeartRate || [], metrics.hrv || [], sleepNights,
      latestDate, metrics.exerciseTime, metrics.respiratoryRate, metrics.oxygenSaturation
    );

    // Key metrics summary
    const keyMetrics = ["restingHeartRate", "hrv", "oxygenSaturation", "vo2Max", "stepCount", "exerciseTime", "activeEnergy", "bodyMass"]
      .filter(k => metrics[k]?.length >= 7)
      .map(k => {
        const data = metrics[k];
        const cfg = METRIC_CONFIG[k];
        const last7 = data.slice(-7).map(d => cfg?.aggregation === "sum" ? d.sum : d.mean);
        const { mean: avg } = meanStd(last7);
        const last30 = data.slice(-30).map(d => cfg?.aggregation === "sum" ? d.sum : d.mean);
        const { mean: avg30 } = meanStd(last30);
        return { label: cfg?.label || k, value: avg.toFixed(cfg?.decimals ?? 0), unit: cfg?.unit || "", avg30: avg30.toFixed(cfg?.decimals ?? 0) };
      });

    // Sleep stats
    const last7sleep = sleepNights.slice(-7);
    const sleepAvg = last7sleep.length > 0 ? (last7sleep.reduce((s, n) => s + n.totalMinutes, 0) / last7sleep.length / 60).toFixed(1) : "—";
    const sleepEff = last7sleep.length > 0 ? (last7sleep.reduce((s, n) => s + n.efficiency, 0) / last7sleep.length * 100).toFixed(0) : "—";

    // Insights
    const insights = generateInsights(metrics, sleepNights).slice(0, 10);

    const scoreColor = recovery.total >= 80 ? "#10b981" : recovery.total >= 60 ? "#22d3ee" : recovery.total >= 40 ? "#f59e0b" : "#ef4444";
    const scoreLabel = recovery.total >= 80 ? "Excelent" : recovery.total >= 60 ? "Bun" : recovery.total >= 40 ? "Mediu" : "Slab";

    // Generate HTML for print
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>VitalStat Raport</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #fff; color: #1a1a2e; padding: 40px; max-width: 800px; margin: auto; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin: 24px 0 12px; color: #444; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  .subtitle { color: #888; font-size: 12px; margin-bottom: 24px; }
  .score-box { display: flex; align-items: center; gap: 16px; background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 16px 0; }
  .score-num { font-size: 48px; font-weight: 800; color: ${scoreColor}; }
  .score-label { font-size: 14px; color: ${scoreColor}; font-weight: 600; }
  .score-detail { font-size: 12px; color: #666; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  th { color: #888; font-weight: 500; font-size: 11px; text-transform: uppercase; }
  .insight { padding: 10px 12px; margin: 6px 0; border-radius: 8px; border-left: 3px solid; }
  .insight-alert { background: #fef2f2; border-color: #ef4444; }
  .insight-warning { background: #fffbeb; border-color: #f59e0b; }
  .insight-good { background: #ecfdf5; border-color: #10b981; }
  .insight-info { background: #eff6ff; border-color: #3b82f6; }
  .insight-title { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
  .insight-body { font-size: 12px; color: #555; line-height: 1.5; }
  .footer { margin-top: 32px; text-align: center; font-size: 10px; color: #aaa; }
  @media print { body { padding: 20px; } }
</style></head><body>
<h1>VitalStat — Raport de sanatate</h1>
<p class="subtitle">Generat pe ${new Date().toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })} | Date pana la ${latestDate}</p>

<div class="score-box">
  <div class="score-num">${recovery.hasEnoughData ? recovery.total : "—"}</div>
  <div>
    <div class="score-label">${recovery.hasEnoughData ? scoreLabel : "Date insuficiente"}</div>
    <div class="score-detail">Scor de recuperare bazat pe ${recovery.components.filter(c => c.available).length} factori</div>
    ${recovery.components.filter(c => c.available).map(c => `<div class="score-detail">${c.name}: ${c.score}/100 (${c.weight}%)</div>`).join("")}
  </div>
</div>

<h2>Metrici cheie (medie 7 zile)</h2>
<table>
  <tr><th>Metrica</th><th>Valoare</th><th>Medie 30z</th></tr>
  ${keyMetrics.map(m => `<tr><td>${m.label}</td><td><strong>${m.value}</strong> ${m.unit}</td><td>${m.avg30} ${m.unit}</td></tr>`).join("")}
  <tr><td>Somn (durata)</td><td><strong>${sleepAvg}</strong> ore</td><td>—</td></tr>
  <tr><td>Somn (eficienta)</td><td><strong>${sleepEff}</strong>%</td><td>—</td></tr>
</table>

<h2>Interpretari (top ${insights.length})</h2>
${insights.map(i => `<div class="insight insight-${i.severity}"><div class="insight-title">${i.title}</div><div class="insight-body">${i.body}</div></div>`).join("")}

<p class="footer">Generat de VitalStat — Datele tale, interpretari inteligente. | vitalstat.app</p>
</body></html>`;

    // Open in new window for printing
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  }, [metrics, sleepNights]);

  return (
    <button onClick={handleExport} className="pill text-[10px]" title="Exporta raport PDF">
      📄
    </button>
  );
}
