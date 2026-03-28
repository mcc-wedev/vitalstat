import { openDB, type IDBPDatabase } from "idb";
import type { DailySummary, SleepNight, DataMeta } from "../parser/healthTypes";

const DB_NAME = "vitalstat";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Store for daily metric summaries: key = "metricKey:YYYY-MM-DD"
        if (!db.objectStoreNames.contains("metrics")) {
          const store = db.createObjectStore("metrics", { keyPath: "id" });
          store.createIndex("byKey", "key");
          store.createIndex("byDate", "date");
        }
        // Store for sleep nights
        if (!db.objectStoreNames.contains("sleep")) {
          db.createObjectStore("sleep", { keyPath: "date" });
        }
        // Store for metadata
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Save parsed health data to IndexedDB
 */
export async function saveHealthData(
  summaries: Record<string, DailySummary[]>,
  sleepNights: SleepNight[],
  meta: DataMeta
): Promise<void> {
  const db = await getDB();

  // Clear existing data
  const tx1 = db.transaction(["metrics", "sleep", "meta"], "readwrite");
  await tx1.objectStore("metrics").clear();
  await tx1.objectStore("sleep").clear();
  await tx1.objectStore("meta").clear();
  await tx1.done;

  // Save metrics in batches
  const tx2 = db.transaction("metrics", "readwrite");
  const store = tx2.objectStore("metrics");
  for (const [key, days] of Object.entries(summaries)) {
    for (const day of days) {
      await store.put({
        id: `${key}:${day.date}`,
        key,
        ...day,
      });
    }
  }
  await tx2.done;

  // Save sleep
  const tx3 = db.transaction("sleep", "readwrite");
  for (const night of sleepNights) {
    await tx3.objectStore("sleep").put(night);
  }
  await tx3.done;

  // Save meta
  const tx4 = db.transaction("meta", "readwrite");
  await tx4.objectStore("meta").put({ id: "main", ...meta });
  await tx4.done;
}

/**
 * Get all daily summaries for a metric
 */
export async function getMetricData(metricKey: string): Promise<DailySummary[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("metrics", "byKey", metricKey);
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get all sleep nights
 */
export async function getSleepData(): Promise<SleepNight[]> {
  const db = await getDB();
  const all = await db.getAll("sleep");
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get metadata
 */
export async function getMeta(): Promise<DataMeta | null> {
  const db = await getDB();
  const meta = await db.get("meta", "main");
  return meta || null;
}

/**
 * Check if data exists
 */
export async function hasData(): Promise<boolean> {
  const meta = await getMeta();
  return meta !== null;
}

/**
 * Clear all stored data
 */
export async function clearData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["metrics", "sleep", "meta"], "readwrite");
  await tx.objectStore("metrics").clear();
  await tx.objectStore("sleep").clear();
  await tx.objectStore("meta").clear();
  await tx.done;
}
