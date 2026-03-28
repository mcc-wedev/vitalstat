"use client";

import { useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { calculateRecovery } from "@/lib/stats/recovery";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

export function StrainCoach({ metrics, sleepNights }: Props) {
  const coach = useMemo(() => {
    const rhr = metrics.restingHeartRate || [];
    const hrv = metrics.hrv || [];
    if (rhr.length < 14 || hrv.length < 14) return null;

    const latestDate = [...rhr.map(d => d.date), ...hrv.map(d => d.date)].sort().pop() || "";
    const recovery = calculateRecovery(
      rhr, hrv, sleepNights, latestDate,
      metrics.exerciseTime, metrics.respiratoryRate,
      metrics.oxygenSaturation, metrics.wristTemperature
    );

    if (!recovery.hasEnoughData) return null;

    const score = recovery.total;

    // Calculate today's current strain
    const ex = metrics.exerciseTime;
    const cal = metrics.activeEnergy;
    const steps = metrics.stepCount;
    const todayEx = ex?.find(d => d.date === latestDate)?.sum || 0;
    const todayCal = cal?.find(d => d.date === latestDate)?.sum || 0;
    const todaySteps = steps?.find(d => d.date === latestDate)?.sum || 0;
    const currentStrain = Math.min(21, Math.round(
      (todayEx / 60) * 7 + (todayCal / 500) * 3 + (todaySteps / 10000) * 2
    ));

    // Target strain based on recovery (WHOOP-style logic)
    let targetMin: number, targetMax: number, zone: string, zoneColor: string, advice: string;

    if (score >= 80) {
      targetMin = 14; targetMax = 20; zone = "Performanta"; zoneColor = "#10b981";
      advice = "Corpul e complet recuperat. Zi ideala pentru antrenament intens, competitie, sau PR-uri.";
    } else if (score >= 67) {
      targetMin = 10; targetMax = 16; zone = "Optim"; zoneColor = "#22d3ee";
      advice = "Recuperare buna. Antrenament moderat-intens — poti impinge, dar nu la maxim.";
    } else if (score >= 50) {
      targetMin = 6; targetMax = 12; zone = "Moderat"; zoneColor = "#f59e0b";
      advice = "Recuperare medie. Antrenament usor-moderat. Focus pe tehnica, nu intensitate.";
    } else if (score >= 33) {
      targetMin = 3; targetMax = 8; zone = "Usor"; zoneColor = "#f97316";
      advice = "Recuperare sub-optima. Plimbare, stretching, yoga. Evita efortul intens.";
    } else {
      targetMin = 0; targetMax = 5; zone = "Odihna"; zoneColor = "#ef4444";
      advice = "Recuperare slaba. Prioritizeaza odihna completa. Maxim o plimbare scurta.";
    }

    const inZone = currentStrain >= targetMin && currentStrain <= targetMax;
    const overZone = currentStrain > targetMax;
    const remaining = Math.max(0, targetMin - currentStrain);

    return { score, currentStrain, targetMin, targetMax, zone, zoneColor, advice, inZone, overZone, remaining };
  }, [metrics, sleepNights]);

  if (!coach) return null;

  const pct = Math.min(100, (coach.currentStrain / 21) * 100);
  const targetMinPct = (coach.targetMin / 21) * 100;
  const targetMaxPct = (coach.targetMax / 21) * 100;

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Strain Coach</h3>
        <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{
          background: `${coach.zoneColor}15`,
          color: coach.zoneColor,
        }}>
          Zona: {coach.zone}
        </span>
      </div>

      {/* Strain bar with target zone */}
      <div className="relative h-6 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.06)" }}>
        {/* Target zone highlight */}
        <div className="absolute h-full rounded-full opacity-20" style={{
          left: `${targetMinPct}%`,
          width: `${targetMaxPct - targetMinPct}%`,
          background: coach.zoneColor,
        }} />
        {/* Current strain fill */}
        <div className="absolute h-full rounded-full transition-all duration-500" style={{
          width: `${pct}%`,
          background: coach.overZone
            ? "linear-gradient(90deg, #f59e0b, #ef4444)"
            : coach.inZone
              ? `linear-gradient(90deg, ${coach.zoneColor}80, ${coach.zoneColor})`
              : "rgba(255,255,255,0.15)",
        }} />
        {/* Labels */}
        <div className="absolute inset-0 flex items-center justify-between px-3">
          <span className="text-[10px] font-bold tabular-nums z-10">{coach.currentStrain}/21</span>
          <span className="text-[9px] text-[var(--muted)] z-10">
            Tinta: {coach.targetMin}–{coach.targetMax}
          </span>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">
          {coach.overZone ? "🔴" : coach.inZone ? "🟢" : "🎯"}
        </span>
        <span className="text-[11px] text-[var(--muted-strong)]">
          {coach.overZone
            ? "Ai depasit zona recomandata. Opreste-te si recupereaza."
            : coach.inZone
              ? "Esti in zona optima de efort!"
              : coach.remaining > 0
                ? `Mai ai de acumulat ~${coach.remaining} puncte de strain.`
                : "Esti aproape de zona optima."}
        </span>
      </div>

      <p className="text-[10px] text-[var(--muted)] leading-relaxed">{coach.advice}</p>
    </div>
  );
}
