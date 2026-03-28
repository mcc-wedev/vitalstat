import { create } from "zustand";
import type { DailySummary, SleepNight, DataMeta } from "@/lib/parser/healthTypes";

export type DashboardTab = "overview" | "cardio" | "sleep" | "activity" | "recovery";

interface HealthState {
  // Data loading
  isLoading: boolean;
  parseProgress: number;
  hasData: boolean;

  // Imported data (in memory after load from IndexedDB)
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  meta: DataMeta | null;

  // UI state
  activeTab: DashboardTab;
  dateRange: { start: string; end: string } | null; // filter

  // Actions
  setLoading: (loading: boolean) => void;
  setParseProgress: (pct: number) => void;
  setData: (
    metrics: Record<string, DailySummary[]>,
    sleepNights: SleepNight[],
    meta: DataMeta
  ) => void;
  clearData: () => void;
  setActiveTab: (tab: DashboardTab) => void;
  setDateRange: (range: { start: string; end: string } | null) => void;
}

export const useHealthStore = create<HealthState>((set) => ({
  isLoading: false,
  parseProgress: 0,
  hasData: false,
  metrics: {},
  sleepNights: [],
  meta: null,
  activeTab: "overview",
  dateRange: null,

  setLoading: (loading) => set({ isLoading: loading }),
  setParseProgress: (pct) => set({ parseProgress: pct }),
  setData: (metrics, sleepNights, meta) =>
    set({ metrics, sleepNights, meta, hasData: true, isLoading: false, parseProgress: 100 }),
  clearData: () =>
    set({ metrics: {}, sleepNights: [], meta: null, hasData: false, parseProgress: 0 }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setDateRange: (range) => set({ dateRange: range }),
}));
