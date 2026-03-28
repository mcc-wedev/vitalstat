"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHealthStore, getDateBounds, filterByDate, filterSleepByDate } from "@/stores/healthStore";
import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";
import { SleepChart } from "@/components/SleepChart";
import { HeroScore } from "@/components/HeroScore";
import { InsightsPanel } from "@/components/InsightsPanel";
import { DateRangePicker } from "@/components/DateRangePicker";
import { DailyReport } from "@/components/DailyReport";
import { METRIC_CONFIG, CATEGORIES, type MetricCategory } from "@/lib/parser/healthTypes";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { clearData, exportAllData } from "@/lib/db/indexedDB";

const TABS: { key: MetricCategory | "overview"; label: string }[] = [
  { key: "overview", label: "Sumar" },
  { key: "cardio", label: "Cardio" },
  { key: "sleep", label: "Somn" },
  { key: "activity", label: "Activitate" },
  { key: "mobility", label: "Mobilitate" },
  { key: "body", label: "Corp" },
  { key: "wellbeing", label: "Wellbeing" },
];

export default function Dashboard() {
  const router = useRouter();
  const { hasData, metrics, sleepNights, meta, activeTab, setActiveTab, datePreset, clearData: clearStore } = useHealthStore();

  useEffect(() => {
    if (!hasData) router.push("/");
  }, [hasData, router]);

  // Filter all data by selected date range
  const bounds = useMemo(() => getDateBounds(datePreset, meta), [datePreset, meta]);
  const filteredMetrics = useMemo(() => {
    const result: Record<string, DailySummary[]> = {};
    for (const [key, data] of Object.entries(metrics)) {
      result[key] = filterByDate(data, bounds);
    }
    return result;
  }, [metrics, bounds]);
  const filteredSleep = useMemo(() => filterSleepByDate(sleepNights, bounds), [sleepNights, bounds]);

  // Is single-day view? (today or yesterday)
  const isDailyView = datePreset === "today" || datePreset === "yesterday";
  const dailyDate = useMemo(() => {
    if (datePreset === "today") return new Date().toISOString().substring(0, 10);
    if (datePreset === "yesterday") return new Date(Date.now() - 86400000).toISOString().substring(0, 10);
    return null;
  }, [datePreset]);

  if (!hasData || !meta) return null;

  const handleReset = async () => {
    await clearData();
    clearStore();
    router.push("/");
  };

  const handleExport = async () => {
    const json = await exportAllData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vitalstat-export-${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const metricsForCategory = (cat: MetricCategory) =>
    Object.entries(METRIC_CONFIG)
      .filter(([key, cfg]) => cfg.category === cat && filteredMetrics[key]?.length > 0)
      .map(([key]) => key);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-subtle">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b border-[var(--glass-border)] bg-[rgba(5,5,8,0.85)]">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(16,185,129,0.15)" }}>
                <svg className="w-4 h-4 text-[#10b981]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </div>
              <h1 className="text-sm sm:text-base font-bold">VitalStat</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleExport} className="pill text-[10px]" title="Exporta date JSON">📤</button>
              <button onClick={handleReset} className="text-[10px] text-red-400/60 hover:text-red-400 px-2">Sterge</button>
            </div>
          </div>
          <div className="flex items-center justify-between pb-2 gap-2">
            <DateRangePicker />
            <span className="hidden sm:inline text-[10px] text-[var(--muted)] shrink-0">
              {meta.totalRecords.toLocaleString()} inreg.
            </span>
          </div>
        </div>
      </header>

      {/* Daily view: no tabs, show DailyReport directly */}
      {isDailyView && dailyDate ? (
        <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6">
          <DailyReport date={dailyDate} metrics={metrics} sleepNights={sleepNights} />
        </main>
      ) : (
        <>
          {/* Tabs */}
          <nav className="border-b border-[var(--glass-border)] bg-[rgba(5,5,8,0.5)]">
            <div className="max-w-6xl mx-auto px-3 sm:px-4 tab-scroll flex">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`tab-btn ${activeTab === tab.key ? "tab-active" : ""}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Content */}
          <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6">
            {activeTab === "overview" && (
              <OverviewTab metrics={filteredMetrics} sleepNights={filteredSleep} allMetrics={metrics} allSleep={sleepNights} metricsForCategory={metricsForCategory} />
            )}
            {activeTab === "sleep" && (
              <SleepTab metrics={filteredMetrics} sleepNights={filteredSleep} />
            )}
            {activeTab !== "overview" && activeTab !== "sleep" && (
              <CategoryTab
                category={activeTab}
                metrics={filteredMetrics}
                sleepNights={filteredSleep}
                availableKeys={metricsForCategory(activeTab)}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}

// ═══ COMPACT OVERVIEW TAB ═══
function OverviewTab({
  metrics, sleepNights, allMetrics, allSleep, metricsForCategory,
}: {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  metricsForCategory: (cat: MetricCategory) => string[];
}) {
  const [showAllInsights, setShowAllInsights] = useState(false);

  // Key metrics to always show on overview (if data exists)
  const keyMetrics = ["restingHeartRate", "hrv", "oxygenSaturation", "vo2Max", "stepCount", "activeEnergy", "exerciseTime", "bodyMass"]
    .filter(k => metrics[k]?.length > 0);

  return (
    <div className="space-y-5">
      {/* Row 1: Recovery Score + Top Insights side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HeroScore
          rhrData={allMetrics.restingHeartRate || []}
          hrvData={allMetrics.hrv || []}
          sleepData={allSleep}
          exerciseData={allMetrics.exerciseTime}
          respData={allMetrics.respiratoryRate}
          spo2Data={allMetrics.oxygenSaturation}
        />
        <div className="glass p-4">
          <h3 className="text-xs font-semibold text-[var(--muted-strong)] mb-3">Interpretari prioritare</h3>
          <InsightsPanel metrics={metrics} sleepNights={sleepNights} maxItems={3} compact />
        </div>
      </div>

      {/* Row 2: Key metric cards */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {keyMetrics.map((key) => (
            <MetricCard key={key} metricKey={key} data={metrics[key]} />
          ))}
        </div>
      </section>

      {/* Row 3: Two trend charts side by side */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {metrics.restingHeartRate?.length > 0 && <TrendChart metricKey="restingHeartRate" data={metrics.restingHeartRate} />}
          {metrics.hrv?.length > 0 && <TrendChart metricKey="hrv" data={metrics.hrv} />}
        </div>
      </section>

      {/* Row 4: All insights (expandable) */}
      {!showAllInsights ? (
        <button
          onClick={() => setShowAllInsights(true)}
          className="w-full glass p-3 text-center text-xs text-[var(--accent)] hover:text-white cursor-pointer"
        >
          Vezi toate interpretarile →
        </button>
      ) : (
        <section>
          <h2 className="section-header">Toate interpretarile</h2>
          <InsightsPanel metrics={metrics} sleepNights={sleepNights} />
        </section>
      )}

      {/* Additional metric cards by category (collapsed) */}
      {(Object.keys(CATEGORIES) as MetricCategory[]).map((cat) => {
        const keys = metricsForCategory(cat).filter(k => !keyMetrics.includes(k));
        if (keys.length === 0) return null;
        return (
          <section key={cat}>
            <h2 className="section-header flex items-center gap-2">
              <span>{CATEGORIES[cat].icon}</span> {CATEGORIES[cat].label}
              <span className="text-[var(--muted)] font-normal">({keys.length})</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {keys.map((key) => (
                <MetricCard key={key} metricKey={key} data={metrics[key]} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ═══ SLEEP TAB ═══
function SleepTab({ metrics, sleepNights }: { metrics: Record<string, DailySummary[]>; sleepNights: SleepNight[] }) {
  return (
    <div className="space-y-6">
      <InsightsPanel metrics={metrics} sleepNights={sleepNights} filter="sleep" />
      <SleepChart data={sleepNights} days={sleepNights.length} />
    </div>
  );
}

// ═══ GENERIC CATEGORY TAB ═══
function CategoryTab({
  category, metrics, sleepNights, availableKeys,
}: {
  category: MetricCategory;
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  availableKeys: string[];
}) {
  return (
    <div className="space-y-6">
      <InsightsPanel metrics={metrics} sleepNights={sleepNights} filter={category === "body" ? undefined : category} />
      {category === "body" && <InsightsPanel metrics={metrics} sleepNights={sleepNights} filter="nutrition" />}

      {availableKeys.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {availableKeys.map((key) => (
              <MetricCard key={key} metricKey={key} data={metrics[key]} />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {availableKeys.slice(0, 4).map((key) => (
              <TrendChart key={key} metricKey={key} data={metrics[key]} />
            ))}
          </div>
        </>
      ) : (
        <div className="glass p-12 text-center text-[var(--muted)]">
          <p className="text-lg mb-2">Nu sunt date disponibile</p>
          <p className="text-sm">Aceasta categorie nu contine date in exportul tau Apple Health.</p>
        </div>
      )}

      {category === "body" && (() => {
        const nutritionKeys = Object.entries(METRIC_CONFIG)
          .filter(([key, cfg]) => cfg.category === "nutrition" && metrics[key]?.length > 0)
          .map(([key]) => key);
        if (nutritionKeys.length === 0) return null;
        return (
          <section>
            <h2 className="section-header">{CATEGORIES.nutrition.icon} {CATEGORIES.nutrition.label}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {nutritionKeys.map((key) => (
                <MetricCard key={key} metricKey={key} data={metrics[key]} />
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
