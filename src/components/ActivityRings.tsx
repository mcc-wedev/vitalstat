"use client";

import { useMemo } from "react";
import type { DailySummary } from "@/lib/parser/healthTypes";

interface Props {
  activeEnergy?: DailySummary[];
  exerciseTime?: DailySummary[];
  standTime?: DailySummary[];
  stepCount?: DailySummary[];
}

/**
 * Apple Fitness Activity Rings — SVG triple concentric rings.
 *
 * Move (outer, red):   activeEnergy → goal 500 kcal
 * Exercise (mid, green): exerciseTime → goal 30 min
 * Stand (inner, cyan):  standTime or steps proxy → goal 12 hrs / 10k steps
 *
 * Ring colors use angular gradients approximated via two-stop linear
 * gradients rotated to match Apple's visual style.
 */

const RING_W = 12;
const GAP = 4;
const SIZE = 130;

interface RingDef {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color1: string; // gradient start
  color2: string; // gradient end
  glowColor: string;
}

function Ring({ cx, cy, r, progress, color1, color2, glowColor, gradId }: {
  cx: number; cy: number; r: number; progress: number;
  color1: string; color2: string; glowColor: string; gradId: string;
}) {
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(progress, 1.5); // allow up to 150% visual
  const dashOffset = circumference * (1 - clamped);

  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color1} />
          <stop offset="100%" stopColor={color2} />
        </linearGradient>
      </defs>
      {/* Background track */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color2}
        strokeWidth={RING_W}
        opacity={0.15}
      />
      {/* Progress arc */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={RING_W}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{
          transition: "stroke-dashoffset 800ms cubic-bezier(0.16, 1, 0.3, 1)",
          filter: `drop-shadow(0 0 4px ${glowColor})`,
        }}
      />
    </>
  );
}

export function ActivityRings({ activeEnergy, exerciseTime, standTime, stepCount }: Props) {
  const rings = useMemo((): RingDef[] | null => {
    // Need at least move data
    const moveData = activeEnergy;
    if (!moveData || moveData.length === 0) return null;

    const latest = moveData[moveData.length - 1];
    const moveVal = latest.sum;

    const exVal = exerciseTime && exerciseTime.length > 0
      ? exerciseTime[exerciseTime.length - 1].sum
      : 0;

    // Stand: use standTime if available, else approximate from steps
    let standVal = 0;
    if (standTime && standTime.length > 0) {
      standVal = standTime[standTime.length - 1].sum / 60; // min → hrs
    } else if (stepCount && stepCount.length > 0) {
      // Proxy: steps / 833 ≈ hours of activity (10k steps / 12 hrs)
      standVal = stepCount[stepCount.length - 1].sum / 833;
    }

    return [
      {
        label: "Miscari",
        value: Math.round(moveVal),
        goal: 500,
        unit: "CAL",
        color1: "#CF2063",
        color2: "#FA114F",
        glowColor: "rgba(250,17,79,0.4)",
      },
      {
        label: "Exercitiu",
        value: Math.round(exVal),
        goal: 30,
        unit: "MIN",
        color1: "#78E84C",
        color2: "#9BE04A",
        glowColor: "rgba(155,224,74,0.4)",
      },
      {
        label: "In picioare",
        value: Math.round(standVal),
        goal: 12,
        unit: "HRS",
        color1: "#02C4FE",
        color2: "#0AECFF",
        glowColor: "rgba(10,236,255,0.4)",
      },
    ];
  }, [activeEnergy, exerciseTime, standTime, stepCount]);

  if (!rings) return null;

  const center = SIZE / 2;
  const outerR = (SIZE - RING_W) / 2;
  const midR = outerR - RING_W - GAP;
  const innerR = midR - RING_W - GAP;
  const radii = [outerR, midR, innerR];

  return (
    <div className="hh-card animate-in" style={{ padding: 20 }}>
      <div className="flex items-center gap-5">
        {/* SVG Rings */}
        <div style={{ width: SIZE, height: SIZE, flexShrink: 0 }}>
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            style={{ transform: "rotate(-90deg)" }}
          >
            {rings.map((ring, i) => (
              <Ring
                key={ring.label}
                cx={center}
                cy={center}
                r={radii[i]}
                progress={ring.goal > 0 ? ring.value / ring.goal : 0}
                color1={ring.color1}
                color2={ring.color2}
                glowColor={ring.glowColor}
                gradId={`ring-grad-${i}`}
              />
            ))}
          </svg>
        </div>

        {/* Stats column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {rings.map((ring, i) => (
            <div key={ring.label} style={{ marginBottom: i < 2 ? 10 : 0 }}>
              <div className="flex items-center gap-1.5" style={{ marginBottom: 2 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: ring.color2,
                    flexShrink: 0,
                  }}
                />
                <span className="hh-footnote" style={{ color: "var(--label-secondary)" }}>
                  {ring.label}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span
                  className="hh-mono-num"
                  style={{ fontSize: 22, fontWeight: 700, color: "var(--label-primary)", lineHeight: 1 }}
                >
                  {ring.value.toLocaleString("ro-RO")}
                </span>
                <span className="hh-caption" style={{ color: "var(--label-secondary)" }}>
                  /{ring.goal} {ring.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
