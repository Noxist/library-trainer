import { distMeters } from "./distance.js";
import { samplePersonalDelayMinutes } from "./profiles.js";

export function computeFeatures({ dayIndex, matrix, strategy, profile, scenarioId, distNormDiv = 600 }) {
  const blocks = strategy.blocks;
  const totalPlannedMin = sum(blocks.map(b => (b.endIdx - b.startIdx) * 15));
  const totalCoveredMin = totalPlannedMin; // "covered" hier gleich planned; später kannst du Risiko/Verlust abziehen

  // Distance + switches + wait + stability + risk
  let distSum = 0;
  let switches = 0;
  let waitPenalty = 0;
  let stabilityPenalty = 0;
  let productiveLossMin = 0;
  let riskLateMin = 0;

  const shortBrutal = profile.gapAnnoyance.shortBrutalFromMin;
  const longOk = profile.gapAnnoyance.longOkFromMin;
  const checkinStressFrom = profile.riskTolerance.lateCheckinBrutalFromMin;
  const switchLossMin = profile.switchAnnoyance.switchLossMin;

  // Stability: kurze Blocks bestrafen
  for (const b of blocks) {
    const lenMin = (b.endIdx - b.startIdx) * 15;
    if (lenMin < 90) stabilityPenalty += (90 - lenMin) / 90; // soft
  }

  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i];
    const b = blocks[i + 1];
    if (a.room !== b.room) {
      switches++;
      distSum += distMeters(matrix, a.room, b.room);
      productiveLossMin += switchLossMin;
    }
    const gapMin = (b.startIdx - a.endIdx) * 15;
    if (gapMin > 0) waitPenalty += gapPenaltyNonlinear(gapMin, shortBrutal, longOk);
  }

  // Check-in Risiko pro Block (Ankunft)
  // planned arrival = block.startTime, plus personal delay (zeitbucket)
  for (const b of blocks) {
    const delay = samplePersonalDelayMinutes(profile, scenarioId, b.startTime);
    const arrivalMin = hhmmToMin(b.startTime) + delay;
    const deadlineMin = hhmmToMin(b.startTime) + 15;
    const lateBy = arrivalMin - deadlineMin;
    if (lateBy > 0) {
      // risk steigt stärker, wenn knapp vor deadline schon Stress
      riskLateMin += lateBy + Math.max(0, checkinStressFrom - (15 - delay)) * 0.5;
    }
  }

  const distanceNorm = distSum / distNormDiv; // später: P95-Normalizer, hier brauchbarer Default
  const switchPenalty = switches * switches; // nichtlinear

  return {
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

// Kurze Lücken brutal, lange flacher
function gapPenaltyNonlinear(gMin, shortBrutalFrom, longOkFrom) {
  // piecewise, glatt genug, keine harte Kante
  const a = Math.min(gMin, shortBrutalFrom);
  const b = Math.max(0, Math.min(gMin, longOkFrom) - shortBrutalFrom);
  const c = Math.max(0, gMin - longOkFrom);

  const p1 = (a / Math.max(1, shortBrutalFrom)) ** 1.7 * 2.5; // brutal
  const p2 = (b / Math.max(1, (longOkFrom - shortBrutalFrom))) * 1.0; // mittel
  const p3 = Math.log1p(c / 30) * 0.4; // flach
  return p1 + p2 + p3;
}

function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

