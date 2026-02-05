export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function normalize(value, max) {
  return clamp01(value / max);
}
