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
import { CorrelationHeatmap } from "@/components/CorrelationHeatmap";
import { RecoveryTimeline } from "@/components/RecoveryTimeline";
import { WeeklyDigest } from "@/components/WeeklyDigest";
import { CalendarHeatmap } from "@/components/CalendarHeatmap";
import { GoalsTracker } from "@/components/GoalsTracker";
import { PDFExport } from "@/components/PDFExport";
import { BehaviorJournal } from "@/components/BehaviorJournal";
import { StrainCoach } from "@/components/StrainCoach";
import { ResilienceScore } from "@/components/ResilienceScore";
import { StabilityScores } from "@/components/StabilityScores";
import { SleepBank } from "@/components/SleepBank";
import { BiologicalAge } from "@/components/BiologicalAge";
import { MonthlyRecap } from "@/components/MonthlyRecap";
import { WhatIfSimulator } from "@/components/WhatIfSimulator";
import { TrendAlerts } from "@/components/TrendAlerts";
import { AgeBenchmark } from "@/components/AgeBenchmark";
import { RecoveryPrediction } from "@/components/RecoveryPrediction";
import { SmartSleepTips } from "@/components/SmartSleepTips";
import { ShareCard } from "@/components/ShareCard";
import { CSVExport } from "@/components/CSVExport";
import { CircadianMap } from "@/components/CircadianMap";
import { ProgressOverview } from "@/components/ProgressOverview";
import { AdaptiveAnalysis } from "@/components/AdaptiveAnalysis";
import { METRIC_CONFIG, CATEGORIES, type MetricCategory } from "@/lib/parser/healthTypes";
import { generateInsights } from "@/lib/stats/insights";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { Onboarding } from "@/components/Onboarding";
import { clearData, exportAllData } from "@/lib/db/indexedDB";

const TABS: { key: MetricCategory | "overview"; label: string; icon: string }[] = [
  { key: "overview", label: "Sumar", icon: "📊" },
  { key: "cardio", label: "Cardio", icon: "❤️" },
  { key: "sleep", label: "Somn", icon: "🌙" },
  { key: "activity", label: "Activitate", icon: "🏃" },
  { key: "mobility", label: "Mobilitate", icon: "🦿" },
  { key: "body", label: "Corp", icon: "⚖️" },
  { key: "wellbeing", label: "Wellbeing", icon: "🧘" },
];

export default function Dashboard() {
  const router = useRouter();
  const { hasData, metrics, sleepNights, meta, activeTab, setActiveTab, datePreset, clearData: clearStore } = useHealthStore();
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    if (!hasData) router.push("/");
  }, [hasData, router]);

  const bounds = useMemo(() => getDateBounds(datePreset, meta), [datePreset, meta]);
  const filteredMetrics = useMemo(() => {
    const result: Record<string, DailySummary[]> = {};
    for (const [key, data] of Object.entries(metrics)) {
      result[key] = filterByDate(data, bounds);
    }
    return result;
  }, [metrics, bounds]);
  const filteredSleep = useMemo(() => filterSleepByDate(sleepNights, bounds), [sleepNights, bounds]);

  const isDailyView = datePreset === "today" || datePreset === "yesterday";
  // "Today" = last day with data, "Yesterday" = day before that
  // (Apple Health export is historical, not real-time — the user's "today"
  //  is the most recent day they have data for.)
  const dailyDate = useMemo(() => {
    if (!meta) return null;
    const end = new Date(meta.dateRange.end + "T00:00:00Z");
    if (datePreset === "today") return meta.dateRange.end;
    if (datePreset === "yesterday") return new Date(end.getTime() - 86400000).toISOString().substring(0, 10);
    return null;
  }, [datePreset, meta]);

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

  // Scroll to top when tab changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-subtle">
      <Onboarding />

      {/* ═══ HEADER — Apple style ═══ */}
      <header className="sticky top-0 z-50 backdrop-blur-xl" style={{ borderBottom: "1px solid rgba(84,84,88,0.6)", background: "rgba(0,0,0,0.88)" }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-5">
          {/* Top row */}
          <div className="flex items-center justify-between py-2.5">
            <div>
              <h1 className="text-[17px] font-bold text-white">VitalStat</h1>
              <p className="text-[11px] hidden sm:block" style={{ color: "rgba(235,235,245,0.3)" }}>
                {meta.totalRecords.toLocaleString()} inregistrari
              </p>
            </div>
            <div className="flex items-center gap-1">
              {/* Force Refresh — unregisters SW, clears all caches, reloads */}
              <button
                onClick={async () => {
                  try {
                    // 1. Unregister ALL service workers (not just update)
                    const regs = await navigator.serviceWorker?.getRegistrations();
                    if (regs) await Promise.all(regs.map(r => r.unregister()));
                  } catch {}
                  try {
                    // 2. Delete all caches
                    if (typeof caches !== "undefined") {
                      const keys = await caches.keys();
                      await Promise.all(keys.map(k => caches.delete(k)));
                    }
                  } catch {}
                  // 3. Hard reload (bypass HTTP cache too)
                  window.location.href = window.location.pathname + "?t=" + Date.now();
                }}
                className="pill text-[13px] flex items-center gap-1.5"
                title="Forteaza actualizare — sterge cache si reincarca"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
                <span className="hidden sm:inline">Actualizeaza</span>
              </button>
              <button onClick={() => setShowActions(!showActions)} className="pill text-[13px]">
                &#x22EF;
              </button>
              {showActions && (
                <div className="flex items-center gap-1 animate-in">
                  <ShareCard metrics={metrics} sleepNights={sleepNights} />
                  <PDFExport metrics={metrics} sleepNights={sleepNights} />
                  <CSVExport metrics={metrics} sleepNights={sleepNights} />
                  <button onClick={handleExport} className="pill text-[11px]" title="Exporta JSON">{"\ud83d\udce4"}</button>
                  <button onClick={handleReset} className="text-[11px] px-2 py-1" style={{ color: "rgba(255,59,48,0.6)" }}>Sterge</button>
                </div>
              )}
            </div>
          </div>
          {/* Date range */}
          <div className="pb-2">
            <DateRangePicker />
          </div>
        </div>
      </header>

      {/* ═══ DESKTOP TABS (hidden on mobile) ═══ */}
      {!isDailyView && (
        <nav className="desktop-tabs" style={{ borderBottom: "1px solid rgba(84,84,88,0.6)", background: "rgba(0,0,0,0.6)" }}>
          <div className="max-w-6xl mx-auto px-3 sm:px-5 tab-scroll flex">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`tab-btn ${activeTab === tab.key ? "tab-active" : ""}`}
              >
                <span className="mr-1.5 text-xs">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* ═══ CONTENT ═══ */}
      {isDailyView && dailyDate ? (
        <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-5 py-4 sm:py-6 overflow-x-hidden">
          <DailyReport date={dailyDate} metrics={metrics} sleepNights={sleepNights} />
        </main>
      ) : (
        <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-5 py-4 sm:py-6 overflow-x-hidden">
          {activeTab === "overview" && (
            <OverviewTab metrics={filteredMetrics} sleepNights={filteredSleep} allMetrics={metrics} allSleep={sleepNights} metricsForCategory={metricsForCategory} datePreset={datePreset} />
          )}
          {activeTab === "sleep" && (
            <SleepTab metrics={filteredMetrics} sleepNights={filteredSleep} allMetrics={metrics} allSleep={sleepNights} />
          )}
          {activeTab !== "overview" && activeTab !== "sleep" && (
            <CategoryTab
              category={activeTab}
              metrics={filteredMetrics}
              sleepNights={filteredSleep}
              allMetrics={metrics}
              allSleep={sleepNights}
              availableKeys={metricsForCategory(activeTab)}
            />
          )}
        </main>
      )}

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      <nav className="bottom-nav">
        {TABS.slice(0, 5).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`bottom-nav-item ${activeTab === tab.key ? "active" : ""}`}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span>{tab.label}</span>
            {activeTab === tab.key && <div className="nav-dot" />}
          </button>
        ))}
        <button
          onClick={() => {
            // Cycle through remaining tabs
            const extraTabs = TABS.slice(5);
            const currentIdx = extraTabs.findIndex(t => t.key === activeTab);
            const next = extraTabs[(currentIdx + 1) % extraTabs.length];
            setActiveTab(next.key);
          }}
          className={`bottom-nav-item ${TABS.slice(5).some(t => t.key === activeTab) ? "active" : ""}`}
        >
          <span className="nav-icon">⋯</span>
          <span>Mai mult</span>
        </button>
      </nav>
    </div>
  );
}

// ═══════════════════════════════════════
//  OVERVIEW TAB
// ═══════════════════════════════════════
function OverviewTab({
  metrics, sleepNights, allMetrics, allSleep, metricsForCategory, datePreset,
}: {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  metricsForCategory: (cat: MetricCategory) => string[];
  datePreset: string;
}) {
  const [showAllInsights, setShowAllInsights] = useState(false);

  // Recovery target date: always the last day of the selected period.
  // For "today"/"yesterday" this is handled at parent level (daily view).
  // For other periods, we use the last date in the filtered dataset.
  const recoveryTargetDate = useMemo(() => {
    // Try filtered first (respects period), fall back to full data
    const filteredDates = Object.values(metrics).flatMap(arr => arr.map(d => d.date));
    if (filteredDates.length > 0) return filteredDates.sort().pop()!;
    const allDates = Object.values(allMetrics).flatMap(arr => arr.map(d => d.date));
    return allDates.sort().pop() || new Date().toISOString().substring(0, 10);
  }, [metrics, allMetrics]);

  // Period label for display
  const periodLabel = useMemo(() => {
    const labels: Record<string, string> = {
      today: "Azi", yesterday: "Ieri", "7d": "7 zile", "14d": "14 zile",
      "30d": "30 zile", "90d": "90 zile", "6m": "6 luni", "1y": "1 an", all: "Tot"
    };
    return labels[datePreset] || "30 zile";
  }, [datePreset]);

  // Favorites: only 6 cards max (Apple Health style)
  const favoriteMetrics = ["restingHeartRate", "hrv", "stepCount", "activeEnergy", "exerciseTime", "vo2Max"]
    .filter(k => metrics[k]?.length > 0);

  // Dates in the selected period — for period-average recovery
  const periodDates = useMemo(() => {
    const dates = new Set<string>();
    for (const arr of Object.values(metrics)) {
      for (const d of arr) dates.add(d.date);
    }
    return [...dates].sort();
  }, [metrics]);

  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ─────────────────────────────────────────── */}
      {/*  1. RECUPERARE (Hero) — the single most     */}
      {/*     important number on the whole page      */}
      {/* ─────────────────────────────────────────── */}
      <HeroScore
        rhrData={allMetrics.restingHeartRate || []}
        hrvData={allMetrics.hrv || []}
        sleepData={allSleep}
        exerciseData={allMetrics.exerciseTime}
        respData={allMetrics.respiratoryRate}
        spo2Data={allMetrics.oxygenSaturation}
        tempData={allMetrics.wristTemperature}
        periodDates={periodDates}
        periodLabel={periodLabel}
      />

      {/* ─────────────────────────────────────────── */}
      {/*  2. PROGRES — clear week-over-week deltas   */}
      {/*     "Did I improve? By how much?"           */}
      {/* ─────────────────────────────────────────── */}
      <ProgressOverview
        metrics={allMetrics}
        sleepNights={allSleep}
        windowDays={periodDates.length || 7}
        periodLabel={periodLabel}
      />

      {/* ─────────────────────────────────────────── */}
      {/*  3. IN ATENTIE — only actionable alerts     */}
      {/*     (max 3, only alert/warning severity)   */}
      {/* ─────────────────────────────────────────── */}
      <section>
        <div className="hh-section-label">
          <span>In atentie</span>
        </div>
        <ActionableHighlights
          metrics={metrics}
          sleepNights={sleepNights}
          allMetrics={allMetrics}
          allSleep={allSleep}
        />
      </section>

      {/* ─────────────────────────────────────────── */}
      {/*  4. FAVORITE — 6 key metric cards           */}
      {/* ─────────────────────────────────────────── */}
      <section>
        <div className="hh-section-label">
          <span>Favorite</span>
          <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>{periodLabel}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 stagger-in">
          {favoriteMetrics.map((key) => (
            <MetricCard key={key} metricKey={key} data={metrics[key]} />
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────── */}
      {/*  5. TRENDURI — just 2 charts (RHR + HRV)    */}
      {/* ─────────────────────────────────────────── */}
      <section>
        <div className="hh-section-label">
          <span>Tendinte</span>
          <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>{periodLabel}</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {metrics.restingHeartRate?.length >= 3 && <TrendChart metricKey="restingHeartRate" data={metrics.restingHeartRate} />}
          {metrics.hrv?.length >= 3 && <TrendChart metricKey="hrv" data={metrics.hrv} />}
        </div>
      </section>

      {/* ─────────────────────────────────────────── */}
      {/*  6. ADVANCED TOGGLE — hide everything else  */}
      {/*     behind a single "Show more" button      */}
      {/* ─────────────────────────────────────────── */}
      {!showAdvanced ? (
        <button
          onClick={() => setShowAdvanced(true)}
          className="hh-card hh-card-tappable"
          style={{
            textAlign: "center",
            color: "var(--accent)",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            border: "none",
            width: "100%",
          }}
        >
          Afiseaza analize avansate →
        </button>
      ) : (
        <AdvancedSections
          metrics={metrics}
          sleepNights={sleepNights}
          allMetrics={allMetrics}
          allSleep={allSleep}
          recoveryTargetDate={recoveryTargetDate}
          showAllInsights={showAllInsights}
          setShowAllInsights={setShowAllInsights}
          onHide={() => setShowAdvanced(false)}
          windowDays={periodDates.length || 30}
          periodLabel={periodLabel}
        />
      )}
    </div>
  );
}

/**
 * Actionable highlights — alerts and warnings only.
 * If nothing is wrong, shows a clean "all good" state.
 */
function ActionableHighlights({
  metrics, sleepNights, allMetrics, allSleep,
}: {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
}) {
  const actionableInsights = useMemo(() => {
    const all = generateInsights(allMetrics, allSleep);
    return all.filter(i => i.severity === "alert" || i.severity === "warning").slice(0, 3);
  }, [allMetrics, allSleep]);

  if (actionableInsights.length === 0) {
    return (
      <div className="hh-card" style={{ textAlign: "center", padding: "20px" }}>
        <div className="hh-mono-num" style={{ fontSize: 28, color: "var(--success)", fontWeight: 700, marginBottom: 4 }}>
          ✓
        </div>
        <p className="hh-body" style={{ color: "var(--label-primary)", fontWeight: 600 }}>
          Nimic de semnalat
        </p>
        <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginTop: 2 }}>
          Toti indicatorii tai sunt in parametri normali.
        </p>
      </div>
    );
  }

  return (
    <InsightsPanel
      metrics={metrics}
      sleepNights={sleepNights}
      fullMetrics={allMetrics}
      fullSleep={allSleep}
      maxItems={3}
      actionableOnly
    />
  );
}

/**
 * Everything advanced — behind a toggle, so the overview stays clean.
 */
function AdvancedSections({
  metrics, sleepNights, allMetrics, allSleep, recoveryTargetDate, showAllInsights, setShowAllInsights, onHide, windowDays, periodLabel,
}: {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  recoveryTargetDate: string;
  showAllInsights: boolean;
  setShowAllInsights: (v: boolean) => void;
  onHide: () => void;
  windowDays: number;
  periodLabel: string;
}) {
  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Period-adaptive analysis — acute/trend/progression/longevity
          picks different sections based on selected window size */}
      <section>
        <div className="hh-section-label">
          <span>Analiza adaptiva</span>
          <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>{periodLabel}</span>
        </div>
        <AdaptiveAnalysis
          metrics={metrics}
          sleepNights={sleepNights}
          allMetrics={allMetrics}
          allSleep={allSleep}
          windowDays={windowDays}
          periodLabel={periodLabel}
        />
      </section>

      <TrendAlerts metrics={metrics} sleepNights={sleepNights} />
      <RecoveryPrediction metrics={allMetrics} sleepNights={allSleep} targetDate={recoveryTargetDate} />

      <section>
        <div className="hh-section-label"><span>Antrenament si longevitate</span></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <StrainCoach metrics={metrics} sleepNights={sleepNights} />
          <BiologicalAge metrics={metrics} sleepNights={sleepNights} />
        </div>
      </section>

      <section>
        <div className="hh-section-label"><span>Performanta saptamanala</span></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <GoalsTracker metrics={metrics} sleepNights={sleepNights} />
          <WeeklyDigest metrics={metrics} sleepNights={sleepNights} />
        </div>
      </section>

      <section>
        <div className="hh-section-label"><span>Analiza aprofundata</span></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <ResilienceScore metrics={metrics} sleepNights={sleepNights} />
          <StabilityScores metrics={metrics} sleepNights={sleepNights} />
          <SleepBank sleepNights={sleepNights} />
        </div>
      </section>

      <section>
        <div className="hh-section-label"><span>Istoric recuperare</span></div>
        <RecoveryTimeline
          rhrData={metrics.restingHeartRate || []}
          hrvData={metrics.hrv || []}
          sleepData={sleepNights}
          exerciseData={metrics.exerciseTime}
          respData={metrics.respiratoryRate}
          spo2Data={metrics.oxygenSaturation}
          tempData={metrics.wristTemperature}
        />
      </section>

      <section>
        <div className="hh-section-label"><span>Vizualizari</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <CalendarHeatmap metrics={metrics} />
          <CorrelationHeatmap metrics={metrics} />
        </div>
      </section>

      <section>
        <div className="hh-section-label"><span>Jurnal si recap lunar</span></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <BehaviorJournal metrics={metrics} sleepNights={sleepNights} />
          <MonthlyRecap metrics={metrics} sleepNights={sleepNights} />
        </div>
      </section>

      <section>
        <div className="hh-section-label"><span>Simulari si comparatii</span></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <WhatIfSimulator metrics={metrics} sleepNights={sleepNights} />
          <AgeBenchmark metrics={metrics} />
        </div>
      </section>

      {!showAllInsights ? (
        <button
          onClick={() => setShowAllInsights(true)}
          className="hh-card hh-card-tappable"
          style={{ textAlign: "center", color: "var(--accent)", fontSize: 15, fontWeight: 600, cursor: "pointer", border: "none", width: "100%" }}
        >
          Vezi toate interpretarile →
        </button>
      ) : (
        <section>
          <div className="hh-section-label"><span>Toate interpretarile</span></div>
          <InsightsPanel metrics={metrics} sleepNights={sleepNights} fullMetrics={allMetrics} fullSleep={allSleep} />
        </section>
      )}

      <button
        onClick={onHide}
        className="hh-card hh-card-tappable"
        style={{ textAlign: "center", color: "var(--label-secondary)", fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", width: "100%" }}
      >
        Ascunde analizele avansate
      </button>
    </div>
  );
}

// ═══ SLEEP TAB ═══
function SleepTab({ metrics, sleepNights, allMetrics, allSleep }: { metrics: Record<string, DailySummary[]>; sleepNights: SleepNight[]; allMetrics: Record<string, DailySummary[]>; allSleep: SleepNight[] }) {
  return (
    <div className="space-y-6">
      <h2 className="section-header flex items-center gap-2">
        <span>🌙</span> Somn
        <span className="text-[15px] font-normal" style={{ color: "rgba(235,235,245,0.3)" }}>({sleepNights.length} nopti)</span>
      </h2>

      {/* Sleep chart first — most visual */}
      <SleepChart data={sleepNights} days={sleepNights.length} />

      {/* Insights — uses full dataset for proper analysis */}
      <InsightsPanel metrics={metrics} sleepNights={sleepNights} fullMetrics={allMetrics} fullSleep={allSleep} filter="sleep" />

      {/* Smart tips + circadian */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SmartSleepTips metrics={metrics} sleepNights={allSleep} />
        <CircadianMap sleepNights={allSleep} />
      </div>

      {/* Sleep-related metrics */}
      {(() => {
        const sleepMetricKeys = Object.entries(METRIC_CONFIG)
          .filter(([key, cfg]) => cfg.category === "sleep" && metrics[key]?.length > 0)
          .map(([key]) => key);
        if (sleepMetricKeys.length === 0) return null;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 stagger-in">
            {sleepMetricKeys.map((key) => (
              <MetricCard key={key} metricKey={key} data={metrics[key]} />
            ))}
          </div>
        );
      })()}

      {/* Sleep bank */}
      <SleepBank sleepNights={sleepNights} />
    </div>
  );
}

// ═══ GENERIC CATEGORY TAB ═══
function CategoryTab({
  category, metrics, sleepNights, allMetrics, allSleep, availableKeys,
}: {
  category: MetricCategory;
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  availableKeys: string[];
}) {
  const catInfo = CATEGORIES[category];

  if (availableKeys.length === 0) {
    return (
      <div className="glass p-12 text-center">
        <p className="text-[22px] mb-2">{catInfo?.icon}</p>
        <p className="text-[17px] mb-2 text-white">Nu sunt date pentru {catInfo?.label || category}</p>
        <p className="text-[15px]" style={{ color: "rgba(235,235,245,0.6)" }}>Aceasta categorie nu contine date in exportul tau Apple Health.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category header */}
      <h2 className="section-header flex items-center gap-2">
        <span>{catInfo?.icon}</span> {catInfo?.label}
        <span className="text-[15px] font-normal" style={{ color: "rgba(235,235,245,0.3)" }}>({availableKeys.length} metrici)</span>
      </h2>

      {/* Insights for this category — uses full dataset */}
      <InsightsPanel metrics={metrics} sleepNights={sleepNights} fullMetrics={allMetrics} fullSleep={allSleep} filter={category === "body" ? undefined : category} />
      {category === "body" && <InsightsPanel metrics={metrics} sleepNights={sleepNights} fullMetrics={allMetrics} fullSleep={allSleep} filter="nutrition" />}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 stagger-in">
        {availableKeys.map((key) => (
          <MetricCard key={key} metricKey={key} data={metrics[key]} />
        ))}
      </div>

      {/* Trend charts for top metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {availableKeys.slice(0, 4).map((key) => (
          <TrendChart key={key} metricKey={key} data={metrics[key]} />
        ))}
      </div>

      {/* Nutrition subsection for body tab */}
      {category === "body" && (() => {
        const nutritionKeys = Object.entries(METRIC_CONFIG)
          .filter(([key, cfg]) => cfg.category === "nutrition" && metrics[key]?.length > 0)
          .map(([key]) => key);
        if (nutritionKeys.length === 0) return null;
        return (
          <section>
            <h2 className="section-header">{CATEGORIES.nutrition.icon} {CATEGORIES.nutrition.label}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 stagger-in">
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
