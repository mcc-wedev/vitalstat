import type { DailySummary, SleepNight, DataMeta } from "./healthTypes";

export interface ParseResult {
  summaries: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
  meta: DataMeta;
}

type ProgressCallback = (percent: number) => void;
type CompleteCallback = (result: ParseResult) => void;

/**
 * Parse Apple Health XML via Web Worker
 */
export function parseHealthXML(
  xmlText: string,
  onProgress: ProgressCallback,
  onComplete: CompleteCallback
): void {
  const worker = new Worker(
    `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/workers/healthParser.worker.js`
  );

  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "progress") {
      onProgress(msg.percent);
    } else if (msg.type === "complete") {
      onComplete(msg.data);
      worker.terminate();
    }
  };

  worker.onerror = (err) => {
    console.error("Parser worker error:", err);
    worker.terminate();
  };

  worker.postMessage({ xmlText });
}
