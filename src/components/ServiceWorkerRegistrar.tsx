"use client";

import { useEffect, useState } from "react";

export function ServiceWorkerRegistrar() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

    navigator.serviceWorker.register(`${basePath}/sw.js`).then((reg) => {
      // Check for updates every 60 seconds
      setInterval(() => reg.update(), 60000);

      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // New version available
            setUpdateAvailable(true);
          }
        });
      });
    }).catch(() => {});

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

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] flex justify-center">
      <button
        onClick={handleUpdate}
        className="glass px-5 py-3 flex items-center gap-3 shadow-2xl cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
        style={{
          background: "rgba(16, 185, 129, 0.15)",
          borderColor: "rgba(16, 185, 129, 0.3)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(16,185,129,0.1)",
        }}
      >
        <span className="text-sm">🔄</span>
        <span className="text-sm font-medium text-[#10b981]">
          Versiune noua disponibila — apasa pentru actualizare
        </span>
      </button>
    </div>
  );
}
