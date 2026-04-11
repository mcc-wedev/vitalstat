"use client";

import { useEffect, useState } from "react";
import { loadProfile, saveProfile } from "@/lib/userProfile";
import type { Sex } from "@/lib/stats/norms";

/**
 * ═══════════════════════════════════════════════════════════════
 *  PROFILE SETUP — age × sex collection modal
 *
 *  Appears once after data is loaded if the user profile is missing.
 *  Required for BiologicalAge, VO2 Max percentile, RHR/HRV/walking
 *  speed percentiles, predicted max HR. Without it those features
 *  silently degrade. Data stays in localStorage — never sent anywhere.
 *
 *  Re-prompt policy: if the user explicitly dismisses, we remember
 *  via `vitalstat-profile-skipped` so we don't nag. They can still
 *  open it from the BiologicalAge card.
 * ═══════════════════════════════════════════════════════════════
 */

const SKIPPED_KEY = "vitalstat-profile-skipped";

interface Props {
  /** Only show the prompt once data has been loaded. */
  shouldShow: boolean;
}

export function ProfileSetup({ shouldShow }: Props) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<Sex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    if (!shouldShow) return;
    const existing = loadProfile();
    if (existing) return;
    try {
      if (localStorage.getItem(SKIPPED_KEY) === "1") return;
    } catch {}
    // delay slightly so welcome onboarding has priority
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, [shouldShow]);

  if (!mounted || !show) return null;

  const handleSave = () => {
    const n = parseInt(age, 10);
    if (!Number.isFinite(n) || n < 10 || n > 100) {
      setError("Varsta trebuie sa fie intre 10 si 100 ani");
      return;
    }
    if (!sex) {
      setError("Selecteaza sexul biologic");
      return;
    }
    saveProfile(n, sex);
    setShow(false);
    // Force a reload so percentile-based components pick up the profile
    window.dispatchEvent(new Event("vitalstat-profile-updated"));
  };

  const handleSkip = () => {
    try { localStorage.setItem(SKIPPED_KEY, "1"); } catch {}
    setShow(false);
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
    >
      <div
        className="hh-card animate-scale-in"
        style={{ maxWidth: 380, width: "100%", padding: 24 }}
      >
        <p
          className="hh-caption"
          style={{
            color: "var(--label-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 6,
          }}
        >
          Profil personal
        </p>
        <h2
          id="profile-title"
          className="hh-title-3"
          style={{ color: "var(--label-primary)", marginBottom: 8 }}
        >
          Ca sa te compar cu norme potrivite
        </h2>
        <p
          className="hh-footnote"
          style={{ color: "var(--label-secondary)", lineHeight: 1.5, marginBottom: 20 }}
        >
          Pentru varsta biologica, percentile VO2 Max, HRV si puls repaus am nevoie de
          varsta si sex. Datele raman in telefon — nu pleaca nicaieri.
        </p>

        {/* Age */}
        <div style={{ marginBottom: 16 }}>
          <label
            className="hh-caption"
            style={{
              display: "block",
              color: "var(--label-secondary)",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Varsta
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={10}
            max={100}
            value={age}
            onChange={(e) => { setAge(e.target.value); setError(null); }}
            placeholder="ex: 34"
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: 17,
              background: "var(--surface-2)",
              border: "none",
              borderRadius: 12,
              color: "var(--label-primary)",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Sex */}
        <div style={{ marginBottom: 16 }}>
          <label
            className="hh-caption"
            style={{
              display: "block",
              color: "var(--label-secondary)",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Sex biologic
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(["male", "female"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setSex(s); setError(null); }}
                className="pill"
                style={{
                  padding: "12px 14px",
                  background: sex === s ? "var(--accent)" : "var(--surface-2)",
                  color: sex === s ? "#fff" : "var(--label-primary)",
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                {s === "male" ? "Barbat" : "Femeie"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p
            className="hh-footnote"
            style={{ color: "var(--danger)", marginBottom: 12 }}
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          className="pill pill-active"
          style={{
            width: "100%",
            padding: "12px",
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Salveaza profil
        </button>
        <button
          type="button"
          onClick={handleSkip}
          style={{
            width: "100%",
            padding: "8px",
            fontSize: 12,
            color: "var(--label-tertiary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          Sari peste — fara percentile vs norme
        </button>
      </div>
    </div>
  );
}
