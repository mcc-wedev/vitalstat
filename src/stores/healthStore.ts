import { create } from "zustand";
import type { DailySummary, SleepNight, DataMeta, MetricCategory } from "@/lib/parser/healthTypes";

export type DatePreset = "today" | "yesterday" | "7d" | "14d" | "30d" | "90d" | "6m" | "1y" | "all";

interface HealthState {
  isLoading: boolean;
  parseProgress: number;
  hasData: boolean;
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  meta: DataMeta | null;
  activeTab: MetricCategory | "overview" | "browse" | "profile";
  datePreset: DatePreset;
  customRange: { start: string; end: string } | null;

  setLoading: (loading: boolean) => void;
  setParseProgress: (pct: number) => void;
  setData: (metrics: Record<string, DailySummary[]>, sleepNights: SleepNight[], meta: DataMeta) => void;
  clearData: () => void;
  setActiveTab: (tab: MetricCategory | "overview" | "browse" | "profile") => void;
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
  datePreset: "30d",
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
 * Get date filter bounds from preset.
 *
 * Uses meta.dateRange.end as the anchor point (last day with data),
 * NOT the current date. This ensures "7d" means "last 7 days of your data"
 * even if the export is a few days old. This is consistent with how
 * Apple Health and Oura present historical data.
 */
export function getDateBounds(preset: DatePreset, meta: DataMeta | null): { start: string; end: string } | null {
  if (preset === "all" || !meta) return null;

  const end = meta.dateRange.end;
  const endDate = new Date(end + "T00:00:00Z");

  switch (preset) {
    case "today":
      // "Today" = last day with data (most recent export date)
      return { start: end, end };
    case "yesterday": {
      // "Yesterday" = day before last day with data
      const y = new Date(endDate.getTime() - 86400000).toISOString().substring(0, 10);
      return { start: y, end: y };
    }
    case "7d": {
      const start = new Date(endDate.getTime() - 6 * 86400000).toISOString().substring(0, 10);
      return { start, end };
    }
    case "14d": {
      const start = new Date(endDate.getTime() - 13 * 86400000).toISOString().substring(0, 10);
      return { start, end };
    }
    case "30d": {
      const start = new Date(endDate.getTime() - 29 * 86400000).toISOString().substring(0, 10);
      return { start, end };
    }
    case "90d": {
      const start = new Date(endDate.getTime() - 89 * 86400000).toISOString().substring(0, 10);
      return { start, end };
    }
    case "6m": {
      const start = new Date(endDate.getTime() - 182 * 86400000).toISOString().substring(0, 10);
      return { start, end };
    }
    case "1y": {
      const start = new Date(endDate.getTime() - 364 * 86400000).toISOString().substring(0, 10);
      return { start, end };
    }
    default:
      return null;
  }
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
