import { initWeights, initOptState, updateWeightsAdam } from "./trainer.js";

const BASE_FEATURES = [
  "distanceNorm",
  "waitPenalty",
  "switchPenalty",
  "stabilityPenalty",
  "productiveLossMin",
  "riskLateMin",
  "totalPlannedMin",
  "totalCoveredMin",
];

// Erzeugt Interaktions-Features (z.B. distanceNorm * waitPenalty)
function expandFeatures(feat) {
  const expanded = { ...feat };
  const keys = Object.keys(feat);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i; j < keys.length; j++) {
      const k1 = keys[i];
      const k2 = keys[j];
      expanded[`${k1}_x_${k2}`] = feat[k1] * feat[k2];
    }
  }
  return expanded;
}

function predict(weights, featA, featB) {
  let scoreA = 0;
  let scoreB = 0;
  for (const k in weights) {
    scoreA += (weights[k] || 0) * (featA[k] || 0);
    scoreB += (weights[k] || 0) * (featB[k] || 0);
  }
  return scoreA > scoreB ? "A" : "B";
}

// --- CORE: Die Brute-Force Analyse ---

export async function runDeepAnalysis(filesData, onProgress) {
  // 1. Daten aggregieren & vorbereiten
  let allRows = [];
  for (const file of filesData) {
    allRows = allRows.concat(file.rows);
  }

  // Für Interaktions-Check brauchen wir erweiterte Features (optional, hier erst mal Basis-Analyse massiv skalieren)
  // Wir bleiben bei Basis-Features für die Stabilität, aber erhöhen die Iterationen drastisch.

  const TOTAL_STEPS = 6;
  const report = (msg, step, pctInStep) => {
    const totalPct = (step + pctInStep) / TOTAL_STEPS;
    if (onProgress) onProgress(msg, totalPct);
  };

  // --- PHASE 1: Massive Grid Search (Hyperparameter) ---
  // Wir testen ein sehr feines Raster.
  // Lernraten: 0.001 bis 0.5 in vielen Schritten
  // L2: 0.00001 bis 0.1
  const learningRates = [0.001, 0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3];
  const l2Rates = [0.00001, 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1];
  
  let bestParams = { lr: 0.05, l2: 0.001 };
  let bestCVScore = -Infinity;
  let triedConfigs = 0;
  const totalConfigs = learningRates.length * l2Rates.length;

  for (const lr of learningRates) {
    for (const l2 of l2Rates) {
      triedConfigs++;
      report(`Grid Search: Konfiguration ${triedConfigs}/${totalConfigs} testen...`, 0, triedConfigs / totalConfigs);
      
      // 5-Fold Cross Validation für JEDE Konfiguration mit vielen Epochen
      const score = await trainModelCV(allRows, { lr, l2, epochs: 300 }); 
      
      if (score > bestCVScore) {
        bestCVScore = score;
        bestParams = { lr, l2 };
      }
      
      // Kurze Pause für UI-Updates
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // --- PHASE 2: Konvergenz-Prüfung (Long Run) ---
  // Wir trainieren das Modell mit den besten Parametern extrem lange, um sicherzugehen, dass es konvergiert.
  report(`Deep Training (10.000 Epochen) mit LR=${bestParams.lr}...`, 1, 0);
  const deepModel = await trainModelSync(allRows, { ...bestParams, epochs: 10000 }, (p) => report(`Deep Training... ${(p*100).toFixed(0)}%`, 1, p));

  // --- PHASE 3: Feature Importance durch Permutation ---
  // Wir verwürfeln jedes Feature einzeln und messen den Genauigkeitsverlust.
  // Das ist der Goldstandard für "Wichtigkeit".
  report("Berechne Feature Importance (Permutation Test)...", 2, 0);
  const baseAcc = evaluate(deepModel.weights, allRows);
  const featureImportance = {};

  for (let i = 0; i < BASE_FEATURES.length; i++) {
    const feat = BASE_FEATURES[i];
    report(`Analysiere Einfluss von '${feat}'...`, 2, i / BASE_FEATURES.length);
    
    // Kopie der Daten mit verwürfeltem Feature
    const permutedRows = permuteFeature(allRows, feat);
    const permAcc = evaluate(deepModel.weights, permutedRows);
    
    // Wichtigkeit = Wie stark bricht die Genauigkeit ein?
    featureImportance[feat] = baseAcc - permAcc; 
    await new Promise(r => setTimeout(r, 5));
  }

  // --- PHASE 4: Stabilitäts-Analyse (Massives Bootstrapping) ---
  // 100 Iterationen, um echte Konfidenzintervalle zu bekommen.
  report("Stabilitäts-Check (100 Bootstrap-Iterationen)...", 3, 0);
  const BOOTSTRAP_ROUNDS = 100;
  const weightSamples = {};
  BASE_FEATURES.forEach(f => weightSamples[f] = []);

  for (let i = 0; i < BOOTSTRAP_ROUNDS; i++) {
    if (i % 5 === 0) report(`Bootstrapping Runde ${i+1}/${BOOTSTRAP_ROUNDS}...`, 3, i / BOOTSTRAP_ROUNDS);
    
    const sample = resample(allRows);
    // Jedes Bootstrap-Modell braucht auch Zeit zum Konvergieren
    const m = await trainModelSync(sample, { ...bestParams, epochs: 1000 }); 
    
    BASE_FEATURES.forEach(f => weightSamples[f].push(m.weights[f]));
    await new Promise(r => setTimeout(r, 0));
  }

  // --- PHASE 5: Leave-One-Out (LOO) für Ausreißer-Erkennung ---
  // Findet Entscheidungen, die untypisch für den User sind.
  report("Suche Inkonsistenzen in den Daten...", 4, 0);
  const inconsistencies = [];
  // Bei sehr vielen Daten ist LOO zu teuer, wir machen K-Fold mit K=N (bzw. Limit)
  const looLimit = Math.min(allRows.length, 200); // Limitieren auf 200 checks um nicht ewig zu brauchen
  
  for (let i = 0; i < looLimit; i++) {
     const trainSet = [...allRows];
     const testRow = trainSet.splice(i, 1)[0];
     // Schnelltraining
     const looModel = await trainModelSync(trainSet, { ...bestParams, epochs: 500 });
     const pred = predict(looModel.weights, testRow.featA, testRow.featB);
     if (pred !== testRow.choice) {
       inconsistencies.push({ index: i, row: testRow, prediction: pred });
     }
     if (i % 20 === 0) await new Promise(r => setTimeout(r, 0));
  }

  // --- PHASE 6: Abschluss ---
  report("Finalisiere Report...", 5, 0.5);
  
  // Statistiken berechnen
  const finalWeightsStats = {};
  BASE_FEATURES.forEach(f => {
    const vals = weightSamples[f];
    const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
    const variance = vals.reduce((a,b)=>a+(b-mean)**2, 0) / vals.length;
    const stdDev = Math.sqrt(variance);
    
    finalWeightsStats[f] = {
      mean,
      stdDev,
      importance: featureImportance[f],
      samples: vals
    };
  });

  return {
    bestParams,
    accuracy: baseAcc,
    weights: finalWeightsStats,
    inconsistencies,
    rowCount: allRows.length,
    rawHistory: allRows // Für Export
  };
}


// --- Helfer ---

async function trainModelSync(data, { lr, l2, epochs }, onEpoch) {
  let weights = initWeights();
  let opt = initOptState();
  const chunkSize = 200; // UI Updates alle X Epochen

  for (let e = 0; e < epochs; e++) {
    for (const row of data) {
      const res = updateWeightsAdam({
        weights, opt, featA: row.featA, featB: row.featB, choice: row.choice, lr, l2
      });
      weights = res.weights;
      opt = res.opt;
    }
    if (e % chunkSize === 0) {
      if (onEpoch) onEpoch(e/epochs);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  return { weights };
}

async function trainModelCV(data, params) {
  const k = 5;
  const chunkSize = Math.floor(data.length / k);
  let totalAcc = 0;

  for (let i = 0; i < k; i++) {
    const testStart = i * chunkSize;
    const testEnd = testStart + chunkSize;
    const trainData = [...data.slice(0, testStart), ...data.slice(testEnd)];
    const testData = data.slice(testStart, testEnd);

    // Hier kein await im Loop für Speed, wir wollen nur Score
    let weights = initWeights();
    let opt = initOptState();
    for (let e=0; e<params.epochs; e++) {
        for(const row of trainData) {
            const res = updateWeightsAdam({weights, opt, featA: row.featA, featB: row.featB, choice: row.choice, lr: params.lr, l2: params.l2});
            weights = res.weights;
            opt = res.opt;
        }
    }
    
    totalAcc += evaluate(weights, testData);
  }
  return totalAcc / k;
}

function evaluate(weights, data) {
  if (!data.length) return 0;
  let correct = 0;
  for (const row of data) {
    if (predict(weights, row.featA, row.featB) === row.choice) correct++;
  }
  return correct / data.length;
}

function permuteFeature(rows, featureKey) {
  // Fisher-Yates Shuffle nur für eine Spalte
  const values = rows.map(r => ({ A: r.featA[featureKey], B: r.featB[featureKey] }));
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  
  // Neue Rows bauen
  return rows.map((r, idx) => ({
    ...r,
    featA: { ...r.featA, [featureKey]: values[idx].A },
    featB: { ...r.featB, [featureKey]: values[idx].B }
  }));
}

function resample(data) {
  const res = [];
  for (let i = 0; i < data.length; i++) {
    res.push(data[Math.floor(Math.random() * data.length)]);
  }
  return res;
}

// Export Funktion für JSON Download
export function generateExportData(result) {
    return JSON.stringify(result, null, 2);
}

// CSV Parsing (bleibt gleich, aber sicherstellen dass es exportiert ist)
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
      const featA = {};
      const featB = {};
      BASE_FEATURES.forEach((f) => {
        const iA = header.indexOf(`A_${f}`);
        const iB = header.indexOf(`B_${f}`);
        if (iA > -1) featA[f] = parseFloat(row[iA]);
        if (iB > -1) featB[f] = parseFloat(row[iB]);
      });
      parsedRows.push({ featA, featB, choice: row[idxChoice] });
    });
    return { filename, rows: parsedRows };
}
