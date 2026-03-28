"use client";

import { useCallback } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

export function CSVExport({ metrics, sleepNights }: Props) {
  const handleExport = useCallback(() => {
    // Collect all dates
    const allDates = new Set<string>();
    for (const data of Object.values(metrics)) {
      for (const d of data) allDates.add(d.date);
    }
    for (const n of sleepNights) allDates.add(n.date);

    const dates = [...allDates].sort();
    const metricKeys = Object.keys(metrics).filter(k => metrics[k].length > 0).sort();

    // Build header
    const header = ["Data"];
    for (const key of metricKeys) {
      const cfg = METRIC_CONFIG[key];
      const label = cfg?.label || key;
      const unit = cfg?.unit ? ` (${cfg.unit})` : "";
      header.push(`${label}${unit}`);
    }
    header.push("Somn (ore)", "Eficienta somn (%)", "Somn profund (%)", "REM (%)");

    // Build rows
    const rows: string[][] = [];
    for (const date of dates) {
      const row = [date];

      for (const key of metricKeys) {
        const entry = metrics[key].find(d => d.date === date);
        if (entry) {
          const cfg = METRIC_CONFIG[key];
          const val = cfg?.aggregation === "sum" ? entry.sum : entry.mean;
          row.push(val.toFixed(cfg?.decimals ?? 2));
        } else {
          row.push("");
        }
      }

      // Sleep
      const night = sleepNights.find(n => n.date === date);
      if (night) {
        row.push((night.totalMinutes / 60).toFixed(2));
        row.push((night.efficiency * 100).toFixed(1));
        const totalMin = Math.max(night.totalMinutes, 1);
        row.push(((night.stages.deep / totalMin) * 100).toFixed(1));
        row.push(((night.stages.rem / totalMin) * 100).toFixed(1));
      } else {
        row.push("", "", "", "");
      }

      rows.push(row);
    }

    // Generate CSV
    const csvContent = [
      header.join(","),
      ...rows.map(r => r.map(cell => cell.includes(",") ? `"${cell}"` : cell).join(",")),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vitalstat-export-${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [metrics, sleepNights]);

  return (
    <button onClick={handleExport} className="pill text-[10px]" title="Exporta CSV pentru Excel">
      📊
    </button>
  );
}
