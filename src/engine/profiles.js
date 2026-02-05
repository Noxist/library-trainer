import { clamp, makeRng, hashStringToUint32, randn } from "./prng.js";
import { timeToMinutes } from "./time.js";

export function defaultProfile(userId = "unknown") {
  return {
    userId,
    // Zeitbucket-Delay in Minuten (mean/std)
    delayByBucket: {
      MORNING:   { meanMin: 6, stdMin: 4 },
      MIDDAY:    { meanMin: 3, stdMin: 3 },
      AFTERNOON: { meanMin: 2, stdMin: 3 },
      EVENING:   { meanMin: 1, stdMin: 2 },
    },
    gapAnnoyance: { shortBrutalFromMin: 20, longOkFromMin: 60 },
    riskTolerance: { lateCheckinBrutalFromMin: 5 },
    switchAnnoyance: { switchLossMin: 15 }
  };
}

export function timeBucket(hhmm) {
  const m = timeToMinutes(hhmm);
  if (m < 11 * 60) return "MORNING";
  if (m < 14 * 60) return "MIDDAY";
  if (m < 17 * 60) return "AFTERNOON";
  return "EVENING";
}

// Deterministischer Delay-Sample pro Scenario + Blockstart
export function samplePersonalDelayMinutes(profile, scenarioId, blockStartHHMM) {
  const bucket = timeBucket(blockStartHHMM);
  const model = profile.delayByBucket[bucket];
  const seed = hashStringToUint32(`${profile.userId}|${scenarioId}|${bucket}|${blockStartHHMM}`);
  const rng = makeRng(seed);
  const z = randn(rng);
  const x = model.meanMin + model.stdMin * z;
  // Keine absurden Werte, aber kein hartes "max": nur sanft clampen
  return clamp(x, -10, 45);
}

