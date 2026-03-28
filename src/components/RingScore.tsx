"use client";

interface RingScoreProps {
  score: number;      // 0-100
  label: string;
  size?: number;      // px, default 80
  strokeWidth?: number;
  color?: string;     // auto from score if not provided
}

function autoColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#22d3ee";
  if (score >= 40) return "#f59e0b";
  if (score >= 20) return "#f97316";
  return "#ef4444";
}

export function RingScore({ score, label, size = 80, strokeWidth = 6, color }: RingScoreProps) {
  const c = color || autoColor(score);
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={c} strokeWidth={strokeWidth}
            strokeDasharray={`${progress} ${circumference}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${c}30)`, transition: "stroke-dasharray 0.8s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold tabular-nums" style={{ color: c }}>{score}</span>
        </div>
      </div>
      <span className="text-[9px] text-[var(--muted)]">{label}</span>
    </div>
  );
}

// Compact 3-ring display (Oura style)
interface ThreeRingsProps {
  recovery: number;
  sleep: number;
  activity: number;
}

export function ThreeRings({ recovery, sleep, activity }: ThreeRingsProps) {
  return (
    <div className="flex items-center justify-center gap-4">
      <RingScore score={recovery} label="Recuperare" size={72} />
      <RingScore score={sleep} label="Somn" size={72} color="#3b82f6" />
      <RingScore score={activity} label="Activitate" size={72} color="#f59e0b" />
    </div>
  );
}
