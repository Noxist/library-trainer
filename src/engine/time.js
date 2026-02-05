export const SLOT_MINUTES = 15;

export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function minutesToIdx(min, dayStartMin) {
  return Math.round((min - dayStartMin) / SLOT_MINUTES);
}

export function idxToMinutes(idx, dayStartMin) {
  return dayStartMin + idx * SLOT_MINUTES;
}

