"use client";

import { useCallback, useState } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";
import { meanStd } from "@/lib/stats/zScore";
import { generateInsights } from "@/lib/stats/insights";

interface Props {
  date: string;
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

const DAILY_METRICS: { key: string; field: "mean" | "sum" }[] = [
  { key: "restingHeartRate", field: "mean" },
  { key: "hrv", field: "mean" },
  { key: "stepCount", field: "sum" },
  { key: "exerciseTime", field: "sum" },
];

/**
 * ═══════════════════════════════════════════════════════════════
 *  SHARE DAILY REPORT — generates a vertical 1080x1920 PNG
 *  (Instagram story format) of the day's key stats for sharing.
 *
 *  Pure canvas — no external dependencies. Honors current theme
 *  vars by sampling from the document at capture time.
 * ═══════════════════════════════════════════════════════════════
 */
export function ShareDailyReport({ date, metrics, sleepNights }: Props) {
  const [busy, setBusy] = useState(false);

  const generate = useCallback(async () => {
    setBusy(true);
    try {
      const W = 1080;
      const H = 1920;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setBusy(false); return; }

      // Detect theme
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      const bg1 = isLight ? "#F2F2F7" : "#000000";
      const bg2 = isLight ? "#FFFFFF" : "#1C1C1E";
      const textPrimary = isLight ? "#000000" : "#FFFFFF";
      const textSecondary = isLight ? "rgba(60,60,67,0.6)" : "rgba(235,235,245,0.6)";
      const textTertiary = isLight ? "rgba(60,60,67,0.3)" : "rgba(235,235,245,0.3)";
      const cardBg = isLight ? "#FFFFFF" : "#1C1C1E";
      const separator = isLight ? "rgba(60,60,67,0.2)" : "rgba(84,84,88,0.35)";

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, bg1);
      grad.addColorStop(1, bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Compute data
      const recovery = calculateRecovery(
        metrics.restingHeartRate || [],
        metrics.hrv || [],
        sleepNights,
        date,
        metrics.exerciseTime,
        metrics.respiratoryRate,
        metrics.oxygenSaturation,
        metrics.wristTemperature,
      );

      const scoreColor = recovery.total >= 80 ? "#34C759"
        : recovery.total >= 60 ? "#30D158"
        : recovery.total >= 40 ? "#FF9500"
        : "#FF3B30";
      const scoreLabel = recovery.total >= 80 ? "Excelent"
        : recovery.total >= 60 ? "Bun"
        : recovery.total >= 40 ? "Mediu"
        : recovery.total >= 20 ? "Slab" : "Critic";

      // ─── HEADER ───
      ctx.fillStyle = "#FF9500";
      ctx.font = "bold 42px -apple-system, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("♡ VitalStat", 80, 140);

      ctx.fillStyle = textTertiary;
      ctx.font = "36px -apple-system, system-ui, sans-serif";
      ctx.textAlign = "right";
      const dayLabel = new Date(date).toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });
      ctx.fillText(dayLabel, W - 80, 140);
      ctx.textAlign = "left";

      // ─── RECOVERY HERO ───
      const heroY = 260;
      ctx.fillStyle = cardBg;
      roundRect(ctx, 60, heroY, W - 120, 440, 32);
      ctx.fill();

      ctx.fillStyle = textSecondary;
      ctx.font = "500 32px -apple-system, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("RECUPERARE", 110, heroY + 70);

      if (recovery.hasEnoughData) {
        ctx.fillStyle = scoreColor;
        ctx.font = "bold 220px -apple-system, system-ui, sans-serif";
        ctx.fillText(String(recovery.total), 100, heroY + 280);

        ctx.fillStyle = scoreColor;
        ctx.font = "bold 56px -apple-system, system-ui, sans-serif";
        ctx.fillText(scoreLabel, 100, heroY + 360);

        // Component bars (up to 4)
        const comps = recovery.components.filter(c => c.available).slice(0, 4);
        const barStartY = heroY + 150;
        const barAreaX = 640;
        const barAreaW = W - 60 - barAreaX - 40;
        ctx.font = "500 26px -apple-system, system-ui, sans-serif";
        comps.forEach((c, i) => {
          const y = barStartY + i * 56;
          ctx.fillStyle = textSecondary;
          ctx.textAlign = "left";
          ctx.fillText(truncate(c.name, 14), barAreaX, y);
          ctx.fillStyle = textPrimary;
          ctx.textAlign = "right";
          ctx.fillText(String(c.score), barAreaX + barAreaW, y);

          // Bar
          ctx.fillStyle = separator;
          roundRect(ctx, barAreaX, y + 12, barAreaW, 8, 4);
          ctx.fill();
          ctx.fillStyle = c.score >= 70 ? "#34C759" : c.score >= 40 ? "#FF9500" : "#FF3B30";
          roundRect(ctx, barAreaX, y + 12, (barAreaW * Math.min(100, c.score)) / 100, 8, 4);
          ctx.fill();
        });
        ctx.textAlign = "left";
      } else {
        ctx.fillStyle = textSecondary;
        ctx.font = "44px -apple-system, system-ui, sans-serif";
        ctx.fillText("Date insuficiente", 100, heroY + 260);
      }

      // ─── METRIC CARDS 2x2 ───
      const cardY = 760;
      const cardSize = (W - 60 - 40 - 60) / 2;
      const gap = 40;

      const snaps = computeSnapshots(date, metrics);
      const top4 = snaps.slice(0, 4);

      top4.forEach((snap, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 60 + col * (cardSize + gap);
        const y = cardY + row * (cardSize + gap);

        // Card bg
        const colors = STATUS_COLORS[snap.status];
        ctx.fillStyle = cardBg;
        roundRect(ctx, x, y, cardSize, cardSize * 0.75, 28);
        ctx.fill();

        // Border stripe
        ctx.fillStyle = colors.text;
        roundRect(ctx, x, y, 8, cardSize * 0.75, 4);
        ctx.fill();

        // Label
        ctx.fillStyle = textSecondary;
        ctx.font = "500 28px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(snap.label.toUpperCase(), x + 40, y + 60);

        // Value
        ctx.fillStyle = textPrimary;
        ctx.font = "bold 90px -apple-system, system-ui, sans-serif";
        ctx.fillText(snap.valueStr, x + 40, y + 180);
        ctx.fillStyle = textTertiary;
        ctx.font = "34px -apple-system, system-ui, sans-serif";
        ctx.fillText(snap.unit, x + 40 + ctx.measureText(snap.valueStr).width + 10, y + 180);

        // Delta
        ctx.fillStyle = colors.text;
        ctx.font = "500 28px -apple-system, system-ui, sans-serif";
        const arrow = snap.deltaPct > 2 ? "↑" : snap.deltaPct < -2 ? "↓" : "→";
        ctx.fillText(`${arrow} ${Math.abs(snap.deltaPct).toFixed(0)}% vs 28z`, x + 40, y + cardSize * 0.75 - 40);
      });

      // ─── INSIGHTS ───
      const insY = cardY + 2 * (cardSize * 0.75 + gap) + 20;
      const filtered: Record<string, DailySummary[]> = {};
      for (const [k, d] of Object.entries(metrics)) filtered[k] = d.filter(x => x.date <= date);
      const insights = generateInsights(filtered, sleepNights.filter(n => n.date <= date)).slice(0, 3);

      if (insights.length > 0) {
        ctx.fillStyle = cardBg;
        const insCardH = 60 + insights.length * 120;
        roundRect(ctx, 60, insY, W - 120, insCardH, 28);
        ctx.fill();

        ctx.fillStyle = textSecondary;
        ctx.font = "500 28px -apple-system, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("CE SPUN DATELE", 110, insY + 60);

        insights.forEach((ins, i) => {
          const y = insY + 120 + i * 120;
          const dot = ins.severity === "alert" ? "#FF3B30"
            : ins.severity === "warning" ? "#FF9500"
            : ins.severity === "good" ? "#34C759" : "#007AFF";
          ctx.fillStyle = dot;
          ctx.beginPath();
          ctx.arc(125, y - 6, 10, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = textPrimary;
          ctx.font = "bold 32px -apple-system, system-ui, sans-serif";
          ctx.fillText(truncate(ins.title, 38), 155, y);

          ctx.fillStyle = textSecondary;
          ctx.font = "28px -apple-system, system-ui, sans-serif";
          ctx.fillText(truncate(ins.body, 44), 155, y + 42);
        });
      }

      // ─── FOOTER ───
      ctx.fillStyle = textTertiary;
      ctx.font = "26px -apple-system, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Generat de VitalStat · vitalstat.app", W / 2, H - 100);

      // Export
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vitalstat-raport-${date}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } finally {
      setBusy(false);
    }
  }, [date, metrics, sleepNights]);

  return (
    <button
      type="button"
      onClick={generate}
      disabled={busy}
      className="pill"
      style={{
        padding: "10px 18px",
        fontSize: 14,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "var(--accent)",
        color: "#fff",
      }}
      title="Descarca raportul ca imagine (format Story)"
    >
      {busy ? "Se genereaza..." : "Descarca imagine raport"}
    </button>
  );
}

// ────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  green: { text: "#34C759" },
  amber: { text: "#FF9500" },
  red:   { text: "#FF3B30" },
};

function getStatus(z: number, higherIsBetter: boolean): "green" | "amber" | "red" {
  const effectiveZ = higherIsBetter ? z : -z;
  if (effectiveZ > -1) return "green";
  if (effectiveZ > -2) return "amber";
  return "red";
}

interface Snap {
  label: string;
  unit: string;
  valueStr: string;
  deltaPct: number;
  status: "green" | "amber" | "red";
}

function computeSnapshots(date: string, metrics: Record<string, DailySummary[]>): Snap[] {
  const out: Snap[] = [];
  for (const { key, field } of DAILY_METRICS) {
    const data = metrics[key];
    const cfg = METRIC_CONFIG[key];
    if (!data || !cfg || data.length < 14) continue;

    const today = data.find(d => d.date === date);
    if (!today) continue;
    const value = today[field];
    const before = data.filter(d => d.date < date).slice(-28);
    if (before.length < 7) continue;

    const baseArr = before.map(d => d[field]);
    const { mean: baseline, std } = meanStd(baseArr);
    const z = std > 0 ? (value - baseline) / std : 0;
    const deltaPct = baseline > 0 ? ((value - baseline) / baseline) * 100 : 0;

    out.push({
      label: cfg.label,
      unit: cfg.unit,
      valueStr: (field === "sum" && value >= 1000)
        ? value.toLocaleString("ro-RO", { maximumFractionDigits: 0 })
        : value.toFixed(cfg.decimals),
      deltaPct,
      status: getStatus(z, cfg.higherIsBetter),
    });
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncate(str: string, max: number): string {
  if (!str) return "";
  if (str.length <= max) return str;
  return str.substring(0, max - 1) + "…";
}
