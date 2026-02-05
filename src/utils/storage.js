// /src/utils/storage.js
const KEY = "rr_trainer_v2";

export function loadState() {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(KEY);
}

export function saveDataset(dataset, matrix) {
  localStorage.setItem(`${KEY}_dataset`, JSON.stringify({ dataset, matrix }));
}

export function loadDataset() {
  try { const raw = localStorage.getItem(`${KEY}_dataset`); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

export function resetDataset() {
  localStorage.removeItem(`${KEY}_dataset`);
}
