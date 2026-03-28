"use client";

import { useCallback } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

export function ShareCard({ metrics, sleepNights }: Props) {
  const generateCard = useCallback(() => {
    const rhr = metrics.restingHeartRate;
    const hrv = metrics.hrv;
    if (!rhr?.length || !hrv?.length) return;

    const latestDate = [...rhr.map(d => d.date), ...hrv.map(d => d.date)].sort().pop() || "";
    const recovery = calculateRecovery(rhr, hrv, sleepNights, latestDate, metrics.exerciseTime, metrics.respiratoryRate, metrics.oxygenSaturation, metrics.wristTemperature);

    const rhrVal = rhr[rhr.length - 1]?.mean.toFixed(0) || "—";
    const hrvVal = hrv[hrv.length - 1]?.mean.toFixed(0) || "—";
    const steps = metrics.stepCount?.[metrics.stepCount.length - 1]?.sum.toLocaleString() || "—";
    const lastSleep = sleepNights.length > 0 ? (sleepNights[sleepNights.length - 1].totalMinutes / 60).toFixed(1) : "—";

    const scoreColor = recovery.total >= 80 ? "#10b981" : recovery.total >= 60 ? "#22d3ee" : recovery.total >= 40 ? "#f59e0b" : "#ef4444";
    const scoreLabel = recovery.total >= 80 ? "Excelent" : recovery.total >= 60 ? "Bun" : recovery.total >= 40 ? "Mediu" : "Slab";

    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 600, 400);
    grad.addColorStop(0, "#0a0a12");
    grad.addColorStop(1, "#0f1020");
    ctx.fillStyle = grad;
    ctx.roundRect(0, 0, 600, 400, 20);
    ctx.fill();

    // Border glow
    ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
    ctx.lineWidth = 1;
    ctx.roundRect(0, 0, 600, 400, 20);
    ctx.stroke();

    // Logo
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 16px -apple-system, system-ui, sans-serif";
    ctx.fillText("♡ VitalStat", 30, 40);

    // Date
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "12px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(latestDate, 570, 40);
    ctx.textAlign = "left";

    // Recovery score (big)
    ctx.fillStyle = scoreColor;
    ctx.font = "bold 72px -apple-system, system-ui, sans-serif";
    ctx.fillText(recovery.hasEnoughData ? String(recovery.total) : "—", 30, 130);

    ctx.font = "16px -apple-system, system-ui, sans-serif";
    ctx.fillText(recovery.hasEnoughData ? `Recuperare ${scoreLabel}` : "Date insuficiente", 30, 155);

    // Metrics grid
    const metricsData = [
      { label: "RHR", value: `${rhrVal} bpm`, icon: "❤️" },
      { label: "HRV", value: `${hrvVal} ms`, icon: "💜" },
      { label: "Somn", value: `${lastSleep}h`, icon: "🌙" },
      { label: "Pasi", value: steps, icon: "🚶" },
    ];

    const startY = 200;
    metricsData.forEach((m, i) => {
      const x = 30 + (i % 2) * 280;
      const y = startY + Math.floor(i / 2) * 70;

      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.roundRect(x, y, 260, 55, 10);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px -apple-system, system-ui, sans-serif";
      ctx.fillText(`${m.icon} ${m.label}`, x + 12, y + 22);

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 20px -apple-system, system-ui, sans-serif";
      ctx.fillText(m.value, x + 12, y + 44);
    });

    // Footer
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "10px -apple-system, system-ui, sans-serif";
    ctx.fillText("Generat de VitalStat — vitalstat.app", 30, 385);

    // Download
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vitalstat-${latestDate}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [metrics, sleepNights]);

  return (
    <button onClick={generateCard} className="pill text-[10px]" title="Genereaza card de partajat">
      📸
    </button>
  );
}
