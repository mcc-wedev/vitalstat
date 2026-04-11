"use client";

import { useEffect, useState } from "react";
import { loadProfile, type UserProfile } from "./userProfile";

/**
 * ═══════════════════════════════════════════════════════════════
 *  useProfile — reactive user profile hook
 *
 *  Returns the current UserProfile from localStorage and re-renders
 *  whenever the profile changes. Listens to:
 *    1. `vitalstat-profile-updated` — custom event dispatched by
 *       ProfileSetup and BiologicalAge when they save a new profile
 *    2. `storage` — cross-tab updates
 *
 *  Use this in any component whose output depends on age/sex, so
 *  the user sees insights update immediately after entering their
 *  profile instead of having to refresh the page.
 * ═══════════════════════════════════════════════════════════════
 */
export function useProfile(): UserProfile | null {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
    const handler = () => setProfile(loadProfile());
    window.addEventListener("vitalstat-profile-updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("vitalstat-profile-updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return profile;
}
