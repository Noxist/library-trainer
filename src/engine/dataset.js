// src/engine/dataset.js

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

/**
 * Wandelt verschiedene JSON-Formate in das von der Engine benötigte Format um.
 * WICHTIG: Erzeugt die Struktur { slots: ... } falls diese fehlt.
 */
function extractDayData(json, day) {
  let dayObj = null;
  let rooms = null;

  // FORMAT 1: Deine neue Struktur (json.data.slots)
  if (json?.data?.slots) {
    const rawSlots = json.data.slots;
    dayObj = {};
    
    // Konvertierung: Fügt die fehlende "slots"-Ebene hinzu
    for (const [roomName, times] of Object.entries(rawSlots)) {
      dayObj[roomName] = { slots: times };
    }

    if (Array.isArray(json.data.rooms)) rooms = json.data.rooms;
  }
  // FORMAT 2: Alte Struktur mit "days"-Objekt
  else if (json?.days?.[day]) {
    dayObj = json.days[day];
    if (Array.isArray(json.rooms)) rooms = json.rooms;
  }
  // FORMAT 3: Struktur mit "days" und nur einem Key
  else if (json?.days && Object.keys(json.days).length === 1) {
    const onlyKey = Object.keys(json.days)[0];
    dayObj = json.days[onlyKey];
    if (Array.isArray(json.rooms)) rooms = json.rooms;
  }
  // FORMAT 4: Struktur mit "roomsData"
  else if (json?.roomsData) {
    dayObj = json.roomsData;
    if (Array.isArray(json.rooms)) rooms = json.rooms;
  }

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
      if (!roomSet.has(r)) { dataset.rooms.push(r); roomSet.add(r); }
    }
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

    if (!dayObj) throw new Error(`Unbekanntes JSON-Format in ${f.name}`);
    
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

      if (dayObj) {
        dataset.days[day] = dayObj;
        if (!dataset.rooms && rooms) dataset.rooms = rooms;
      }
    } catch (e) {
      console.warn(`Fehler beim Laden von ${fileName}:`, e);
    }
  }

  finalizeDataset(dataset);
  return { dataset, matrix };
}
