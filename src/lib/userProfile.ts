/**
 * User profile — persisted in localStorage.
 * Needed for percentile-based scoring (age × sex norms)
 * and for predicted max HR (Tanaka 2001).
 *
 * We deliberately keep it minimal and non-PII: just age and sex.
 */

import type { Sex } from "./stats/norms";

const KEY = "vitalstat-user-profile";

export interface UserProfile {
  age: number;     // chronological age in years
  sex: Sex;        // male | female
  updatedAt: string; // ISO date
}

export function loadProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      typeof parsed.age === "number" &&
      (parsed.sex === "male" || parsed.sex === "female")
    ) {
      return parsed as UserProfile;
    }
  } catch {}
  return null;
}

export function saveProfile(age: number, sex: Sex): UserProfile {
  const profile: UserProfile = {
    age: Math.round(Math.max(10, Math.min(100, age))),
    sex,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(profile));
    } catch {}
  }
  return profile;
}

export function clearProfile(): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }
}
