// src/engine/dataset.js
// Lädt 38 Tagesfiles + Matrix aus <input type="file">, merged alles in ein Dataset.
// Erwartete Day-Filename: YYYY-MM-DD_ml.json (z.B. 2026-01-06_ml.json)
// Matrix-Filename: roomDistanceMatrix.json

export function parseDayFromFilename(filename) {
  // "2026-01-06_ml.json" -> "2026-01-06"
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})_ml\.json$/);
  return m ? m[1] : null;
}

export async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

export async function buildDatasetFromUploads(dayFiles, matrixFile) {
  if (!matrixFile) throw new Error("Matrix fehlt: roomDistanceMatrix.json hochladen");
  if (!dayFiles || dayFiles.length === 0) throw new Error("Keine Tages-JSONs hochgeladen");

  const matrix = await readJsonFile(matrixFile);

  // merged dataset
  const dataset = {
    rooms: null,
    days: {}, // { "YYYY-MM-DD": { "ROOM": { slots:{...}, events:[...] } } }
    meta: {
      source: "uploaded_multi_files",
      createdAtISO: new Date().toISOString(),
      dayCount: 0
    }
  };

  // Tagesfiles lesen/mergen
  for (const f of dayFiles) {
    const day = parseDayFromFilename(f.name);
    if (!day) throw new Error(`Ungültiger Dateiname: ${f.name} (erwartet: YYYY-MM-DD_ml.json)`);

    const json = await readJsonFile(f);

    // Wir akzeptieren zwei mögliche Formate:
    // A) original: { rooms:[], days:{ "YYYY-MM-DD": {...} } }
    // B) "day-only": { rooms:[], day:"YYYY-MM-DD", roomsData:{...} } (falls du sowas mal hattest)
    let dayObj = null;

    if (json?.days?.[day]) {
      dayObj = json.days[day];
      if (!dataset.rooms && Array.isArray(json.rooms)) dataset.rooms = json.rooms;
    } else if (json?.days && Object.keys(json.days).length === 1) {
      // Tagesfile hat evtl. dayKey drin, aber nicht exakt passend -> nimm den einzigen
      const onlyKey = Object.keys(json.days)[0];
      dayObj = json.days[onlyKey];
      if (!dataset.rooms && Array.isArray(json.rooms)) dataset.rooms = json.rooms;
    } else if (json?.roomsData) {
      dayObj = json.roomsData;
      if (!dataset.rooms && Array.isArray(json.rooms)) dataset.rooms = json.rooms;
    } else {
      throw new Error(`Unbekanntes JSON-Format in ${f.name}`);
    }

    dataset.days[day] = dayObj;
  }

  dataset.meta.dayCount = Object.keys(dataset.days).length;

  // rooms fallback aus days ableiten
  if (!dataset.rooms) {
    const firstDay = Object.keys(dataset.days)[0];
    const roomsObj = dataset.days[firstDay];
    dataset.rooms = Object.keys(roomsObj);
  }

  // Basis-Sanity: alle Tage sollten ähnliche Räume haben (wir prüfen nur grob)
  const roomSet = new Set(dataset.rooms);
  for (const d of Object.keys(dataset.days)) {
    const roomsObj = dataset.days[d];
    for (const r of Object.keys(roomsObj)) {
      if (!roomSet.has(r)) {
        // nicht crashen, aber aufnehmen
        dataset.rooms.push(r);
        roomSet.add(r);
      }
    }
  }

  return { dataset, matrix };
}

