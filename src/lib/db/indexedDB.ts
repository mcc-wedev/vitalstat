import { openDB, type IDBPDatabase } from "idb";
import type { DailySummary, SleepNight, DataMeta } from "../parser/healthTypes";

const DB_NAME = "vitalstat";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("metrics")) {
          const store = db.createObjectStore("metrics", { keyPath: "id" });
          store.createIndex("byKey", "key");
          store.createIndex("byDate", "date");
        }
        if (!db.objectStoreNames.contains("sleep")) {
          db.createObjectStore("sleep", { keyPath: "date" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export interface ImportDelta {
  /** Number of metric day-rows NEW in this import (not previously in DB). */
  newMetricDays: number;
  /** Number of sleep nights NEW in this import. */
  newSleepNights: number;
  /** Resulting unified date range after merge. */
  dateRange: { start: string; end: string };
}

/**
 * Save parsed health data — INCREMENTAL: merges with existing data.
 * Returns a delta describing what was actually added so the UI can
 * show "Added X new days" instead of re-reporting total records.
 */
export async function saveHealthData(
  summaries: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
  meta: DataMeta
): Promise<ImportDelta> {
  const db = await getDB();

  // Snapshot existing metric + sleep keys so we can count new rows
  const existingMetricIds = new Set<string>();
  {
    const tx = db.transaction("metrics", "readonly");
    let cursor = await tx.objectStore("metrics").openCursor();
    while (cursor) {
      existingMetricIds.add(cursor.key as string);
      cursor = await cursor.continue();
    }
    await tx.done;
  }
  const existingSleepDates = new Set<string>();
  {
    const tx = db.transaction("sleep", "readonly");
    let cursor = await tx.objectStore("sleep").openCursor();
    while (cursor) {
      existingSleepDates.add(cursor.key as string);
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  let newMetricDays = 0;
  let newSleepNights = 0;

  // Merge metrics (put = upsert, overwrites if same key:date exists)
  const tx2 = db.transaction("metrics", "readwrite");
  const store = tx2.objectStore("metrics");
  for (const [key, days] of Object.entries(summaries)) {
    for (const day of days) {
      const id = `${key}:${day.date}`;
      if (!existingMetricIds.has(id)) newMetricDays++;
      await store.put({ id, key, ...day });
    }
  }
  await tx2.done;

  // Merge sleep (put = upsert by date)
  const tx3 = db.transaction("sleep", "readwrite");
  for (const night of sleepNights) {
    if (!existingSleepDates.has(night.date)) newSleepNights++;
    await tx3.objectStore("sleep").put(night);
  }
  await tx3.done;

  // Update meta: expand date range, recalculate total record count from DB
  // (avoids over-counting on repeated imports of overlapping data).
  const existingMeta = await getMeta();
  const totalMetricRows = await db.count("metrics");
  const totalSleepRows = await db.count("sleep");
  const mergedMeta: DataMeta & { id: string } = {
    id: "main",
    importDate: meta.importDate,
    totalRecords: totalMetricRows + totalSleepRows,
    dateRange: {
      start: existingMeta
        ? meta.dateRange.start < existingMeta.dateRange.start ? meta.dateRange.start : existingMeta.dateRange.start
        : meta.dateRange.start,
      end: existingMeta
        ? meta.dateRange.end > existingMeta.dateRange.end ? meta.dateRange.end : existingMeta.dateRange.end
        : meta.dateRange.end,
    },
    availableMetrics: [
      ...new Set([
        ...(existingMeta?.availableMetrics || []),
        ...meta.availableMetrics,
      ]),
    ],
  };

  const tx4 = db.transaction("meta", "readwrite");
  await tx4.objectStore("meta").put(mergedMeta);
  await tx4.done;

  return { newMetricDays, newSleepNights, dateRange: mergedMeta.dateRange };
}

export async function getMetricData(metricKey: string): Promise<DailySummary[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("metrics", "byKey", metricKey);
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getSleepData(): Promise<SleepNight[]> {
  const db = await getDB();
  const all = await db.getAll("sleep");
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getMeta(): Promise<DataMeta | null> {
  const db = await getDB();
  const meta = await db.get("meta", "main");
  return meta || null;
}

export async function hasData(): Promise<boolean> {
  const meta = await getMeta();
  return meta !== null;
}

export async function clearData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["metrics", "sleep", "meta"], "readwrite");
  await tx.objectStore("metrics").clear();
  await tx.objectStore("sleep").clear();
  await tx.objectStore("meta").clear();
  await tx.done;
}

/**
 * Export all data as JSON string (for cross-device transfer)
 */
export async function exportAllData(): Promise<string> {
  const meta = await getMeta();
  if (!meta) return "{}";

  const metrics: Record<string, DailySummary[]> = {};
  for (const key of meta.availableMetrics) {
    if (key === "sleepAnalysis") continue;
    metrics[key] = await getMetricData(key);
  }
  const sleep = await getSleepData();

  return JSON.stringify({ metrics, sleepNights: sleep, meta }, null, 0);
}

/**
 * Import data from JSON string (from another device)
 */
export async function importFromJSON(jsonStr: string): Promise<{
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  meta: DataMeta;
}> {
  const data = JSON.parse(jsonStr);
  if (!data.meta || !data.metrics) throw new Error("Format JSON invalid");
  await saveHealthData(data.metrics, data.sleepNights || [], data.meta);
  return data;
}
