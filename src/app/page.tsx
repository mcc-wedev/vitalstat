"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileUpload } from "@/components/FileUpload";
import { useHealthStore } from "@/stores/healthStore";
import { hasData, getMeta, getMetricData, getSleepData } from "@/lib/db/indexedDB";
import type { DailySummary } from "@/lib/parser/healthTypes";

export default function Home() {
  const router = useRouter();
  const { hasData: storeHasData, setData, setLoading } = useHealthStore();

  // Check for existing data in IndexedDB on mount
  useEffect(() => {
    async function checkExisting() {
      const exists = await hasData();
      if (exists) {
        setLoading(true);
        const meta = await getMeta();
        if (meta) {
          const metrics: Record<string, DailySummary[]> = {};
          for (const key of meta.availableMetrics) {
            if (key === "sleepAnalysis") continue;
            metrics[key] = await getMetricData(key);
          }
          const sleep = await getSleepData();
          setData(metrics, sleep, meta);
        }
      }
    }
    checkExisting();
  }, [setData, setLoading]);

  // Redirect to dashboard when data is loaded
  useEffect(() => {
    if (storeHasData) {
      router.push("/dashboard");
    }
  }, [storeHasData, router]);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <svg className="w-10 h-10 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
          <h1 className="text-4xl font-bold tracking-tight">VitalStat</h1>
        </div>
        <p className="text-muted text-lg max-w-md mx-auto">
          Inteligenta statistica pentru sanatatea ta, din datele Apple Watch.
          <br />
          <span className="text-sm">Zero server. Datele raman pe dispozitivul tau.</span>
        </p>
      </div>

      <FileUpload />

      <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl w-full text-center">
        {[
          { icon: "♥", label: "Scor Recuperare", desc: "Ca WHOOP, gratis" },
          { icon: "📊", label: "Analiza Trenduri", desc: "Intervale de incredere + anomalii" },
          { icon: "🌙", label: "Analiza Somn", desc: "Stadii, regularitate, jet lag social" },
          { icon: "🔒", label: "100% Privat", desc: "Datele nu parasesc dispozitivul" },
        ].map((f) => (
          <div key={f.label} className="p-4">
            <div className="text-2xl mb-2">{f.icon}</div>
            <p className="text-sm font-medium">{f.label}</p>
            <p className="text-xs text-muted mt-1">{f.desc}</p>
          </div>
        ))}
      </div>

      <footer className="mt-16 text-muted text-xs">
        Cum exporti: iPhone → aplicatia Sanatate → Profil → Exporta toate datele de sanatate
      </footer>
    </main>
  );
}
