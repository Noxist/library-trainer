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

function predict(weights, featA, featB) {
  let scoreA = 0;
  let scoreB = 0;
  for (const k of BASE_FEATURES) {
    scoreA += (weights[k] || 0) * (featA[k] || 0);
    scoreB += (weights[k] || 0) * (featB[k] || 0);
  }
  return scoreA > scoreB ? "A" : "B";
}

export async function runDeepAnalysis(filesData, onProgress) {
  let allRows = [];
  for (const file of filesData) {
    allRows = allRows.concat(file.rows);
  }

  const TOTAL_STEPS = 5;
  const report = (msg, step, pctInStep) => {
    const totalPct = (step + pctInStep) / TOTAL_STEPS;
    if (onProgress) onProgress(msg, totalPct);
  };

  // --- PHASE 1: Massive Grid Search ---
  const learningRates = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2];
  const l2Rates = [0.00001, 0.0001, 0.001, 0.01, 0.1];
  
  let bestParams = { lr: 0.05, l2: 0.001 };
  let bestCVScore = -Infinity;
  let triedConfigs = 0;
  const totalConfigs = learningRates.length * l2Rates.length;

  for (const lr of learningRates) {
    for (const l2 of l2Rates) {
      triedConfigs++;
      report(`Grid Search: Konfiguration ${triedConfigs}/${totalConfigs}`, 0, triedConfigs / totalConfigs);
      const score = await trainModelCV(allRows, { lr, l2, epochs: 1000 }); 
      if (score > bestCVScore) {
        bestCVScore = score;
        bestParams = { lr, l2 };
      }
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // --- PHASE 2: Deep Convergence Training ---
  report(`Deep Training (20.000 Epochen)...`, 1, 0);
  const deepModel = await trainModelSync(allRows, { ...bestParams, epochs: 20000 }, (p) => report(`Training...`, 1, p));

  // --- PHASE 3: Feature Importance ---
  report("Berechne Feature Importance...", 2, 0);
  const baseAcc = evaluate(deepModel.weights, allRows);
  const featureImportance = {};
  for (let i = 0; i < BASE_FEATURES.length; i++) {
    const feat = BASE_FEATURES[i];
    const permAcc = evaluate(deepModel.weights, permuteFeature(allRows, feat));
    featureImportance[feat] = baseAcc - permAcc;
    await new Promise(r => setTimeout(r, 0));
  }

  // --- PHASE 4: Massives Bootstrapping (Der Zeit-Fresser) ---
  const BOOTSTRAP_ROUNDS = 200; 
  report(`Stabilitäts-Check (${BOOTSTRAP_ROUNDS} Runden)...`, 3, 0);
  const weightSamples = {};
  BASE_FEATURES.forEach(f => weightSamples[f] = []);

  for (let i = 0; i < BOOTSTRAP_ROUNDS; i++) {
    const sample = resample(allRows);
    const m = await trainModelSync(sample, { ...bestParams, epochs: 2000 }); 
    BASE_FEATURES.forEach(f => weightSamples[f].push(m.weights[f]));
    if (i % 5 === 0) report(`Bootstrapping...`, 3, i / BOOTSTRAP_ROUNDS);
    await new Promise(r => setTimeout(r, 0));
  }

  // --- PHASE 5: Finale & Python Export ---
  report("Finalisiere Ergebnisse...", 4, 0.5);
  const finalWeightsStats = {};
  const meanWeights = {};
  BASE_FEATURES.forEach(f => {
    const vals = weightSamples[f];
    const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
    meanWeights[f] = mean;
    finalWeightsStats[f] = {
      mean,
      stdDev: Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2, 0) / vals.length),
      importance: featureImportance[f]
    };
  });

  const pythonConfig = {
    totalCoveredMin: Math.max(0.001, meanWeights["totalCoveredMin"] || 0.01),
    waitPenalty: meanWeights["waitPenalty"] || -1.0,
    switchBonus: meanWeights["switchPenalty"] || -0.5, 
    stabilityBonus: (meanWeights["stabilityPenalty"] || -0.5) * -10.0, 
    productiveLossMin: meanWeights["productiveLossMin"] || -0.1,
    preferredRoomBonus: 5.0 
  };

  return {
    bestParams,
    accuracy: baseAcc,
    weights: finalWeightsStats,
    pythonConfig,
    rowCount: allRows.length
  };
}

// --- Hilfsfunktionen ---

async function trainModelSync(data, { lr, l2, epochs }, onEpoch) {
  let weights = initWeights();
  let opt = initOptState();
  for (let e = 0; e < epochs; e++) {
    for (const row of data) {
      const res = updateWeightsAdam({ weights, opt, featA: row.featA, featB: row.featB, choice: row.choice, lr, l2 });
      weights = res.weights;
      opt = res.opt;
    }
    if (e % 500 === 0) {
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
    const testData = data.slice(i * chunkSize, (i + 1) * chunkSize);
    const trainData = [...data.slice(0, i * chunkSize), ...data.slice((i + 1) * chunkSize)];
    let weights = initWeights();
    let opt = initOptState();
    for (let e=0; e < params.epochs; e++) {
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
  const values = rows.map(r => ({ A: r.featA[featureKey], B: r.featB[featureKey] }));
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return rows.map((r, idx) => ({ ...r, featA: { ...r.featA, [featureKey]: values[idx].A }, featB: { ...r.featB, [featureKey]: values[idx].B } }));
}

function resample(data) {
  return Array.from({ length: data.length }, () => data[Math.floor(Math.random() * data.length)]);
}

export function parseCsvData(text, filename) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;
  const header = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  const idxChoice = header.indexOf("choice");
  if (idxChoice === -1) return null;
  const parsedRows = lines.slice(1).map(line => {
    const row = line.split(",").map(c => c.trim().replace(/"/g, ""));
    const featA = {}, featB = {};
    BASE_FEATURES.forEach(f => {
      featA[f] = parseFloat(row[header.indexOf(`A_${f}`)] || 0);
      featB[f] = parseFloat(row[header.indexOf(`B_${f}`)] || 0);
    });
    return { featA, featB, choice: row[idxChoice] };
  });
  return { filename, rows: parsedRows };
}
