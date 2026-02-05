import { distMeters } from "./distance.js";
import { samplePersonalDelayMinutes } from "./profiles.js";

function sum(values) {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function computeFeatures({ dayIndex, matrix, strategy, profile, scenarioId, distNormDiv = 600 }) {
  const blocks = strategy.blocks;
  const totalPlannedMin = sum(blocks.map((b) => (b.endIdx - b.startIdx) * 15));
  const totalCoveredMin = totalPlannedMin;

  let walkMeters = 0;
  let switches = 0;
  let waitMinutesTotal = 0;

  let waitPenalty = 0;
  let productiveLossMin = 0;
  let riskLateMin = 0;

  const shortBrutal = profile.gapAnnoyance.shortBrutalFromMin;
  const longOk = profile.gapAnnoyance.longOkFromMin;
  const checkinStressFrom = profile.riskTolerance.lateCheckinBrutalFromMin;
  const switchLossMin = profile.switchAnnoyance.switchLossMin;

  const uniqueRooms = new Set(blocks.map((b) => b.room)).size;

  let shortBlockPenalty = 0;
  for (const b of blocks) {
    const lenMin = (b.endIdx - b.startIdx) * 15;
    shortBlockPenalty += clamp01((90 - lenMin) / 90);
  }
  shortBlockPenalty = blocks.length ? shortBlockPenalty / blocks.length : 0;

  const stabilityScore = clamp01((uniqueRooms > 0 ? 1 / uniqueRooms : 0) * (1 - 0.6 * shortBlockPenalty));
  const stabilityPenalty = blocks.length ? sum(blocks.map((b) => {
    const lenMin = (b.endIdx - b.startIdx) * 15;
    return lenMin < 90 ? (90 - lenMin) / 90 : 0;
  })) : 0;

  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i];
    const b = blocks[i + 1];

    if (a.room !== b.room) {
      switches += 1;
      walkMeters += distMeters(matrix, a.room, b.room);
      productiveLossMin += switchLossMin;
    }

    const gapMin = (b.startIdx - a.endIdx) * 15;
    if (gapMin > 0) {
      waitMinutesTotal += gapMin;
      waitPenalty += gapPenaltyNonlinear(gapMin, shortBrutal, longOk);
    }
  }

  for (const b of blocks) {
    const delay = samplePersonalDelayMinutes(profile, scenarioId, b.startTime);
    const arrivalMin = hhmmToMin(b.startTime) + delay;
    const deadlineMin = hhmmToMin(b.startTime) + 15;
    const lateBy = arrivalMin - deadlineMin;
    if (lateBy > 0) {
      riskLateMin += lateBy + Math.max(0, checkinStressFrom - (15 - delay)) * 0.5;
    }
  }

  const distanceNorm = walkMeters / distNormDiv;
  const switchPenalty = switches * switches;

  return {
    walkMeters,
    waitMinutesTotal,
    switches,
    uniqueRooms,
    stabilityScore,
    distanceNorm,
    waitPenalty,
    switchPenalty,
    stabilityPenalty,
    productiveLossMin,
    riskLateMin,
    totalPlannedMin,
    totalCoveredMin
  };
}

function gapPenaltyNonlinear(gMin, shortBrutalFrom, longOkFrom) {
  const a = Math.min(gMin, shortBrutalFrom);
  const b = Math.max(0, Math.min(gMin, longOkFrom) - shortBrutalFrom);
  const c = Math.max(0, gMin - longOkFrom);

  const p1 = (a / Math.max(1, shortBrutalFrom)) ** 1.7 * 2.5;
  const p2 = (b / Math.max(1, (longOkFrom - shortBrutalFrom))) * 1.0;
  const p3 = Math.log1p(c / 30) * 0.4;
  return p1 + p2 + p3;
}

function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
