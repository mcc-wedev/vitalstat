"use client";

import { useCallback, useState } from "react";

/**
 * Export button that generates a printable health report.
 * Uses window.print() with a print-optimized class toggle.
 */
export function ExportReport() {
  const [printing, setPrinting] = useState(false);

  const handleExport = useCallback(() => {
    setPrinting(true);
    // Add print class to body for print-specific styles
    document.body.classList.add("vitalstat-print");

    // Small delay to let React re-render
    requestAnimationFrame(() => {
      window.print();
      // Clean up after print dialog closes
      const cleanup = () => {
        document.body.classList.remove("vitalstat-print");
        setPrinting(false);
      };
      // Use both afterprint event and timeout as fallback
      window.addEventListener("afterprint", cleanup, { once: true });
      setTimeout(cleanup, 5000);
    });
  }, []);

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={printing}
      style={{
        width: "100%",
        padding: "14px 20px",
        borderRadius: 14,
        border: "1px solid var(--separator)",
        background: "var(--surface-1)",
        color: "var(--label-primary)",
        fontSize: 15,
        fontWeight: 600,
        cursor: printing ? "wait" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: printing ? 0.6 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9V2h12v7" />
        <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
        <rect x={6} y={14} width={12} height={8} />
      </svg>
      {printing ? "Se genereaza..." : "Exporta raport PDF"}
    </button>
  );
}
