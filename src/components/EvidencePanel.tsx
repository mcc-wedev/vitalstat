"use client";

import { useMemo } from "react";
import { computeEvidenceBasedReport } from "@/lib/stats/evidenceBased";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

/** Color by zone */
function zc(zone: string): string {
  const green = ["adapted", "regular", "excellent", "above_avg", "improving", "maintaining", "minimal", "early", "moderate_early", "intermediate"];
  const yellow = ["moderate", "average", "mild", "moderate_late", "declining_normal"];
  if (green.includes(zone)) return "rgb(52,199,89)";
  if (yellow.includes(zone)) return "rgb(255,204,0)";
  return "rgb(255,59,48)";
}

function zoneLabel(zone: string): string {
  const m: Record<string, string> = {
    adapted: "Bine adaptat", moderate: "Efort moderat", overreaching: "Suprasolicitare",
    regular: "Regulat", irregular: "Neregulat",
    excellent: "Excelent", above_avg: "Peste medie", average: "Medie", below_avg: "Sub medie", low: "Scazut",
    improving: "In crestere", maintaining: "Stabil", declining_normal: "Declin normal", declining_fast: "Declin accelerat",
    minimal: "Minim", mild: "Usor", significant: "Semnificativ",
    early: "Matinal", moderate_early: "Moderat matinal", intermediate: "Intermediar",
    moderate_late: "Moderat nocturn", late: "Nocturn",
  };
  return m[zone] || zone;
}

function MetricCard({ title, value, unit, zone, explain, tip, reference }: {
  title: string;
  value: string;
  unit?: string;
  zone: string;
  explain: string;
  tip?: string;
  reference: string;
}) {
  const color = zc(zone);
  return (
    <div style={{ padding: "18px 0", borderBottom: "0.5px solid var(--separator)" }}>
      {/* Header: title + value */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--label-primary)" }}>{title}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: "var(--label-primary)", letterSpacing: "-0.02em" }}>
          {value}
          {unit && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--label-secondary)", marginLeft: 3 }}>{unit}</span>}
        </span>
      </div>

      {/* Zone badge */}
      <div style={{ marginBottom: 10 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color,
          padding: "3px 10px", borderRadius: 6,
          background: `${color}18`,
        }}>
          {zoneLabel(zone)}
        </span>
      </div>

      {/* Plain language explanation */}
      <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--label-secondary)", margin: "0 0 6px 0" }}>
        {explain}
      </p>

      {/* Actionable tip (if any) */}
      {tip && (
        <p style={{ fontSize: 13, lineHeight: 1.5, color, fontWeight: 600, margin: "0 0 8px 0" }}>
          → {tip}
        </p>
      )}

      {/* Reference */}
      <p style={{ fontSize: 10, color: "var(--label-quaternary, rgba(235,235,245,0.18))", margin: 0, fontStyle: "italic" }}>
        Sursa: {reference}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Human-readable explanations for each metric + zone
// ═══════════════════════════════════════════════════════════════

function hrvExplain(cv: number, zone: string): { explain: string; tip?: string } {
  if (zone === "adapted") return {
    explain: `Inima ta bate foarte regulat de la o zi la alta (variatie doar ${cv.toFixed(1)}%). Asta inseamna ca corpul tau e bine recuperat si pregatit de efort.`,
    tip: "Poti antrena intens azi — corpul e pregatit.",
  };
  if (zone === "moderate") return {
    explain: `Ritmul inimii variaza moderat intre zile (${cv.toFixed(1)}%). Corpul gestioneaza un nivel de stres sau oboseala, dar inca functioneaza bine.`,
    tip: "Antrenament moderat recomandat. Evita efortul maximal.",
  };
  return {
    explain: `Ritmul inimii fluctueaza mult de la o zi la alta (${cv.toFixed(1)}%). De obicei asta inseamna ca esti obosit, stresat, sau nu ai dormit suficient.`,
    tip: "Prioritizeaza odihna. O zi de pauza de la antrenament ar ajuta.",
  };
}

function rhrExplain(change: number, current: number, trend: number, alert: boolean): { explain: string; tip?: string } {
  if (alert) return {
    explain: `Pulsul in repaus a crescut cu ${change.toFixed(0)} bpm fata de inceputul perioadei. O crestere de peste 5 bpm sustinuta este un semnal de atentie — poate indica oboseala cronica, stres, sau o problema de sanatate.`,
    tip: "Daca pulsul ramane ridicat 2+ saptamani, discuta cu medicul.",
  };
  if (Math.abs(change) < 3) return {
    explain: `Pulsul in repaus e stabil la ${current.toFixed(0)} bpm — doar ${change >= 0 ? "+" : ""}${change.toFixed(1)} bpm fata de baza. Un puls stabil inseamna ca inima functioneaza constant, fara semne de stres sau boala.`,
  };
  if (change > 0) return {
    explain: `Pulsul a crescut usor cu ${change.toFixed(1)} bpm. Nu e inca ingrijorator, dar merita urmarit. Poate fi de la oboseala, alcool, sau mai putin somn.`,
    tip: "Monitorizeaza in urmatoarele 2 saptamani.",
  };
  return {
    explain: `Pulsul a scazut cu ${Math.abs(change).toFixed(1)} bpm fata de baza — semn pozitiv. Inseamna ca fitness-ul cardiovascular se imbunatateste.`,
  };
}

function vo2Explain(current: number, expected: number, delta: number, status: string, yearly: number): { explain: string; tip?: string } {
  const base = `VO2 Max masoara cat de bine corpul foloseste oxigenul in timpul efortului — e cel mai puternic predictor de longevitate din medicina. Al tau e ${current.toFixed(1)}, iar media pentru varsta ta e ${expected}.`;
  if (status === "improving") return {
    explain: `${base} Esti cu ${delta.toFixed(1)} peste norma si in crestere. Excelent — inseamna ca antrenamentul functioneaza.`,
  };
  if (status === "maintaining") return {
    explain: `${base} Esti cu ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} fata de norma si stabil. Normal dupa 30 de ani e sa scada ~0.5/an — tu il mentii.`,
  };
  if (status === "declining_normal") return {
    explain: `${base} Scade cu ${Math.abs(yearly).toFixed(1)}/an — in limita normala (se asteapta ~0.5/an). Nimic ingrijorator.`,
  };
  return {
    explain: `${base} Scade mai repede decat normal (${Math.abs(yearly).toFixed(1)}/an vs. 0.5/an asteptat).`,
    tip: "Adauga 2-3 sesiuni de cardio pe saptamana (mers rapid, inot, bicicleta).",
  };
}

function walkExplain(speed: number, zone: string, age: number): { explain: string; tip?: string } {
  const base = `Viteza medie de mers e ${speed.toFixed(2)} m/s. Intr-un studiu pe 34,485 de persoane, viteza de mers a prezis supravietuirea mai bine decat varsta.`;
  if (zone === "excellent" || zone === "above_avg") return {
    explain: `${base} Esti peste medie — semn de vitalitate si forma fizica buna.`,
  };
  if (zone === "average") return {
    explain: `${base} Esti in medie pentru varsta ta. E un punct de referinta bun.`,
  };
  return {
    explain: `${base} Esti sub media pentru varsta ta. Viteza de mers reflecta forta musculara, echilibru si rezistenta.`,
    tip: "Plimbarile zilnice de 30 min la pas alert imbunatatesc acest indicator.",
  };
}

function sriExplain(sri: number, bedStd: number, wakeStd: number): { explain: string; tip?: string } {
  if (sri >= 80) return {
    explain: `Te culci si te trezesti cam la aceeasi ora in fiecare zi (±${bedStd.toFixed(0)} min). Regularitatea somnului e mai importanta decat durata — un program constant imbunatateste calitatea somnului, starea de spirit si sanatatea metabolica.`,
  };
  if (sri >= 60) return {
    explain: `Programul de somn variaza moderat — te culci cu ±${bedStd.toFixed(0)} min diferenta. E acceptabil, dar un program mai constant ar imbunatati calitatea somnului.`,
    tip: "Incearca sa te culci la aceeasi ora ±15 min, inclusiv in weekend.",
  };
  return {
    explain: `Programul de somn e neregulat — ora de culcare variaza cu ±${bedStd.toFixed(0)} min. Cercetarile arata ca neregularitatea somnului creste riscul de boli metabolice si cardiovasculare.`,
    tip: "Seteaza o alarma de culcare la aceeasi ora in fiecare seara.",
  };
}

function chronoExplain(jetLag: number, chronotype: string, msfsc: number): { explain: string; tip?: string } {
  const chronoName: Record<string, string> = {
    early: "matinal (te trezesti devreme natural)",
    moderate_early: "moderat matinal",
    intermediate: "intermediar (nici matinal, nici nocturn)",
    moderate_late: "moderat nocturn",
    late: "nocturn (esti mai activ seara)",
  };
  const base = `Cronotipul tau e ${chronoName[chronotype] || chronotype}. Social jet lag masoara diferenta intre ceasul tau biologic si programul tau social.`;

  if (jetLag < 1) return {
    explain: `${base} Ai doar ${jetLag.toFixed(1)}h diferenta intre weekend si saptamana — ceasul biologic e aliniat cu viata ta zilnica. Ideal.`,
  };
  if (jetLag < 2) return {
    explain: `${base} Ai ${jetLag.toFixed(1)}h diferenta — ca si cum ai calatori intr-un fus orar diferit in weekend. Efectul e similar cu un jet lag usor.`,
    tip: "Incearca sa nu dormi cu mai mult de 1h in plus in weekend.",
  };
  return {
    explain: `${base} Ai ${jetLag.toFixed(1)}h diferenta — echivalentul unui jet lag de ${jetLag.toFixed(0)} ore in fiecare saptamana. Studiile arata ca peste 2h creste riscul de obezitate si depresie.`,
    tip: "Reduce treptat diferenta: culca-te cu 15 min mai devreme in weekend.",
  };
}

// ═══════════════════════════════════════════════════════════════

export function EvidencePanel({ metrics, sleepNights }: Props) {
  const profile = useMemo(() => {
    try {
      const raw = localStorage.getItem("vitalstat-user-profile");
      if (raw) {
        const p = JSON.parse(raw);
        return { age: p.age || 50, sex: (p.sex || "male") as "male" | "female" };
      }
    } catch {}
    return { age: 50, sex: "male" as const };
  }, []);

  const report = useMemo(
    () => computeEvidenceBasedReport(metrics, sleepNights, profile.age, profile.sex),
    [metrics, sleepNights, profile.age, profile.sex]
  );

  const available = Object.values(report).filter(v => v !== null);
  if (available.length < 2) return null;

  return (
    <div className="hh-card" style={{ padding: "16px 20px" }}>
      <div style={{ marginBottom: 12 }}>
        <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px 0" }}>
          Metrici validate stiintific
        </p>
        <p style={{ fontSize: 12, color: "var(--label-tertiary)", margin: 0 }}>
          Calcule bazate pe studii cu zeci de mii de participanti. Fiecare cu sursa.
        </p>
      </div>

      {report.hrvCv && (() => {
        const { explain, tip } = hrvExplain(report.hrvCv.cv, report.hrvCv.zone);
        return (
          <MetricCard
            title="Cat de recuperat esti"
            value={report.hrvCv.cv.toFixed(1)}
            unit="% variatie"
            zone={report.hrvCv.zone}
            explain={explain}
            tip={tip}
            reference={report.hrvCv.reference}
          />
        );
      })()}

      {report.rhrTrend && (() => {
        const { explain, tip } = rhrExplain(
          report.rhrTrend.change, report.rhrTrend.currentRhr,
          report.rhrTrend.trendPerMonth, report.rhrTrend.alert
        );
        return (
          <MetricCard
            title="Sanatatea inimii"
            value={report.rhrTrend.change >= 0 ? `+${report.rhrTrend.change.toFixed(1)}` : report.rhrTrend.change.toFixed(1)}
            unit="bpm fata de baza"
            zone={report.rhrTrend.alert ? "overreaching" : Math.abs(report.rhrTrend.change) < 3 ? "adapted" : "moderate"}
            explain={explain}
            tip={tip}
            reference={report.rhrTrend.reference}
          />
        );
      })()}

      {report.vo2Trajectory && (() => {
        const { explain, tip } = vo2Explain(
          report.vo2Trajectory.currentVo2, report.vo2Trajectory.expectedForAge,
          report.vo2Trajectory.delta, report.vo2Trajectory.status,
          report.vo2Trajectory.yearlyChange
        );
        return (
          <MetricCard
            title="Capacitatea aerobica"
            value={report.vo2Trajectory.currentVo2.toFixed(1)}
            unit="mL/kg/min"
            zone={report.vo2Trajectory.status}
            explain={explain}
            tip={tip}
            reference={report.vo2Trajectory.reference}
          />
        );
      })()}

      {report.walkingSpeed && (() => {
        const { explain, tip } = walkExplain(report.walkingSpeed.meanSpeed, report.walkingSpeed.zone, profile.age);
        return (
          <MetricCard
            title="Vitalitate (viteza de mers)"
            value={report.walkingSpeed.meanSpeed.toFixed(2)}
            unit="m/s"
            zone={report.walkingSpeed.zone}
            explain={explain}
            tip={tip}
            reference={report.walkingSpeed.reference}
          />
        );
      })()}

      {report.sri && (() => {
        const { explain, tip } = sriExplain(report.sri.sri, report.sri.bedtimeStdMin, report.sri.waketimeStdMin);
        return (
          <MetricCard
            title="Regularitatea somnului"
            value={report.sri.sri.toFixed(0)}
            unit="din 100"
            zone={report.sri.zone}
            explain={explain}
            tip={tip}
            reference={report.sri.reference}
          />
        );
      })()}

      {report.chronotype && (() => {
        const { explain, tip } = chronoExplain(
          report.chronotype.socialJetLagHours,
          report.chronotype.chronotype,
          report.chronotype.msfsc
        );
        return (
          <MetricCard
            title="Ceasul tau biologic"
            value={report.chronotype.socialJetLagHours.toFixed(1)}
            unit="h jet lag social"
            zone={report.chronotype.jetLagZone}
            explain={explain}
            tip={tip}
            reference={report.chronotype.reference}
          />
        );
      })()}
    </div>
  );
}
