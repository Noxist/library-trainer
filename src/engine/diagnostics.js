import { initWeights, initOptState, updateWeightsAdam } from "./trainer.js";

// --- KONFIGURATION ---
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

const BOOTSTRAP_ROUNDS = 25; // Wie viele Modelle für Disagreement-Check?
const MARGIN_THRESHOLD = 0.15; // Unter diesem Score-Unterschied gilt es als "unsicher"

// --- HAUPTFUNKTION ---

export async function runDiagnostics(filesData, currentWeights) {
  const t0 = performance.now();
  
  // 1. Datenvorbereitung
  let rows = [];
  filesData.forEach(f => rows.push(...f.rows));
  
  if (rows.length < 10) throw new Error("Zu wenige Daten für Diagnose (min. 10).");

  // Feature-Statistiken berechnen (Min/Max/Mean/Std) für Coverage & Sampling
  const stats = calculateFeatureStats(rows);

  // 2. Unsicherheits-Analyse (Global)
  // Wir trainieren N Bootstrap-Modelle, um die Varianz der Vorhersagen zu messen.
  const bootstrapModels = await trainBootstrapEnsemble(rows, BOOTSTRAP_ROUNDS);
  
  const uncertaintyAnalysis = analyzeUncertainty(rows, bootstrapModels, currentWeights);

  // 3. Feature-Sensitivität & Redundanz
  const featureAnalysis = analyzeFeatures(rows, currentWeights);

  // 4. Daten-Abdeckung (Coverage)
  const coverageAnalysis = analyzeCoverage(rows, stats);

  // 5. Active Learning: Vorschläge für neue Strategien
  const suggestedQueries = suggestNextQueries(bootstrapModels, stats, 5);

  const t1 = performance.now();

  return {
    meta: {
      rowCount: rows.length,
      durationMs: Math.round(t1 - t0),
      timestamp: new Date().toISOString()
    },
    uncertainty: uncertaintyAnalysis,
    features: featureAnalysis,
    coverage: coverageAnalysis,
    suggestions: suggestedQueries
  };
}

// --- 2. UNSICHERHEITS-ANALYSE ---

function analyzeUncertainty(rows, models, mainWeights) {
  let margins = [];
  let disagreements = 0;
  let criticalZones = [];

  rows.forEach((row, idx) => {
    // 2.1 Margin Analyse (Wie knapp war die Entscheidung des Hauptmodells?)
    const scoreA = computeScore(mainWeights, row.featA);
    const scoreB = computeScore(mainWeights, row.featB);
    const margin = Math.abs(scoreA - scoreB);
    margins.push(margin);

    // 2.2 Disagreement Check (Wie uneinig ist sich das Komitee?)
    let votesA = 0;
    models.forEach(model => {
      const sA = computeScore(model, row.featA);
      const sB = computeScore(model, row.featB);
      if (sA > sB) votesA++;
    });
    
    // Disagreement Ratio: 0.0 = Alle einig, 0.5 = 50/50 Split (Maximale Unsicherheit)
    const ratio = votesA / models.length;
    const disagreement = 1 - 2 * Math.abs(0.5 - ratio); // Skaliert auf 0..1 (1=max disagreement)

    if (disagreement > 0.3) disagreements++;

    // Kritische Zonen identifizieren
    if (margin < MARGIN_THRESHOLD || disagreement > 0.4) {
      criticalZones.push({
        index: idx,
        margin: margin.toFixed(4),
        disagreement: disagreement.toFixed(2),
        reason: margin < MARGIN_THRESHOLD ? "Low Margin" : "High Disagreement"
      });
    }
  });

  // Histogramm der Margins
  const histogram = [0,0,0,0,0]; // <0.1, <0.5, <1.0, <2.0, >2.0
  margins.forEach(m => {
    if (m < 0.1) histogram[0]++;
    else if (m < 0.5) histogram[1]++;
    else if (m < 1.0) histogram[2]++;
    else if (m < 2.0) histogram[3]++;
    else histogram[4]++;
  });

  return {
    meanMargin: mean(margins),
    uncertaintyRatio: (criticalZones.length / rows.length).toFixed(2), // Anteil unsicherer Entscheidungen
    disagreementCount: disagreements,
    marginHistogram: histogram,
    criticalSamples: criticalZones.slice(0, 10) // Top 10 Beispiele
  };
}

// --- 3. FEATURE SENSITIVITÄT & REDUNDANZ ---

function analyzeFeatures(rows, weights) {
  // 3.1 Korrelations-Matrix (Redundanz)
  // Wir bauen Vektoren für jedes Feature über alle Rows (Differenz A - B)
  const featureVectors = {};
  FEATURES.forEach(f => featureVectors[f] = []);

  rows.forEach(row => {
    FEATURES.forEach(f => {
      const delta = (row.featA[f] || 0) - (row.featB[f] || 0);
      featureVectors[f].push(delta);
    });
  });

  const correlations = {};
  FEATURES.forEach(f1 => {
    correlations[f1] = {};
    FEATURES.forEach(f2 => {
      if (f1 === f2) return;
      correlations[f1][f2] = pearsonCorrelation(featureVectors[f1], featureVectors[f2]).toFixed(2);
    });
  });

  // Redundante Features finden (> 0.9 oder < -0.9)
  const redundantPairs = [];
  const checked = new Set();
  FEATURES.forEach(f1 => {
    FEATURES.forEach(f2 => {
      if (f1 === f2 || checked.has(f2 + f1)) return;
      const corr = parseFloat(correlations[f1][f2]);
      if (Math.abs(corr) > 0.85) {
        redundantPairs.push(`${f1} <-> ${f2} (${corr})`);
      }
      checked.add(f1 + f2);
    });
  });

  // 3.2 Feature Impact ("Kipppunkte")
  // Wie viel Änderung in Feature X ist nötig, um eine typische Entscheidung umzudrehen?
  // Wir nehmen an: Margin = Gewicht * Delta. 
  // Um Margin 0 zu erreichen: Delta = -Margin / Gewicht.
  const tippingPoints = {};
  const avgMargin = 2.0; // Annahme: Typische klare Entscheidung
  
  FEATURES.forEach(f => {
    const w = weights[f];
    if (Math.abs(w) < 0.001) {
      tippingPoints[f] = "Irrelevant (Weight ~ 0)";
    } else {
      const deltaNeeded = avgMargin / Math.abs(w);
      tippingPoints[f] = `±${deltaNeeded.toFixed(2)}`;
    }
  });

  return {
    redundantPairs,
    tippingPoints, // "Sensitivität"
    correlationMatrix: correlations
  };
}

// --- 4. COVERAGE (ABDECKUNG) ---

function analyzeCoverage(rows, stats) {
  // Wir schauen uns 2D-Plots von wichtigen Dimensionen an
  // Z.B. Wartezeit vs. Distanz
  
  const zones = {
    "Wait_vs_Distance": gridCoverage(rows, "waitPenalty", "distanceNorm", stats),
    "Covered_vs_Switch": gridCoverage(rows, "totalCoveredMin", "switchPenalty", stats)
  };

  // Suche nach "Blind Spots" (Leere Quadranten)
  const blindSpots = [];
  Object.entries(zones).forEach(([name, grid]) => {
    grid.forEach(cell => {
      if (cell.count === 0) {
        blindSpots.push(`${name}: Bereich ${cell.xRange} / ${cell.yRange} (0 Datenpunkte)`);
      }
    });
  });

  return {
    blindSpots: blindSpots.slice(0, 5), // Top 5 Lücken
    zoneAnalysis: zones
  };
}

// --- 5. ACTIVE LEARNING (GENERATE QUERIES) ---

function suggestNextQueries(models, stats, n = 5) {
  // Strategie: Pool-based Active Learning
  // Wir generieren 1000 zufällige Feature-Differenzen (A vs B Szenarien)
  // und suchen die, bei denen sich die Bootstrap-Modelle am uneinigsten sind.
  
  const candidates = [];
  for(let i=0; i<1000; i++) {
    const syntheticDiff = generateRandomFeatureVector(stats);
    
    // Berechne Disagreement für diesen Vektor
    let predictionsA = 0;
    models.forEach(m => {
      // Score = w * diff
      let s = 0;
      FEATURES.forEach(f => s += (m[f]||0) * syntheticDiff[f]);
      if (s > 0) predictionsA++;
    });

    const ratio = predictionsA / models.length;
    // Disagreement: Am nächsten an 0.5 ist am besten
    const uncertainty = 1 - 2 * Math.abs(0.5 - ratio); 
    
    candidates.push({ diff: syntheticDiff, uncertainty });
  }

  // Sortiere nach Unsicherheit (höchste zuerst)
  candidates.sort((a,b) => b.uncertainty - a.uncertainty);

  // Wähle Top N und formuliere sie lesbar
  return candidates.slice(0, n).map(c => describeScenario(c.diff));
}

// --- HELPER ---

// Trainiert N Modelle auf Resampled Data
async function trainBootstrapEnsemble(rows, n) {
  const models = [];
  for(let i=0; i<n; i++) {
    const sample = resample(rows);
    let weights = initWeights();
    let opt = initOptState();
    
    // Quick Training (weniger Epochen reichen für Varianz-Schätzung)
    for(let e=0; e<50; e++) {
      sample.forEach(row => {
        const r = updateWeightsAdam({ weights, opt, ...row, lr: 0.05 });
        weights = r.weights;
        opt = r.opt;
      });
    }
    models.push(weights);
  }
  return models;
}

function computeScore(weights, features) {
  let s = 0;
  FEATURES.forEach(k => s += (weights[k]||0) * (features[k]||0));
  return s;
}

function calculateFeatureStats(rows) {
  const stats = {};
  FEATURES.forEach(f => {
    const vals = rows.map(r => r.featA[f]).concat(rows.map(r => r.featB[f]));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    stats[f] = { min, max, span: max - min };
  });
  return stats;
}

function gridCoverage(rows, fX, fY, stats) {
  // 3x3 Grid
  const grid = [];
  const xStep = stats[fX].span / 3;
  const yStep = stats[fY].span / 3;

  for(let x=0; x<3; x++) {
    for(let y=0; y<3; y++) {
      const xMin = stats[fX].min + x * xStep;
      const xMax = xMin + xStep;
      const yMin = stats[fY].min + y * yStep;
      const yMax = yMin + yStep;
      
      const count = rows.filter(r => {
        // Wir prüfen, ob A oder B in diesem Bereich lag
        const inA = (r.featA[fX] >= xMin && r.featA[fX] <= xMax) && (r.featA[fY] >= yMin && r.featA[fY] <= yMax);
        const inB = (r.featB[fX] >= xMin && r.featB[fX] <= xMax) && (r.featB[fY] >= yMin && r.featB[fY] <= yMax);
        return inA || inB;
      }).length;

      grid.push({
        xRange: `${fX} [${xMin.toFixed(1)} - ${xMax.toFixed(1)}]`,
        yRange: `${fY} [${yMin.toFixed(1)} - ${yMax.toFixed(1)}]`,
        count
      });
    }
  }
  return grid;
}

function generateRandomFeatureVector(stats) {
  const vec = {};
  FEATURES.forEach(f => {
    // Zufälliger Wert im Bereich der beobachteten Daten (Delta A-B kann -span bis +span sein)
    // Wir simulieren hier die Differenz (FeatureA - FeatureB)
    const range = stats[f].span;
    vec[f] = (Math.random() * range * 2) - range; 
  });
  return vec;
}

function describeScenario(diff) {
  // Interpretiert einen Differenz-Vektor in lesbare "Trade-Offs"
  // Wir suchen die 2 dominantesten Unterschiede
  const sorted = Object.entries(diff).sort((a,b) => Math.abs(b[1]) - Math.abs(a[1]));
  const top1 = sorted[0];
  const top2 = sorted[1];

  return `Trade-Off: ${formatFeature(top1)} GEGEN ${formatFeature(top2)} (Unsicherheit: Hoch)`;
}

function formatFeature([key, val]) {
  const dir = val > 0 ? "mehr" : "weniger";
  // Mapping für schönere Namen
  const names = {
    distanceNorm: "Laufweg",
    waitPenalty: "Wartezeit",
    totalCoveredMin: "Arbeitszeit",
    switchPenalty: "Raumwechsel"
  };
  return `${Math.abs(val).toFixed(2)} ${dir} ${names[key] || key}`;
}

// Mathe Helpers
function mean(arr) { return arr.reduce((a,b)=>a+b,0)/arr.length; }
function resample(arr) { return Array.from({length: arr.length}, () => arr[Math.floor(Math.random()*arr.length)]); }
function pearsonCorrelation(x, y) {
  const n = x.length;
  const mx = mean(x), my = mean(y);
  let num=0, den1=0, den2=0;
  for(let i=0; i<n; i++) {
    const dx = x[i]-mx;
    const dy = y[i]-my;
    num += dx*dy;
    den1 += dx*dx;
    den2 += dy*dy;
  }
  return den1===0 || den2===0 ? 0 : num / Math.sqrt(den1*den2);
}
