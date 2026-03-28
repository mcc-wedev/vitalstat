// Every HKQuantityTypeIdentifier Apple Watch can produce
export const QUANTITY_TYPES = {
  heartRate: "HKQuantityTypeIdentifierHeartRate",
  hrv: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  restingHeartRate: "HKQuantityTypeIdentifierRestingHeartRate",
  walkingHeartRateAverage: "HKQuantityTypeIdentifierWalkingHeartRateAverage",
  vo2Max: "HKQuantityTypeIdentifierVO2Max",
  oxygenSaturation: "HKQuantityTypeIdentifierOxygenSaturation",
  respiratoryRate: "HKQuantityTypeIdentifierRespiratoryRate",
  bloodPressureSystolic: "HKQuantityTypeIdentifierBloodPressureSystolic",
  bloodPressureDiastolic: "HKQuantityTypeIdentifierBloodPressureDiastolic",
  wristTemperature: "HKQuantityTypeIdentifierAppleSleepingWristTemperature",
  bodyTemperature: "HKQuantityTypeIdentifierBodyTemperature",
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
  walkingSpeed: "HKQuantityTypeIdentifierWalkingSpeed",
  stepLength: "HKQuantityTypeIdentifierWalkingStepLength",
  doubleSupportPct: "HKQuantityTypeIdentifierWalkingDoubleSupportPercentage",
  walkingAsymmetry: "HKQuantityTypeIdentifierWalkingAsymmetryPercentage",
  walkingSteadiness: "HKQuantityTypeIdentifierAppleWalkingSteadiness",
  sixMinWalkDistance: "HKQuantityTypeIdentifierSixMinuteWalkTestDistance",
  stairSpeedUp: "HKQuantityTypeIdentifierStairAscentSpeed",
  stairSpeedDown: "HKQuantityTypeIdentifierStairDescentSpeed",
  bodyMass: "HKQuantityTypeIdentifierBodyMass",
  bodyFat: "HKQuantityTypeIdentifierBodyFatPercentage",
  bmi: "HKQuantityTypeIdentifierBodyMassIndex",
  leanBodyMass: "HKQuantityTypeIdentifierLeanBodyMass",
  waistCircumference: "HKQuantityTypeIdentifierWaistCircumference",
  height: "HKQuantityTypeIdentifierHeight",
  dietaryEnergy: "HKQuantityTypeIdentifierDietaryEnergyConsumed",
  dietaryProtein: "HKQuantityTypeIdentifierDietaryProtein",
  dietaryCarbs: "HKQuantityTypeIdentifierDietaryCarbohydrates",
  dietaryFat: "HKQuantityTypeIdentifierDietaryFatTotal",
  dietaryFiber: "HKQuantityTypeIdentifierDietaryFiber",
  dietarySugar: "HKQuantityTypeIdentifierDietarySugar",
  dietarySodium: "HKQuantityTypeIdentifierDietarySodium",
  dietaryCaffeine: "HKQuantityTypeIdentifierDietaryCaffeine",
  dietaryWater: "HKQuantityTypeIdentifierDietaryWater",
  noiseExposure: "HKQuantityTypeIdentifierEnvironmentalAudioExposure",
  headphoneAudio: "HKQuantityTypeIdentifierHeadphoneAudioExposure",
  handwashingDuration: "HKQuantityTypeIdentifierHandwashingDuration",
  uvExposure: "HKQuantityTypeIdentifierUVExposure",
} as const;

export const CATEGORY_TYPES = {
  sleepAnalysis: "HKCategoryTypeIdentifierSleepAnalysis",
  menstrualFlow: "HKCategoryTypeIdentifierMenstrualFlow",
  mindfulSession: "HKCategoryTypeIdentifierMindfulSession",
  highHeartRateEvent: "HKCategoryTypeIdentifierHighHeartRateEvent",
  lowHeartRateEvent: "HKCategoryTypeIdentifierLowHeartRateEvent",
  irregularHeartRhythmEvent: "HKCategoryTypeIdentifierIrregularHeartRhythmEvent",
} as const;

export const SLEEP_VALUES = {
  inBed: "HKCategoryValueSleepAnalysisInBed",
  awake: "HKCategoryValueSleepAnalysisAwake",
  asleepCore: "HKCategoryValueSleepAnalysisAsleepCore",
  asleepDeep: "HKCategoryValueSleepAnalysisAsleepDeep",
  asleepREM: "HKCategoryValueSleepAnalysisAsleepREM",
  asleep: "HKCategoryValueSleepAnalysisAsleep",
} as const;

export const TYPE_TO_KEY: Record<string, string> = {};
for (const [key, val] of Object.entries(QUANTITY_TYPES)) TYPE_TO_KEY[val] = key;
for (const [key, val] of Object.entries(CATEGORY_TYPES)) TYPE_TO_KEY[val] = key;

export const ALL_TRACKED_TYPES = new Set([
  ...Object.values(QUANTITY_TYPES),
  ...Object.values(CATEGORY_TYPES),
]);

export type MetricKey = keyof typeof QUANTITY_TYPES;

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

export type MetricCategory = "cardio" | "sleep" | "activity" | "mobility" | "body" | "nutrition" | "wellbeing";

export interface MetricInfo {
  label: string;
  unit: string;
  decimals: number;
  higherIsBetter: boolean;
  color: string;
  description: string;
  category: MetricCategory;
  /** "sum" = cumulate daily total (steps, calories). "mean" = average daily value (RHR, HRV). */
  aggregation: "sum" | "mean";
}

// Complete Romanian config for ALL metrics, with aggregation
export const METRIC_CONFIG: Record<string, MetricInfo> = {
  // ═══ CARDIOVASCULAR ═══
  heartRate:              { label: "Puls",                    unit: "bpm",       decimals: 0, higherIsBetter: false, color: "#ef4444", description: "Frecventa cardiaca instantanee",                         category: "cardio",    aggregation: "mean" },
  restingHeartRate:       { label: "Puls repaus",             unit: "bpm",       decimals: 0, higherIsBetter: false, color: "#ef4444", description: "Pulsul in repaus — indicator cheie de fitness",          category: "cardio",    aggregation: "mean" },
  hrv:                    { label: "HRV",                     unit: "ms",        decimals: 0, higherIsBetter: true,  color: "#8b5cf6", description: "Variabilitatea pulsului (SDNN) — indicator de recuperare", category: "cardio",    aggregation: "mean" },
  oxygenSaturation:       { label: "SpO2",                    unit: "%",         decimals: 1, higherIsBetter: true,  color: "#3b82f6", description: "Saturatie oxigen in sange (normal: 95-100%)",            category: "cardio",    aggregation: "mean" },
  vo2Max:                 { label: "VO2 Max",                 unit: "mL/min/kg", decimals: 1, higherIsBetter: true,  color: "#14b8a6", description: "Capacitate aeroba maxima — predictor #1 longevitate",    category: "cardio",    aggregation: "mean" },
  walkingHeartRateAverage:{ label: "Puls mers",               unit: "bpm",       decimals: 0, higherIsBetter: false, color: "#f97316", description: "Puls mediu in timpul mersului",                         category: "cardio",    aggregation: "mean" },
  respiratoryRate:        { label: "Frecventa respiratorie",  unit: "/min",      decimals: 1, higherIsBetter: false, color: "#06b6d4", description: "Respiratii pe minut (normal: 12-20)",                    category: "cardio",    aggregation: "mean" },
  bloodPressureSystolic:  { label: "Tensiune sistolica",      unit: "mmHg",      decimals: 0, higherIsBetter: false, color: "#dc2626", description: "Presiunea arteriala maxima",                            category: "cardio",    aggregation: "mean" },
  bloodPressureDiastolic: { label: "Tensiune diastolica",     unit: "mmHg",      decimals: 0, higherIsBetter: false, color: "#b91c1c", description: "Presiunea arteriala minima",                            category: "cardio",    aggregation: "mean" },
  wristTemperature:       { label: "Temp. incheietura",       unit: "°C",        decimals: 2, higherIsBetter: false, color: "#f59e0b", description: "Deviatie temperatura in somn fata de baseline",          category: "cardio",    aggregation: "mean" },
  bodyTemperature:        { label: "Temperatura corp",        unit: "°C",        decimals: 1, higherIsBetter: false, color: "#f59e0b", description: "Temperatura corporala",                                 category: "cardio",    aggregation: "mean" },

  // ═══ ACTIVITATE ═══
  stepCount:       { label: "Pasi",              unit: "",     decimals: 0, higherIsBetter: true,  color: "#10b981", description: "Numar pasi zilnic",              category: "activity", aggregation: "sum" },
  distance:        { label: "Distanta",          unit: "km",   decimals: 1, higherIsBetter: true,  color: "#10b981", description: "Distanta mers + alergat",       category: "activity", aggregation: "sum" },
  distanceCycling: { label: "Distanta ciclism",  unit: "km",   decimals: 1, higherIsBetter: true,  color: "#22c55e", description: "Distanta pedalata",             category: "activity", aggregation: "sum" },
  distanceSwimming:{ label: "Distanta inot",     unit: "m",    decimals: 0, higherIsBetter: true,  color: "#0ea5e9", description: "Distanta inotata",              category: "activity", aggregation: "sum" },
  flightsClimbed:  { label: "Etaje urcate",      unit: "",     decimals: 0, higherIsBetter: true,  color: "#a3e635", description: "Etaje urcate pe scari",        category: "activity", aggregation: "sum" },
  activeEnergy:    { label: "Calorii active",     unit: "kcal", decimals: 0, higherIsBetter: true,  color: "#f59e0b", description: "Energie cheltuita activ",      category: "activity", aggregation: "sum" },
  basalEnergy:     { label: "Calorii bazale",     unit: "kcal", decimals: 0, higherIsBetter: false, color: "#fbbf24", description: "Energia cheltuita in repaus",  category: "activity", aggregation: "sum" },
  exerciseTime:    { label: "Exercitiu",          unit: "min",  decimals: 0, higherIsBetter: true,  color: "#ec4899", description: "Minute de exercitiu fizic",    category: "activity", aggregation: "sum" },
  standTime:       { label: "Timp in picioare",   unit: "min",  decimals: 0, higherIsBetter: true,  color: "#84cc16", description: "Minute in picioare",           category: "activity", aggregation: "sum" },
  standHour:       { label: "Ore in picioare",    unit: "h",    decimals: 0, higherIsBetter: true,  color: "#84cc16", description: "Ore cu minim 1 min in picioare", category: "activity", aggregation: "sum" },
  swimStrokes:     { label: "Miscari inot",       unit: "",     decimals: 0, higherIsBetter: true,  color: "#0ea5e9", description: "Numar de miscari de inot",     category: "activity", aggregation: "sum" },

  // ═══ MOBILITATE ═══
  walkingSpeed:     { label: "Viteza mers",          unit: "km/h", decimals: 2, higherIsBetter: true,  color: "#22d3ee", description: "Predictor puternic de mortalitate la 65+",            category: "mobility", aggregation: "mean" },
  stepLength:       { label: "Lungime pas",          unit: "cm",   decimals: 0, higherIsBetter: true,  color: "#2dd4bf", description: "Lungimea medie a pasului",                          category: "mobility", aggregation: "mean" },
  doubleSupportPct: { label: "Dublu sprijin",        unit: "%",    decimals: 1, higherIsBetter: false, color: "#a78bfa", description: "% timp cu ambele picioare pe sol — indicator balans", category: "mobility", aggregation: "mean" },
  walkingAsymmetry: { label: "Asimetrie mers",       unit: "%",    decimals: 1, higherIsBetter: false, color: "#c084fc", description: "Diferenta intre picior drept si stang",              category: "mobility", aggregation: "mean" },
  walkingSteadiness:{ label: "Stabilitate mers",     unit: "%",    decimals: 0, higherIsBetter: true,  color: "#67e8f9", description: "Scor de stabilitate in mers",                       category: "mobility", aggregation: "mean" },
  sixMinWalkDistance:{ label: "Test 6 min mers",     unit: "m",    decimals: 0, higherIsBetter: true,  color: "#34d399", description: "Distanta parcursa in testul de 6 minute",            category: "mobility", aggregation: "mean" },
  stairSpeedUp:     { label: "Viteza urcat scari",   unit: "m/s",  decimals: 2, higherIsBetter: true,  color: "#34d399", description: "Viteza la urcatul scarilor",                        category: "mobility", aggregation: "mean" },
  stairSpeedDown:   { label: "Viteza coborat scari", unit: "m/s",  decimals: 2, higherIsBetter: true,  color: "#6ee7b7", description: "Viteza la coboratul scarilor",                      category: "mobility", aggregation: "mean" },

  // ═══ CORP ═══
  bodyMass:          { label: "Greutate",            unit: "kg", decimals: 1, higherIsBetter: false, color: "#6366f1", description: "Masa corporala",              category: "body", aggregation: "mean" },
  bodyFat:           { label: "Grasime corporala",   unit: "%",  decimals: 1, higherIsBetter: false, color: "#818cf8", description: "Procentul de grasime",        category: "body", aggregation: "mean" },
  bmi:               { label: "IMC",                 unit: "",   decimals: 1, higherIsBetter: false, color: "#a5b4fc", description: "Indicele de masa corporala",  category: "body", aggregation: "mean" },
  leanBodyMass:      { label: "Masa slaba",          unit: "kg", decimals: 1, higherIsBetter: true,  color: "#7c3aed", description: "Masa corporala fara grasime", category: "body", aggregation: "mean" },
  waistCircumference:{ label: "Circumferinta talie", unit: "cm", decimals: 0, higherIsBetter: false, color: "#9333ea", description: "Indicator risc cardiovascular", category: "body", aggregation: "mean" },
  height:            { label: "Inaltime",            unit: "cm", decimals: 0, higherIsBetter: false, color: "#c4b5fd", description: "Inaltimea",                   category: "body", aggregation: "mean" },

  // ═══ NUTRITIE ═══
  dietaryEnergy:   { label: "Calorii consumate", unit: "kcal", decimals: 0, higherIsBetter: false, color: "#fb923c", description: "Aport caloric zilnic",     category: "nutrition", aggregation: "sum" },
  dietaryProtein:  { label: "Proteine",          unit: "g",    decimals: 0, higherIsBetter: true,  color: "#f472b6", description: "Consum de proteine",       category: "nutrition", aggregation: "sum" },
  dietaryCarbs:    { label: "Carbohidrati",      unit: "g",    decimals: 0, higherIsBetter: false, color: "#fbbf24", description: "Consum carbohidrati",      category: "nutrition", aggregation: "sum" },
  dietaryFat:      { label: "Grasimi",           unit: "g",    decimals: 0, higherIsBetter: false, color: "#fb7185", description: "Consum grasimi",           category: "nutrition", aggregation: "sum" },
  dietaryFiber:    { label: "Fibre",             unit: "g",    decimals: 0, higherIsBetter: true,  color: "#86efac", description: "Consum fibre (tinta: 25-30g)", category: "nutrition", aggregation: "sum" },
  dietarySugar:    { label: "Zahar",             unit: "g",    decimals: 0, higherIsBetter: false, color: "#fda4af", description: "Consum zahar",             category: "nutrition", aggregation: "sum" },
  dietarySodium:   { label: "Sodiu",             unit: "mg",   decimals: 0, higherIsBetter: false, color: "#fdba74", description: "Consum sodiu (tinta: <2300mg)", category: "nutrition", aggregation: "sum" },
  dietaryCaffeine: { label: "Cafeina",           unit: "mg",   decimals: 0, higherIsBetter: false, color: "#a16207", description: "Consum cafeina",           category: "nutrition", aggregation: "sum" },
  dietaryWater:    { label: "Apa",               unit: "mL",   decimals: 0, higherIsBetter: true,  color: "#38bdf8", description: "Consum de apa",            category: "nutrition", aggregation: "sum" },

  // ═══ WELLBEING ═══
  noiseExposure:       { label: "Zgomot ambiental",     unit: "dB",  decimals: 0, higherIsBetter: false, color: "#fca5a5", description: "Nivel mediu zgomot (pericol >85dB)",  category: "wellbeing", aggregation: "mean" },
  headphoneAudio:      { label: "Volum casti",          unit: "dB",  decimals: 0, higherIsBetter: false, color: "#fdba74", description: "Peste 85dB dauneaza auzului",          category: "wellbeing", aggregation: "mean" },
  mindfulMinutes:      { label: "Meditatie",            unit: "min", decimals: 0, higherIsBetter: true,  color: "#a78bfa", description: "Minute de mindfulness/meditatie",       category: "wellbeing", aggregation: "sum" },
  handwashingDuration: { label: "Spalat pe maini",      unit: "sec", decimals: 0, higherIsBetter: true,  color: "#5eead4", description: "Durata medie spalat pe maini",          category: "wellbeing", aggregation: "mean" },
  uvExposure:          { label: "Expunere UV",          unit: "",    decimals: 0, higherIsBetter: false, color: "#fde047", description: "Indice expunere ultraviolete",           category: "wellbeing", aggregation: "mean" },
};

// Categories with Romanian labels
export const CATEGORIES: Record<MetricCategory, { label: string; icon: string; color: string }> = {
  cardio:    { label: "Cardiovascular",   icon: "♥",  color: "#ef4444" },
  sleep:     { label: "Somn",             icon: "🌙", color: "#8b5cf6" },
  activity:  { label: "Activitate",       icon: "🏃", color: "#10b981" },
  mobility:  { label: "Mobilitate",       icon: "🦿", color: "#22d3ee" },
  body:      { label: "Corp",             icon: "⚖️", color: "#6366f1" },
  nutrition: { label: "Nutritie",         icon: "🍎", color: "#fb923c" },
  wellbeing: { label: "Wellbeing",        icon: "🧘", color: "#a78bfa" },
};

/**
 * Get the display value for a daily summary respecting aggregation type
 */
export function getDisplayValue(summary: DailySummary, metricKey: string): number {
  const config = METRIC_CONFIG[metricKey];
  if (!config) return summary.mean;
  return config.aggregation === "sum" ? summary.sum : summary.mean;
}
