"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHealthStore, type DashboardTab } from "@/stores/healthStore";
import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";
import { SleepChart } from "@/components/SleepChart";
import { RecoveryScoreDisplay } from "@/components/RecoveryScore";
import { InsightsPanel } from "@/components/InsightsPanel";
import { clearData } from "@/lib/db/indexedDB";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";

const TABS: { key: DashboardTab; label: string }[] = [
  { key: "overview", label: "Sumar" },
  { key: "cardio", label: "Cardiovascular" },
  { key: "sleep", label: "Somn" },
  { key: "activity", label: "Activitate" },
  { key: "recovery", label: "Recuperare" },
];

export default function Dashboard() {
  const router = useRouter();
  const {
    hasData,
    metrics,
    sleepNights,
    meta,
    activeTab,
    setActiveTab,
    clearData: clearStore,
  } = useHealthStore();

  useEffect(() => {
    if (!hasData) {
      router.push("/");
    }
  }, [hasData, router]);

  if (!hasData || !meta) return null;

  const handleReset = async () => {
    await clearData();
    clearStore();
    router.push("/");
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-card-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg
            className="w-6 h-6 text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
            />
          </svg>
          <h1 className="text-lg font-bold">VitalStat</h1>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted">
          <span>
            {meta.totalRecords.toLocaleString()} records ·{" "}
            {meta.dateRange.start} → {meta.dateRange.end}
          </span>
          <button
            onClick={handleReset}
            className="text-danger/70 hover:text-danger transition-colors"
          >
            Sterge datele
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-card-border px-4 flex gap-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        {activeTab === "overview" && (
          <OverviewTab metrics={metrics} sleepNights={sleepNights} />
        )}
        {activeTab === "cardio" && (
          <CardioTab metrics={metrics} sleepNights={sleepNights} />
        )}
        {activeTab === "sleep" && (
          <SleepTab metrics={metrics} sleepNights={sleepNights} />
        )}
        {activeTab === "activity" && (
          <ActivityTab metrics={metrics} sleepNights={sleepNights} />
        )}
        {activeTab === "recovery" && (
          <RecoveryTab metrics={metrics} sleepNights={sleepNights} />
        )}
      </main>
    </div>
  );
}

// --- Tab Components ---

type TabProps = {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
};

function OverviewTab({ metrics, sleepNights }: TabProps) {
  const overviewMetrics = [
    "restingHeartRate",
    "hrv",
    "oxygenSaturation",
    "stepCount",
    "activeEnergy",
    "exerciseTime",
    "bodyMass",
    "vo2Max",
  ].filter((k) => metrics[k]?.length > 0);

  return (
    <div className="space-y-6">
      {/* Insights — most important, at the top */}
      <div>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-3">
          Interpretari cheie
        </h2>
        <InsightsPanel
          metrics={metrics}
          sleepNights={sleepNights}
          maxItems={6}
        />
      </div>

      {/* Recovery score */}
      <RecoveryScoreDisplay
        rhrData={metrics.restingHeartRate || []}
        hrvData={metrics.hrv || []}
        sleepData={sleepNights}
      />

      {/* Metric cards grid */}
      <div>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-3">
          Metrici la o privire
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {overviewMetrics.map((key) => (
            <MetricCard key={key} metricKey={key} data={metrics[key]} />
          ))}
        </div>
      </div>

      {/* Key trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {metrics.restingHeartRate?.length > 0 && (
          <TrendChart
            metricKey="restingHeartRate"
            data={metrics.restingHeartRate}
          />
        )}
        {metrics.hrv?.length > 0 && (
          <TrendChart metricKey="hrv" data={metrics.hrv} />
        )}
      </div>
    </div>
  );
}

function CardioTab({ metrics, sleepNights }: TabProps) {
  const cardioMetrics = [
    "restingHeartRate",
    "hrv",
    "oxygenSaturation",
    "walkingHeartRateAverage",
    "vo2Max",
    "respiratoryRate",
  ].filter((k) => metrics[k]?.length > 0);

  return (
    <div className="space-y-6">
      <InsightsPanel
        metrics={metrics}
        sleepNights={sleepNights}
        filter="cardio"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cardioMetrics.map((key) => (
          <MetricCard key={key} metricKey={key} data={metrics[key]} />
        ))}
      </div>

      {cardioMetrics.map((key) => (
        <TrendChart key={key} metricKey={key} data={metrics[key]} />
      ))}
    </div>
  );
}

function SleepTab({ metrics, sleepNights }: TabProps) {
  return (
    <div className="space-y-6">
      <InsightsPanel
        metrics={metrics}
        sleepNights={sleepNights}
        filter="sleep"
      />

      <SleepChart data={sleepNights} days={30} />
    </div>
  );
}

function ActivityTab({ metrics, sleepNights }: TabProps) {
  const activityMetrics = [
    "stepCount",
    "activeEnergy",
    "exerciseTime",
    "distance",
    "flightsClimbed",
  ].filter((k) => metrics[k]?.length > 0);

  return (
    <div className="space-y-6">
      <InsightsPanel
        metrics={metrics}
        sleepNights={sleepNights}
        filter="activity"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {activityMetrics.map((key) => (
          <MetricCard key={key} metricKey={key} data={metrics[key]} />
        ))}
      </div>
      {activityMetrics.slice(0, 3).map((key) => (
        <TrendChart key={key} metricKey={key} data={metrics[key]} />
      ))}
    </div>
  );
}

function RecoveryTab({ metrics, sleepNights }: TabProps) {
  return (
    <div className="space-y-6">
      <InsightsPanel
        metrics={metrics}
        sleepNights={sleepNights}
        filter="recovery"
      />

      <RecoveryScoreDisplay
        rhrData={metrics.restingHeartRate || []}
        hrvData={metrics.hrv || []}
        sleepData={sleepNights}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {metrics.restingHeartRate?.length > 0 && (
          <TrendChart
            metricKey="restingHeartRate"
            data={metrics.restingHeartRate}
            days={180}
          />
        )}
        {metrics.hrv?.length > 0 && (
          <TrendChart metricKey="hrv" data={metrics.hrv} days={180} />
        )}
      </div>

      {/* Correlation insights */}
      <div>
        <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-3">
          Corelatii in datele tale
        </h2>
        <InsightsPanel
          metrics={metrics}
          sleepNights={sleepNights}
          filter="correlation"
        />
      </div>

      <div className="bg-card border border-card-border rounded-xl p-4">
        <h3 className="text-sm font-medium mb-3">
          Cum functioneaza Scorul de Recuperare
        </h3>
        <div className="text-xs text-muted space-y-2">
          <p>
            <strong className="text-foreground">HRV (40%):</strong> Variabilitatea
            pulsului relativa la baseline-ul tau pe 30 zile. Mai mare =
            tonus parasimpatic mai bun = recuperare mai buna.
          </p>
          <p>
            <strong className="text-foreground">Puls repaus (30%):</strong>{" "}
            Deviatie de la baseline-ul personal. Mai scazut decat de obicei = bine.
            Ridicat = stres, boala, sau overtraining.
          </p>
          <p>
            <strong className="text-foreground">Somn (30%):</strong>{" "}
            Combina eficienta somnului, durata (7-9h optim), si procentul
            de somn profund (&gt;15% tinta).
          </p>
          <p className="text-muted/70 pt-2">
            Minimum 14 zile de date necesare. Toate valorile sunt z-scored
            fata de baseline-ul tau personal — nu norme populationale.
          </p>
        </div>
      </div>
    </div>
  );
}
