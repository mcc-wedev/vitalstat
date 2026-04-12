"use client";

import { useEffect, useState } from "react";
import { loadProfile, saveProfile } from "@/lib/userProfile";
import type { Sex } from "@/lib/stats/norms";

const SKIPPED_KEY = "vitalstat-profile-skipped";

interface Props {
  /** Only show the prompt once data has been loaded. */
  shouldShow: boolean;
  /** When true, always render (profile view/edit mode for Profil tab) */
  alwaysShow?: boolean;
}

export function ProfileSetup({ shouldShow, alwaysShow }: Props) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [age, setAge] = useState<string>("");
  const [sex, setSex] = useState<Sex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const existing = loadProfile();
    if (alwaysShow) {
      if (existing) {
        setAge(String(existing.age));
        setSex(existing.sex);
      } else {
        setEditing(true);
      }
      setShow(true);
      return;
    }
    if (!shouldShow) return;
    if (existing) return;
    try {
      if (localStorage.getItem(SKIPPED_KEY) === "1") return;
    } catch {}
    setEditing(true);
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, [shouldShow, alwaysShow]);

  useEffect(() => {
    if (!alwaysShow) return;
    const onUpdate = () => {
      const p = loadProfile();
      if (p) { setAge(String(p.age)); setSex(p.sex); setEditing(false); }
    };
    window.addEventListener("vitalstat-profile-updated", onUpdate);
    return () => window.removeEventListener("vitalstat-profile-updated", onUpdate);
  }, [alwaysShow]);

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
    setEditing(false);
    setError(null);
    window.dispatchEvent(new Event("vitalstat-profile-updated"));
    if (!alwaysShow) setShow(false);
  };

  const handleSkip = () => {
    try { localStorage.setItem(SKIPPED_KEY, "1"); } catch {}
    setShow(false);
  };

  const profile = loadProfile();

  // ── Profile View (when exists and not editing) ──
  if (alwaysShow && profile && !editing) {
    return (
      <div className="hh-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Profil personal
            </p>
            <p className="hh-footnote" style={{ color: "var(--label-secondary)" }}>
              Folosit pentru percentile si varsta biologica
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="hh-footnote"
            style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
          >
            Editeaza
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ padding: 14, background: "var(--surface-2)", borderRadius: 12 }}>
            <div className="hh-footnote" style={{ color: "var(--label-tertiary)", marginBottom: 4 }}>Varsta</div>
            <div className="hh-mono-num" style={{ fontSize: 22, fontWeight: 700 }}>{profile.age} <span className="hh-footnote" style={{ fontWeight: 400, color: "var(--label-tertiary)" }}>ani</span></div>
          </div>
          <div style={{ padding: 14, background: "var(--surface-2)", borderRadius: 12 }}>
            <div className="hh-footnote" style={{ color: "var(--label-tertiary)", marginBottom: 4 }}>Sex biologic</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{profile.sex === "male" ? "Barbat" : "Femeie"}</div>
          </div>
        </div>

        <p className="hh-footnote" style={{ color: "var(--label-tertiary)", marginTop: 12, fontSize: 11 }}>
          Datele raman pe dispozitiv — nu sunt trimise nicaieri.
        </p>
      </div>
    );
  }

  // ── Edit / Setup form ──
  const isModal = !alwaysShow;
  const content = (
    <div
      className={isModal ? "hh-card animate-scale-in" : "hh-card"}
      style={{ maxWidth: isModal ? 380 : undefined, width: isModal ? "100%" : undefined, padding: 24 }}
    >
      <p className="hh-caption" style={{ color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        Profil personal
      </p>
      <h2 className="hh-title-3" style={{ color: "var(--label-primary)", marginBottom: 8 }}>
        {profile ? "Editeaza profil" : "Ca sa te compar cu norme potrivite"}
      </h2>
      <p className="hh-footnote" style={{ color: "var(--label-secondary)", lineHeight: 1.5, marginBottom: 20 }}>
        Pentru varsta biologica, percentile VO2 Max, HRV si puls repaus am nevoie de
        varsta si sex. Datele raman in telefon — nu pleaca nicaieri.
      </p>

      {/* Age */}
      <div style={{ marginBottom: 16 }}>
        <label className="hh-caption" style={{ display: "block", color: "var(--label-secondary)", marginBottom: 6, fontWeight: 600 }}>
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
            width: "100%", padding: "12px 14px", fontSize: 17,
            background: "var(--surface-2)", border: "none", borderRadius: 12,
            color: "var(--label-primary)", outline: "none", fontFamily: "inherit",
          }}
        />
      </div>

      {/* Sex */}
      <div style={{ marginBottom: 16 }}>
        <label className="hh-caption" style={{ display: "block", color: "var(--label-secondary)", marginBottom: 6, fontWeight: 600 }}>
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
                fontSize: 15, fontWeight: 600,
              }}
            >
              {s === "male" ? "Barbat" : "Femeie"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="hh-footnote" style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        className="pill pill-active"
        style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 700, marginBottom: 8 }}
      >
        Salveaza profil
      </button>
      {isModal && (
        <button
          type="button"
          onClick={handleSkip}
          style={{ width: "100%", padding: "8px", fontSize: 12, color: "var(--label-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}
        >
          Sari peste — fara percentile vs norme
        </button>
      )}
      {!isModal && profile && (
        <button
          type="button"
          onClick={() => setEditing(false)}
          style={{ width: "100%", padding: "8px", fontSize: 12, color: "var(--label-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}
        >
          Anuleaza
        </button>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
        role="dialog"
        aria-modal="true"
      >
        {content}
      </div>
    );
  }

  return content;
}
