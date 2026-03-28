"use client";

import { useState, useEffect } from "react";

const STEPS = [
  {
    title: "Bine ai venit la VitalStat",
    body: "Aplicatia care transforma datele Apple Watch in interpretari inteligente. Totul ruleaza local — datele tale nu parasesc niciodata telefonul.",
    icon: "💚",
  },
  {
    title: "Scorul de Recuperare",
    body: "Algoritm cu 6 factori (HRV, puls, somn, antrenament, respiratie, SpO2) care iti spune cat de recuperat esti. Similar cu WHOOP, dar gratuit.",
    icon: "📊",
  },
  {
    title: "Interpretari stiintifice",
    body: "Fiecare insight e bazat pe studii reale — nu generalitati. Aplicatia gaseste pattern-uri personale in datele tale si iti spune ce inseamna.",
    icon: "🧬",
  },
  {
    title: "Selecteaza perioada",
    body: "Foloseste 'Azi' sau 'Ieri' pentru un raport detaliat al zilei. '30z' sau '90z' pentru trenduri pe termen lung. 'Tot' pentru toata istoria.",
    icon: "📅",
  },
];

const STORAGE_KEY = "vitalstat-onboarding-done";

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) setShow(true);
    } catch { setShow(true); }
  }, []);

  const handleFinish = () => {
    setShow(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  };

  if (!show) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}>
      <div className="glass p-6 max-w-sm w-full text-center" style={{ background: "rgba(15,15,20,0.95)", borderColor: "rgba(16,185,129,0.2)" }}>
        <div className="text-4xl mb-4">{current.icon}</div>
        <h2 className="text-lg font-bold mb-2">{current.title}</h2>
        <p className="text-sm text-[var(--muted-strong)] mb-6 leading-relaxed">{current.body}</p>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-4">
          {STEPS.map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full" style={{
              background: i === step ? "#10b981" : "rgba(255,255,255,0.15)",
            }} />
          ))}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="flex-1 pill text-sm py-2">
              Inapoi
            </button>
          )}
          <button
            onClick={isLast ? handleFinish : () => setStep(step + 1)}
            className="flex-1 pill pill-active text-sm py-2"
          >
            {isLast ? "Incepe" : "Urmatorul"}
          </button>
        </div>

        <button onClick={handleFinish} className="mt-3 text-[10px] text-[var(--muted)] hover:text-white">
          Sari peste
        </button>
      </div>
    </div>
  );
}
