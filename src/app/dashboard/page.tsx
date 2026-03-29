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
import { METRIC_CONFIG, CATEGORIES, type MetricCategory } from "@/lib/parser/healthTypes";
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
      <Onboarding />

      {/* ═══ HEADER ═══ */}
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b border-[rgba(255,255,255,0.05)] bg-[rgba(9,9,11,0.88)]">
        <div className="max-w-6xl mx-auto px-3 sm:px-5">
          {/* Top row */}
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.2) 0%, rgba(96,165,250,0.15) 100%)" }}>
                <svg className="w-4.5 h-4.5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-bold tracking-tight">VitalStat</h1>
                <p className="text-[9px] text-[var(--foreground-muted)] hidden sm:block">
                  {meta.totalRecords.toLocaleString()} inregistrari · {meta.dateRange.start} — {meta.dateRange.end}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowActions(!showActions)} className="pill text-xs">
                ⋯
              </button>
              {showActions && (
                <div className="flex items-center gap-1 animate-in">
                  <ShareCard metrics={metrics} sleepNights={sleepNights} />
                  <PDFExport metrics={metrics} sleepNights={sleepNights} />
                  <CSVExport metrics={metrics} sleepNights={sleepNights} />
                  <button onClick={handleExport} className="pill text-[10px]" title="Exporta JSON">📤</button>
                  <button onClick={handleReset} className="text-[10px] text-red-400/60 hover:text-red-400 px-2 py-1">Sterge</button>
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
        <nav className="desktop-tabs border-b border-[rgba(255,255,255,0.04)] bg-[rgba(9,9,11,0.6)]">
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
        <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-5 py-4 sm:py-6">
          <DailyReport date={dailyDate} metrics={metrics} sleepNights={sleepNights} />
        </main>
      ) : (
        <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-5 py-4 sm:py-6">
          {activeTab === "overview" && (
            <OverviewTab metrics={filteredMetrics} sleepNights={filteredSleep} allMetrics={metrics} allSleep={sleepNights} metricsForCategory={metricsForCategory} />
          )}
          {activeTab === "sleep" && (
            <SleepTab metrics={filteredMetrics} sleepNights={filteredSleep} allSleep={sleepNights} />
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
//  OVERVIEW TAB — Restructured
// ═══════════════════════════════════════
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
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const keyMetrics = ["restingHeartRate", "hrv", "oxygenSaturation", "vo2Max", "stepCount", "activeEnergy", "exerciseTime", "bodyMass"]
    .filter(k => metrics[k]?.length > 0);

  return (
    <div className="space-y-5">
      {/* ── HERO: Recovery Score + Priority Insights ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <HeroScore
            rhrData={allMetrics.restingHeartRate || []}
            hrvData={allMetrics.hrv || []}
            sleepData={allSleep}
            exerciseData={allMetrics.exerciseTime}
            respData={allMetrics.respiratoryRate}
            spo2Data={allMetrics.oxygenSaturation}
            tempData={allMetrics.wristTemperature}
          />
        </div>
        <div className="lg:col-span-3 glass p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-[var(--foreground-secondary)] uppercase tracking-wider">Ce trebuie sa stii</h3>
            <span className="badge badge-info">Azi</span>
          </div>
          <InsightsPanel metrics={metrics} sleepNights={sleepNights} maxItems={4} compact />
        </div>
      </div>

      {/* ── KEY METRICS GRID ── */}
      <section>
        <h2 className="section-header">Metrici principale</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 stagger-in">
          {keyMetrics.map((key) => (
            <MetricCard key={key} metricKey={key} data={metrics[key]} />
          ))}
        </div>
      </section>

      {/* ── ALERTS (only when issues detected) ── */}
      <TrendAlerts metrics={metrics} sleepNights={sleepNights} />
      <RecoveryPrediction metrics={allMetrics} sleepNights={allSleep} />

      {/* ── DIVIDER ── */}
      <div className="divider" />

      {/* ── TRAINING & AGING ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StrainCoach metrics={allMetrics} sleepNights={allSleep} />
        <BiologicalAge metrics={allMetrics} sleepNights={allSleep} />
      </div>

      {/* ── TREND CHARTS ── */}
      <section>
        <h2 className="section-header">Trenduri cheie</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {metrics.restingHeartRate?.length > 0 && <TrendChart metricKey="restingHeartRate" data={metrics.restingHeartRate} />}
          {metrics.hrv?.length > 0 && <TrendChart metricKey="hrv" data={metrics.hrv} />}
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div className="divider" />

      {/* ── DAILY PERFORMANCE ── */}
      <section>
        <h2 className="section-header">Performanta zilnica</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GoalsTracker metrics={metrics} sleepNights={sleepNights} />
          <WeeklyDigest metrics={metrics} sleepNights={sleepNights} />
        </div>
      </section>

      {/* ── DEEP ANALYSIS (collapsible sections) ── */}
      <section>
        <h2 className="section-header">Analiza aprofundata</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ResilienceScore metrics={allMetrics} sleepNights={allSleep} />
          <StabilityScores metrics={metrics} sleepNights={sleepNights} />
          <SleepBank sleepNights={sleepNights} />
        </div>
      </section>

      {/* ── BEHAVIOR & TRENDS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BehaviorJournal metrics={allMetrics} sleepNights={allSleep} />
        <MonthlyRecap metrics={allMetrics} sleepNights={allSleep} />
      </div>

      {/* ── DIVIDER ── */}
      <div className="divider" />

      {/* ── SIMULATORS ── */}
      <section>
        <h2 className="section-header">Simulari & Comparatii</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <WhatIfSimulator metrics={allMetrics} sleepNights={allSleep} />
          <AgeBenchmark metrics={allMetrics} />
        </div>
      </section>

      {/* ── TIMELINE ── */}
      <RecoveryTimeline
        rhrData={allMetrics.restingHeartRate || []}
        hrvData={allMetrics.hrv || []}
        sleepData={allSleep}
        exerciseData={allMetrics.exerciseTime}
        respData={allMetrics.respiratoryRate}
        spo2Data={allMetrics.oxygenSaturation}
        tempData={allMetrics.wristTemperature}
      />

      {/* ── HEATMAPS ── */}
      <section>
        <h2 className="section-header">Vizualizari</h2>
        <div className="space-y-4">
          <CalendarHeatmap metrics={metrics} />
          <CorrelationHeatmap metrics={metrics} />
        </div>
      </section>

      {/* ── ALL INSIGHTS ── */}
      <div className="divider" />
      {!showAllInsights ? (
        <button
          onClick={() => setShowAllInsights(true)}
          className="w-full glass p-4 text-center text-xs font-semibold text-[var(--accent)] hover:text-white cursor-pointer"
        >
          Vezi toate interpretarile →
        </button>
      ) : (
        <section className="animate-in">
          <h2 className="section-header">Toate interpretarile</h2>
          <InsightsPanel metrics={metrics} sleepNights={sleepNights} />
        </section>
      )}

      {/* ── ADDITIONAL METRICS BY CATEGORY ── */}
      {(Object.keys(CATEGORIES) as MetricCategory[]).map((cat) => {
        const keys = metricsForCategory(cat).filter(k => !keyMetrics.includes(k));
        if (keys.length === 0) return null;
        return (
          <section key={cat}>
            <h2 className="section-header flex items-center gap-2">
              <span>{CATEGORIES[cat].icon}</span> {CATEGORIES[cat].label}
              <span className="font-normal text-[var(--foreground-muted)]">({keys.length})</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 stagger-in">
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
function SleepTab({ metrics, sleepNights, allSleep }: { metrics: Record<string, DailySummary[]>; sleepNights: SleepNight[]; allSleep: SleepNight[] }) {
  return (
    <div className="space-y-6">
      <InsightsPanel metrics={metrics} sleepNights={sleepNights} filter="sleep" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SmartSleepTips metrics={metrics} sleepNights={allSleep} />
        <CircadianMap sleepNights={allSleep} />
      </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 stagger-in">
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
        <div className="glass p-12 text-center">
          <p className="text-lg mb-2 text-[var(--foreground-secondary)]">Nu sunt date disponibile</p>
          <p className="text-sm text-[var(--foreground-muted)]">Aceasta categorie nu contine date in exportul tau Apple Health.</p>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 stagger-in">
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
