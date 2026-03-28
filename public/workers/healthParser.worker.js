/**
 * Web Worker for parsing Apple Health XML export
 * Uses SAX-style string parsing (no DOMParser — too slow for large files)
 */

// All quantity type identifiers we track
const TRACKED_QUANTITY_TYPES = new Set([
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierWalkingHeartRateAverage",
  "HKQuantityTypeIdentifierVO2Max",
  "HKQuantityTypeIdentifierOxygenSaturation",
  "HKQuantityTypeIdentifierRespiratoryRate",
  "HKQuantityTypeIdentifierAppleSleepingWristTemperature",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierFlightsClimbed",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierBasalEnergyBurned",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKQuantityTypeIdentifierAppleStandTime",
  "HKQuantityTypeIdentifierWalkingSpeed",
  "HKQuantityTypeIdentifierWalkingStepLength",
  "HKQuantityTypeIdentifierWalkingDoubleSupportPercentage",
  "HKQuantityTypeIdentifierWalkingAsymmetryPercentage",
  "HKQuantityTypeIdentifierAppleWalkingSteadiness",
  "HKQuantityTypeIdentifierBodyMass",
  "HKQuantityTypeIdentifierBodyFatPercentage",
  "HKQuantityTypeIdentifierBodyMassIndex",
  "HKQuantityTypeIdentifierEnvironmentalSoundReduction",
  "HKQuantityTypeIdentifierHeadphoneAudioExposure",
]);

const SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";

// Short key mapping
const TYPE_TO_KEY = {
  HKQuantityTypeIdentifierHeartRate: "heartRate",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierRestingHeartRate: "restingHeartRate",
  HKQuantityTypeIdentifierWalkingHeartRateAverage: "walkingHeartRateAverage",
  HKQuantityTypeIdentifierVO2Max: "vo2Max",
  HKQuantityTypeIdentifierOxygenSaturation: "oxygenSaturation",
  HKQuantityTypeIdentifierRespiratoryRate: "respiratoryRate",
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: "wristTemperature",
  HKQuantityTypeIdentifierStepCount: "stepCount",
  HKQuantityTypeIdentifierDistanceWalkingRunning: "distance",
  HKQuantityTypeIdentifierFlightsClimbed: "flightsClimbed",
  HKQuantityTypeIdentifierActiveEnergyBurned: "activeEnergy",
  HKQuantityTypeIdentifierBasalEnergyBurned: "basalEnergy",
  HKQuantityTypeIdentifierAppleExerciseTime: "exerciseTime",
  HKQuantityTypeIdentifierAppleStandTime: "standTime",
  HKQuantityTypeIdentifierWalkingSpeed: "walkingSpeed",
  HKQuantityTypeIdentifierWalkingStepLength: "stepLength",
  HKQuantityTypeIdentifierWalkingDoubleSupportPercentage: "doubleSupportPct",
  HKQuantityTypeIdentifierWalkingAsymmetryPercentage: "walkingAsymmetry",
  HKQuantityTypeIdentifierAppleWalkingSteadiness: "walkingSteadiness",
  HKQuantityTypeIdentifierBodyMass: "bodyMass",
  HKQuantityTypeIdentifierBodyFatPercentage: "bodyFat",
  HKQuantityTypeIdentifierBodyMassIndex: "bmi",
  HKQuantityTypeIdentifierEnvironmentalSoundReduction: "noiseExposure",
  HKQuantityTypeIdentifierHeadphoneAudioExposure: "headphoneAudio",
  HKCategoryTypeIdentifierSleepAnalysis: "sleepAnalysis",
};

function extractAttr(tag, attrName) {
  const pattern = new RegExp(`${attrName}="([^"]*)"`, "i");
  const match = tag.match(pattern);
  return match ? match[1] : "";
}

function parseHealthDate(dateStr) {
  // Format: "2024-01-15 08:30:00 -0500"
  if (!dateStr) return "";
  return dateStr.replace(" ", "T").replace(/ ([+-]\d{4})$/, "$1");
}

self.onmessage = function (e) {
  const { xmlText } = e.data;
  const totalLength = xmlText.length;
  let processed = 0;
  let lastProgressReport = 0;

  // Accumulate daily data
  const dailyData = {}; // { metricKey: { "YYYY-MM-DD": [values] } }
  const sleepRecords = []; // raw sleep records
  let totalRecords = 0;
  let minDate = "9999-99-99";
  let maxDate = "0000-00-00";
  const availableMetrics = new Set();

  // Parse Records using regex (much faster than DOM for large files)
  const recordRegex = /<Record\s[^>]*\/>/g;
  let match;

  while ((match = recordRegex.exec(xmlText)) !== null) {
    const tag = match[0];
    const type = extractAttr(tag, "type");

    // Progress reporting every 2%
    processed = match.index;
    const pct = Math.floor((processed / totalLength) * 100);
    if (pct > lastProgressReport + 1) {
      lastProgressReport = pct;
      self.postMessage({ type: "progress", percent: pct });
    }

    if (type === SLEEP_TYPE) {
      const value = extractAttr(tag, "value");
      const startDate = parseHealthDate(extractAttr(tag, "startDate"));
      const endDate = parseHealthDate(extractAttr(tag, "endDate"));
      const sourceName = extractAttr(tag, "sourceName");

      sleepRecords.push({ stage: value, startDate, endDate, sourceName });
      totalRecords++;

      const dateKey = startDate.substring(0, 10);
      if (dateKey < minDate) minDate = dateKey;
      if (dateKey > maxDate) maxDate = dateKey;
      availableMetrics.add("sleepAnalysis");
      continue;
    }

    if (!TRACKED_QUANTITY_TYPES.has(type)) continue;

    const value = parseFloat(extractAttr(tag, "value"));
    if (isNaN(value)) continue;

    const startDate = parseHealthDate(extractAttr(tag, "startDate"));
    const key = TYPE_TO_KEY[type];
    const dateKey = startDate.substring(0, 10);

    if (!dailyData[key]) dailyData[key] = {};
    if (!dailyData[key][dateKey]) dailyData[key][dateKey] = [];
    dailyData[key][dateKey].push(value);

    totalRecords++;
    if (dateKey < minDate) minDate = dateKey;
    if (dateKey > maxDate) maxDate = dateKey;
    availableMetrics.add(key);
  }

  self.postMessage({ type: "progress", percent: 90 });

  // Compute daily summaries
  const summaries = {};
  for (const [key, dates] of Object.entries(dailyData)) {
    summaries[key] = [];
    const sortedDates = Object.keys(dates).sort();
    for (const date of sortedDates) {
      const vals = dates[date];
      const n = vals.length;
      const sum = vals.reduce((a, b) => a + b, 0);
      const mean = sum / n;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const variance = n > 1
        ? vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1)
        : 0;

      summaries[key].push({
        date,
        mean,
        min,
        max,
        sum,
        count: n,
        stddev: Math.sqrt(variance),
      });
    }
  }

  self.postMessage({ type: "progress", percent: 95 });

  // Process sleep into nights
  const sleepNights = processSleepRecords(sleepRecords);

  self.postMessage({
    type: "complete",
    data: {
      summaries,
      sleepNights,
      meta: {
        importDate: new Date().toISOString(),
        totalRecords,
        dateRange: { start: minDate, end: maxDate },
        availableMetrics: Array.from(availableMetrics),
      },
    },
  });
};

function processSleepRecords(records) {
  // Group sleep records by night (use bedtime date, adjusted for going to bed after midnight)
  const nightMap = {};

  for (const rec of records) {
    if (!rec.startDate) continue;
    // Determine which "night" this belongs to
    const startHour = new Date(rec.startDate).getHours();
    const startDateObj = new Date(rec.startDate);
    // If after midnight but before noon, assign to previous day's night
    const nightDate = startHour < 12
      ? new Date(startDateObj.getTime() - 86400000).toISOString().substring(0, 10)
      : rec.startDate.substring(0, 10);

    if (!nightMap[nightDate]) nightMap[nightDate] = [];
    nightMap[nightDate].push(rec);
  }

  const nights = [];
  for (const [date, recs] of Object.entries(nightMap)) {
    // Only process Apple Watch records (more accurate stages)
    const watchRecs = recs.filter(
      (r) => r.sourceName && r.sourceName.toLowerCase().includes("watch")
    );
    const useRecs = watchRecs.length > 0 ? watchRecs : recs;

    let deepMin = 0, coreMin = 0, remMin = 0, awakeMin = 0, inBedMin = 0;
    let earliestBed = null, latestWake = null;

    for (const r of useRecs) {
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      const mins = (end - start) / 60000;

      if (!earliestBed || start < earliestBed) earliestBed = start;
      if (!latestWake || end > latestWake) latestWake = end;

      switch (r.stage) {
        case "HKCategoryValueSleepAnalysisAsleepDeep":
          deepMin += mins;
          break;
        case "HKCategoryValueSleepAnalysisAsleepCore":
          coreMin += mins;
          break;
        case "HKCategoryValueSleepAnalysisAsleepREM":
          remMin += mins;
          break;
        case "HKCategoryValueSleepAnalysisAwake":
          awakeMin += mins;
          break;
        case "HKCategoryValueSleepAnalysisInBed":
          inBedMin += mins;
          break;
        case "HKCategoryValueSleepAnalysisAsleep":
          // Legacy (no stages), count as core
          coreMin += mins;
          break;
      }
    }

    const totalSleep = deepMin + coreMin + remMin;
    const totalInBed = inBedMin > 0 ? inBedMin : totalSleep + awakeMin;
    if (totalSleep < 60) continue; // skip nights with < 1h sleep

    // Sleep midpoint: average of bed and wake time as hour of day
    let midpoint = 0;
    if (earliestBed && latestWake) {
      const mid = new Date((earliestBed.getTime() + latestWake.getTime()) / 2);
      midpoint = mid.getHours() + mid.getMinutes() / 60;
    }

    nights.push({
      date,
      totalMinutes: Math.round(totalSleep),
      inBedMinutes: Math.round(totalInBed),
      stages: {
        deep: Math.round(deepMin),
        core: Math.round(coreMin),
        rem: Math.round(remMin),
        awake: Math.round(awakeMin),
      },
      efficiency: totalInBed > 0 ? totalSleep / totalInBed : 0,
      sleepMidpoint: midpoint,
      bedtime: earliestBed ? earliestBed.toISOString() : "",
      wakeTime: latestWake ? latestWake.toISOString() : "",
    });
  }

  return nights.sort((a, b) => a.date.localeCompare(b.date));
}
