"use client";

import { useMemo } from "react";
import type { SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";

interface Props {
  sleepNights: SleepNight[];
}

export function CircadianMap({ sleepNights }: Props) {
  const data = useMemo(() => {
    if (sleepNights.length < 14) return null;

    const last30 = sleepNights.slice(-30);

    // Bedtime analysis
    const bedtimes = last30.map(n => {
      const d = new Date(n.bedtime);
      let h = d.getHours() + d.getMinutes() / 60;
      if (h < 12) h += 24;
      return h;
    });
    const { mean: avgBedtime } = meanStd(bedtimes);

    // Wake time analysis
    const waketimes = last30.map(n => {
      const bed = new Date(n.bedtime);
      const wake = new Date(bed.getTime() + n.totalMinutes * 60000 + (n.inBedMinutes - n.totalMinutes) * 60000);
      return wake.getHours() + wake.getMinutes() / 60;
    });
    const { mean: avgWake } = meanStd(waketimes);

    // Sleep midpoint → chronotype
    const midpoints = last30.map(n => {
      const bed = new Date(n.bedtime);
      let h = bed.getHours() + bed.getMinutes() / 60;
      if (h < 12) h += 24;
      return h + (n.totalMinutes / 60) / 2;
    });
    const { mean: avgMidpoint } = meanStd(midpoints);

    // Chronotype classification (Roenneberg 2003)
    const chronotype = avgMidpoint <= 26 ? "Extrem matinal" // midpoint before 2am
      : avgMidpoint <= 27 ? "Matinal"     // 2-3am
      : avgMidpoint <= 28 ? "Usor matinal" // 3-4am
      : avgMidpoint <= 29 ? "Intermediar"  // 4-5am
      : avgMidpoint <= 30 ? "Usor nocturn" // 5-6am
      : "Nocturn";                          // 6am+

    // Day-of-week bedtime pattern
    const dayNames = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sam"];
    const byDay: number[][] = [[], [], [], [], [], [], []];
    last30.forEach(n => {
      const dow = new Date(n.date).getDay();
      const d = new Date(n.bedtime);
      let h = d.getHours() + d.getMinutes() / 60;
      if (h < 12) h += 24;
      byDay[dow].push(h);
    });

    const dayPattern = byDay.map((vals, i) => ({
      day: dayNames[i],
      avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      count: vals.length,
    }));

    const formatHour = (h: number): string => {
      const normalized = h >= 24 ? h - 24 : h;
      const hours = Math.floor(normalized);
      const mins = Math.round((normalized - hours) * 60);
      return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
    };

    return {
      avgBedtime: formatHour(avgBedtime),
      avgWake: formatHour(avgWake),
      avgDuration: ((avgWake + 24 - avgBedtime) % 24).toFixed(1),
      chronotype,
      dayPattern,
      formatHour,
    };
  }, [sleepNights]);

  if (!data) return null;

  // Find min/max for bedtime bar visualization
  const validDays = data.dayPattern.filter(d => d.count > 0);
  const minH = Math.min(...validDays.map(d => d.avg));
  const maxH = Math.max(...validDays.map(d => d.avg));
  const range = Math.max(maxH - minH, 0.5);

  return (
    <div className="glass p-4 animate-in">
      <h3 className="text-xs font-semibold text-[var(--muted-strong)] mb-3">Ritmul tau circadian</h3>

      {/* Key stats */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-4">
        <div className="rounded-lg p-2 sm:p-2.5 text-center" style={{ background: "rgba(99,102,241,0.08)" }}>
          <div className="text-[8px] sm:text-[9px] text-[var(--foreground-muted)]">Culcare</div>
          <div className="text-sm sm:text-base font-bold text-indigo-400">{data.avgBedtime}</div>
        </div>
        <div className="rounded-lg p-2 sm:p-2.5 text-center" style={{ background: "rgba(245,158,11,0.08)" }}>
          <div className="text-[8px] sm:text-[9px] text-[var(--foreground-muted)]">Trezire</div>
          <div className="text-sm sm:text-base font-bold text-amber-400">{data.avgWake}</div>
        </div>
        <div className="rounded-lg p-2 sm:p-2.5 text-center" style={{ background: "rgba(16,185,129,0.08)" }}>
          <div className="text-[8px] sm:text-[9px] text-[var(--foreground-muted)]">Cronotip</div>
          <div className="text-[10px] sm:text-xs font-bold text-emerald-400 mt-0.5 truncate">{data.chronotype}</div>
        </div>
      </div>

      {/* Weekly bedtime pattern */}
      <h4 className="text-[10px] text-[var(--muted)] mb-2">Ora de culcare pe zile</h4>
      <div className="space-y-1.5">
        {data.dayPattern.map(day => {
          if (day.count === 0) return null;
          const offset = ((day.avg - minH) / range) * 100;
          return (
            <div key={day.day} className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--muted)] w-7 shrink-0">{day.day}</span>
              <div className="flex-1 h-4 relative rounded" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="absolute h-full w-3 rounded" style={{
                  left: `${Math.min(95, offset)}%`,
                  background: "rgba(99,102,241,0.6)",
                }} />
              </div>
              <span className="text-[9px] text-[var(--muted)] tabular-nums w-10 text-right shrink-0">
                {data.formatHour(day.avg)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[8px] text-[var(--muted)] mt-3 italic">
        Cronotip bazat pe Munich Chronotype Questionnaire (Roenneberg 2003).
      </p>
    </div>
  );
}
