"use client";

import { useEffect, useState } from "react";

export function ServiceWorkerRegistrar() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    navigator.serviceWorker.register(`${basePath}/sw.js`).then((reg) => {
      // Check for updates every 30 seconds (was 60)
      setInterval(() => reg.update(), 30000);

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    }).catch(() => {});

    // Listen for SW_UPDATED message → auto-reload
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_UPDATED") {
        window.location.reload();
      }
    });

    // When the new SW takes over, reload
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  const handleUpdate = () => {
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        reg.waiting.postMessage("SKIP_WAITING");
      }
    });
  };

  const handleForceRefresh = () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        // Tell SW to nuke all caches
        if (reg.active) reg.active.postMessage("FORCE_REFRESH");
        // Unregister SW entirely
        reg.unregister().then(() => {
          // Hard reload bypassing cache
          window.location.href = window.location.href + "?t=" + Date.now();
        });
      });
    } else {
      window.location.href = window.location.href + "?t=" + Date.now();
    }
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] flex justify-center">
      <div className="glass px-4 py-3 flex items-center gap-3 shadow-2xl" style={{
        background: "rgba(16, 185, 129, 0.12)",
        borderColor: "rgba(16, 185, 129, 0.3)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}>
        <button onClick={handleUpdate} className="text-sm font-medium text-[#10b981] cursor-pointer hover:underline">
          Versiune noua — Actualizeaza
        </button>
        <span className="text-[var(--muted)]">|</span>
        <button onClick={handleForceRefresh} className="text-xs text-[var(--muted)] cursor-pointer hover:text-white">
          Forteaza refresh
        </button>
      </div>
    </div>
  );
}
