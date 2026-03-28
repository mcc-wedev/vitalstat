// Every HKQuantityTypeIdentifier Apple Watch can produce
export const QUANTITY_TYPES = {
  // Cardiovascular
  heartRate: "HKQuantityTypeIdentifierHeartRate",
  hrv: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  restingHeartRate: "HKQuantityTypeIdentifierRestingHeartRate",
  walkingHeartRateAverage: "HKQuantityTypeIdentifierWalkingHeartRateAverage",
  vo2Max: "HKQuantityTypeIdentifierVO2Max",
  oxygenSaturation: "HKQuantityTypeIdentifierOxygenSaturation",
  respiratoryRate: "HKQuantityTypeIdentifierRespiratoryRate",
  bloodPressureSystolic: "HKQuantityTypeIdentifierBloodPressureSystolic",
  bloodPressureDiastolic: "HKQuantityTypeIdentifierBloodPressureDiastolic",

  // Temperature
  wristTemperature: "HKQuantityTypeIdentifierAppleSleepingWristTemperature",
  bodyTemperature: "HKQuantityTypeIdentifierBodyTemperature",

  // Activity & Fitness
  stepCount: "HKQuantityTypeIdentifierStepCount",
  distance: "HKQuantityTypeIdentifierDistanceWalkingRunning",
  distanceCycling: "HKQuantityTypeIdentifierDistanceCycling",
  distanceSwimming: "HKQuantityTypeIdentifierDistanceSwimming",
  flightsClimbed: "HKQuantityTypeIdentifierFlightsClimbed",
  activeEnergy: "HKQuantityTypeIdentifierActiveEnergyBurned",
  basalEnergy: "HKQuantityTypeIdentifierBasalEnergyBurned",
  exerciseTime: "HKQuantityTypeIdentifierAppleExerciseTime",
  standTime: "HKQuantityTypeIdentifierAppleStandTime",
  standHour: "HKQuantityTypeIdentifierAppleStandHour",
  swimStrokes: "HKQuantityTypeIdentifierSwimmingStrokeCount",

  // Mobility
  walkingSpeed: "HKQuantityTypeIdentifierWalkingSpeed",
  stepLength: "HKQuantityTypeIdentifierWalkingStepLength",
  doubleSupportPct: "HKQuantityTypeIdentifierWalkingDoubleSupportPercentage",
  walkingAsymmetry: "HKQuantityTypeIdentifierWalkingAsymmetryPercentage",
  walkingSteadiness: "HKQuantityTypeIdentifierAppleWalkingSteadiness",
  sixMinWalkDistance: "HKQuantityTypeIdentifierSixMinuteWalkTestDistance",
  stairSpeedUp: "HKQuantityTypeIdentifierStairAscentSpeed",
  stairSpeedDown: "HKQuantityTypeIdentifierStairDescentSpeed",

  // Body
  bodyMass: "HKQuantityTypeIdentifierBodyMass",
  bodyFat: "HKQuantityTypeIdentifierBodyFatPercentage",
  bmi: "HKQuantityTypeIdentifierBodyMassIndex",
  leanBodyMass: "HKQuantityTypeIdentifierLeanBodyMass",
  waistCircumference: "HKQuantityTypeIdentifierWaistCircumference",
  height: "HKQuantityTypeIdentifierHeight",

  // Nutrition
  dietaryEnergy: "HKQuantityTypeIdentifierDietaryEnergyConsumed",
  dietaryProtein: "HKQuantityTypeIdentifierDietaryProtein",
  dietaryCarbs: "HKQuantityTypeIdentifierDietaryCarbohydrates",
  dietaryFat: "HKQuantityTypeIdentifierDietaryFatTotal",
  dietaryFiber: "HKQuantityTypeIdentifierDietaryFiber",
  dietarySugar: "HKQuantityTypeIdentifierDietarySugar",
  dietarySodium: "HKQuantityTypeIdentifierDietarySodium",
  dietaryCaffeine: "HKQuantityTypeIdentifierDietaryCaffeine",
  dietaryWater: "HKQuantityTypeIdentifierDietaryWater",

  // Audio
  noiseExposure: "HKQuantityTypeIdentifierEnvironmentalAudioExposure",
  headphoneAudio: "HKQuantityTypeIdentifierHeadphoneAudioExposure",

  // Other
  handwashingDuration: "HKQuantityTypeIdentifierHandwashingDuration",
  uvExposure: "HKQuantityTypeIdentifierUVExposure",
  mindfulMinutes: "HKQuantityTypeIdentifierMindfulSession",
} as const;

export const CATEGORY_TYPES = {
  sleepAnalysis: "HKCategoryTypeIdentifierSleepAnalysis",
  menstrualFlow: "HKCategoryTypeIdentifierMenstrualFlow",
  sexualActivity: "HKCategoryTypeIdentifierSexualActivity",
  mindfulSession: "HKCategoryTypeIdentifierMindfulSession",
  highHeartRateEvent: "HKCategoryTypeIdentifierHighHeartRateEvent",
  lowHeartRateEvent: "HKCategoryTypeIdentifierLowHeartRateEvent",
  irregularHeartRhythmEvent: "HKCategoryTypeIdentifierIrregularHeartRhythmEvent",
  toothbrushingEvent: "HKCategoryTypeIdentifierToothbrushingEvent",
} as const;

export const SLEEP_VALUES = {
  inBed: "HKCategoryValueSleepAnalysisInBed",
  awake: "HKCategoryValueSleepAnalysisAwake",
  asleepCore: "HKCategoryValueSleepAnalysisAsleepCore",
  asleepDeep: "HKCategoryValueSleepAnalysisAsleepDeep",
  asleepREM: "HKCategoryValueSleepAnalysisAsleepREM",
  asleep: "HKCategoryValueSleepAnalysisAsleep",
} as const;

// Build reverse lookup
export const TYPE_TO_KEY: Record<string, string> = {};
for (const [key, val] of Object.entries(QUANTITY_TYPES)) TYPE_TO_KEY[val] = key;
for (const [key, val] of Object.entries(CATEGORY_TYPES)) TYPE_TO_KEY[val] = key;

export const ALL_TRACKED_TYPES = new Set([
  ...Object.values(QUANTITY_TYPES),
  ...Object.values(CATEGORY_TYPES),
]);

export type MetricKey = keyof typeof QUANTITY_TYPES;

export interface HealthRecord {
  type: string;
  key: string;
  value: number;
  unit: string;
  startDate: string;
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
  date: string;
  mean: number;
  min: number;
  max: number;
  sum: number;
  count: number;
  stddev: number;
}

export interface SleepNight {
  date: string;
  totalMinutes: number;
  inBedMinutes: number;
  stages: { deep: number; core: number; rem: number; awake: number };
  efficiency: number;
  sleepMidpoint: number;
  bedtime: string;
  wakeTime: string;
}

export interface DataMeta {
  importDate: string;
  totalRecords: number;
  dateRange: { start: string; end: string };
  availableMetrics: string[];
}

// Romanian labels + display config for every metric
export const METRIC_CONFIG: Record<string, {
  label: string;
  unit: string;
  decimals: number;
  higherIsBetter: boolean;
  color: string;
  description: string;
}> = {
  // Cardiovascular
  heartRate: { label: "Puls", unit: "bpm", decimals: 0, higherIsBetter: false, color: "#ef4444", description: "Frecventa cardiaca instantanee" },
  restingHeartRate: { label: "Puls in repaus", unit: "bpm", decimals: 0, higherIsBetter: false, color: "#ef4444", description: "Puls in repaus masurat pe parcursul zilei" },
  hrv: { label: "Variabilitate puls (HRV)", unit: "ms", decimals: 0, higherIsBetter: true, color: "#8b5cf6", description: "SDNN — indicator cheie al recuperarii" },
  oxygenSaturation: { label: "Oxigen sange (SpO2)", unit: "%", decimals: 1, higherIsBetter: true, color: "#3b82f6", description: "Saturatie oxigen in sange" },
  vo2Max: { label: "VO2 Max", unit: "mL/min/kg", decimals: 1, higherIsBetter: true, color: "#14b8a6", description: "Capacitate aeroba maxima — cel mai puternic predictor de longevitate" },
  walkingHeartRateAverage: { label: "Puls mers", unit: "bpm", decimals: 0, higherIsBetter: false, color: "#f97316", description: "Puls mediu in timpul mersului" },
  respiratoryRate: { label: "Frecventa respiratorie", unit: "/min", decimals: 1, higherIsBetter: false, color: "#06b6d4", description: "Respiratii pe minut" },
  bloodPressureSystolic: { label: "Tensiune sistolica", unit: "mmHg", decimals: 0, higherIsBetter: false, color: "#dc2626", description: "Presiunea maxima" },
  bloodPressureDiastolic: { label: "Tensiune diastolica", unit: "mmHg", decimals: 0, higherIsBetter: false, color: "#b91c1c", description: "Presiunea minima" },

  // Temperature
  wristTemperature: { label: "Temperatura incheietura", unit: "°C", decimals: 2, higherIsBetter: false, color: "#f59e0b", description: "Deviatie de la baseline in somn" },
  bodyTemperature: { label: "Temperatura corp", unit: "°C", decimals: 1, higherIsBetter: false, color: "#f59e0b", description: "Temperatura corporala" },

  // Activity
  stepCount: { label: "Pasi", unit: "", decimals: 0, higherIsBetter: true, color: "#10b981", description: "Numar pasi zilnic" },
  distance: { label: "Distanta", unit: "km", decimals: 1, higherIsBetter: true, color: "#10b981", description: "Distanta mers + alergat" },
  distanceCycling: { label: "Distanta ciclism", unit: "km", decimals: 1, higherIsBetter: true, color: "#22c55e", description: "Distanta pedalata" },
  distanceSwimming: { label: "Distanta inot", unit: "m", decimals: 0, higherIsBetter: true, color: "#0ea5e9", description: "Distanta inotata" },
  flightsClimbed: { label: "Etaje urcate", unit: "", decimals: 0, higherIsBetter: true, color: "#a3e635", description: "Etaje urcate pe scari" },
  activeEnergy: { label: "Calorii active", unit: "kcal", decimals: 0, higherIsBetter: true, color: "#f59e0b", description: "Energie cheltuita activ" },
  basalEnergy: { label: "Calorii bazale", unit: "kcal", decimals: 0, higherIsBetter: false, color: "#fbbf24", description: "Energia cheltuita in repaus" },
  exerciseTime: { label: "Exercitiu", unit: "min", decimals: 0, higherIsBetter: true, color: "#ec4899", description: "Minute de exercitiu fizic" },
  standTime: { label: "Timp in picioare", unit: "min", decimals: 0, higherIsBetter: true, color: "#84cc16", description: "Minute petrecute in picioare" },

  // Mobility
  walkingSpeed: { label: "Viteza mers", unit: "km/h", decimals: 2, higherIsBetter: true, color: "#22d3ee", description: "Predictor puternic de mortalitate la 65+" },
  stepLength: { label: "Lungime pas", unit: "cm", decimals: 0, higherIsBetter: true, color: "#2dd4bf", description: "Lungimea medie a pasului" },
  doubleSupportPct: { label: "Timp dublu sprijin", unit: "%", decimals: 1, higherIsBetter: false, color: "#a78bfa", description: "% din timp cu ambele picioare pe sol — indicator balans" },
  walkingAsymmetry: { label: "Asimetrie mers", unit: "%", decimals: 1, higherIsBetter: false, color: "#c084fc", description: "Diferenta intre piciorul drept si stang" },
  walkingSteadiness: { label: "Stabilitate mers", unit: "%", decimals: 0, higherIsBetter: true, color: "#67e8f9", description: "Scor de stabilitate in mers" },
  stairSpeedUp: { label: "Viteza urcat scari", unit: "m/s", decimals: 2, higherIsBetter: true, color: "#34d399", description: "Viteza la urcatul scarilor" },
  stairSpeedDown: { label: "Viteza coborat scari", unit: "m/s", decimals: 2, higherIsBetter: true, color: "#6ee7b7", description: "Viteza la coboratul scarilor" },

  // Body
  bodyMass: { label: "Greutate", unit: "kg", decimals: 1, higherIsBetter: false, color: "#6366f1", description: "Masa corporala" },
  bodyFat: { label: "Grasime corporala", unit: "%", decimals: 1, higherIsBetter: false, color: "#818cf8", description: "Procentul de grasime" },
  bmi: { label: "IMC", unit: "", decimals: 1, higherIsBetter: false, color: "#a5b4fc", description: "Indicele de masa corporala" },

  // Nutrition
  dietaryEnergy: { label: "Calorii consumate", unit: "kcal", decimals: 0, higherIsBetter: false, color: "#fb923c", description: "Aport caloric zilnic" },
  dietaryProtein: { label: "Proteine", unit: "g", decimals: 0, higherIsBetter: true, color: "#f472b6", description: "Consum de proteine" },
  dietaryCarbs: { label: "Carbohidrati", unit: "g", decimals: 0, higherIsBetter: false, color: "#fbbf24", description: "Consum carbohidrati" },
  dietaryWater: { label: "Apa", unit: "mL", decimals: 0, higherIsBetter: true, color: "#38bdf8", description: "Consum de apa" },
  dietaryCaffeine: { label: "Cafeina", unit: "mg", decimals: 0, higherIsBetter: false, color: "#a16207", description: "Consum de cafeina" },

  // Audio
  noiseExposure: { label: "Expunere zgomot", unit: "dB", decimals: 0, higherIsBetter: false, color: "#fca5a5", description: "Nivel mediu zgomot ambiental" },
  headphoneAudio: { label: "Volum casti", unit: "dB", decimals: 0, higherIsBetter: false, color: "#fdba74", description: "Nivel audio casti — peste 85dB dauneaza auzului" },
};
