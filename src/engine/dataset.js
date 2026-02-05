// /src/engine/dataset.js
export function parseDayFromFilename(filename) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})_ml\.json$/);
  return m ? m[1] : null;
}

export async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

export async function buildDatasetFromUploads(dayFiles, matrixFile) {
  if (!matrixFile) throw new Error("Matrix fehlt: roomDistanceMatrix.json");
  if (!dayFiles || dayFiles.length === 0) throw new Error("Keine Tages-JSONs hochgeladen");

  if (matrixFile.name !== "roomDistanceMatrix.json") {
    throw new Error(`Matrix-Dateiname falsch: ${matrixFile.name} (erwartet roomDistanceMatrix.json)`);
  }

  const matrix = await readJsonFile(matrixFile);

  const dataset = {
    rooms: null,
    days: {},
    meta: { source: "uploaded_multi_files", createdAtISO: new Date().toISOString(), dayCount: 0 }
  };

  for (const f of dayFiles) {
    const day = parseDayFromFilename(f.name);
    if (!day) throw new Error(`Ungültiger Tages-Dateiname: ${f.name} (erwartet YYYY-MM-DD_ml.json)`);

    const json = await readJsonFile(f);

    let dayObj = null;
    if (json?.days?.[day]) {
      dayObj = json.days[day];
      if (!dataset.rooms && Array.isArray(json.rooms)) dataset.rooms = json.rooms;
    } else if (json?.days && Object.keys(json.days).length === 1) {
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

  if (!dataset.rooms) {
    const firstDay = Object.keys(dataset.days)[0];
    dataset.rooms = Object.keys(dataset.days[firstDay] || {});
  }

  // falls einzelne Tage zusätzliche Räume haben
  const roomSet = new Set(dataset.rooms);
  for (const d of Object.keys(dataset.days)) {
    for (const r of Object.keys(dataset.days[d] || {})) {
      if (!roomSet.has(r)) { dataset.rooms.push(r); roomSet.add(r); }
    }
  }

  return { dataset, matrix };
}
