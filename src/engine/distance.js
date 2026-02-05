import { SLOT_MINUTES } from "./time.js";

export const WALK_SPEED_M_PER_MIN = 70;

export function metersToWalkMinutes(meters) {
  return meters / WALK_SPEED_M_PER_MIN;
}

export function metersToWalkSlots(meters) {
  return Math.ceil(metersToWalkMinutes(meters) / SLOT_MINUTES);
}

export function distMeters(matrix, fromRoom, toRoom) {
  if (fromRoom === toRoom) return 0;
  const row = matrix[fromRoom];
  if (!row) return Infinity;
  const v = row[toRoom];
  if (typeof v !== "number") return Infinity;
  return v;
}

