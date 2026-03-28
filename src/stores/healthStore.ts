import { create } from "zustand";
import type { DailySummary, SleepNight, DataMeta, MetricCategory } from "@/lib/parser/healthTypes";

export type DatePreset = "7d" | "30d" | "90d" | "6m" | "1y" | "all";

interface HealthState {
  isLoading: boolean;
  parseProgress: number;
  hasData: boolean;
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  meta: DataMeta | null;
  activeTab: MetricCategory | "overview";
  datePreset: DatePreset;
  customRange: { start: string; end: string } | null;

  setLoading: (loading: boolean) => void;
  setParseProgress: (pct: number) => void;
  setData: (metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[], meta: DataMeta) => void;
  clearData: () => void;
  setActiveTab: (tab: MetricCategory | "overview") => void;
  setDatePreset: (preset: DatePreset) => void;
  setCustomRange: (range: { start: string; end: string } | null) => void;
}

export const useHealthStore = create<HealthState>((set) => ({
  isLoading: false,
  parseProgress: 0,
  hasData: false,
  metrics: {},
  sleepNights: [],
  meta: null,
  activeTab: "overview",
  datePreset: "90d",
  customRange: null,

  setLoading: (loading) => set({ isLoading: loading }),
  setParseProgress: (pct) => set({ parseProgress: pct }),
  setData: (metrics, sleepNights, meta) =>
    set({ metrics, sleepNights, meta, hasData: true, isLoading: false, parseProgress: 100 }),
  clearData: () =>
    set({ metrics: {}, sleepNights: [], meta: null, hasData: false, parseProgress: 0 }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setDatePreset: (preset) => set({ datePreset: preset, customRange: null }),
  setCustomRange: (range) => set({ customRange: range }),
}));

/**
 * Get date filter bounds from preset
 */
export function getDateBounds(preset: DatePreset, meta: DataMeta | null): { start: string; end: string } | null {
  if (preset === "all" || !meta) return null;

  const end = meta.dateRange.end;
  const endDate = new Date(end);
  let startDate: Date;

  switch (preset) {
    case "7d":  startDate = new Date(endDate.getTime() - 7 * 86400000); break;
    case "30d": startDate = new Date(endDate.getTime() - 30 * 86400000); break;
    case "90d": startDate = new Date(endDate.getTime() - 90 * 86400000); break;
    case "6m":  startDate = new Date(endDate.getTime() - 182 * 86400000); break;
    case "1y":  startDate = new Date(endDate.getTime() - 365 * 86400000); break;
    default:    return null;
  }

  return {
    start: startDate.toISOString().substring(0, 10),
    end,
  };
}

/**
 * Filter DailySummary array by date range
 */
export function filterByDate(data: DailySummary[], bounds: { start: string; end: string } | null): DailySummary[] {
  if (!bounds) return data;
  return data.filter(d => d.date >= bounds.start && d.date <= bounds.end);
}

/**
 * Filter SleepNight array by date range
 */
export function filterSleepByDate(data: SleepNight[], bounds: { start: string; end: string } | null): SleepNight[] {
  if (!bounds) return data;
  return data.filter(d => d.date >= bounds.start && d.date <= bounds.end);
}
