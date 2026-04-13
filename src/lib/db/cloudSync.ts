/**
 * Cloud Sync — pulls health data from Supabase (pushed by Health Auto Export webhook)
 *
 * Flow:
 * 1. Health Auto Export iOS app → sends data daily → Supabase Edge Function
 * 2. Edge Function aggregates and stores in vs_health_metrics / vs_sleep_nights
 * 3. VitalStat pulls from Supabase on app open → merges with IndexedDB
 */

import { saveHealthData, getMeta } from "./indexedDB";
import type { DailySummary, SleepNight, DataMeta } from "../parser/healthTypes";

const SUPABASE_URL = "https://kvyrvzxidbsfcozgjcwb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2eXJ2enhpZGJzZmNvemdqY3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NzI4MzgsImV4cCI6MjA4NzE0ODgzOH0.gXe9ziS2TVC0zw0AJl5vdz8KcP0HoSkzWWLWA0eKqLQ";

const STORAGE_KEY = "vitalstat-cloud-sync";

export interface CloudSyncConfig {
  enabled: boolean;
  lastPullAt: string | null;
}

export function getCloudConfig(): CloudSyncConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, lastPullAt: null };
}

export function setCloudConfig(config: CloudSyncConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

async function supabaseGet(table: string, params: string = ""): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status}`);
  return res.json();
}

export interface SyncResult {
  newMetrics: number;
  newSleep: number;
  dateRange: { start: string; end: string } | null;
  error?: string;
}

/**
 * Pull latest data from Supabase and merge into IndexedDB.
 * Only fetches records newer than last pull (incremental).
 */
export async function pullFromCloud(forceFull = false): Promise<SyncResult> {
  const config = getCloudConfig();

  // Check if there's any data in Supabase first
  const meta = await supabaseGet("vs_sync_meta", "id=eq.main&select=last_webhook_at,total_pushes");
  if (!meta.length || !meta[0].last_webhook_at) {
    return { newMetrics: 0, newSleep: 0, dateRange: null, error: "Nicio sincronizare primita inca de la Health Auto Export" };
  }

  // Build date filter for incremental sync
  let dateFilter = "";
  if (!forceFull && config.lastPullAt) {
    dateFilter = `&updated_at=gte.${config.lastPullAt}`;
  }

  // Fetch metrics
  const rawMetrics = await supabaseGet(
    "vs_health_metrics",
    `select=metric_key,date,mean,min,max,sum,count,stddev${dateFilter}&order=date.asc&limit=10000`
  );

  // Fetch sleep
  const rawSleep = await supabaseGet(
    "vs_sleep_nights",
    `select=*${dateFilter}&order=date.asc&limit=1000`
  );

  if (rawMetrics.length === 0 && rawSleep.length === 0) {
    return { newMetrics: 0, newSleep: 0, dateRange: null };
  }

  // Convert to VitalStat format
  const summaries: Record<string, DailySummary[]> = {};
  let minDate = "9999-99-99";
  let maxDate = "0000-00-00";
  const availableMetrics = new Set<string>();

  for (const row of rawMetrics) {
    const key = row.metric_key;
    const date = row.date;
    if (!summaries[key]) summaries[key] = [];
    summaries[key].push({
      date,
      mean: row.mean,
      min: row.min,
      max: row.max,
      sum: row.sum,
      count: row.count,
      stddev: row.stddev,
    });
    availableMetrics.add(key);
    if (date < minDate) minDate = date;
    if (date > maxDate) maxDate = date;
  }

  const sleepNights: SleepNight[] = rawSleep.map((row: any) => {
    const deep = row.deep_min || 0;
    const core = row.core_min || 0;
    const rem = row.rem_min || 0;
    const awake = row.awake_min || 0;
    const totalSleep = deep + core + rem;
    const inBed = row.duration > totalSleep ? row.duration : totalSleep + awake;
    return {
      date: row.date,
      totalMinutes: totalSleep,
      inBedMinutes: inBed,
      stages: { deep, core, rem, awake },
      efficiency: row.efficiency || (inBed > 0 ? totalSleep / inBed : 0),
      sleepMidpoint: row.midpoint || 0,
      bedtime: row.bedtime || "",
      wakeTime: row.waketime || "",
      segments: row.segments || [],
    };
  });

  for (const n of sleepNights) {
    availableMetrics.add("sleepAnalysis");
    if (n.date < minDate) minDate = n.date;
    if (n.date > maxDate) maxDate = n.date;
  }

  if (minDate === "9999-99-99") {
    return { newMetrics: 0, newSleep: 0, dateRange: null };
  }

  // Merge with existing data in IndexedDB
  const dataMeta: DataMeta = {
    importDate: new Date().toISOString(),
    totalRecords: rawMetrics.length + rawSleep.length,
    dateRange: { start: minDate, end: maxDate },
    availableMetrics: Array.from(availableMetrics),
  };

  const delta = await saveHealthData(summaries, sleepNights, dataMeta);

  // Update last pull timestamp
  setCloudConfig({ enabled: true, lastPullAt: new Date().toISOString() });

  return {
    newMetrics: delta.newMetricDays,
    newSleep: delta.newSleepNights,
    dateRange: delta.dateRange,
  };
}

/**
 * Get webhook URL + token for Health Auto Export setup
 */
export async function getWebhookInfo(): Promise<{ url: string; token: string } | null> {
  try {
    const meta = await supabaseGet("vs_sync_meta", "id=eq.main&select=api_token");
    if (!meta.length) return null;
    return {
      url: `${SUPABASE_URL}/functions/v1/vitalstat-webhook`,
      token: meta[0].api_token,
    };
  } catch {
    return null;
  }
}
