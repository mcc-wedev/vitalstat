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
              {/* Force Refresh Button */}
              <button
                onClick={async () => {
                  try {
                    const reg = await navigator.serviceWorker?.getRegistration();
                    if (reg) await reg.update();
                  } catch {}
                  try {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                  } catch {}
                  window.location.reload();
                }}
                className="pill text-[13px] flex items-center gap-1.5"
                title="Actualizeaza"
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
        <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-5 py-4 sm:py-6">
          <DailyReport date={dailyDate} metrics={metrics} sleepNights={sleepNights} />
        </main>
      ) : (
        <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-5 py-4 sm:py-6">
          {activeTab === "overview" && (
            <OverviewTab metrics={filteredMetrics} sleepNights={filteredSleep} allMetrics={metrics} allSleep={sleepNights} metricsForCategory={metricsForCategory} datePreset={datePreset} />
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
function OneBigThing({ metrics, sleepNights }: { metrics: Record<string, DailySummary[]>; sleepNights: SleepNight[] }) {
  const insight = useMemo(() => {
    // Find the most impactful metric change
    const checks = [
      { key: "hrv", label: "HRV", higherBetter: true },
      { key: "restingHeartRate", label: "Pulsul de repaus", higherBetter: false },
      { key: "oxygenSaturation", label: "SpO2", higherBetter: true },
    ];
    let best: { text: string; color: string; icon: string } | null = null;
    let maxChange = 0;

    for (const { key, label, higherBetter } of checks) {
      const d = metrics[key];
      if (!d || d.length < 7) continue;
      const last7 = d.slice(-7);
      const prev7 = d.slice(-14, -7);
      if (prev7.length < 3) continue;
      const avgLast = last7.reduce((s, x) => s + (x.mean || 0), 0) / last7.length;
      const avgPrev = prev7.reduce((s, x) => s + (x.mean || 0), 0) / prev7.length;
      if (avgPrev === 0) continue;
      const pct = ((avgLast - avgPrev) / avgPrev) * 100;
      if (Math.abs(pct) > Math.abs(maxChange)) {
        maxChange = pct;
        const improved = (pct > 0 && higherBetter) || (pct < 0 && !higherBetter);
        best = {
          text: `${label} ${pct > 0 ? "a crescut" : "a scazut"} cu ${Math.abs(pct).toFixed(1)}% fata de saptamana anterioara`,
          color: improved ? "#10b981" : "#ef4444",
          icon: improved ? "\u2191" : "\u2193",
        };
      }
    }

    if (!best && sleepNights.length >= 7) {
      const last7 = sleepNights.slice(-7);
      const avgDur = last7.reduce((s, n) => s + (n.totalMinutes || 0), 0) / last7.length / 60;
      best = {
        text: `Media somnului in ultimele 7 nopti: ${avgDur.toFixed(1)} ore`,
        color: avgDur >= 7 ? "#10b981" : avgDur >= 6 ? "#f59e0b" : "#ef4444",
        icon: avgDur >= 7 ? "\u2713" : "\u26a0\ufe0f",
      };
    }

    return best;
  }, [metrics, sleepNights]);

  if (!insight) return null;

  return (
    <div className="glass p-5 sm:p-6">
      <p className="text-[13px] mb-3" style={{ color: "rgba(235,235,245,0.3)" }}>Cel mai important lucru</p>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{insight.icon}</span>
        <p className="text-[17px] font-normal leading-relaxed" style={{ color: "rgba(235,235,245,0.6)" }}>{insight.text}</p>
      </div>
    </div>
  );
}

function LongTermTrends({ metrics }: { metrics: Record<string, DailySummary[]> }) {
  const trends = useMemo(() => {
    const checks = [
      { key: "restingHeartRate", label: "Puls repaus", unit: "bpm", higherBetter: false },
      { key: "hrv", label: "HRV", unit: "ms", higherBetter: true },
      { key: "stepCount", label: "Pasi", unit: "", higherBetter: true },
    ];
    const results: { label: string; current: number; previous: number; unit: string; pctChange: number; improved: boolean }[] = [];

    for (const { key, label, unit, higherBetter } of checks) {
      const d = metrics[key];
      if (!d || d.length < 14) continue;
      const last7 = d.slice(-7);
      const prev7 = d.slice(-14, -7);
      if (prev7.length < 3) continue;
      const avgLast = last7.reduce((s, x) => s + (x.mean || 0), 0) / last7.length;
      const avgPrev = prev7.reduce((s, x) => s + (x.mean || 0), 0) / prev7.length;
      if (avgPrev === 0) continue;
      const pct = ((avgLast - avgPrev) / avgPrev) * 100;
      results.push({
        label,
        current: avgLast,
        previous: avgPrev,
        unit,
        pctChange: pct,
        improved: (pct > 0 && higherBetter) || (pct < 0 && !higherBetter),
      });
    }
    return results;
  }, [metrics]);

  if (trends.length === 0) return null;

  return (
    <section>
      <h2 className="section-header">Tendinte pe termen lung \u00b7 7d vs 7d anterioare</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {trends.map((t) => (
          <div key={t.label} className="glass p-4 sm:p-5">
            <p className="text-[13px] mb-2" style={{ color: "rgba(235,235,245,0.3)" }}>{t.label}</p>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-[28px] font-bold tabular-nums">{t.current.toFixed(0)}</span>
              {t.unit && <span className="text-[15px]" style={{ color: "rgba(235,235,245,0.6)" }}>{t.unit}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] tabular-nums" style={{ color: t.improved ? "#34C759" : "#FF3B30" }}>
                {t.pctChange > 0 ? "+" : ""}{t.pctChange.toFixed(1)}%
              </span>
              <span className="text-[11px]" style={{ color: "rgba(235,235,245,0.3)" }}>
                de la {t.previous.toFixed(0)} {t.unit}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

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

  // Compute target date for recovery based on selected period
  const recoveryTargetDate = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
    if (datePreset === "today") return today;
    if (datePreset === "yesterday") return yesterday;
    const allDates = Object.values(metrics).flatMap(arr => arr.map(d => d.date));
    return allDates.sort().pop() || today;
  }, [datePreset, metrics]);

  // Period label for display
  const periodLabel = useMemo(() => {
    const labels: Record<string, string> = {
      today: "Azi", yesterday: "Ieri", "7d": "7 zile", "14d": "14 zile",
      "30d": "30 zile", "90d": "90 zile", "6m": "6 luni", "1y": "1 an", all: "Tot"
    };
    return labels[datePreset] || "30 zile";
  }, [datePreset]);

  const keyMetrics = ["restingHeartRate", "hrv", "oxygenSaturation", "vo2Max", "stepCount", "activeEnergy", "exerciseTime", "bodyMass"]
    .filter(k => metrics[k]?.length > 0);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── HERO: Recovery Score ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2">
          <HeroScore
            rhrData={allMetrics.restingHeartRate || []}
            hrvData={allMetrics.hrv || []}
            sleepData={allSleep}
            exerciseData={allMetrics.exerciseTime}
            respData={allMetrics.respiratoryRate}
            spo2Data={allMetrics.oxygenSaturation}
            tempData={allMetrics.wristTemperature}
            targetDate={recoveryTargetDate}
          />
        </div>
        <div className="lg:col-span-3 glass p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[17px] font-normal text-white">Ce trebuie sa stii</h3>
            <span className="badge badge-info">{periodLabel}</span>
          </div>
          <InsightsPanel metrics={metrics} sleepNights={sleepNights} maxItems={4} compact />
        </div>
      </div>

      {/* ── ONE BIG THING ── */}
      <OneBigThing metrics={metrics} sleepNights={sleepNights} />

      {/* ── LONG-TERM TRENDS ── */}
      <LongTermTrends metrics={metrics} />

      {/* ── KEY METRICS GRID ── */}
      <section>
        <h2 className="section-header">Metrici principale &middot; {periodLabel}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-in">
          {keyMetrics.map((key) => (
            <MetricCard key={key} metricKey={key} data={metrics[key]} />
          ))}
        </div>
      </section>

      {/* ── ALERTS (only when issues detected) ── */}
      <TrendAlerts metrics={metrics} sleepNights={sleepNights} />
      <RecoveryPrediction metrics={allMetrics} sleepNights={allSleep} targetDate={recoveryTargetDate} />

      {/* ── DIVIDER ── */}
      <div className="divider" />

      {/* ── TRAINING & AGING ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <StrainCoach metrics={metrics} sleepNights={sleepNights} />
        <BiologicalAge metrics={metrics} sleepNights={sleepNights} />
      </div>

      {/* ── TREND CHARTS ── */}
      <section>
        <h2 className="section-header">Trenduri cheie &middot; {periodLabel}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {metrics.restingHeartRate?.length > 0 && <TrendChart metricKey="restingHeartRate" data={metrics.restingHeartRate} />}
          {metrics.hrv?.length > 0 && <TrendChart metricKey="hrv" data={metrics.hrv} />}
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div className="divider" />

      {/* ── DAILY PERFORMANCE ── */}
      <section>
        <h2 className="section-header">Performanta zilnica &middot; {periodLabel}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <GoalsTracker metrics={metrics} sleepNights={sleepNights} />
          <WeeklyDigest metrics={metrics} sleepNights={sleepNights} />
        </div>
      </section>

      {/* ── DEEP ANALYSIS ── */}
      <section>
        <h2 className="section-header">Analiza aprofundata &middot; {periodLabel}</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ResilienceScore metrics={metrics} sleepNights={sleepNights} />
          <StabilityScores metrics={metrics} sleepNights={sleepNights} />
          <SleepBank sleepNights={sleepNights} />
        </div>
      </section>

      {/* ── BEHAVIOR & TRENDS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <BehaviorJournal metrics={metrics} sleepNights={sleepNights} />
        <MonthlyRecap metrics={metrics} sleepNights={sleepNights} />
      </div>

      {/* ── DIVIDER ── */}
      <div className="divider" />

      {/* ── SIMULATORS ── */}
      <section>
        <h2 className="section-header">Simulari & Comparatii</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <WhatIfSimulator metrics={metrics} sleepNights={sleepNights} />
          <AgeBenchmark metrics={metrics} />
        </div>
      </section>

      {/* ── TIMELINE ── */}
      <RecoveryTimeline
        rhrData={metrics.restingHeartRate || []}
        hrvData={metrics.hrv || []}
        sleepData={sleepNights}
        exerciseData={metrics.exerciseTime}
        respData={metrics.respiratoryRate}
        spo2Data={metrics.oxygenSaturation}
        tempData={metrics.wristTemperature}
      />

      {/* ── HEATMAPS ── */}
      <section>
        <h2 className="section-header">Vizualizari</h2>
        <div className="space-y-5">
          <CalendarHeatmap metrics={metrics} />
          <CorrelationHeatmap metrics={metrics} />
        </div>
      </section>

      {/* ── ALL INSIGHTS ── */}
      <div className="divider" />
      {!showAllInsights ? (
        <button
          onClick={() => setShowAllInsights(true)}
          className="w-full glass p-5 text-center text-[15px] font-normal cursor-pointer"
          style={{ color: "#007AFF" }}
        >
          Vezi toate interpretarile {"\u2192"}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 stagger-in">
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
      <h2 className="section-header flex items-center gap-2">
        <span>🌙</span> Somn
        <span className="text-[15px] font-normal" style={{ color: "rgba(235,235,245,0.3)" }}>({sleepNights.length} nopti)</span>
      </h2>

      {/* Sleep chart first — most visual */}
      <SleepChart data={sleepNights} days={sleepNights.length} />

      {/* Insights */}
      <InsightsPanel metrics={metrics} sleepNights={sleepNights} filter="sleep" />

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
  category, metrics, sleepNights, availableKeys,
}: {
  category: MetricCategory;
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
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

      {/* Insights for this category */}
      <InsightsPanel metrics={metrics} sleepNights={sleepNights} filter={category === "body" ? undefined : category} />
      {category === "body" && <InsightsPanel metrics={metrics} sleepNights={sleepNights} filter="nutrition" />}

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
