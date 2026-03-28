"use client";

import { useState, useEffect, useMemo } from "react";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";
import { pearson, pearsonPValue } from "@/lib/stats/correlation";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

interface JournalEntry {
  date: string;
  behaviors: Record<string, boolean>;
}

interface BehaviorCorrelation {
  behavior: string;
  metric: string;
  metricLabel: string;
  withMean: number;
  withoutMean: number;
  diffPct: number;
  positive: boolean; // is the effect good?
  n: number;
}

const BEHAVIORS = [
  { key: "caffeine_late", label: "Cafeina dupa 14:00", icon: "☕", category: "diet" },
  { key: "alcohol", label: "Alcool", icon: "🍷", category: "diet" },
  { key: "heavy_meal", label: "Masa copioasa seara", icon: "🍔", category: "diet" },
  { key: "supplements", label: "Suplimente", icon: "💊", category: "diet" },
  { key: "high_stress", label: "Stres ridicat", icon: "😰", category: "mental" },
  { key: "meditation", label: "Meditatie", icon: "🧘", category: "mental" },
  { key: "screens_late", label: "Ecrane dupa 22:00", icon: "📱", category: "habits" },
  { key: "cold_exposure", label: "Dus rece / crioterapie", icon: "🧊", category: "habits" },
  { key: "nap", label: "Pui de somn", icon: "😴", category: "habits" },
  { key: "stretching", label: "Stretching / yoga", icon: "🤸", category: "habits" },
  { key: "social", label: "Socializare activa", icon: "👥", category: "mental" },
  { key: "outdoor", label: "Timp in aer liber (>30min)", icon: "🌳", category: "habits" },
];

const STORAGE_KEY = "vitalstat-journal";

function loadJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveJournal(entries: JournalEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function BehaviorJournal({ metrics, sleepNights }: Props) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showCorrelations, setShowCorrelations] = useState(false);
  const today = new Date().toISOString().substring(0, 10);

  useEffect(() => { setEntries(loadJournal()); }, []);

  const todayEntry = entries.find(e => e.date === today);
  const todayBehaviors = todayEntry?.behaviors || {};

  const toggleBehavior = (key: string) => {
    const updated = { ...todayBehaviors, [key]: !todayBehaviors[key] };
    const newEntries = entries.filter(e => e.date !== today);
    newEntries.push({ date: today, behaviors: updated });
    newEntries.sort((a, b) => a.date.localeCompare(b.date));
    setEntries(newEntries);
    saveJournal(newEntries);
  };

  // Correlations — need 15+ entries to be meaningful
  const correlations = useMemo(() => {
    if (entries.length < 15) return [];
    const results: BehaviorCorrelation[] = [];

    const targetMetrics = [
      { key: "hrv", label: "HRV", field: "mean" as const, higherBetter: true, lag: 1 },
      { key: "restingHeartRate", label: "Puls repaus", field: "mean" as const, higherBetter: false, lag: 1 },
    ];

    // Also check sleep (next night)
    const sleepMap = new Map(sleepNights.map(n => [n.date, n.totalMinutes / 60]));

    for (const behavior of BEHAVIORS) {
      const yesDates = entries.filter(e => e.behaviors[behavior.key]).map(e => e.date);
      const noDates = entries.filter(e => !e.behaviors[behavior.key]).map(e => e.date);
      if (yesDates.length < 5 || noDates.length < 5) continue;

      // Check impact on next-day metrics
      for (const tm of targetMetrics) {
        const data = metrics[tm.key];
        if (!data || data.length < 14) continue;
        const dataMap = new Map(data.map(d => [d.date, d[tm.field]]));

        // Get next-day values
        const yesVals: number[] = [];
        const noVals: number[] = [];
        for (const date of yesDates) {
          const nextDay = new Date(new Date(date).getTime() + 86400000 * tm.lag).toISOString().substring(0, 10);
          const v = dataMap.get(nextDay);
          if (v !== undefined) yesVals.push(v);
        }
        for (const date of noDates) {
          const nextDay = new Date(new Date(date).getTime() + 86400000 * tm.lag).toISOString().substring(0, 10);
          const v = dataMap.get(nextDay);
          if (v !== undefined) noVals.push(v);
        }

        if (yesVals.length >= 5 && noVals.length >= 5) {
          const { mean: yesMean } = meanStd(yesVals);
          const { mean: noMean } = meanStd(noVals);
          const diff = yesMean - noMean;
          const diffPct = noMean !== 0 ? (diff / noMean) * 100 : 0;

          if (Math.abs(diffPct) > 2) {
            const isGood = tm.higherBetter ? diff > 0 : diff < 0;
            results.push({
              behavior: `${behavior.icon} ${behavior.label}`,
              metric: tm.key,
              metricLabel: tm.label,
              withMean: yesMean,
              withoutMean: noMean,
              diffPct,
              positive: isGood,
              n: yesVals.length + noVals.length,
            });
          }
        }
      }

      // Sleep impact
      const yesSleep: number[] = [];
      const noSleep: number[] = [];
      for (const date of yesDates) { const v = sleepMap.get(date); if (v) yesSleep.push(v); }
      for (const date of noDates) { const v = sleepMap.get(date); if (v) noSleep.push(v); }

      if (yesSleep.length >= 5 && noSleep.length >= 5) {
        const { mean: yM } = meanStd(yesSleep);
        const { mean: nM } = meanStd(noSleep);
        const diff = yM - nM;
        const diffPct = nM !== 0 ? (diff / nM) * 100 : 0;
        if (Math.abs(diffPct) > 2) {
          results.push({
            behavior: `${behavior.icon} ${behavior.label}`,
            metric: "sleep",
            metricLabel: "Somn (ore)",
            withMean: yM,
            withoutMean: nM,
            diffPct,
            positive: diff > 0,
            n: yesSleep.length + noSleep.length,
          });
        }
      }
    }

    // Sort by absolute impact
    return results.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));
  }, [entries, metrics, sleepNights]);

  const daysLogged = entries.length;
  const daysNeeded = Math.max(0, 15 - daysLogged);

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Jurnal zilnic</h3>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[var(--muted)]">{daysLogged} zile logate</span>
          {correlations.length > 0 && (
            <button onClick={() => setShowCorrelations(!showCorrelations)} className="text-[9px] text-[var(--accent)] hover:underline">
              {showCorrelations ? "Jurnal" : `Corelatii (${correlations.length})`}
            </button>
          )}
        </div>
      </div>

      {!showCorrelations ? (
        <>
          <p className="text-[10px] text-[var(--muted)] mb-3">
            {daysNeeded > 0
              ? `Logheaza zilnic — mai ai nevoie de ${daysNeeded} zile pentru corelatii.`
              : "Ai suficiente date! Verifica tab-ul Corelatii."}
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            {BEHAVIORS.map(b => {
              const active = !!todayBehaviors[b.key];
              return (
                <button
                  key={b.key}
                  onClick={() => toggleBehavior(b.key)}
                  className="flex items-center gap-2 p-2 rounded-lg text-left text-[11px] transition-all"
                  style={{
                    background: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.03)",
                    borderColor: active ? "rgba(16,185,129,0.3)" : "transparent",
                    border: "1px solid",
                  }}
                >
                  <span className="text-sm">{b.icon}</span>
                  <span className={active ? "text-[#10b981]" : "text-[var(--muted-strong)]"}>{b.label}</span>
                  {active && <span className="ml-auto text-[#10b981] text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-[var(--muted)] mb-2">
            Impactul comportamentelor tale asupra metricilor (bazat pe {daysLogged} zile):
          </p>
          {correlations.slice(0, 8).map((c, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium">{c.behavior}</div>
                <div className="text-[9px] text-[var(--muted)]">→ {c.metricLabel}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold" style={{ color: c.positive ? "#10b981" : "#ef4444" }}>
                  {c.diffPct > 0 ? "+" : ""}{c.diffPct.toFixed(1)}%
                </div>
                <div className="text-[8px] text-[var(--muted)]">n={c.n}</div>
              </div>
            </div>
          ))}
          {correlations.length === 0 && (
            <p className="text-[11px] text-[var(--muted)] text-center py-4">
              Nicio corelatie semnificativa gasita inca. Continua sa loghezi zilnic.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
