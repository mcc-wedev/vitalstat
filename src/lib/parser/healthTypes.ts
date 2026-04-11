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

export type SleepStage = "deep" | "core" | "rem" | "awake" | "inBed";

export interface SleepSegment {
  /** ISO start time */
  s: string;
  /** ISO end time */
  e: string;
  /** Stage */
  st: SleepStage;
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
  /** Raw sleep segments for hypnogram rendering. Optional — only present
   *  for nights imported after the per-segment parser update. Older imports
   *  will lack this field and the Hypnogram component will silently hide. */
  segments?: SleepSegment[];
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
// Colors: Apple Health category accent colors
export const METRIC_CONFIG: Record<string, MetricInfo> = {
  // ═══ CARDIOVASCULAR — #FF3B30 (systemRed) / #FF2D55 (systemPink) ═══
  heartRate:              { label: "Puls",                    unit: "bpm",       decimals: 0, higherIsBetter: false, color: "#FF3B30", description: "Frecventa cardiaca instantanee",                         category: "cardio",    aggregation: "mean" },
  restingHeartRate:       { label: "Puls repaus",             unit: "bpm",       decimals: 0, higherIsBetter: false, color: "#FF3B30", description: "Pulsul in repaus — indicator cheie de fitness",          category: "cardio",    aggregation: "mean" },
  hrv:                    { label: "HRV",                     unit: "ms",        decimals: 0, higherIsBetter: true,  color: "#FF2D55", description: "Variabilitatea pulsului (SDNN) — indicator de recuperare", category: "cardio",    aggregation: "mean" },
  oxygenSaturation:       { label: "SpO2",                    unit: "%",         decimals: 1, higherIsBetter: true,  color: "#5AC8FA", description: "Saturatie oxigen in sange (normal: 95-100%)",            category: "cardio",    aggregation: "mean" },
  vo2Max:                 { label: "VO2 Max",                 unit: "mL/min/kg", decimals: 1, higherIsBetter: true,  color: "#FF9500", description: "Capacitate aeroba maxima — predictor #1 longevitate",    category: "cardio",    aggregation: "mean" },
  walkingHeartRateAverage:{ label: "Puls mers",               unit: "bpm",       decimals: 0, higherIsBetter: false, color: "#FF3B30", description: "Puls mediu in timpul mersului",                         category: "cardio",    aggregation: "mean" },
  respiratoryRate:        { label: "Frecventa respiratorie",  unit: "/min",      decimals: 1, higherIsBetter: false, color: "#5AC8FA", description: "Respiratii pe minut (normal: 12-20)",                    category: "cardio",    aggregation: "mean" },
  bloodPressureSystolic:  { label: "Tensiune sistolica",      unit: "mmHg",      decimals: 0, higherIsBetter: false, color: "#FF3B30", description: "Presiunea arteriala maxima",                            category: "cardio",    aggregation: "mean" },
  bloodPressureDiastolic: { label: "Tensiune diastolica",     unit: "mmHg",      decimals: 0, higherIsBetter: false, color: "#FF3B30", description: "Presiunea arteriala minima",                            category: "cardio",    aggregation: "mean" },
  wristTemperature:       { label: "Temp. incheietura",       unit: "\u00b0C",        decimals: 2, higherIsBetter: false, color: "#FF9500", description: "Deviatie temperatura in somn fata de baseline",          category: "cardio",    aggregation: "mean" },
  bodyTemperature:        { label: "Temperatura corp",        unit: "\u00b0C",        decimals: 1, higherIsBetter: false, color: "#FF9500", description: "Temperatura corporala",                                 category: "cardio",    aggregation: "mean" },

  // ═══ ACTIVITATE — #FF9500 (systemOrange) ═══
  stepCount:       { label: "Pasi",              unit: "",     decimals: 0, higherIsBetter: true,  color: "#FF9500", description: "Numar pasi zilnic",              category: "activity", aggregation: "sum" },
  distance:        { label: "Distanta",          unit: "km",   decimals: 1, higherIsBetter: true,  color: "#FF9500", description: "Distanta mers + alergat",       category: "activity", aggregation: "sum" },
  distanceCycling: { label: "Distanta ciclism",  unit: "km",   decimals: 1, higherIsBetter: true,  color: "#34C759", description: "Distanta pedalata",             category: "activity", aggregation: "sum" },
  distanceSwimming:{ label: "Distanta inot",     unit: "m",    decimals: 0, higherIsBetter: true,  color: "#007AFF", description: "Distanta inotata",              category: "activity", aggregation: "sum" },
  flightsClimbed:  { label: "Etaje urcate",      unit: "",     decimals: 0, higherIsBetter: true,  color: "#34C759", description: "Etaje urcate pe scari",        category: "activity", aggregation: "sum" },
  activeEnergy:    { label: "Calorii active",     unit: "kcal", decimals: 0, higherIsBetter: true,  color: "#FF9500", description: "Energie cheltuita activ",      category: "activity", aggregation: "sum" },
  basalEnergy:     { label: "Calorii bazale",     unit: "kcal", decimals: 0, higherIsBetter: false, color: "#FF9500", description: "Energia cheltuita in repaus",  category: "activity", aggregation: "sum" },
  exerciseTime:    { label: "Exercitiu",          unit: "min",  decimals: 0, higherIsBetter: true,  color: "#34C759", description: "Minute de exercitiu fizic",    category: "activity", aggregation: "sum" },
  standTime:       { label: "Timp in picioare",   unit: "min",  decimals: 0, higherIsBetter: true,  color: "#007AFF", description: "Minute in picioare",           category: "activity", aggregation: "sum" },
  standHour:       { label: "Ore in picioare",    unit: "h",    decimals: 0, higherIsBetter: true,  color: "#007AFF", description: "Ore cu minim 1 min in picioare", category: "activity", aggregation: "sum" },
  swimStrokes:     { label: "Miscari inot",       unit: "",     decimals: 0, higherIsBetter: true,  color: "#007AFF", description: "Numar de miscari de inot",     category: "activity", aggregation: "sum" },

  // ═══ MOBILITATE — #007AFF (systemBlue) ═══
  walkingSpeed:     { label: "Viteza mers",          unit: "km/h", decimals: 2, higherIsBetter: true,  color: "#007AFF", description: "Predictor puternic de mortalitate la 65+",            category: "mobility", aggregation: "mean" },
  stepLength:       { label: "Lungime pas",          unit: "cm",   decimals: 0, higherIsBetter: true,  color: "#007AFF", description: "Lungimea medie a pasului",                          category: "mobility", aggregation: "mean" },
  doubleSupportPct: { label: "Dublu sprijin",        unit: "%",    decimals: 1, higherIsBetter: false, color: "#5856D6", description: "% timp cu ambele picioare pe sol — indicator balans", category: "mobility", aggregation: "mean" },
  walkingAsymmetry: { label: "Asimetrie mers",       unit: "%",    decimals: 1, higherIsBetter: false, color: "#5856D6", description: "Diferenta intre picior drept si stang",              category: "mobility", aggregation: "mean" },
  walkingSteadiness:{ label: "Stabilitate mers",     unit: "%",    decimals: 0, higherIsBetter: true,  color: "#007AFF", description: "Scor de stabilitate in mers",                       category: "mobility", aggregation: "mean" },
  sixMinWalkDistance:{ label: "Test 6 min mers",     unit: "m",    decimals: 0, higherIsBetter: true,  color: "#007AFF", description: "Distanta parcursa in testul de 6 minute",            category: "mobility", aggregation: "mean" },
  stairSpeedUp:     { label: "Viteza urcat scari",   unit: "m/s",  decimals: 2, higherIsBetter: true,  color: "#34C759", description: "Viteza la urcatul scarilor",                        category: "mobility", aggregation: "mean" },
  stairSpeedDown:   { label: "Viteza coborat scari", unit: "m/s",  decimals: 2, higherIsBetter: true,  color: "#34C759", description: "Viteza la coboratul scarilor",                      category: "mobility", aggregation: "mean" },

  // ═══ CORP — #5856D6 (systemIndigo) ═══
  bodyMass:          { label: "Greutate",            unit: "kg", decimals: 1, higherIsBetter: false, color: "#5856D6", description: "Masa corporala",              category: "body", aggregation: "mean" },
  bodyFat:           { label: "Grasime corporala",   unit: "%",  decimals: 1, higherIsBetter: false, color: "#5856D6", description: "Procentul de grasime",        category: "body", aggregation: "mean" },
  bmi:               { label: "IMC",                 unit: "",   decimals: 1, higherIsBetter: false, color: "#AF52DE", description: "Indicele de masa corporala",  category: "body", aggregation: "mean" },
  leanBodyMass:      { label: "Masa slaba",          unit: "kg", decimals: 1, higherIsBetter: true,  color: "#5856D6", description: "Masa corporala fara grasime", category: "body", aggregation: "mean" },
  waistCircumference:{ label: "Circumferinta talie", unit: "cm", decimals: 0, higherIsBetter: false, color: "#FF2D55", description: "Indicator risc cardiovascular", category: "body", aggregation: "mean" },
  height:            { label: "Inaltime",            unit: "cm", decimals: 0, higherIsBetter: false, color: "#5856D6", description: "Inaltimea",                   category: "body", aggregation: "mean" },

  // ═══ NUTRITIE — #34C759 (systemGreen) ═══
  dietaryEnergy:   { label: "Calorii consumate", unit: "kcal", decimals: 0, higherIsBetter: false, color: "#34C759", description: "Aport caloric zilnic",     category: "nutrition", aggregation: "sum" },
  dietaryProtein:  { label: "Proteine",          unit: "g",    decimals: 0, higherIsBetter: true,  color: "#34C759", description: "Consum de proteine",       category: "nutrition", aggregation: "sum" },
  dietaryCarbs:    { label: "Carbohidrati",      unit: "g",    decimals: 0, higherIsBetter: false, color: "#FF9500", description: "Consum carbohidrati",      category: "nutrition", aggregation: "sum" },
  dietaryFat:      { label: "Grasimi",           unit: "g",    decimals: 0, higherIsBetter: false, color: "#FF9500", description: "Consum grasimi",           category: "nutrition", aggregation: "sum" },
  dietaryFiber:    { label: "Fibre",             unit: "g",    decimals: 0, higherIsBetter: true,  color: "#34C759", description: "Consum fibre (tinta: 25-30g)", category: "nutrition", aggregation: "sum" },
  dietarySugar:    { label: "Zahar",             unit: "g",    decimals: 0, higherIsBetter: false, color: "#FF3B30", description: "Consum zahar",             category: "nutrition", aggregation: "sum" },
  dietarySodium:   { label: "Sodiu",             unit: "mg",   decimals: 0, higherIsBetter: false, color: "#FF9500", description: "Consum sodiu (tinta: <2300mg)", category: "nutrition", aggregation: "sum" },
  dietaryCaffeine: { label: "Cafeina",           unit: "mg",   decimals: 0, higherIsBetter: false, color: "#FF9500", description: "Consum cafeina",           category: "nutrition", aggregation: "sum" },
  dietaryWater:    { label: "Apa",               unit: "mL",   decimals: 0, higherIsBetter: true,  color: "#007AFF", description: "Consum de apa",            category: "nutrition", aggregation: "sum" },

  // ═══ WELLBEING — #FF2D55 (systemPink) ═══
  noiseExposure:       { label: "Zgomot ambiental",     unit: "dB",  decimals: 0, higherIsBetter: false, color: "#FF9500", description: "Nivel mediu zgomot (pericol >85dB)",  category: "wellbeing", aggregation: "mean" },
  headphoneAudio:      { label: "Volum casti",          unit: "dB",  decimals: 0, higherIsBetter: false, color: "#FF9500", description: "Peste 85dB dauneaza auzului",          category: "wellbeing", aggregation: "mean" },
  mindfulMinutes:      { label: "Meditatie",            unit: "min", decimals: 0, higherIsBetter: true,  color: "#5AC8FA", description: "Minute de mindfulness/meditatie",       category: "wellbeing", aggregation: "sum" },
  handwashingDuration: { label: "Spalat pe maini",      unit: "sec", decimals: 0, higherIsBetter: true,  color: "#007AFF", description: "Durata medie spalat pe maini",          category: "wellbeing", aggregation: "mean" },
  uvExposure:          { label: "Expunere UV",          unit: "",    decimals: 0, higherIsBetter: false, color: "#FF9500", description: "Indice expunere ultraviolete",           category: "wellbeing", aggregation: "mean" },
};

// Categories with Romanian labels — Apple Health category colors
export const CATEGORIES: Record<MetricCategory, { label: string; icon: string; color: string }> = {
  cardio:    { label: "Cardiovascular",   icon: "\u2665",  color: "#FF3B30" },
  sleep:     { label: "Somn",             icon: "\ud83c\udf19", color: "#AF52DE" },
  activity:  { label: "Activitate",       icon: "\ud83c\udfc3", color: "#FF9500" },
  mobility:  { label: "Mobilitate",       icon: "\ud83e\uddbf", color: "#007AFF" },
  body:      { label: "Corp",             icon: "\u2696\ufe0f", color: "#5856D6" },
  nutrition: { label: "Nutritie",         icon: "\ud83c\udf4e", color: "#34C759" },
  wellbeing: { label: "Wellbeing",        icon: "\ud83e\uddd8", color: "#FF2D55" },
};

/**
 * Unit conversions applied AT DISPLAY TIME.
 * Raw data stays in HealthKit's native units in IndexedDB (source of truth).
 */
const UNIT_CONVERTERS: Record<string, (v: number) => number> = {
  // Apple stores walking/running distance in km already? Actually in meters per iOS 17+
  // But XML export uses "unit" attribute — we don't capture it. Safest: don't convert,
  // Apple Health export shows distance as km in ro-RO setting.
  // walkingSpeed: m/s → km/h (multiply by 3.6)
  walkingSpeed: (v) => v * 3.6,
  // stairSpeedUp / stairSpeedDown: already in m/s, keep
  // oxygenSaturation: Apple stores as 0.0–1.0 fraction. Display as %.
  oxygenSaturation: (v) => (v <= 1 ? v * 100 : v),
  // stepLength: m → cm
  stepLength: (v) => v * 100,
  // doubleSupportPct / walkingAsymmetry: stored as 0.0–1.0 fraction
  doubleSupportPct: (v) => (v <= 1 ? v * 100 : v),
  walkingAsymmetry: (v) => (v <= 1 ? v * 100 : v),
  // bodyFat: 0.0–1.0 fraction
  bodyFat: (v) => (v <= 1 ? v * 100 : v),
};

/**
 * Get the display value for a daily summary respecting aggregation type
 * and applying any unit conversions.
 */
export function getDisplayValue(summary: DailySummary, metricKey: string): number {
  const config = METRIC_CONFIG[metricKey];
  if (!config) return summary.mean;
  const raw = config.aggregation === "sum" ? summary.sum : summary.mean;
  const converter = UNIT_CONVERTERS[metricKey];
  return converter ? converter(raw) : raw;
}
