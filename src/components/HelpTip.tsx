"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Short text shown in the tooltip bubble. Keep under ~2 sentences. */
  text: string;
  /** Optional citation line (e.g., "Buchheit 2014"). */
  source?: string;
  /** Optional accessible label — defaults to "Afla mai multe" */
  label?: string;
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  HELP TIP — a small "(?)" icon that opens a plain-language
 *  explanation of statistical terms (Mann-Kendall τ, ACWR, z-score,
 *  Banister CTL/ATL, confidence levels etc.).
 *
 *  Works on hover (desktop) and tap (mobile). Dismisses on outside
 *  click or Escape.
 * ═══════════════════════════════════════════════════════════════
 */
export function HelpTip({ text, source, label = "Afla mai multe" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          background: "var(--surface-2)",
          color: "var(--label-tertiary)",
          border: "none",
          cursor: "pointer",
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          marginLeft: 4,
          verticalAlign: "middle",
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 200,
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            minWidth: 200,
            maxWidth: 260,
            background: "var(--surface-1)",
            border: "0.5px solid var(--separator)",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.45,
            color: "var(--label-secondary)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            pointerEvents: "auto",
            textAlign: "left",
            fontWeight: 400,
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          {text}
          {source && (
            <span style={{ display: "block", marginTop: 4, color: "var(--label-tertiary)", fontSize: 11 }}>
              {source}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
