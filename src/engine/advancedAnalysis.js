import { initWeights, initOptState, updateWeightsAdam } from "./trainer.js";

const FEATURES = [
  "distanceNorm",
  "waitPenalty",
  "switchPenalty",
  "stabilityPenalty",
  "productiveLossMin",
  "riskLateMin",
  "totalPlannedMin",
  "totalCoveredMin",
];

// Hilfsfunktion: Sigmoid
function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

// Hilfsfunktion: Vorhersage für einen Datensatz
function predict(weights, row) {
  let scoreA = 0;
  let scoreB = 0;
  for (const f of FEATURES) {
    scoreA += (weights[f] || 0) * (row.featA[f] || 0);
    scoreB += (weights[f] || 0) * (row.featB[f] || 0);
  }
  return scoreA > scoreB ? "A" : "B";
}

// --- CORE: Der Trainer ---

export async function runDeepAnalysis(filesData, onProgress) {
  // 1. Daten aggregieren
  let allRows = [];
  for (const file of filesData) {
    allRows = allRows.concat(file.rows);
  }

  const totalSteps = 5; // Phasen der Analyse
  let currentStep = 0;

  const reportProgress = (msg, percent) => {
    if (onProgress) onProgress(msg, (currentStep + percent) / totalSteps);
  };

  // --- PHASE 1: Hyperparameter Grid Search (Cross Validation) ---
  currentStep = 0;
  reportProgress("Suche optimale Hyperparameter (Grid Search)...", 0);
  
  const learningRates = [0.01, 0.05, 0.1];
  const l2Rates = [0.0001, 0.001, 0.01];
  let bestParams = { lr: 0.05, l2: 0.001 };
  let bestAccuracy = 0;

  // Wir machen das async, um den UI Thread nicht zu blockieren (Glühen lassen, aber nicht abstürzen)
  for (const lr of learningRates) {
    for (const l2 of l2Rates) {
      const acc = await trainModelCV(allRows, { lr, l2, epochs: 200 }); // Kurze CV
      if (acc > bestAccuracy) {
        bestAccuracy = acc;
        bestParams = { lr, l2 };
      }
      await new Promise(r => setTimeout(r, 0)); // Yield to UI
    }
  }

  // --- PHASE 2: Globales Training (Basis-Modell) ---
  currentStep = 1;
  reportProgress(`Basis-Training mit LR=${bestParams.lr}, L2=${bestParams.l2}...`, 0);
  
  const baseModel = await trainModelFull(allRows, { ...bestParams, epochs: 1000 });

  // --- PHASE 3: Feature Importance & Fixing Strategy ---
  currentStep = 2;
  reportProgress("Analysiere dominante Faktoren...", 0);

  // Sortiere Gewichte nach absoluter Stärke
  const sortedWeights = Object.entries(baseModel.weights).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const strongestFeat = sortedWeights[0][0]; // Das allerstärkste Feature
  const secondStrongest = sortedWeights[1][0];

  // --- PHASE 4: Fine-Tuning (Fix Strong, Train Weak) ---
  currentStep = 3;
  reportProgress(`Fixiere '${strongestFeat}' & '${secondStrongest}' und optimiere Details...`, 0);

  // Wir starten mit den Gewichten aus Phase 2, aber "sperren" die Top 2
  const refinedModel = await trainModelLocked(allRows, baseModel.weights, [strongestFeat, secondStrongest], { ...bestParams, epochs: 2000, lr: bestParams.lr * 0.5 });

  // --- PHASE 5: Unsicherheits-Analyse (Bootstrapping) ---
  currentStep = 4;
  reportProgress("Berechne Konfidenzintervalle (Bootstrapping)...", 0);
  
  const bootstrapIterations = 20;
  const weightVariations = {};
  FEATURES.forEach(f => weightVariations[f] = []);

  for (let i = 0; i < bootstrapIterations; i++) {
    const sample = resample(allRows);
    const m = await trainModelFull(sample, { ...bestParams, epochs: 500 });
    FEATURES.forEach(f => weightVariations[f].push(m.weights[f]));
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
  }

  // Ergebnisse zusammenstellen
  const finalStats = {};
  FEATURES.forEach(f => {
    const vals = weightVariations[f];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const stdDev = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    finalStats[f] = {
      value: refinedModel.weights[f], // Wir nehmen das verfeinerte Gewicht
      baseValue: baseModel.weights[f],
      stdDev: stdDev,
      isDominant: [strongestFeat, secondStrongest].includes(f)
    };
  });

  return {
    bestParams,
    accuracy: bestAccuracy,
    weights: finalStats,
    rowCount: allRows.length
  };
}

// --- Helpers ---

async function trainModelCV(data, params) {
  // 5-Fold CV
  const k = 5;
  const chunkSize = Math.floor(data.length / k);
  let totalAcc = 0;

  for (let i = 0; i < k; i++) {
    const testStart = i * chunkSize;
    const testEnd = testStart + chunkSize;
    const trainData = [...data.slice(0, testStart), ...data.slice(testEnd)];
    const testData = data.slice(testStart, testEnd);

    const model = trainModelSync(trainData, params);
    const acc = evaluate(model, testData);
    totalAcc += acc;
  }
  return totalAcc / k;
}

async function trainModelFull(data, params) {
  return trainModelSync(data, params);
}

// Synchroner Trainer (der eigentliche Optimizer Loop)
function trainModelSync(data, { lr, l2, epochs }) {
  let weights = initWeights();
  let opt = initOptState();

  for (let e = 0; e < epochs; e++) {
    for (const row of data) {
      const res = updateWeightsAdam({
        weights, opt, featA: row.featA, featB: row.featB, choice: row.choice, lr, l2
      });
      weights = res.weights;
      opt = res.opt;
    }
  }
  return { weights };
}

// Locked Trainer: Aktualisiert nur nicht-fixierte Gewichte
async function trainModelLocked(data, startWeights, lockedKeys, { lr, l2, epochs }) {
  let weights = { ...startWeights };
  let opt = initOptState(); // Reset optimizer momentum

  for (let e = 0; e < epochs; e++) {
    for (const row of data) {
      // 1. Normaler Update Step
      const res = updateWeightsAdam({
        weights, opt, featA: row.featA, featB: row.featB, choice: row.choice, lr, l2
      });
      
      // 2. Override: Setze fixierte Gewichte zurück auf den Startwert
      const newWeights = res.weights;
      for (const key of lockedKeys) {
        newWeights[key] = startWeights[key];
      }
      
      weights = newWeights;
      opt = res.opt;
    }
    if (e % 100 === 0) await new Promise(r => setTimeout(r, 0));
  }
  return { weights };
}

function evaluate(model, data) {
  if (data.length === 0) return 0;
  let correct = 0;
  for (const row of data) {
    if (predict(model.weights, row) === row.choice) correct++;
  }
  return correct / data.length;
}

function resample(data) {
  const res = [];
  for (let i = 0; i < data.length; i++) {
    res.push(data[Math.floor(Math.random() * data.length)]);
  }
  return res;
}

export function parseCsvData(text, filename) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
  
    const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const rows = lines.slice(1).map((line) => line.split(",").map((c) => c.trim().replace(/"/g, "")));
  
    const idxChoice = header.indexOf("choice");
    if (idxChoice === -1) return null;
  
    const parsedRows = [];
    rows.forEach((row) => {
      if (row.length !== header.length) return;
      const choice = row[idxChoice];
      const featA = {};
      const featB = {};
      FEATURES.forEach((f) => {
        const iA = header.indexOf(`A_${f}`);
        const iB = header.indexOf(`B_${f}`);
        if (iA > -1) featA[f] = parseFloat(row[iA]);
        if (iB > -1) featB[f] = parseFloat(row[iB]);
      });
      parsedRows.push({ featA, featB, choice });
    });
  
    return { filename, rows: parsedRows };
  }
