import type { DailySummary, SleepNight, DataMeta } from "./healthTypes";

export interface ParseResult {
  summaries: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  meta: DataMeta;
}

type ProgressCallback = (percent: number) => void;
type CompleteCallback = (result: ParseResult) => void;
type ErrorCallback = (error: string) => void;

function getBasePath(): string {
  if (typeof window !== "undefined") {
    // Detect basePath from current URL
    const path = window.location.pathname;
    const match = path.match(/^(\/[^/]+)\//);
    if (match) return match[1];
  }
  return "";
}

/**
 * Parse Apple Health XML via Web Worker
 */
export function parseHealthXML(
  xmlText: string,
  onProgress: ProgressCallback,
  onComplete: CompleteCallback,
  onError?: ErrorCallback
): void {
  const basePath = getBasePath();
  const workerUrl = `${basePath}/workers/healthParser.worker.js`;

  let worker: Worker;
  try {
    worker = new Worker(workerUrl);
  } catch (err) {
    console.error("Failed to create worker at", workerUrl, err);
    onError?.(`Failed to load parser. URL: ${workerUrl}`);
    return;
  }

  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "progress") {
      onProgress(msg.percent);
    } else if (msg.type === "complete") {
      onComplete(msg.data);
      worker.terminate();
    } else if (msg.type === "error") {
      onError?.(msg.message);
      worker.terminate();
    }
  };

  worker.onerror = (err) => {
    console.error("Parser worker error:", err);
    onError?.(`Worker error: ${err.message}`);
    worker.terminate();
  };

  worker.postMessage({ xmlText });
}
