"use client";

import { useMemo } from "react";
import { computeEvidenceBasedReport } from "@/lib/stats/evidenceBased";
import type { DailySummary, SleepNight } from "@/lib/parser/healthTypes";

interface Props {
  metrics: Record<string, DailySummary[]>;
  sleepNights: SleepNight[];
}

/** Zone → color palette */
function zoneColors(zone: string): { main: string; bg: string; glow: string } {
  const green = ["adapted", "regular", "excellent", "above_avg", "improving", "maintaining", "minimal", "early", "moderate_early", "intermediate", "optimal", "above_target", "on_target", "elite", "above_average"];
  const yellow = ["moderate", "average", "mild", "moderate_late", "declining_normal", "good", "below_target", "building", "below_average"];
  if (green.includes(zone)) return { main: "rgb(52,199,89)", bg: "rgba(52,199,89,0.08)", glow: "rgba(52,199,89,0.15)" };
  if (yellow.includes(zone)) return { main: "rgb(255,176,0)", bg: "rgba(255,176,0,0.08)", glow: "rgba(255,176,0,0.12)" };
  return { main: "rgb(255,59,48)", bg: "rgba(255,59,48,0.08)", glow: "rgba(255,59,48,0.12)" };
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
    optimal: "Optim", good: "Bun", above_target: "Peste tinta", on_target: "La tinta",
    below_target: "Sub tinta", short: "Insuficient", very_short: "Foarte putin",
    long: "Prea mult", very_long: "Excesiv",
    building: "Crestere rapida", high_risk: "Risc accidentare", detraining: "Deantrenare",
    elite: "Elit", above_average: "Peste medie", below_average: "Sub medie",
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
  const { main, bg, glow } = zoneColors(zone);
  return (
    <div style={{
      background: "var(--surface-1)",
      borderRadius: 16,
      padding: "20px 20px 16px",
      marginBottom: 12,
      position: "relative",
      overflow: "hidden",
      border: `0.5px solid ${glow}`,
      boxShadow: `0 0 20px ${glow}, 0 1px 3px rgba(0,0,0,0.08)`,
    }}>
      {/* Subtle gradient glow top-right */}
      <div style={{
        position: "absolute", top: -30, right: -30, width: 120, height: 120,
        background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Zone indicator bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, width: 3, height: "100%",
        background: `linear-gradient(to bottom, ${main}, ${main}44)`,
        borderRadius: "3px 0 0 3px",
      }} />

      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, position: "relative" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--label-primary)", letterSpacing: "-0.01em", lineHeight: 1.3 }}>
            {title}
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6,
            fontSize: 11, fontWeight: 700, color: main, textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", background: main,
              boxShadow: `0 0 6px ${main}`,
            }} />
            {zoneLabel(zone)}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
          <span style={{
            fontSize: 28, fontWeight: 800, color: "var(--label-primary)",
            letterSpacing: "-0.03em", lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}>
            {value}
          </span>
          {unit && (
            <div style={{ fontSize: 11, color: "var(--label-tertiary)", marginTop: 2, letterSpacing: "0.02em" }}>
              {unit}
            </div>
          )}
        </div>
      </div>

      {/* Explanation */}
      <p style={{
        fontSize: 13, lineHeight: 1.55, color: "var(--label-secondary)",
        margin: "0 0 8px 0", position: "relative",
      }}>
        {explain}
      </p>

      {/* Actionable tip */}
      {tip && (
        <div style={{
          background: bg,
          borderRadius: 10, padding: "10px 12px", margin: "0 0 10px 0",
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <span style={{ color: main, fontSize: 14, lineHeight: 1.5, flexShrink: 0 }}>&#x279C;</span>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: main, fontWeight: 600, margin: 0 }}>
            {tip}
          </p>
        </div>
      )}

      {/* Reference — subtle pill */}
      <div style={{
        fontSize: 10, color: "var(--label-quaternary, rgba(235,235,245,0.18))",
        fontStyle: "italic", position: "relative",
      }}>
        {reference}
      </div>
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

function stepsExplain(avgSteps: number, zone: string, target: number, mortalityReduction: number): { explain: string; tip?: string } {
  const base = `Faci in medie ${Math.round(avgSteps).toLocaleString()} de pasi pe zi. Un studiu pe 47,471 de oameni a aratat ca fiecare 1,000 de pasi in plus scade riscul de mortalitate cu ~15%, pana la un plafon.`;
  if (zone === "excellent" || zone === "above_target") return {
    explain: `${base} Esti peste tinta de ${target.toLocaleString()} — riscul tau de mortalitate e cu ~${mortalityReduction}% mai mic decat al celor sedentari.`,
  };
  if (zone === "on_target") return {
    explain: `${base} Esti aproape de tinta de ${target.toLocaleString()} pasi. Riscul tau e deja cu ~${mortalityReduction}% mai mic.`,
    tip: "Inca ${(target - avgSteps).toFixed(0)} pasi/zi te-ar duce la tinta optima.",
  };
  if (zone === "below_target") return {
    explain: `${base} Esti sub tinta de ${target.toLocaleString()} pasi. Vestea buna: chiar si o crestere mica conteaza — fiecare 1,000 de pasi in plus face diferenta.`,
    tip: "Adauga o plimbare de 15 min dupa masa. Aduce ~2,000 pasi in plus.",
  };
  return {
    explain: `${base} Cu mai putin de 4,000 pasi/zi, esti in zona sedentara. Dar cercetarea arata ca orice pas in plus ajuta — nu trebuie sa faci 10,000.`,
    tip: "Incepe cu tinta de 5,000 pasi/zi si creste treptat.",
  };
}

function sleepDurExplain(avgHours: number, zone: string): { explain: string; tip?: string } {
  const base = `Dormi in medie ${avgHours.toFixed(1)} ore pe noapte. Cel mai mare studiu pe somn (1.38 milioane de oameni) a aratat o curba in U: atat somnul prea scurt cat si cel prea lung cresc riscul de mortalitate.`;
  if (zone === "optimal") return {
    explain: `${base} Tu esti exact in zona optima (7-8h) — riscul minim.`,
  };
  if (zone === "good") return {
    explain: `${base} Esti aproape de zona optima. Riscul e doar usor crescut.`,
  };
  if (zone === "short") return {
    explain: `${base} Sub 6 ore, studiul arata +12% risc de mortalitate. Corpul nu are timp suficient pentru repararea celulara si consolidarea memoriei.`,
    tip: "Muta ora de culcare cu 30 min mai devreme. In 2 saptamani vei simti diferenta.",
  };
  if (zone === "very_short") return {
    explain: `${base} Sub 5 ore constant e un semnal serios. Creste riscul cardiovascular, scade imunitatea si afecteaza cognitia.`,
    tip: "Prioritar: identifica ce te tine treaz (ecrane, stres, cafeina dupa ora 14).",
  };
  if (zone === "long") return {
    explain: `${base} Peste 9 ore, studiul arata +30% risc de mortalitate. Somnul excesiv poate indica o problema de sanatate subiacenta (inflamatie, depresie, apnee).`,
    tip: "Daca dormi mult si tot esti obosit, discuta cu medicul.",
  };
  return {
    explain: `${base} Somnul constant peste 10 ore e asociat cu risc semnificativ crescut. Merita investigat medical.`,
    tip: "Consulta un medic — poate fi apnee de somn, hipotiroidism sau depresie.",
  };
}

function trainingExplain(acwr: number, zone: string, weeklyMin: number): { explain: string; tip?: string } {
  const base = `Raportul de incarcare (ACWR) masoara cat antrenezi ACUM vs. cat ai antrenat LUNA TRECUTA. E cel mai studiat predictor de accidentari in sport.`;
  if (zone === "optimal") return {
    explain: `${base} Raportul tau e ${acwr.toFixed(2)} — in zona optima (0.8-1.3). Antrenezi suficient fara sa te expui la accidentare. Ai facut ${Math.round(weeklyMin)} min exercitiu saptamana asta.`,
  };
  if (zone === "building") return {
    explain: `${base} Raportul e ${acwr.toFixed(2)} — ai crescut incarcarea recent. Nu e periculos inca, dar ai grija sa nu sariti direct la mult.`,
    tip: "Regula de aur: nu creste volumul cu mai mult de 10% pe saptamana.",
  };
  if (zone === "high_risk") return {
    explain: `${base} Raportul e ${acwr.toFixed(2)} — zona de risc! Ai crescut brusc volumul fata de ce faceai luna trecuta. Studiile arata ca peste 1.5, riscul de accidentare creste de 2-4 ori.`,
    tip: "Reduce intensitatea in urmatoarele 5-7 zile. Corpul are nevoie de adaptare.",
  };
  return {
    explain: `${base} Raportul e ${acwr.toFixed(2)} — ai antrenat mai putin decat de obicei. Un pic de pauza e OK, dar daca se prelungeste, pierzi adaptarile castigate.`,
    tip: "Redu-te treptat la volumul anterior. Nu sari direct inapoi la 100%.",
  };
}

function fitnessExplain(vo2: number, percentile: number, category: string, mortalityReduction: string, age: number): { explain: string; tip?: string } {
  const base = `VO2 Max-ul tau (${vo2.toFixed(1)}) te plaseaza la percentila ${percentile} — adica esti mai fit decat ${percentile}% din oamenii de varsta ta.`;
  if (category === "elite") return {
    explain: `${base} Esti in categoria "elit" — studiul Cleveland Clinic (122,007 pacienti) a aratat ca fitness-ul extrem de ridicat scade riscul de mortalitate cu ~80%. Nu exista "prea fit" — beneficiul creste continuu.`,
  };
  if (category === "above_average") return {
    explain: `${base} Esti peste medie — riscul de mortalitate e cu ~50% mai mic decat al celor sedentari. Un nivel excelent de protectie.`,
  };
  if (category === "average") return {
    explain: `${base} Esti in medie — deja cu ~30% mai protejat decat sedentarii. Dar fiecare punct in plus de VO2 Max aduce beneficii masurabile.`,
    tip: "2-3 sesiuni de cardio intens (intervale) pe saptamana cresc VO2 Max cel mai eficient.",
  };
  if (category === "below_average") return {
    explain: `${base} Sub medie, dar vestea buna: cei care trec din "sub medie" in "medie" au cea mai mare reducere de risc. E cel mai important progres de facut.`,
    tip: "Incepe cu 150 min/sapt de mers rapid. Dupa 6 sapt, adauga intervale (1 min rapid, 2 min usor).",
  };
  return {
    explain: `${base} Fitness-ul scazut e cel mai puternic predictor de mortalitate — mai puternic decat fumatul sau diabetul. Dar e si cel mai reversibil.`,
    tip: "Orice miscare conteaza. Chiar 10 min de mers zilnic e un inceput. Creste treptat.",
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
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "linear-gradient(135deg, rgba(52,199,89,0.2), rgba(0,122,255,0.2))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
        }}>
          &#x1F9EC;
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--label-primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Metrici validate stiintific
          </p>
          <p style={{ fontSize: 11, color: "var(--label-tertiary)", margin: 0 }}>
            Bazate pe studii cu zeci de mii de participanti
          </p>
        </div>
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

      {report.stepsLongevity && (() => {
        const { explain, tip } = stepsExplain(
          report.stepsLongevity.avgSteps,
          report.stepsLongevity.zone,
          report.stepsLongevity.targetSteps,
          report.stepsLongevity.mortalityReduction
        );
        return (
          <MetricCard
            title="Pasii tai si longevitatea"
            value={Math.round(report.stepsLongevity.avgSteps).toLocaleString()}
            unit="pasi/zi"
            zone={report.stepsLongevity.zone}
            explain={explain}
            tip={tip}
            reference={report.stepsLongevity.reference}
          />
        );
      })()}

      {report.sleepDuration && (() => {
        const { explain, tip } = sleepDurExplain(
          report.sleepDuration.avgHours,
          report.sleepDuration.zone
        );
        return (
          <MetricCard
            title="Cat dormi — zona de risc"
            value={report.sleepDuration.avgHours.toFixed(1)}
            unit="ore/noapte"
            zone={report.sleepDuration.zone}
            explain={explain}
            tip={tip}
            reference={report.sleepDuration.reference}
          />
        );
      })()}

      {report.trainingLoad && (() => {
        const { explain, tip } = trainingExplain(
          report.trainingLoad.acwr,
          report.trainingLoad.zone,
          report.trainingLoad.weeklyMinutes
        );
        return (
          <MetricCard
            title="Echilibrul antrenamentului"
            value={report.trainingLoad.acwr.toFixed(2)}
            unit="raport acut:cronic"
            zone={report.trainingLoad.zone}
            explain={explain}
            tip={tip}
            reference={report.trainingLoad.reference}
          />
        );
      })()}

      {report.fitnessPercentile && (() => {
        const { explain, tip } = fitnessExplain(
          report.fitnessPercentile.vo2,
          report.fitnessPercentile.percentile,
          report.fitnessPercentile.category,
          report.fitnessPercentile.mortalityReduction,
          profile.age
        );
        return (
          <MetricCard
            title="Fitness vs. mortalitate"
            value={`P${report.fitnessPercentile.percentile}`}
            unit={`(VO2: ${report.fitnessPercentile.vo2.toFixed(1)})`}
            zone={report.fitnessPercentile.category}
            explain={explain}
            tip={tip}
            reference={report.fitnessPercentile.reference}
          />
        );
      })()}
    </section>
  );
}
