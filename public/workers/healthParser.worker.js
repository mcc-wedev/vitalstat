/**
 * Web Worker for parsing Apple Health XML export
 * Processes in chunks to handle files >500MB
 */

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
  const idx = tag.indexOf(attrName + '="');
  if (idx === -1) return "";
  const start = idx + attrName.length + 2;
  const end = tag.indexOf('"', start);
  return end === -1 ? "" : tag.substring(start, end);
}

function parseHealthDate(dateStr) {
  if (!dateStr) return "";
  return dateStr.replace(" ", "T").replace(/ ([+-]\d{4})$/, "$1");
}

self.onmessage = function (e) {
  const { buffer } = e.data;
  const totalSize = buffer.byteLength;
  const CHUNK_SIZE = 32 * 1024 * 1024; // 32MB chunks
  const decoder = new TextDecoder("utf-8");

  const dailyData = {};
  const sleepRecords = [];
  let totalRecords = 0;
  let minDate = "9999-99-99";
  let maxDate = "0000-00-00";
  const availableMetrics = new Set();

  let leftover = "";
  let bytesProcessed = 0;

  self.postMessage({ type: "progress", percent: 1 });

  for (let offset = 0; offset < totalSize; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = new Uint8Array(buffer, offset, end - offset);
    const isLast = end >= totalSize;
    const decoded = decoder.decode(chunk, { stream: !isLast });

    const text = leftover + decoded;

    // Find all <Record .../> tags in this chunk
    // We need to handle tags that span chunk boundaries
    let lastRecordEnd = 0;
    let searchStart = 0;

    while (true) {
      const recordStart = text.indexOf("<Record ", searchStart);
      if (recordStart === -1) break;

      const recordEnd = text.indexOf("/>", recordStart);
      if (recordEnd === -1) {
        // Incomplete tag — save as leftover for next chunk
        break;
      }

      const tag = text.substring(recordStart, recordEnd + 2);
      lastRecordEnd = recordEnd + 2;
      searchStart = lastRecordEnd;

      const type = extractAttr(tag, "type");

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

    // Keep leftover: from last complete record end (or from last <Record that didn't close)
    const lastOpenRecord = text.lastIndexOf("<Record ");
    if (lastOpenRecord !== -1 && lastOpenRecord >= lastRecordEnd) {
      // There's an unclosed <Record tag
      leftover = text.substring(lastOpenRecord);
    } else {
      leftover = "";
    }

    bytesProcessed = end;
    const pct = Math.floor((bytesProcessed / totalSize) * 85);
    self.postMessage({ type: "progress", percent: Math.max(2, pct) });
  }

  self.postMessage({ type: "progress", percent: 88 });

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
      const variance =
        n > 1
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

  self.postMessage({ type: "progress", percent: 93 });

  const sleepNights = processSleepRecords(sleepRecords);

  self.postMessage({ type: "progress", percent: 98 });

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
  const nightMap = {};

  for (const rec of records) {
    if (!rec.startDate) continue;
    const startHour = new Date(rec.startDate).getHours();
    const startDateObj = new Date(rec.startDate);
    const nightDate =
      startHour < 12
        ? new Date(startDateObj.getTime() - 86400000)
            .toISOString()
            .substring(0, 10)
        : rec.startDate.substring(0, 10);

    if (!nightMap[nightDate]) nightMap[nightDate] = [];
    nightMap[nightDate].push(rec);
  }

  const nights = [];
  for (const [date, recs] of Object.entries(nightMap)) {
    const watchRecs = recs.filter(
      (r) => r.sourceName && r.sourceName.toLowerCase().includes("watch")
    );
    const useRecs = watchRecs.length > 0 ? watchRecs : recs;

    let deepMin = 0,
      coreMin = 0,
      remMin = 0,
      awakeMin = 0,
      inBedMin = 0;
    let earliestBed = null,
      latestWake = null;

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
          coreMin += mins;
          break;
      }
    }

    const totalSleep = deepMin + coreMin + remMin;
    const totalInBed = inBedMin > 0 ? inBedMin : totalSleep + awakeMin;
    if (totalSleep < 60) continue;

    let midpoint = 0;
    if (earliestBed && latestWake) {
      const mid = new Date(
        (earliestBed.getTime() + latestWake.getTime()) / 2
      );
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
