"use client";

import { useMemo, useState } from "react";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { METRIC_CONFIG } from "@/lib/parser/healthTypes";
import { pearson, pearsonPValue } from "@/lib/stats/correlation";

interface Props {
  metrics: Record<string, DailySummary[]>;
}

interface CellData {
  r: number;
  p: number;
  n: number;
  xKey: string;
  yKey: string;
}

const KEY_METRICS = [
  "restingHeartRate", "hrv", "oxygenSaturation", "vo2Max",
  "stepCount", "activeEnergy", "exerciseTime",
  "walkingSpeed", "bodyMass", "respiratoryRate",
];

function getVal(d: DailySummary, key: string): number {
  const cfg = METRIC_CONFIG[key];
  return cfg?.aggregation === "sum" ? d.sum : d.mean;
}

export function CorrelationHeatmap({ metrics }: Props) {
  const [selected, setSelected] = useState<CellData | null>(null);

  const availableKeys = useMemo(() =>
    KEY_METRICS.filter(k => metrics[k]?.length >= 20), [metrics]);

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, CellData>> = {};

    for (const xKey of availableKeys) {
      m[xKey] = {};
      for (const yKey of availableKeys) {
        if (xKey === yKey) { m[xKey][yKey] = { r: 1, p: 0, n: 0, xKey, yKey }; continue; }

        const xMap = new Map(metrics[xKey].map(d => [d.date, getVal(d, xKey)]));
        const yMap = new Map(metrics[yKey].map(d => [d.date, getVal(d, yKey)]));
        const xs: number[] = [], ys: number[] = [];
        for (const [date, xv] of xMap) {
          const yv = yMap.get(date);
          if (yv !== undefined) { xs.push(xv); ys.push(yv); }
        }

        if (xs.length >= 15) {
          const r = pearson(xs, ys);
          const p = pearsonPValue(r, xs.length);
          m[xKey][yKey] = { r, p, n: xs.length, xKey, yKey };
        } else {
          m[xKey][yKey] = { r: 0, p: 1, n: xs.length, xKey, yKey };
        }
      }
    }
    return m;
  }, [metrics, availableKeys]);

  if (availableKeys.length < 3) return null;

  const getColor = (r: number, p: number): string => {
    if (p >= 0.05) return "rgba(255,255,255,0.03)";
    const abs = Math.min(Math.abs(r), 1);
    const alpha = 0.1 + abs * 0.6;
    return r > 0 ? `rgba(16,185,129,${alpha})` : `rgba(239,68,68,${alpha})`;
  };

  const getLabel = (key: string) => {
    const cfg = METRIC_CONFIG[key];
    if (!cfg) return key;
    // Short label
    const short: Record<string, string> = {
      restingHeartRate: "RHR", hrv: "HRV", oxygenSaturation: "SpO2",
      vo2Max: "VO2", stepCount: "Pasi", activeEnergy: "Cal",
      exerciseTime: "Exerc", walkingSpeed: "Viteza", bodyMass: "Greutate",
      respiratoryRate: "Resp",
    };
    return short[key] || cfg.label.substring(0, 6);
  };

  return (
    <div className="glass p-4 animate-in">
      <h3 className="text-xs font-semibold text-[var(--muted-strong)] mb-3">Matrice de corelatii</h3>
      <p className="text-[10px] text-[var(--muted)] mb-3">Doar corelatii cu p&lt;0.05. Verde = corelatie pozitiva, Rosu = negativa.</p>

      <div className="overflow-x-auto">
        <div className="inline-grid gap-px" style={{
          gridTemplateColumns: `60px repeat(${availableKeys.length}, 40px)`,
        }}>
          {/* Header row */}
          <div />
          {availableKeys.map(k => (
            <div key={k} className="text-[8px] text-[var(--muted)] text-center truncate px-0.5 -rotate-45 origin-bottom-left h-10 flex items-end justify-center">
              {getLabel(k)}
            </div>
          ))}

          {/* Data rows */}
          {availableKeys.map(xKey => (
            <div key={xKey} className="contents">
              <div className="text-[9px] text-[var(--muted)] flex items-center pr-1 truncate">{getLabel(xKey)}</div>
              {availableKeys.map(yKey => {
                const cell = matrix[xKey]?.[yKey];
                if (!cell) return <div key={yKey} className="w-10 h-10" />;
                const isDiag = xKey === yKey;

                return (
                  <button
                    key={yKey}
                    onClick={() => !isDiag && cell.p < 0.05 && setSelected(cell)}
                    className="w-10 h-10 rounded text-[8px] font-medium tabular-nums flex items-center justify-center cursor-pointer hover:ring-1 hover:ring-white/20"
                    style={{ background: isDiag ? "rgba(255,255,255,0.08)" : getColor(cell.r, cell.p) }}
                    title={isDiag ? "" : `r=${cell.r.toFixed(2)}, p=${cell.p.toFixed(3)}, n=${cell.n}`}
                  >
                    {isDiag ? "—" : cell.p < 0.05 ? cell.r.toFixed(1) : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selected && selected.p < 0.05 && (
        <div className="mt-3 p-3 rounded-lg border border-[var(--glass-border)]" style={{ background: "rgba(255,255,255,0.03)" }}>
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-xs font-medium">
                {METRIC_CONFIG[selected.xKey]?.label} → {METRIC_CONFIG[selected.yKey]?.label}
              </h4>
              <p className="text-[10px] text-[var(--muted)] mt-1">
                r = {selected.r.toFixed(3)} | p = {selected.p.toFixed(4)} | n = {selected.n} zile
              </p>
              <p className="text-[11px] text-[var(--muted-strong)] mt-1">
                {Math.abs(selected.r) > 0.5 ? "Corelatie puternica" : Math.abs(selected.r) > 0.3 ? "Corelatie moderata" : "Corelatie slaba"}
                {selected.r > 0 ? " pozitiva" : " negativa"} —
                {selected.r > 0 ? " cand una creste, cealalta tinde sa creasca" : " cand una creste, cealalta tinde sa scada"}.
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-[var(--muted)] hover:text-white">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
