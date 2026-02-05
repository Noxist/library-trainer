import { TRAINING_MIX } from "../config/trainingMix.js";

const expanded = Object.entries(TRAINING_MIX).flatMap(([hours, weight]) => {
  const count = Math.max(0, Number(weight) || 0);
  return Array(count).fill(Number(hours));
});

export function selectTrainingHorizon(roundIndex) {
  if (!expanded.length) return 8;
  return expanded[roundIndex % expanded.length];
}
