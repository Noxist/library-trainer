import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "public", "data");
const indexPath = path.join(dataDir, "dataset-index.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(indexPath)) {
  fail(`[dataset-check] Fehlend: ${indexPath}`);
}

const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const matrixFile = index?.matrixFile;
const dayFiles = Array.isArray(index?.dayFiles) ? index.dayFiles : [];

if (!matrixFile) fail("[dataset-check] matrixFile fehlt in dataset-index.json");
if (!dayFiles.length) fail("[dataset-check] dayFiles fehlt oder leer in dataset-index.json");

const matrixPath = path.join(dataDir, matrixFile);
if (!fs.existsSync(matrixPath)) {
  fail(`[dataset-check] Matrix fehlt: ${matrixFile}`);
}

let missing = 0;
for (const file of dayFiles) {
  const p = path.join(dataDir, file);
  if (!fs.existsSync(p)) {
    console.error(`[dataset-check] Tagesdatei fehlt: ${file}`);
    missing += 1;
  }
}

if (missing > 0) {
  process.exit(1);
}

console.log(`[dataset-check] Dataset OK: ${dayFiles.length} day files, matrix OK`);
