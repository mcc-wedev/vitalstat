export const QUANTITY_TYPES = {
  heartRate: "HKQuantityTypeIdentifierHeartRate",
  hrv: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  restingHeartRate: "HKQuantityTypeIdentifierRestingHeartRate",
  walkingHeartRateAverage: "HKQuantityTypeIdentifierWalkingHeartRateAverage",
  vo2Max: "HKQuantityTypeIdentifierVO2Max",
  oxygenSaturation: "HKQuantityTypeIdentifierOxygenSaturation",
  respiratoryRate: "HKQuantityTypeIdentifierRespiratoryRate",
  wristTemperature: "HKQuantityTypeIdentifierAppleSleepingWristTemperature",
  stepCount: "HKQuantityTypeIdentifierStepCount",
  distance: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  flightsClimbed: "HKQuantityTypeIdentifierFlightsClimbed",
  activeEnergy: "HKQuantityTypeIdentifierActiveEnergyBurned",
  basalEnergy: "HKQuantityTypeIdentifierBasalEnergyBurned",
  exerciseTime: "HKQuantityTypeIdentifierAppleExerciseTime",
  standTime: "HKQuantityTypeIdentifierAppleStandTime",
  walkingSpeed: "HKQuantityTypeIdentifierWalkingSpeed",
  stepLength: "HKQuantityTypeIdentifierWalkingStepLength",
  doubleSupportPct: "HKQuantityTypeIdentifierWalkingDoubleSupportPercentage",
  walkingAsymmetry: "HKQuantityTypeIdentifierWalkingAsymmetryPercentage",
  walkingSteadiness: "HKQuantityTypeIdentifierAppleWalkingSteadiness",
  bodyMass: "HKQuantityTypeIdentifierBodyMass",
  bodyFat: "HKQuantityTypeIdentifierBodyFatPercentage",
  bmi: "HKQuantityTypeIdentifierBodyMassIndex",
  noiseExposure: "HKQuantityTypeIdentifierEnvironmentalSoundReduction",
  headphoneAudio: "HKQuantityTypeIdentifierHeadphoneAudioExposure",
} as const;

export const CATEGORY_TYPES = {
  sleepAnalysis: "HKCategoryTypeIdentifierSleepAnalysis",
} as const;

export const SLEEP_VALUES = {
  inBed: "HKCategoryValueSleepAnalysisInBed",
  awake: "HKCategoryValueSleepAnalysisAwake",
  asleepCore: "HKCategoryValueSleepAnalysisAsleepCore",
  asleepDeep: "HKCategoryValueSleepAnalysisAsleepDeep",
  asleepREM: "HKCategoryValueSleepAnalysisAsleepREM",
  asleep: "HKCategoryValueSleepAnalysisAsleep", // legacy, pre-stages
} as const;

// All types we want to extract from the XML
const allQuantityTypes = new Set(Object.values(QUANTITY_TYPES));
const allCategoryTypes = new Set(Object.values(CATEGORY_TYPES));
export const ALL_TRACKED_TYPES = new Set([...allQuantityTypes, ...allCategoryTypes]);

// Reverse lookup: identifier → short key
export const TYPE_TO_KEY: Record<string, string> = {};
for (const [key, val] of Object.entries(QUANTITY_TYPES)) {
  TYPE_TO_KEY[val] = key;
}
for (const [key, val] of Object.entries(CATEGORY_TYPES)) {
  TYPE_TO_KEY[val] = key;
}

export type MetricKey = keyof typeof QUANTITY_TYPES;
export type CategoryKey = keyof typeof CATEGORY_TYPES;

export interface HealthRecord {
  type: string;
  key: string; // short key
  value: number;
  unit: string;
  startDate: string; // ISO
  endDate: string;
  sourceName: string;
}

export interface SleepRecord {
  stage: string;
  startDate: string;
  endDate: string;
  sourceName: string;
}

export interface DailySummary {
  date: string; // YYYY-MM-DD
  mean: number;
  min: number;
  max: number;
  sum: number;
  count: number;
  stddev: number;
}

export interface SleepNight {
  date: string; // YYYY-MM-DD (night of)
  totalMinutes: number;
  inBedMinutes: number;
  stages: {
    deep: number;
    core: number;
    rem: number;
    awake: number;
  };
  efficiency: number; // 0-1
  sleepMidpoint: number; // hour of day (e.g., 3.5 = 3:30 AM)
  bedtime: string; // ISO
  wakeTime: string; // ISO
}

export interface DataMeta {
  importDate: string;
  totalRecords: number;
  dateRange: { start: string; end: string };
  availableMetrics: string[];
}

// Display config per metric
export const METRIC_CONFIG: Record<string, {
  label: string;
  unit: string;
  decimals: number;
  higherIsBetter: boolean;
  color: string;
}> = {
  restingHeartRate: { label: "Resting HR", unit: "bpm", decimals: 0, higherIsBetter: false, color: "#ef4444" },
  hrv: { label: "HRV", unit: "ms", decimals: 0, higherIsBetter: true, color: "#8b5cf6" },
  oxygenSaturation: { label: "SpO2", unit: "%", decimals: 1, higherIsBetter: true, color: "#3b82f6" },
  stepCount: { label: "Steps", unit: "", decimals: 0, higherIsBetter: true, color: "#10b981" },
  activeEnergy: { label: "Active Cal", unit: "kcal", decimals: 0, higherIsBetter: true, color: "#f59e0b" },
  exerciseTime: { label: "Exercise", unit: "min", decimals: 0, higherIsBetter: true, color: "#ec4899" },
  bodyMass: { label: "Weight", unit: "kg", decimals: 1, higherIsBetter: false, color: "#6366f1" },
  vo2Max: { label: "VO2 Max", unit: "mL/min·kg", decimals: 1, higherIsBetter: true, color: "#14b8a6" },
  walkingHeartRateAverage: { label: "Walking HR", unit: "bpm", decimals: 0, higherIsBetter: false, color: "#f97316" },
  respiratoryRate: { label: "Resp. Rate", unit: "/min", decimals: 1, higherIsBetter: false, color: "#06b6d4" },
};
