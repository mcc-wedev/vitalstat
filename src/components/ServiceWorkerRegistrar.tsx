"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => {
        // SW registration failed silently — not critical
      });
    }
  }, []);

  return null;
}
