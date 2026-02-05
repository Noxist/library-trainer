// src/engine/dataset.js

const TIME_KEY_RE = /^\d{2}:\d{2}$/;

export function parseDayFromFilename(filename) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})_ml\.json$/);
  return m ? m[1] : null;
}

export async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

export async function readJsonUrl(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Konnte ${url} nicht laden (HTTP ${res.status})`);
  return res.json();
}

function toOccupiedFlag(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value > 0 ? 1 : 0;

  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "busy", "occupied", "blocked", "booked", "taken", "x"].includes(v)) return 1;
    if (["0", "false", "free", "available", "open", "vacant", "empty", ""].includes(v)) return 0;
    const asNum = Number(v);
    if (!Number.isNaN(asNum)) return asNum > 0 ? 1 : 0;
  }

  return value ? 1 : 0;
}

function normalizeSlotsMap(rawSlots) {
  if (!rawSlots || typeof rawSlots !== "object" || Array.isArray(rawSlots)) return null;

  const normalized = {};
  for (const [time, value] of Object.entries(rawSlots)) {
    if (!TIME_KEY_RE.test(time)) continue;
    normalized[time] = toOccupiedFlag(value);
  }

  return Object.keys(normalized).length ? normalized : null;
}

function normalizeDayObject(rawDayObj) {
  if (!rawDayObj || typeof rawDayObj !== "object") return null;

  const dayObj = {};

  for (const [roomName, roomValue] of Object.entries(rawDayObj)) {
    if (!roomValue) continue;

    const rawSlots =
      roomValue?.slots && typeof roomValue.slots === "object"
        ? roomValue.slots
        : roomValue;

    const slots = normalizeSlotsMap(rawSlots);
    if (!slots) continue;

    dayObj[roomName] = { slots };
  }

  return Object.keys(dayObj).length ? dayObj : null;
}

/**
 * Wandelt verschiedene JSON-Formate in das von der Engine benötigte Format um.
 * Liefert null zurück, wenn ein Tagesfile keine verwertbaren Slotdaten enthält.
 */
function extractDayData(json, day) {
  let rawDayObj = null;
  let rooms = null;

  // FORMAT 1: Neue Struktur (json.data.slots)
  if (json?.data?.slots) {
    rawDayObj = json.data.slots;
    if (Array.isArray(json.data.rooms)) rooms = json.data.rooms;
  }
  // FORMAT 2: Alte Struktur mit "days"-Objekt
  else if (json?.days?.[day]) {
    rawDayObj = json.days[day];
    if (Array.isArray(json.rooms)) rooms = json.rooms;
  }
  // FORMAT 3: Struktur mit "days" und nur einem Key
  else if (json?.days && Object.keys(json.days).length === 1) {
    const onlyKey = Object.keys(json.days)[0];
    rawDayObj = json.days[onlyKey];
    if (Array.isArray(json.rooms)) rooms = json.rooms;
  }
  // FORMAT 4: Struktur mit "roomsData"
  else if (json?.roomsData) {
    rawDayObj = json.roomsData;
    if (Array.isArray(json.rooms)) rooms = json.rooms;
  }

  const dayObj = normalizeDayObject(rawDayObj);
  return { dayObj, rooms };
}

function finalizeDataset(dataset) {
  dataset.meta.dayCount = Object.keys(dataset.days).length;

  if (!dataset.rooms) {
    const firstDay = Object.keys(dataset.days)[0];
    dataset.rooms = firstDay ? Object.keys(dataset.days[firstDay] || {}) : [];
  }

  // Sammle alle Räume aus allen Tagen
  const roomSet = new Set(dataset.rooms);
  for (const d of Object.keys(dataset.days)) {
    for (const r of Object.keys(dataset.days[d] || {})) {
      if (!roomSet.has(r)) {
        dataset.rooms.push(r);
        roomSet.add(r);
      }
    }
  }

  if (!dataset.meta.dayCount) {
    throw new Error("Keine kompatiblen Tagesdaten gefunden (keine verwertbaren Slot-Informationen).");
  }
}

export async function buildDatasetFromUploads(dayFiles, matrixFile) {
  if (!matrixFile) throw new Error("Matrix fehlt: roomDistanceMatrix.json");
  if (!dayFiles || dayFiles.length === 0) throw new Error("Keine Tages-JSONs hochgeladen");

  const matrix = await readJsonFile(matrixFile);

  const dataset = {
    rooms: null,
    days: {},
    meta: { source: "uploaded_multi_files", createdAtISO: new Date().toISOString(), dayCount: 0 }
  };

  for (const f of dayFiles) {
    const day = parseDayFromFilename(f.name);
    if (!day) throw new Error(`Ungültiger Tages-Dateiname: ${f.name}`);

    const json = await readJsonFile(f);
    const { dayObj, rooms } = extractDayData(json, day);

    if (!dayObj) {
      console.warn(`Überspringe ${f.name}: keine kompatiblen Slotdaten gefunden.`);
      continue;
    }

    if (!dataset.rooms && rooms) dataset.rooms = rooms;
    dataset.days[day] = dayObj;
  }

  finalizeDataset(dataset);
  return { dataset, matrix };
}

export async function buildDatasetFromRepository() {
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  const dataRoot = `${cleanBase}data/`;

  const index = await readJsonUrl(`${dataRoot}dataset-index.json`);
  const dayFiles = Array.isArray(index?.dayFiles) ? index.dayFiles : [];
  const matrixFile = index?.matrixFile || "roomDistanceMatrix.json";

  if (!dayFiles.length) throw new Error("Keine dayFiles in dataset-index.json gefunden");

  const matrix = await readJsonUrl(`${dataRoot}${matrixFile}`);

  const dataset = {
    rooms: null,
    days: {},
    meta: { source: "repo_public_data", createdAtISO: new Date().toISOString(), dayCount: 0 }
  };

  for (const fileName of dayFiles) {
    const day = parseDayFromFilename(fileName);
    if (!day) {
      console.warn(`Überspringe ungültigen Dateinamen: ${fileName}`);
      continue;
    }

    try {
      const json = await readJsonUrl(`${dataRoot}${fileName}`);
      const { dayObj, rooms } = extractDayData(json, day);

      if (!dayObj) {
        console.warn(`Überspringe ${fileName}: keine kompatiblen Slotdaten gefunden.`);
        continue;
      }

      dataset.days[day] = dayObj;
      if (!dataset.rooms && rooms) dataset.rooms = rooms;
    } catch (e) {
      console.warn(`Fehler beim Laden von ${fileName}:`, e);
    }
  }

  finalizeDataset(dataset);
  return { dataset, matrix };
}
