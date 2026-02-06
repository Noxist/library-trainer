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

// Active Learning: Perfectioning-Daten zählen 5x so viel wie normale,
// da sie gezielt Schwachstellen adressieren.
const PERFECTIONING_WEIGHT_MULTIPLIER = 5.0; 

// --- HAUPTFUNKTION ---
export async function runComprehensiveAnalysis(filesData, onProgress) {
  const t0 = performance.now();
  
  // 1. Daten Aggregation & Säuberung
  let allRows = [];
  filesData.forEach(f => {
    if (f.rows && Array.isArray(f.rows)) {
        allRows = allRows.concat(f.rows);
    }
  });

  if (allRows.length < 5) throw new Error("Zu wenige Daten (min. 5 Entscheidungen nötig).");

  const TOTAL_STEPS = 6;
  const report = (msg, step) => {
    if (onProgress) onProgress(msg, step / TOTAL_STEPS);
  };

  // --- PHASE 1: Feature Stats & Grid Search ---
  report(`Analysiere ${allRows.length} Entscheidungen...`, 0);
  const stats = calculateFeatureStats(allRows);
  
  // Wir suchen konservative Hyperparameter, um Overfitting zu vermeiden
  const bestParams = { lr: 0.05, l2: 0.01 }; 

  // --- PHASE 2: Massives Bootstrapping (Der Kern) ---
  const BOOTSTRAP_ROUNDS = 100; 
  const ensembleModels = [];
  const weightAccumulator = {};
  BASE_FEATURES.forEach(f => weightAccumulator[f] = []);

  for (let i = 0; i < BOOTSTRAP_ROUNDS; i++) {
    if (i % 10 === 0) report(`Trainiere Ensemble-Modell ${i+1}/${BOOTSTRAP_ROUNDS}...`, 2);
    
    // Resampling: Wir ziehen zufällige Teilmengen, um die Stabilität zu testen
    const sample = weightedResample(allRows);
    
    // Training eines Modells auf dieser Teilmenge
    const model = await trainModelSync(sample, { ...bestParams, epochs: 500 });
    ensembleModels.push(model);
    
    BASE_FEATURES.forEach(f => weightAccumulator[f].push(model.weights[f]));
    
    await new Promise(r => setTimeout(r, 0)); // UI atmen lassen
  }

  // --- PHASE 3: Gewichtungs-Analyse & Python Export ---
  report("Berechne optimale Gewichte & Python-Config...", 3);
  
  const finalWeightsStats = {};
  const meanWeights = {};
  
  BASE_FEATURES.forEach(f => {
    const vals = weightAccumulator[f];
    // Median ist robuster gegen Ausreißer als Mittelwert
    vals.sort((a,b) => a - b);
    const medianVal = vals[Math.floor(vals.length / 2)];
    
    // Standardabweichung für Unsicherheit
    const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
    const variance = vals.reduce((a,b)=>a+(b-mean)**2, 0) / vals.length;
    
    meanWeights[f] = medianVal;
    finalWeightsStats[f] = {
      mean: medianVal,
      stdDev: Math.sqrt(variance),
      // Stability Score: Wie sicher ist sich das Modell (0..1)?
      stabilityScore: (1 - Math.min(1, Math.sqrt(variance) / (Math.abs(mean) + 0.5))).toFixed(2)
    };
  });

  // --- DAS KORRIGIERTE MAPPING FÜR PYTHON ---
  const pythonConfig = mapToPythonConfig(meanWeights);

  // --- PHASE 4: Diagnose (Blind Spots & Unsicherheit) ---
  report("Suche nach Lücken und Widersprüchen...", 4);
  const diagnostics = analyzeDiagnostics(allRows, ensembleModels);

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

// --- LOGIK: Python Mapping (Der wichtigste Teil) ---
function mapToPythonConfig(w) {
    // Hier übersetzen wir die JS-Gewichte (Trainer) in Python-Logik (Scanner).
    
    // 1. Total Covered (Minuten im Raum)
    // JS: Positiv (mehr ist gut). Python: Positiv.
    // Wir erzwingen mindestens 0.001, damit Zeit überhaupt einen Wert hat.
    let totalCoveredMin = Math.max(0.001, w["totalCoveredMin"] || 0.01);

    // 2. Wait Penalty (Wartezeit)
    // JS: Negativ (Warten ist schlecht). Python: Negativ.
    // Wir begrenzen es, damit es nicht -100 wird und alles blockiert.
    let waitPenalty = Math.max(-10.0, Math.min(0, w["waitPenalty"] || -1.0));

    // 3. Switch Bonus (Raumwechsel)
    // JS: 'switchPenalty' ist meist negativ (Strafe). 
    // Python: 'switchBonus' wird addiert. Muss also auch negativ sein, wenn Wechsel schlecht sind.
    // FIX: Wir nehmen den Wert 1:1, aber cappen ihn bei +1.0 (kleiner Bonus ok, aber kein "Wechsel-Wahn").
    let switchBonus = w["switchPenalty"] || -0.5;
    if (switchBonus > 1.0) switchBonus = 0.5; // Sanity Cap: Wechseln ist selten "super toll".

    // 4. Stability Bonus (Im gleichen Raum bleiben)
    // JS: 'stabilityPenalty' (Feature ist 1 wenn unstabil/wechselnd? Nein, Feature Check nötig).
    // Im JS Code (features.js): stabilityPenalty = (1 - stabilityScore) * 10.
    // Also: Hohe Penalty = Wenig Stabilität.
    // Wenn das Gewicht negativ ist (z.B. -5), heisst das: Instabilität ist schlecht.
    // Python: 'stabilityBonus' wird addiert, wenn Raum == LastRoom.
    // Ergo: Wir müssen das Vorzeichen umdrehen! (Negatives Penalty-Gewicht -> Positiver Bonus).
    // Wir skalieren mit Faktor 2, da Python das oft pro Schritt addiert.
    let stabilityBonus = (w["stabilityPenalty"] || 0) * -2.0;
    
    // Sanity Check: Stabilität sollte fast immer gut sein (Positiv).
    if (stabilityBonus < 0) stabilityBonus = 0.5; // Fallback: Ein bisschen Stabilität ist immer gut.

    return {
        totalCoveredMin,
        waitPenalty,
        switchBonus,
        stabilityBonus,
        productiveLossMin: w["productiveLossMin"] || -0.2, // Abbauzeit kostet
        preferredRoomBonus: 5.0 // Fixer Wert, da nicht trainiert
    };
}

// --- HELPER FUNKTIONEN ---

async function trainModelSync(data, { lr, l2, epochs }) {
  let weights = initWeights();
  let opt = initOptState();
  
  for (let e = 0; e < epochs; e++) {
    for (const row of data) {
      // PERFECTIONING Boost: Diese Daten sind "sauberer", also lernen wir stärker daraus
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
    const res = [];
    // Wir nehmen exakt so viele Samples wie Rows, aber mit Zurücklegen
    for(let i=0; i<rows.length; i++) {
        const idx = Math.floor(Math.random() * rows.length);
        res.push(rows[idx]);
    }
    // Trick: Wir fügen JEDE Perfectioning-Row garantiert noch 1x hinzu,
    // um sicherzugehen, dass sie im Bootstrap vertreten ist.
    rows.forEach(r => {
        if (r.mode === "PERFECTIONING") res.push(r);
    });
    return res;
}

function analyzeDiagnostics(rows, models) {
    let disagreements = 0;
    const criticalSamples = [];

    // Wir prüfen nur die letzten 100 Entscheidungen (aktuellste Relevanz)
    const recentRows = rows.slice(-100);

    recentRows.forEach((row, idx) => {
        let votesA = 0;
        models.forEach(m => {
            if (predict(m.weights, row.featA, row.featB) === "A") votesA++;
        });
        
        // Wie sicher ist sich das Ensemble? (0.5 = 50/50 = maximale Unsicherheit)
        const ratio = votesA / models.length;
        const disagreement = 1 - 2 * Math.abs(0.5 - ratio); // 0 = sicher, 1 = unsicher
        
        if (disagreement > 0.4) {
            disagreements++;
            criticalSamples.push({
                index: idx,
                disagreement: disagreement.toFixed(2),
                mode: row.mode || "NORMAL"
            });
        }
    });
    
    return {
        disagreementCount: disagreements,
        criticalSamples: criticalSamples.slice(0, 10),
        datasetHealth: (1 - (disagreements / Math.max(1, recentRows.length))).toFixed(2)
    };
}

function suggestNextQueries(models, stats, n) {
    // Generiert synthetische Szenarien, bei denen sich die Modelle uneinig sind
    const candidates = [];
    for(let i=0; i<200; i++) {
        const diff = generateRandomDiff(stats);
        
        let votesA = 0;
        models.forEach(m => {
            let s = 0;
            BASE_FEATURES.forEach(f => s += (m.weights[f]||0) * diff[f]);
            if (s > 0) votesA++;
        });
        
        // Entropy: Nahe 0.5 ist maximal interessant
        const entropy = 1 - 2 * Math.abs(0.5 - (votesA / models.length));
        candidates.push({ diff, entropy });
    }
    
    return candidates
        .sort((a,b) => b.entropy - a.entropy)
        .slice(0, n)
        .map(c => describeDiff(c.diff));
}

// --- BASIC MATH HELPERS ---

function predict(w, fA, fB) {
    let sA = 0, sB = 0;
    BASE_FEATURES.forEach(k => {
        sA += (w[k]||0)*(fA[k]||0);
        sB += (w[k]||0)*(fB[k]||0);
    });
    return sA > sB ? "A" : "B";
}

function calculateFeatureStats(rows) {
    const s = {};
    BASE_FEATURES.forEach(f => {
        const vals = rows.flatMap(r => [r.featA[f], r.featB[f]]);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        s[f] = { min, max, range: (max - min) || 1.0 };
    });
    return s;
}

function generateRandomDiff(stats) {
    const d = {};
    BASE_FEATURES.forEach(f => {
        // Wir erzeugen einen Differenzvektor im Bereich der beobachteten Daten
        d[f] = (Math.random() - 0.5) * stats[f].range; 
    });
    return d;
}

function describeDiff(diff) {
    // Findet die 2 dominantesten Features im Konflikt
    const entries = Object.entries(diff).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1]));
    const f1 = entries[0];
    const f2 = entries[1];
    
    const nameMap = {
        distanceNorm: "Laufweg", waitPenalty: "Wartezeit", totalCoveredMin: "Arbeitszeit",
        switchPenalty: "Wechsel", totalPlannedMin: "Planung"
    };
    
    const n1 = nameMap[f1[0]] || f1[0];
    const n2 = nameMap[f2[0]] || f2[0];
    
    return `${n1} (${f1[1]>0?'+':''}${f1[1].toFixed(1)}) vs. ${n2} (${f2[1]>0?'+':''}${f2[1].toFixed(1)})`;
}

// --- CSV PARSER (ROBUST) ---
export function parseCsvDataWithMode(text, filename) {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    
    // Header cleanen (entfernt Quotes und Whitespace)
    const header = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    
    const idxChoice = header.indexOf("choice");
    const idxMode = header.indexOf("mode"); 
    
    if (idxChoice === -1) return null; // Kein valides File

    const rows = [];
    lines.slice(1).forEach(line => {
        // Ignoriere leere Zeilen
        if (!line.trim()) return;
        
        const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
        if (cols.length < header.length) return;

        const featA = {}, featB = {};
        BASE_FEATURES.forEach(f => {
            const iA = header.indexOf(`A_${f}`);
            const iB = header.indexOf(`B_${f}`);
            // Fallback auf 0 falls Feature fehlt
            featA[f] = iA > -1 ? parseFloat(cols[iA]) : 0;
            featB[f] = iB > -1 ? parseFloat(cols[iB]) : 0;
        });

        rows.push({
            featA, featB, 
            choice: cols[idxChoice],
            mode: idxMode > -1 ? cols[idxMode] : "NORMAL"
        });
    });
    
    return { filename, rows };
}
