import { TRAINING_MIX } from "../config/trainingMix.js";

const expanded = Object.entries(TRAINING_MIX).flatMap(
  ([hours, weight]) => Array(weight).fill(Number(hours))
);

// z.B. [4, 8, 8, 12, 12, 12]

export function selectTrainingHorizon(roundIndex) {
  return expanded[roundIndex % expanded.length];
}
