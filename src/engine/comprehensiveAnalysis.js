import { initWeights, initOptState, updateWeightsAdam } from "./trainer.js";

// --- KONFIGURATION ---
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

// Wie wichtig sind Perfectioning-Fragen im Vergleich zu normalen?
const PERFECTIONING_WEIGHT_MULTIPLIER = 3.0; 

// --- MAIN: The Grand Analysis ---
export async function runComprehensiveAnalysis(filesData, onProgress) {
  const t0 = performance.now();
  
  // 1. Daten Aggregation
  let allRows = [];
  filesData.forEach(f => {
    // Wir markieren Rows basierend auf dem Dateinamen oder Inhalt, falls möglich
    // Aber unser Parser extrahiert jetzt das "mode" Feld direkt.
    allRows = allRows.concat(f.rows);
  });

  if (allRows.length < 5) throw new Error("Zu wenig Daten (min. 5).");

  const TOTAL_STEPS = 6;
  const report = (msg, step) => {
    if (onProgress) onProgress(msg, step / TOTAL_STEPS);
  };

  // --- PHASE 1: Feature Stats & Grid Search ---
  report("Analysiere Datenverteilung & Hyperparameter...", 0);
  const stats = calculateFeatureStats(allRows);
  
  // Grid Search für beste Lernparameter (verkürzt, da wir später massiv bootstrappen)
  const bestParams = await findBestHyperparams(allRows);

  // --- PHASE 2: Massives Bootstrapping (Der Kern) ---
  // Wir trainieren N Modelle auf Teilmengen der Daten.
  // Das liefert uns (A) Robuste Gewichte (Mittelwert) und (B) Unsicherheit (Varianz).
  const BOOTSTRAP_ROUNDS = 200; // Rechenintensiv!
  const ensembleModels = [];
  const weightAccumulator = {};
  BASE_FEATURES.forEach(f => weightAccumulator[f] = []);

  for (let i = 0; i < BOOTSTRAP_ROUNDS; i++) {
    if (i % 10 === 0) report(`Trainiere Ensemble-Modell ${i+1}/${BOOTSTRAP_ROUNDS}...`, 2);
    
    // Resampling mit Rücksicht auf Perfectioning-Gewichtung
    const sample = weightedResample(allRows);
    
    const model = await trainModelSync(sample, { ...bestParams, epochs: 1500 });
    ensembleModels.push(model);
    
    BASE_FEATURES.forEach(f => weightAccumulator[f].push(model.weights[f]));
    
    // UI nicht blockieren
    await new Promise(r => setTimeout(r, 0));
  }

  // --- PHASE 3: Gewichtungs-Analyse (Python Export Vorbereitung) ---
  report("Berechne optimale Gewichte & Stabilität...", 3);
  
  const finalWeightsStats = {};
  const meanWeights = {};
  
  BASE_FEATURES.forEach(f => {
    const vals = weightAccumulator[f];
    const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
    const variance = vals.reduce((a,b)=>a+(b-mean)**2, 0) / vals.length;
    
    meanWeights[f] = mean;
    finalWeightsStats[f] = {
      mean,
      stdDev: Math.sqrt(variance),
      stabilityScore: (1 - Math.min(1, Math.sqrt(variance) / (Math.abs(mean) + 0.1))).toFixed(2)
    };
  });

  // Konvertierung für Python Script (Mapping)
  const pythonConfig = {
    totalCoveredMin: Math.max(0.001, meanWeights["totalCoveredMin"] || 0.01),
    waitPenalty: meanWeights["waitPenalty"] || -1.0,
    switchBonus: meanWeights["switchPenalty"] || -0.5, // Mapping Penalty -> Bonus (negativ)
    stabilityBonus: (meanWeights["stabilityPenalty"] || -0.5) * -10.0, // Skalierung
    productiveLossMin: meanWeights["productiveLossMin"] || -0.1,
    preferredRoomBonus: 5.0 
  };

  // --- PHASE 4: Diagnose (Blind Spots & Unsicherheit) ---
  report("Suche nach Lücken und Widersprüchen...", 4);
  
  const diagnostics = analyzeDiagnostics(allRows, ensembleModels, meanWeights, stats);

  // --- PHASE 5: Active Learning (Next Steps) ---
  report("Generiere Trainings-Vorschläge...", 5);
  const suggestions = suggestNextQueries(ensembleModels, stats, 5);

  const t1 = performance.now();

  return {
    meta: {
      durationMs: Math.round(t1 - t0),
      rowCount: allRows.length,
      perfectioningCount: allRows.filter(r => r.mode === "PERFECTIONING").length
    },
    bestParams,
    pythonConfig,
    weightsAnalysis: finalWeightsStats,
    diagnostics,
    suggestions
  };
}

// --- CORE LOGIC ---

async function findBestHyperparams(rows) {
  // Mini Grid Search
  const lrs = [0.01, 0.05, 0.1];
  const l2s = [0.0001, 0.001];
  let bestScore = -Infinity;
  let best = { lr: 0.05, l2: 0.001 };

  for (const lr of lrs) {
    for (const l2 of l2s) {
        // 3-Fold CV für Speed
        const score = await crossValidate(rows, { lr, l2, epochs: 200 }, 3);
        if (score > bestScore) {
            bestScore = score;
            best = { lr, l2 };
        }
    }
  }
  return best;
}

async function crossValidate(rows, params, k=3) {
    const chunkSize = Math.floor(rows.length / k);
    let totalAcc = 0;
    for(let i=0; i<k; i++) {
        const testData = rows.slice(i*chunkSize, (i+1)*chunkSize);
        const trainData = [...rows.slice(0, i*chunkSize), ...rows.slice((i+1)*chunkSize)];
        const m = await trainModelSync(trainData, params);
        totalAcc += evaluate(m.weights, testData);
    }
    return totalAcc / k;
}

async function trainModelSync(data, { lr, l2, epochs }) {
  let weights = initWeights();
  let opt = initOptState();
  
  for (let e = 0; e < epochs; e++) {
    for (const row of data) {
      // PERFECTIONING Boost: Wir trainieren diese Zeile öfter oder mit höherer LR
      const isPerf = row.mode === "PERFECTIONING";
      const effectiveLr = isPerf ? lr * PERFECTIONING_WEIGHT_MULTIPLIER : lr;
      
      const res = updateWeightsAdam({
        weights, opt, 
        featA: row.featA, featB: row.featB, choice: row.choice, 
        lr: effectiveLr, l2
      });
      weights = res.weights;
      opt = res.opt;
    }
  }
  return { weights };
}

function weightedResample(rows) {
    // Normales Resampling, aber Perfectioning-Rows landen wahrscheinlicher im Topf
    const res = [];
    for(let i=0; i<rows.length; i++) {
        const idx = Math.floor(Math.random() * rows.length);
        const row = rows[idx];
        res.push(row);
        
        // Wenn es ein Perfectioning-Row ist, packen wir ihn statistisch öfter rein
        if (row.mode === "PERFECTIONING" && Math.random() < 0.5) {
            res.push(row); // Extra Kopie
        }
    }
    return res;
}

function analyzeDiagnostics(rows, models, meanWeights, stats) {
    let disagreements = 0;
    const criticalSamples = [];

    rows.forEach((row, idx) => {
        // Disagreement Check
        let votesA = 0;
        models.forEach(m => {
            if (predict(m.weights, row.featA, row.featB) === "A") votesA++;
        });
        const ratio = votesA / models.length;
        const disagreement = 1 - 2 * Math.abs(0.5 - ratio);
        
        if (disagreement > 0.3) {
            disagreements++;
            if (disagreement > 0.5 || idx % 5 === 0) { // Limit output
                criticalSamples.push({
                    id: row.scenarioId || idx,
                    mode: row.mode || "NORMAL",
                    disagreement: disagreement.toFixed(2),
                    choice: row.choice
                });
            }
        }
    });

    // Coverage Check (Wartezeit vs Distanz)
    const blindSpots = [];
    // ... (ähnliche Logik wie vorher, gekürzt für Fokus)
    
    return {
        disagreementCount: disagreements,
        criticalSamples: criticalSamples.slice(0, 10),
        datasetHealth: (1 - (disagreements / rows.length)).toFixed(2)
    };
}

function suggestNextQueries(models, stats, n) {
    const candidates = [];
    for(let i=0; i<500; i++) {
        const diff = generateRandomDiff(stats);
        // Unsicherheit messen
        let votesA = 0;
        models.forEach(m => {
            let s = 0;
            BASE_FEATURES.forEach(f => s += (m.weights[f]||0) * diff[f]);
            if (s > 0) votesA++;
        });
        const entropy = 1 - 2 * Math.abs(0.5 - (votesA / models.length));
        candidates.push({ diff, entropy });
    }
    return candidates.sort((a,b) => b.entropy - a.entropy).slice(0, n).map(c => describeDiff(c.diff));
}

// --- HELPERS ---

function predict(w, fA, fB) {
    let sA = 0, sB = 0;
    BASE_FEATURES.forEach(k => {
        sA += (w[k]||0)*(fA[k]||0);
        sB += (w[k]||0)*(fB[k]||0);
    });
    return sA > sB ? "A" : "B";
}

function evaluate(w, data) {
    let ok = 0;
    data.forEach(r => { if (predict(w, r.featA, r.featB) === r.choice) ok++; });
    return ok / data.length;
}

function calculateFeatureStats(rows) {
    const s = {};
    BASE_FEATURES.forEach(f => {
        const vals = rows.flatMap(r => [r.featA[f], r.featB[f]]);
        s[f] = { min: Math.min(...vals), max: Math.max(...vals), range: Math.max(...vals)-Math.min(...vals)||1 };
    });
    return s;
}

function generateRandomDiff(stats) {
    const d = {};
    BASE_FEATURES.forEach(f => {
        d[f] = (Math.random() - 0.5) * stats[f].range;
    });
    return d;
}

function describeDiff(diff) {
    const entries = Object.entries(diff).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1]));
    const f1 = entries[0], f2 = entries[1];
    return `Kläre Konflikt: ${f1[0]} (${f1[1].toFixed(2)}) vs. ${f2[0]} (${f2[1].toFixed(2)})`;
}

// CSV Parser, der MODE und ID korrekt liest
export function parseCsvDataWithMode(text, filename) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const header = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    
    // Indices finden
    const idxChoice = header.indexOf("choice");
    const idxMode = header.indexOf("mode"); // Suche nach "mode" Spalte
    const idxId = header.indexOf("scenarioId");

    if (idxChoice === -1) return null;

    const rows = [];
    lines.slice(1).forEach(line => {
        const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
        if (cols.length !== header.length) return;

        const featA = {}, featB = {};
        BASE_FEATURES.forEach(f => {
            const iA = header.indexOf(`A_${f}`);
            const iB = header.indexOf(`B_${f}`);
            if (iA > -1) featA[f] = parseFloat(cols[iA]);
            if (iB > -1) featB[f] = parseFloat(cols[iB]);
        });

        rows.push({
            featA, featB, 
            choice: cols[idxChoice],
            mode: idxMode > -1 ? cols[idxMode] : "UNKNOWN", // Hier lesen wir PERFECTIONING
            scenarioId: idxId > -1 ? cols[idxId] : null
        });
    });
    return { filename, rows };
}
