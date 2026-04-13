"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
import { AttentionBanner } from "@/components/AttentionBanner";
import { ActivityRings } from "@/components/ActivityRings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Hypnogram } from "@/components/Hypnogram";
import { PeriodReport } from "@/components/PeriodReport";
import { EvidencePanel } from "@/components/EvidencePanel";
import { DeepAnalysis } from "@/components/DeepAnalysis";
import { METRIC_CONFIG, CATEGORIES, type MetricCategory } from "@/lib/parser/healthTypes";
import { generateSmartInsights } from "@/lib/stats/smartInsights";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";
import { Onboarding } from "@/components/Onboarding";
import { ProfileSetup } from "@/components/ProfileSetup";
import { clearData, exportAllData, saveHealthData, getMeta, getMetricData, getSleepData } from "@/lib/db/indexedDB";
import { parseHealthBuffer } from "@/lib/parser/xmlParser";
import { pullFromCloud, getWebhookInfo, getCloudConfig, setCloudConfig, type CloudSyncConfig, type SyncResult } from "@/lib/db/cloudSync";
import JSZip from "jszip";

// Bottom nav — Apple Health 3-tab pattern: Summary, Browse, Profile
const BOTTOM_TABS: { key: string; label: string; icon: string }[] = [
  { key: "overview", label: "Sumar", icon: "📊" },
  { key: "browse", label: "Categorii", icon: "🔍" },
  { key: "profile", label: "Setari", icon: "⚙️" },
];

// Category tabs — used inside Browse mode
const CATEGORY_TABS: { key: MetricCategory; label: string; icon: string }[] = [
  { key: "cardio", label: "Cardiovascular", icon: "❤️" },
  { key: "sleep", label: "Somn", icon: "🌙" },
  { key: "activity", label: "Activitate", icon: "🏃" },
  { key: "mobility", label: "Mobilitate", icon: "🦿" },
  { key: "body", label: "Corp", icon: "⚖️" },
  { key: "wellbeing", label: "Wellbeing", icon: "🧘" },
];

export default function Dashboard() {
  const router = useRouter();
  const { hasData, metrics, sleepNights, meta, activeTab, setActiveTab, datePreset, setData } = useHealthStore();

  useEffect(() => {
    if (!hasData) router.push("/");
  }, [hasData, router]);

  // Silent cloud sync — reusable helper with AbortController support
  const silentSync = useCallback(async (signal?: AbortSignal) => {
    const config = getCloudConfig();
    if (!config.enabled) return;
    if (config.lastPullAt && Date.now() - new Date(config.lastPullAt).getTime() < 3600000) return;
    try {
      const result = await pullFromCloud(false, signal);
      if (signal?.aborted) return;
      if (result.newMetrics > 0 || result.newSleep > 0) {
        const freshMeta = await getMeta();
        if (signal?.aborted || !freshMeta) return;
        const freshMetrics: Record<string, DailySummary[]> = {};
        for (const key of freshMeta.availableMetrics) {
          if (key === "sleepAnalysis") continue;
          freshMetrics[key] = await getMetricData(key);
        }
        const freshSleep = await getSleepData();
        if (!signal?.aborted) setData(freshMetrics, freshSleep, freshMeta);
      }
    } catch { /* silent — mutex or network fail */ }
  }, [setData]);

  // Auto-sync on app open + when tab becomes visible (PWA resume)
  useEffect(() => {
    if (!hasData) return;
    const ac = new AbortController();
    silentSync(ac.signal);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") silentSync(ac.signal);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => { ac.abort(); document.removeEventListener("visibilitychange", handleVisibility); };
  }, [hasData, silentSync]);

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
      <ProfileSetup shouldShow={hasData} />

      {/* ═══ HEADER — Clean, minimal ═══ */}
      <header className="sticky top-0 z-50 backdrop-blur-xl" style={{ borderBottom: "0.5px solid var(--separator)", background: "var(--overlay-header)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-5">
          <div className="flex items-center justify-between py-3">
            <h1 className="hh-large-title" style={{ color: "var(--label-primary)", fontWeight: 500 }}>
              {activeTab === "profile" ? "Setari" : "Sumar"}
            </h1>
            <ThemeToggle />
          </div>
          {activeTab !== "profile" && (
            <div className="pb-2">
              <DateRangePicker />
            </div>
          )}
        </div>
      </header>

      {/* ═══ CONTENT ═══ */}
      {isDailyView && dailyDate ? (
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-5 py-4 sm:py-6 overflow-x-hidden">
          <DailyReport date={dailyDate} metrics={metrics} sleepNights={sleepNights} />
        </main>
      ) : (
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-5 py-4 sm:py-6 overflow-x-hidden">
          {activeTab === "overview" && (
            <OverviewTab metrics={filteredMetrics} sleepNights={filteredSleep} allMetrics={metrics} allSleep={sleepNights} metricsForCategory={metricsForCategory} datePreset={datePreset} />
          )}
          {activeTab === "browse" && (
            <BrowseTab
              metrics={filteredMetrics}
              sleepNights={filteredSleep}
              allMetrics={metrics}
              allSleep={sleepNights}
              metricsForCategory={metricsForCategory}
            />
          )}
          {activeTab === "profile" && (
            <ProfileTab />
          )}
          {activeTab === "sleep" && (
            <SleepTab metrics={filteredMetrics} sleepNights={filteredSleep} allMetrics={metrics} allSleep={sleepNights} />
          )}
          {activeTab !== "overview" && activeTab !== "browse" && activeTab !== "profile" && activeTab !== "sleep" && (
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

      {/* ═══ BOTTOM NAV — 3 tabs (Apple Health style) ═══ */}
      <nav className="bottom-nav">
        {BOTTOM_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`bottom-nav-item ${activeTab === tab.key ? "active" : ""}`}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
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
      {/*  0. IN ATENTIE AZI — critical health signals */}
      {/*     (illness early warning, HRV crash, sleep  */}
      {/*     debt). Only renders if alerts exist.      */}
      {/* ─────────────────────────────────────────── */}
      <AttentionBanner allMetrics={allMetrics} allSleep={allSleep} />

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
      {/*  Activity Rings (Apple Fitness style)        */}
      {/* ─────────────────────────────────────────── */}
      <ActivityRings
        activeEnergy={metrics.activeEnergy}
        exerciseTime={metrics.exerciseTime}
        standTime={metrics.standTime}
        stepCount={metrics.stepCount}
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
      {/*  PERIOD REPORT — deep analysis for ≥30d    */}
      {/* ─────────────────────────────────────────── */}
      {(periodDates.length || 0) >= 30 && (
        <PeriodReport
          metrics={metrics}
          sleepNights={sleepNights}
          allMetrics={allMetrics}
          allSleep={allSleep}
          windowDays={periodDates.length || 30}
          periodLabel={periodLabel}
        />
      )}

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
          <span>{periodLabel}</span>
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
          <span>{periodLabel}</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {metrics.restingHeartRate?.length >= 3 && <TrendChart metricKey="restingHeartRate" data={metrics.restingHeartRate} />}
          {metrics.hrv?.length >= 3 && <TrendChart metricKey="hrv" data={metrics.hrv} />}
        </div>
      </section>

      {/* ─────────────────────────────────────────── */}
      {/*  EVIDENCE-BASED — validated scientific metrics */}
      {/* ─────────────────────────────────────────── */}
      <EvidencePanel metrics={allMetrics} sleepNights={allSleep} />
      <DeepAnalysis metrics={allMetrics} sleepNights={allSleep} />

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
    const all = generateSmartInsights(metrics, sleepNights, allMetrics, allSleep, 30);
    return all.filter(i => i.severity === "critical" || i.severity === "warning").slice(0, 3);
  }, [metrics, sleepNights, allMetrics, allSleep]);

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
          <span>{periodLabel}</span>
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

// ═══ BROWSE TAB — Apple Health "Browse" pattern ═══
function BrowseTab({
  metrics, sleepNights, allMetrics, allSleep, metricsForCategory,
}: {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  allMetrics: Record<string, DailySummary[]>;
  allSleep: SleepNight[];
  metricsForCategory: (cat: MetricCategory) => string[];
}) {
  const { setActiveTab } = useHealthStore();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="hh-section-label"><span>Categorii</span></div>
      <div className="hh-inset-group">
        {CATEGORY_TABS.map((cat) => {
          const count = metricsForCategory(cat.key).length;
          // Sleep category: count sleep nights instead of metrics
          const hasSleepData = cat.key === "sleep" && sleepNights.length > 0;
          const hasData = count > 0 || hasSleepData;
          if (!hasData) return null; // Hide empty categories

          return (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              className="hh-card-tappable"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 22 }}>{cat.icon}</span>
                <div>
                  <span className="hh-body" style={{ color: "var(--label-primary)", fontWeight: 500, display: "block" }}>
                    {cat.label}
                  </span>
                  <span className="hh-caption" style={{ color: "var(--label-tertiary)" }}>
                    {hasSleepData && count === 0
                      ? `${sleepNights.length} nopti`
                      : `${count} ${count === 1 ? "metrica" : "metrici"}`}
                  </span>
                </div>
              </div>
              <span style={{ color: "var(--label-tertiary)", fontSize: 17 }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══ PROFILE TAB ═══
function ProfileTab() {
  const router = useRouter();
  const { metrics, sleepNights, meta, setData, setLoading, setParseProgress, clearData: clearStore } = useHealthStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string>("");
  const [importProgress, setImportProgress] = useState(0);
  const [importError, setImportError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cloudConfig, setCloudConfigState] = useState<CloudSyncConfig>(() => getCloudConfig());
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<{ url: string; token: string } | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  // Load webhook info on mount
  useEffect(() => {
    let active = true;
    getWebhookInfo().then(info => { if (active) setWebhookInfo(info); }).catch(() => {});
    return () => { active = false; };
  }, []);

  /** Reload merged data from IndexedDB into Zustand store */
  const reloadFromDB = useCallback(async () => {
    const freshMeta = await getMeta();
    if (freshMeta) {
      const freshMetrics: Record<string, DailySummary[]> = {};
      for (const key of freshMeta.availableMetrics) {
        if (key === "sleepAnalysis") continue;
        freshMetrics[key] = await getMetricData(key);
      }
      const freshSleep = await getSleepData();
      setData(freshMetrics, freshSleep, freshMeta);
    }
  }, [setData]);

  const handleCloudSync = useCallback(async (forceFull = false) => {
    setSyncStatus("Se sincronizeaza...");
    setSyncResult(null);
    try {
      const result = await pullFromCloud(forceFull);
      setSyncResult(result);
      if ((result.newMetrics > 0 || result.newSleep > 0) && !result.error) {
        await reloadFromDB();
      }
      // Always enable auto-sync after manual press (even if no new data yet)
      const cfg = { enabled: true, lastPullAt: new Date().toISOString() };
      setCloudConfig(cfg);
      setCloudConfigState(cfg);
      setSyncStatus("");
    } catch (err) {
      setSyncResult({ newMetrics: 0, newSleep: 0, dateRange: null, error: err instanceof Error ? err.message : "Eroare sync" });
      setSyncStatus("");
    }
  }, [reloadFromDB]);

  const handleImport = useCallback(async (file: File) => {
    setImportError("");
    setImportStatus("Se citeste fisierul...");
    setImportProgress(0);
    try {
      let buffer: ArrayBuffer;
      if (file.name.endsWith(".zip")) {
        setImportStatus("Se extrage ZIP...");
        const zip = await JSZip.loadAsync(file);
        let xmlFile = zip.file("apple_health_export/export.xml") || zip.file("export.xml");
        if (!xmlFile) {
          const found = Object.keys(zip.files).find(f => f.endsWith("export.xml") && !f.endsWith("export_cda.xml"));
          if (found) xmlFile = zip.file(found);
        }
        if (!xmlFile) throw new Error("Nu s-a gasit export.xml in ZIP");
        setImportStatus("Se decomprima XML...");
        buffer = await xmlFile.async("arraybuffer");
      } else if (file.name.endsWith(".xml")) {
        buffer = await file.arrayBuffer();
      } else if (file.name.endsWith(".json")) {
        setImportStatus("Se importa din JSON...");
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.meta || !data.metrics) throw new Error("Format JSON invalid");
        await saveHealthData(data.metrics, data.sleepNights || [], data.meta);
        await reloadFromDB();
        setImportStatus("");
        return;
      } else {
        throw new Error("Accepta doar .zip, .xml sau .json");
      }

      if (buffer.byteLength < 100) throw new Error("Fisierul pare gol");
      const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(0);
      setImportStatus(`Se proceseaza ${sizeMB}MB...`);

      parseHealthBuffer(
        buffer,
        (percent) => {
          setImportProgress(percent);
          if (percent < 85) setImportStatus(`Se proceseaza... ${percent}%`);
          else if (percent < 95) setImportStatus("Se calculeaza sumarele zilnice...");
          else setImportStatus("Aproape gata...");
        },
        async (result) => {
          try {
            setImportStatus("Se salveaza...");
            await saveHealthData(result.summaries, result.sleepNights, result.meta);
            await reloadFromDB();
            setImportStatus("");
            setImportProgress(0);
          } catch (err) {
            setImportError(err instanceof Error ? err.message : "Eroare la salvare");
            setImportStatus("");
            setImportProgress(0);
          }
        },
        (errMsg) => {
          setImportError(errMsg);
          setImportStatus("");
          setImportProgress(0);
        }
      );
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Eroare la import");
      setImportStatus("");
      setImportProgress(0);
    }
  }, [reloadFromDB]);

  const handleExportJSON = useCallback(async () => {
    const json = await exportAllData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vitalstat-export-${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleDelete = useCallback(async () => {
    await clearData();
    clearStore();
    router.push("/");
  }, [clearStore, router]);

  const dataInfo = meta ? {
    start: meta.dateRange.start,
    end: meta.dateRange.end,
    metrics: meta.availableMetrics.filter(k => k !== "sleepAnalysis").length,
    records: meta.totalRecords,
  } : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── 1. PROFIL PERSONAL ── */}
      <ProfileSetup shouldShow={true} alwaysShow={true} />

      {/* ── 2. DATELE TALE ── */}
      <div className="hh-card" style={{ padding: 20 }}>
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Datele tale
        </p>
        <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginBottom: 16 }}>
          Totul ramane pe dispozitivul tau — nu trimitem nimic nicaieri.
        </p>

        {/* Data summary */}
        {dataInfo && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: 12 }}>
              <div className="hh-footnote" style={{ color: "var(--label-tertiary)", marginBottom: 2 }}>Perioada</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--label-primary)" }}>
                {dataInfo.start.substring(5)} — {dataInfo.end.substring(5)}
              </div>
            </div>
            <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: 12 }}>
              <div className="hh-footnote" style={{ color: "var(--label-tertiary)", marginBottom: 2 }}>Metrici</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--label-primary)" }}>
                {dataInfo.metrics} tipuri · {dataInfo.records.toLocaleString("ro")} inregistrari
              </div>
            </div>
          </div>
        )}

        {/* Import new data */}
        <input
          ref={fileRef}
          type="file"
          accept=".zip,.xml,.json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
          className="hidden"
          style={{ display: "none" }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!!importStatus}
          style={{
            width: "100%", padding: "14px 16px", borderRadius: 12,
            background: "var(--accent)", color: "#fff",
            fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: importStatus ? 0.6 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Importa date noi
        </button>
        <p className="hh-footnote" style={{ color: "var(--label-tertiary)", marginTop: 6, fontSize: 11, textAlign: "center" }}>
          Accepta .zip sau .xml din Apple Health, sau .json exportat
        </p>

        {/* Import progress */}
        {importStatus && (
          <div style={{ marginTop: 12 }}>
            <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginBottom: 6 }}>{importStatus}</p>
            {importProgress > 0 && (
              <div style={{ width: "100%", height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${importProgress}%`, height: "100%", background: "var(--accent)", borderRadius: 2, transition: "width 0.3s" }} />
              </div>
            )}
          </div>
        )}
        {importError && (
          <p className="hh-footnote" style={{ color: "var(--danger)", marginTop: 8 }}>{importError}</p>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: "var(--separator)", margin: "16px 0" }} />

        {/* Export actions */}
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, fontSize: 11 }}>
          Exporta
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            type="button"
            onClick={handleExportJSON}
            className="pill"
            style={{ padding: "12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <span style={{ fontSize: 16 }}>{"\ud83d\udce4"}</span> JSON backup
          </button>
          <PDFExport metrics={metrics} sleepNights={sleepNights} label="Raport PDF" />
          <CSVExport metrics={metrics} sleepNights={sleepNights} label="CSV / Excel" />
          <ShareCard metrics={metrics} sleepNights={sleepNights} label="Card imagine" />
        </div>
      </div>

      {/* ── 3. SINCRONIZARE AUTOMATA ── */}
      <div className="hh-card" style={{ padding: 20 }}>
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Sincronizare automata
        </p>
        <p className="hh-footnote" style={{ color: "var(--label-secondary)", marginBottom: 16 }}>
          Primeste date zilnic fara export manual, via Health Auto Export.
        </p>

        {/* Sync button */}
        <button
          type="button"
          onClick={() => handleCloudSync(false)}
          disabled={!!syncStatus}
          style={{
            width: "100%", padding: "14px 16px", borderRadius: 12,
            background: "var(--accent)", color: "#fff",
            fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: syncStatus ? 0.6 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          {syncStatus || "Sincronizeaza din cloud"}
        </button>

        {cloudConfig.lastPullAt && (
          <p className="hh-footnote" style={{ color: "var(--label-tertiary)", marginTop: 6, fontSize: 11, textAlign: "center" }}>
            Ultima sincronizare: {new Date(cloudConfig.lastPullAt).toLocaleString("ro-RO")}
          </p>
        )}

        {/* Sync result */}
        {syncResult && (
          <div style={{ marginTop: 12, padding: 12, background: syncResult.error ? "rgba(255,59,48,0.08)" : "rgba(52,199,89,0.08)", borderRadius: 10 }}>
            {syncResult.error ? (
              <p className="hh-footnote" style={{ color: "var(--danger)" }}>{syncResult.error}</p>
            ) : syncResult.newMetrics === 0 && syncResult.newSleep === 0 ? (
              <p className="hh-footnote" style={{ color: "var(--label-secondary)" }}>Totul e la zi — nu sunt date noi.</p>
            ) : (
              <p className="hh-footnote" style={{ color: "rgb(52,199,89)" }}>
                ✓ Adaugat {syncResult.newMetrics > 0 ? `${syncResult.newMetrics} zile metrici` : ""}{syncResult.newMetrics > 0 && syncResult.newSleep > 0 ? " + " : ""}{syncResult.newSleep > 0 ? `${syncResult.newSleep} nopti somn` : ""}
              </p>
            )}
          </div>
        )}

        <div style={{ height: 1, background: "var(--separator)", margin: "16px 0" }} />

        {/* Setup instructions */}
        <button
          type="button"
          onClick={() => setShowSetup(!showSetup)}
          className="pill"
          style={{ width: "100%", padding: "12px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            Configurare Health Auto Export
          </span>
          <span style={{ fontSize: 11 }}>{showSetup ? "▲" : "▼"}</span>
        </button>

        {showSetup && (
          <div style={{ marginTop: 12, padding: 16, background: "var(--surface-2)", borderRadius: 12 }}>
            <p className="hh-footnote" style={{ color: "var(--label-primary)", fontWeight: 700, marginBottom: 12 }}>
              Setup o singura data (5 min):
            </p>

            <ol style={{ margin: 0, paddingLeft: 20, color: "var(--label-secondary)", fontSize: 13, lineHeight: 1.7 }}>
              <li style={{ marginBottom: 8 }}>
                Instaleaza <strong style={{ color: "var(--label-primary)" }}>Health Auto Export</strong> din App Store (~$5)
              </li>
              <li style={{ marginBottom: 8 }}>
                In app → <strong style={{ color: "var(--label-primary)" }}>Automations</strong> → <strong>REST API</strong>
              </li>
              <li style={{ marginBottom: 8 }}>
                Method: <strong style={{ color: "var(--label-primary)" }}>POST</strong>
              </li>
              <li style={{ marginBottom: 8 }}>
                URL:
                {webhookInfo && (
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(webhookInfo.url); }}
                    style={{ display: "block", marginTop: 4, padding: "8px 10px", background: "var(--surface-1)", borderRadius: 8, border: "1px solid var(--separator)", fontSize: 11, fontFamily: "monospace", color: "var(--accent)", cursor: "pointer", wordBreak: "break-all", textAlign: "left", width: "100%" }}
                    title="Click to copy"
                  >
                    📋 {webhookInfo.url}
                  </button>
                )}
              </li>
              <li style={{ marginBottom: 8 }}>
                Header: <code style={{ fontSize: 11, color: "var(--label-primary)" }}>X-API-Token</code>
                {webhookInfo && (
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(webhookInfo.token); }}
                    style={{ display: "block", marginTop: 4, padding: "8px 10px", background: "var(--surface-1)", borderRadius: 8, border: "1px solid var(--separator)", fontSize: 11, fontFamily: "monospace", color: "var(--accent)", cursor: "pointer", wordBreak: "break-all", textAlign: "left", width: "100%" }}
                    title="Click to copy"
                  >
                    📋 {webhookInfo.token}
                  </button>
                )}
              </li>
              <li style={{ marginBottom: 8 }}>
                Selecteaza metricile: <strong style={{ color: "var(--label-primary)" }}>Heart Rate, HRV, Steps, Exercise, SpO2, Sleep</strong> etc.
              </li>
              <li style={{ marginBottom: 8 }}>
                Frecventa: <strong style={{ color: "var(--label-primary)" }}>Daily</strong> (sau la fiecare 6h)
              </li>
              <li>
                Gata! Datele vin automat. Apasa <strong style={{ color: "var(--accent)" }}>Sincronizeaza din cloud</strong> oricand.
              </li>
            </ol>
          </div>
        )}
      </div>

      {/* ── 4. APLICATIE ── */}
      <div className="hh-card" style={{ padding: 20 }}>
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
          Aplicatie
        </p>

        {/* Force refresh */}
        <button
          type="button"
          onClick={async () => {
            try {
              const regs = await navigator.serviceWorker?.getRegistrations();
              if (regs) await Promise.all(regs.map(r => r.unregister()));
            } catch {}
            try {
              if (typeof caches !== "undefined") {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
              }
            } catch {}
            window.location.href = window.location.pathname + "?t=" + Date.now();
          }}
          className="pill"
          style={{ width: "100%", padding: "12px 16px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          Forteaza actualizare aplicatie
        </button>

        <div style={{ height: 1, background: "var(--separator)", margin: "12px 0" }} />

        {/* Delete data */}
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 12,
              background: "transparent", border: "1px solid var(--danger)",
              color: "var(--danger)", fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Sterge toate datele
          </button>
        ) : (
          <div style={{ padding: 14, background: "rgba(255,59,48,0.08)", borderRadius: 12, border: "1px solid var(--danger)" }}>
            <p className="hh-footnote" style={{ color: "var(--danger)", fontWeight: 600, marginBottom: 10 }}>
              Esti sigur? Toate datele importate vor fi sterse permanent.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  flex: 1, padding: "10px", borderRadius: 10,
                  background: "var(--danger)", color: "#fff",
                  fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
                }}
              >
                Da, sterge tot
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="pill"
                style={{ flex: 1, padding: "10px", fontSize: 13, fontWeight: 600 }}
              >
                Anuleaza
              </button>
            </div>
          </div>
        )}

        <p className="hh-footnote" style={{ color: "var(--label-tertiary)", marginTop: 16, textAlign: "center", fontSize: 11 }}>
          VitalStat · 100% privat · Datele raman pe dispozitiv
        </p>
      </div>
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

      {/* Hypnogram — per-night sleep stages timeline (new imports only) */}
      <Hypnogram sleepNights={sleepNights} />

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
