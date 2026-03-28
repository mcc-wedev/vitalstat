"use client";

import { useMemo } from "react";
import type { SleepNight } from "@/lib/parser/healthTypes";

interface Props {
  sleepNights: SleepNight[];
}

export function SleepBank({ sleepNights }: Props) {
  const bank = useMemo(() => {
    if (sleepNights.length < 7) return null;

    const TARGET = 8; // hours
    const last30 = sleepNights.slice(-30);

    // Running balance over 30 days
    let balance = 0;
    const history = last30.map(n => {
      const hours = n.totalMinutes / 60;
      const diff = hours - TARGET;
      balance += diff;
      return {
        date: n.date,
        hours,
        diff,
        balance: Math.round(balance * 10) / 10,
      };
    });

    const current = history[history.length - 1]?.balance || 0;
    const last7Balance = last30.slice(-7).reduce((s, n) => s + (n.totalMinutes / 60 - TARGET), 0);

    const status = current >= 0 ? "surplus" : current >= -5 ? "deficit_mic" : "deficit_mare";
    const color = status === "surplus" ? "#10b981" : status === "deficit_mic" ? "#f59e0b" : "#ef4444";
    const icon = status === "surplus" ? "🟢" : status === "deficit_mic" ? "🟡" : "🔴";

    const message = status === "surplus"
      ? `Ai un surplus de ${current.toFixed(1)}h. Banca ta de somn e pozitiva — excelent!`
      : current >= -3
        ? `Deficit de ${Math.abs(current).toFixed(1)}h pe 30 de zile. Adauga 30-45 min/noapte in urmatoarele zile.`
        : `Deficit sever: ${Math.abs(current).toFixed(1)}h. Ai nevoie de 3-4 nopti de 9+ ore pentru recuperare.`;

    const weekTrend = last7Balance > 0 ? "in crestere" : last7Balance < -2 ? "in scadere" : "stabil";

    return { current, history, color, icon, message, weekTrend, last7Balance };
  }, [sleepNights]);

  if (!bank) return null;

  // Simple sparkline from balance history
  const minBal = Math.min(...bank.history.map(h => h.balance));
  const maxBal = Math.max(...bank.history.map(h => h.balance));
  const range = Math.max(maxBal - minBal, 1);

  return (
    <div className="glass p-4 animate-in">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-[var(--muted-strong)]">Sleep Bank</h3>
        <span className="text-[9px] text-[var(--muted)]">Ultimele 30 zile</span>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-lg">{bank.icon}</span>
        <span className="text-2xl font-bold tabular-nums" style={{ color: bank.color }}>
          {bank.current > 0 ? "+" : ""}{bank.current.toFixed(1)}h
        </span>
        <span className="text-[10px] text-[var(--muted)]">
          Saptamana: {bank.last7Balance > 0 ? "+" : ""}{bank.last7Balance.toFixed(1)}h ({bank.weekTrend})
        </span>
      </div>

      {/* Mini balance chart */}
      <div className="h-10 flex items-end gap-px mb-2">
        {bank.history.map((h, i) => {
          const height = ((h.balance - minBal) / range) * 100;
          return (
            <div
              key={i}
              className="flex-1 rounded-t-sm min-h-[2px]"
              style={{
                height: `${Math.max(5, height)}%`,
                background: h.balance >= 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.3)",
              }}
              title={`${h.date}: ${h.balance > 0 ? "+" : ""}${h.balance.toFixed(1)}h`}
            />
          );
        })}
      </div>

      <p className="text-[10px] text-[var(--muted)] leading-relaxed">{bank.message}</p>
    </div>
  );
}
