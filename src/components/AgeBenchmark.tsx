"use client";

import { useMemo } from "react";
import type { DailySummary } from "@/lib/parser/healthTypes";
import { meanStd } from "@/lib/stats/zScore";
import { useProfile } from "@/lib/useProfile";

interface Props {
  metrics: Record<string, DailySummary[]>;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  AGE BENCHMARK — personalized cohort comparison
 *
 *  Takes the user's age from the profile (reactive via useProfile)
 *  and ranks their last-30-day averages against published norms
 *  for that exact age bracket.
 *
 *  Key design decisions (2026-04 rewrite):
 *   - No more manual age-group dropdown. The cohort is derived
 *     from profile.age so the numbers actually mean something.
 *   - Every metric produces its own qualitative narrative, not a
 *     templated "Excelent/Peste medie" label copy-pasted across
 *     rows. The narrative is built from (value × bracket × metric)
 *     so switching age brackets actually produces different prose.
 *   - Falls back to a soft prompt if profile is not set yet.
 *
 *  Norms (percentile references):
 *   RHR — Palatini 2006, NHANES (Ostchega 2011)
 *   HRV (RMSSD) — Nunan 2010, Voss 2015
 *   VO2 Max — Kodama 2009, ACSM 2021
 *   Steps — Tudor-Locke 2011
 * ═══════════════════════════════════════════════════════════════
 */

type Bracket = "20-29" | "30-39" | "40-49" | "50-59" | "60+";

const NORMS: Record<
  string,
  {
    label: string;
    unit: string;
    higherIsBetter: boolean;
    useSum: boolean;
    ranges: Record<Bracket, { p25: number; p50: number; p75: number; p90: number }>;
  }
> = {
  restingHeartRate: {
    label: "Puls in repaus",
    unit: "bpm",
    higherIsBetter: false,
    useSum: false,
    ranges: {
      "20-29": { p25: 57, p50: 64, p75: 71, p90: 78 },
      "30-39": { p25: 58, p50: 65, p75: 73, p90: 80 },
      "40-49": { p25: 59, p50: 66, p75: 74, p90: 81 },
      "50-59": { p25: 60, p50: 68, p75: 76, p90: 83 },
      "60+":   { p25: 58, p50: 67, p75: 76, p90: 84 },
    },
  },
  hrv: {
    label: "HRV (RMSSD)",
    unit: "ms",
    higherIsBetter: true,
    useSum: false,
    ranges: {
      "20-29": { p25: 30, p50: 42, p75: 60, p90: 80 },
      "30-39": { p25: 24, p50: 35, p75: 50, p90: 68 },
      "40-49": { p25: 18, p50: 28, p75: 42, p90: 58 },
      "50-59": { p25: 14, p50: 22, p75: 35, p90: 48 },
      "60+":   { p25: 10, p50: 18, p75: 28, p90: 40 },
    },
  },
  vo2Max: {
    label: "VO2 Max",
    unit: "ml/kg/min",
    higherIsBetter: true,
    useSum: false,
    ranges: {
      "20-29": { p25: 35, p50: 40, p75: 47, p90: 53 },
      "30-39": { p25: 32, p50: 37, p75: 44, p90: 50 },
      "40-49": { p25: 29, p50: 35, p75: 41, p90: 47 },
      "50-59": { p25: 26, p50: 32, p75: 38, p90: 44 },
      "60+":   { p25: 22, p50: 28, p75: 34, p90: 40 },
    },
  },
  stepCount: {
    label: "Pasi zilnici",
    unit: "pasi",
    higherIsBetter: true,
    useSum: true,
    ranges: {
      "20-29": { p25: 5500, p50: 7500, p75: 10000, p90: 13000 },
      "30-39": { p25: 5000, p50: 7000, p75: 9500,  p90: 12000 },
      "40-49": { p25: 4500, p50: 6500, p75: 9000,  p90: 11500 },
      "50-59": { p25: 4000, p50: 6000, p75: 8500,  p90: 11000 },
      "60+":   { p25: 3000, p50: 5000, p75: 7000,  p90: 9500  },
    },
  },
};

function bracketForAge(age: number): Bracket {
  if (age < 30) return "20-29";
  if (age < 40) return "30-39";
  if (age < 50) return "40-49";
  if (age < 60) return "50-59";
  return "60+";
}

function percentile(
  value: number,
  range: { p25: number; p50: number; p75: number; p90: number },
  higherIsBetter: boolean,
): number {
  // Linear interpolation between published anchor points.
  // Clamps at p5 and p95 so extreme values don't blow up.
  const { p25, p50, p75, p90 } = range;
  const interp = (v: number, lo: number, hi: number, pLo: number, pHi: number) => {
    if (hi === lo) return pLo;
    return pLo + ((v - lo) / (hi - lo)) * (pHi - pLo);
  };

  if (higherIsBetter) {
    if (value <= p25) return Math.max(5, interp(value, p25 * 0.7, p25, 5, 25));
    if (value <= p50) return interp(value, p25, p50, 25, 50);
    if (value <= p75) return interp(value, p50, p75, 50, 75);
    if (value <= p90) return interp(value, p75, p90, 75, 90);
    return Math.min(99, interp(value, p90, p90 * 1.25, 90, 99));
  }
  // Lower-is-better (RHR)
  if (value >= p90) return Math.max(5, interp(value, p90 * 1.2, p90, 5, 25));
  if (value >= p75) return interp(value, p90, p75, 25, 50);
  if (value >= p50) return interp(value, p75, p50, 50, 75);
  if (value >= p25) return interp(value, p50, p25, 75, 90);
  return Math.min(99, interp(value, p25, p25 * 0.8, 90, 99));
}

/**
 * Builds a qualitative, metric-specific narrative for a single
 * benchmark row. Returns different prose for each combination of
 * (metric × bracket × percentile range) instead of the old
 * "Excelent/Peste medie" ladder that was identical across metrics.
 */
function interpretation(
  key: string,
  bracket: Bracket,
  value: number,
  pct: number,
  p50: number,
  p75: number,
): string {
  const gap = (ref: number, v: number) => Math.abs(v - ref);

  if (key === "restingHeartRate") {
    if (pct >= 85) {
      return `${Math.round(value)} bpm — un puls atat de scazut la ${bracket} ani apare la sub 15% din populatie. Reflecta volum de slow-twitch crescut si tonus parasimpatic puternic. Tipic pentru cine face volum constant in zona 2.`;
    }
    if (pct >= 65) {
      return `${Math.round(value)} bpm — cu ~${Math.round(gap(p50, value))} bpm sub mediana pentru ${bracket} ani. Inima ta pompeaza mai mult per bataie (volum sistolic bun). Continua volumul aerob, recuperarea evident functioneaza.`;
    }
    if (pct >= 40) {
      return `${Math.round(value)} bpm — aproximativ in mediana pentru ${bracket} ani. Nu e un semn de alarma, dar 8-12 saptamani de zona 2 (3x30min) ar putea cobori ~5 bpm.`;
    }
    if (pct >= 20) {
      return `${Math.round(value)} bpm — peste mediana de ${Math.round(p50)} bpm pentru ${bracket} ani. Cauze tipice la cineva din aceasta grupa de varsta: somn fragmentat, cofeina tarzie, sau lipsa de volum aerob. Test concret: 4 saptamani fara cofeina dupa ora 14.`;
    }
    return `${Math.round(value)} bpm — semnificativ peste cohorta ${bracket} ani (mediana ~${Math.round(p50)}). Combinatia varsta + puls ridicat e factor de risc cardiovascular independent (Palatini 2006). Prioritate: check-up si zona 2 structurata.`;
  }

  if (key === "hrv") {
    if (pct >= 85) {
      return `${Math.round(value)} ms — un HRV de top 15% pentru ${bracket} ani. Sistemul tau autonom e mai tanar decat varsta cronologica. Rezerva de recuperare mare — poti absorbi stres (antrenament, viata) fara sa platesti scump.`;
    }
    if (pct >= 65) {
      return `${Math.round(value)} ms — peste mediana de ${Math.round(p50)} ms pentru ${bracket} ani. HRV scade natural ~0.5ms/an dupa 30 ani (Umetani 1998), dar tu mergi invers. Semn bun ca ritmul circadian si somnul functioneaza.`;
    }
    if (pct >= 40) {
      return `${Math.round(value)} ms — in zona mediana pentru ${bracket} ani. Nu te compara cu atleti de pe retele: HRV e foarte individual. Focus pe delta personal (cresc/scad fata de propria mea medie), nu pe cifra absoluta.`;
    }
    if (pct >= 20) {
      return `${Math.round(value)} ms — sub mediana cohortei ${bracket} ani (${Math.round(p50)} ms). Cele 3 parghii cu cel mai mare impact la varsta ta: (1) regularitate bedtime ±30 min, (2) reducere alcool seara, (3) zona 2 in loc de HIIT.`;
    }
    return `${Math.round(value)} ms — HRV-ul tau e in sfertul inferior pentru ${bracket} ani. Asta nu e o sentinta — e o oportunitate: in 8-12 saptamani de somn consistent + aerob usor, ai cel mai mult de castigat.`;
  }

  if (key === "vo2Max") {
    if (pct >= 85) {
      return `${value.toFixed(1)} mL/kg/min — in top 15% pentru ${bracket} ani. VO2 Max e cel mai puternic predictor singular al mortalitatii (Kodama 2009). La acest nivel, un MET in plus vs media = ~13% mai putin risc cardiovascular — tu ai mai multi.`;
    }
    if (pct >= 65) {
      return `${value.toFixed(1)} mL/kg/min — peste mediana (${p50}) pentru ${bracket} ani. Asta cumparare ~3-5 ani de "varsta biologica cardiovasculara". Pentru a mai castiga: 1x/saptamana intervale 4x4 min la 90% HRmax adauga rapid.`;
    }
    if (pct >= 40) {
      return `${value.toFixed(1)} mL/kg/min — mediana cohortei ${bracket}. "Media" aici inseamna de fapt sub-optimal — mediana populatiei generale e deja decondtionata. Orice progres aici conteaza direct in longevitate.`;
    }
    if (pct >= 20) {
      return `${value.toFixed(1)} mL/kg/min — sub mediana (${p50}) pentru ${bracket} ani. Vestea buna: VO2 Max raspunde rapid la antrenament. 3x45min zona 2 pe saptamana + 1 sesiune intervale = +10-15% in 8 saptamani pentru incepatori.`;
    }
    return `${value.toFixed(1)} mL/kg/min — in sfertul inferior pentru ${bracket} ani. La acest nivel, fiecare mL/kg/min castigat are impact masurabil pe calitatea vietii (scari, geanta, caruciorul la aeroport). Start simplu: 20 min mers alert zilnic.`;
  }

  if (key === "stepCount") {
    if (pct >= 85) {
      return `${Math.round(value).toLocaleString("ro-RO")} pasi/zi — in top 15% pentru ${bracket} ani. Peste pragul de 10k nu mai scade mortalitatea semnificativ (Paluch 2022), dar volumul si-l vezi in alte metrice: RHR, greutate, somn.`;
    }
    if (pct >= 65) {
      return `${Math.round(value).toLocaleString("ro-RO")} pasi/zi — peste mediana pentru ${bracket} ani. Esti in zona "activ non-sportiv" unde beneficiul cardiovascular e deja substantial. Suprafata plateu-ului mortalitatii incepe la ~${Math.round(p75).toLocaleString("ro-RO")}.`;
    }
    if (pct >= 40) {
      return `${Math.round(value).toLocaleString("ro-RO")} pasi/zi — mediana ${bracket} ani. Urmatoarele 2000 pasi/zi sunt cele mai valoroase: Paluch 2022 arata ca beneficiile mortalitatii cresc rapid intre 4k si 8k pasi/zi.`;
    }
    if (pct >= 20) {
      return `${Math.round(value).toLocaleString("ro-RO")} pasi/zi — sub mediana ${bracket} ani. La acest volum, cel mai simplu castig: o plimbare zilnica dupa pranz de 15 min ≈ +1500 pasi si beneficiu metabolic direct.`;
    }
    return `${Math.round(value).toLocaleString("ro-RO")} pasi/zi — sub pragul minim recomandat. Orice crestere pana la 4000 pasi/zi are impact disproportionat de mare pe mortalitate (Paluch 2022). Start minimalist: 10 min dimineata + 10 min seara.`;
  }

  return `${value.toFixed(0)} — percentila ${Math.round(pct)} pentru cohorta ${bracket} ani.`;
}

export function AgeBenchmark({ metrics }: Props) {
  const profile = useProfile();

  const rows = useMemo(() => {
    if (!profile) return [];
    const bracket = bracketForAge(profile.age);

    const out: {
      key: string;
      label: string;
      unit: string;
      value: number;
      percentile: number;
      color: string;
      narrative: string;
      bracket: Bracket;
    }[] = [];

    for (const [key, cfg] of Object.entries(NORMS)) {
      const data = metrics[key];
      if (!data || data.length < 7) continue;

      const range = cfg.ranges[bracket];
      if (!range) continue;

      const last30 = data.slice(-30);
      const rawValues = last30.map(d => (cfg.useSum ? d.sum : d.mean)).filter(v => v > 0);
      if (rawValues.length < 5) continue;
      const { mean: avg } = meanStd(rawValues);
      if (!Number.isFinite(avg) || avg <= 0) continue;

      const pct = Math.max(1, Math.min(99, percentile(avg, range, cfg.higherIsBetter)));
      const color =
        pct >= 80 ? "#34C759" :
        pct >= 60 ? "#5AC8FA" :
        pct >= 40 ? "#FF9500" :
        pct >= 20 ? "#FF9F0A" : "#FF3B30";

      out.push({
        key,
        label: cfg.label,
        unit: cfg.unit,
        value: cfg.useSum ? Math.round(avg) : Math.round(avg * 10) / 10,
        percentile: pct,
        color,
        narrative: interpretation(key, bracket, avg, pct, range.p50, range.p75),
        bracket,
      });
    }
    return out;
  }, [metrics, profile?.age, profile?.sex]);

  if (!profile) {
    return (
      <div className="hh-card" style={{ minWidth: 0 }}>
        <div className="hh-section-label" style={{ padding: 0, marginBottom: 8 }}>
          <span>Benchmark pe varsta</span>
        </div>
        <p className="hh-footnote" style={{ color: "var(--label-secondary)" }}>
          Adauga-ti varsta in profil pentru comparatii personalizate cu cohorta ta.
          Fara profil, metricile nu pot fi interpretate contextual — un HRV de 35 ms
          inseamna lucruri foarte diferite la 25 si la 55 ani.
        </p>
      </div>
    );
  }

  if (rows.length === 0) return null;

  const bracket = bracketForAge(profile.age);

  return (
    <div className="hh-card" style={{ minWidth: 0 }}>
      <div className="hh-section-label" style={{ padding: 0, marginBottom: 10 }}>
        <span>Benchmark pe varsta</span>
        <span style={{ color: "var(--label-tertiary)", textTransform: "none", letterSpacing: 0 }}>
          cohorta {bracket} ani
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map(r => (
          <div key={r.key}>
            <div className="flex items-center justify-between" style={{ marginBottom: 4, gap: 8 }}>
              <span className="hh-body" style={{ color: "var(--label-primary)", fontWeight: 600 }}>
                {r.label}
              </span>
              <span className="hh-mono-num" style={{ fontSize: 14, fontWeight: 700, color: r.color }}>
                P{Math.round(r.percentile)}
              </span>
            </div>

            <div
              className="relative h-2 rounded-full overflow-hidden"
              style={{ background: "rgba(120,120,128,0.18)" }}
            >
              <div
                className="absolute h-full rounded-full transition-all duration-500"
                style={{
                  width: `${r.percentile}%`,
                  background: `linear-gradient(90deg, ${r.color}66, ${r.color})`,
                }}
              />
              <div
                className="absolute h-full"
                style={{ left: "50%", width: 1, background: "rgba(120,120,128,0.5)" }}
              />
            </div>

            <p
              className="hh-footnote"
              style={{
                color: "var(--label-secondary)",
                lineHeight: 1.45,
                marginTop: 6,
              }}
            >
              {r.narrative}
            </p>
          </div>
        ))}
      </div>

      <p
        className="hh-caption-2"
        style={{
          color: "var(--label-tertiary)",
          marginTop: 12,
          fontStyle: "italic",
        }}
      >
        Norme: Palatini 2006, Nunan 2010, Voss 2015, Kodama 2009, Tudor-Locke 2011, Paluch 2022, ACSM 2021.
      </p>
    </div>
  );
}
