import React, { useState, useMemo } from "react";
import { initWeights, initOptState, updateWeightsAdam } from "../engine/trainer";

// Die Features, die wir analysieren (müssen mit CSV-Headern matchen)
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

// Deutsche Labels für die Anzeige
const LABELS = {
  distanceNorm: "Laufwege",
  waitPenalty: "Wartezeit",
  switchPenalty: "Raumwechsel",
  stabilityPenalty: "Raum-Stabilität",
  productiveLossMin: "Wechsel-Verlust",
  riskLateMin: "Verspätungs-Risiko",
  totalPlannedMin: "Geplante Zeit",
  totalCoveredMin: "Abgedeckte Zeit",
};

export default function ProfileAnalyzer() {
  const [analyzedFiles, setAnalyzedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setIsProcessing(true);
    const results = [];

    for (const file of files) {
      try {
        const text = await file.text();
        const result = analyzeCsvContent(text, file.name);
        if (result) results.push(result);
      } catch (err) {
        console.error("Fehler bei Datei:", file.name, err);
      }
    }

    setAnalyzedFiles((prev) => [...prev, ...results]);
    setIsProcessing(false);
  };

  const groupStats = useMemo(() => {
    if (analyzedFiles.length === 0) return null;

    const stats = {};
    FEATURES.forEach((feat) => {
      const values = analyzedFiles.map((f) => f.weights[feat] || 0);
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      const stdDev = Math.sqrt(variance);

      stats[feat] = { mean, stdDev };
    });

    // Finde das Feature mit der größten Uneinigkeit (StdDev)
    const sortedByUncertainty = Object.entries(stats).sort(
      (a, b) => b[1].stdDev - a[1].stdDev
    );

    return {
      features: stats,
      mostUncertain: sortedByUncertainty[0], // [featureKey, {mean, stdDev}]
      mostConsistent: sortedByUncertainty[sortedByUncertainty.length - 1],
    };
  }, [analyzedFiles]);

  const reset = () => setAnalyzedFiles([]);

  return (
    <div className="space-y-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Gruppen-Analyse & Profil-Check</h2>
          <p className="text-sm text-slate-500">
            Lade mehrere CSV-Dateien hoch, um den "gemeinsamen Nenner" und Konfliktpunkte zu finden.
          </p>
        </div>
        {analyzedFiles.length > 0 && (
          <button
            onClick={reset}
            className="rounded-lg px-3 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {/* Upload Area */}
      {analyzedFiles.length === 0 && (
        <div className="relative flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100">
          <input
            type="file"
            multiple
            accept=".csv"
            onChange={handleFileUpload}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          <div className="text-center">
            <p className="font-medium text-slate-700">CSV Dateien hier ablegen</p>
            <p className="text-xs text-slate-400">oder klicken zum Auswählen</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isProcessing && <div className="text-center text-sm text-slate-500">Analysiere Daten ...</div>}

      {/* Results */}
      {groupStats && (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Linke Spalte: Gemeinsamer Nenner */}
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 font-medium text-slate-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">1</span>
              Gemeinsamer Nenner (Gewichte)
            </h3>
            <div className="space-y-3">
              {Object.entries(groupStats.features)
                .sort((a, b) => Math.abs(b[1].mean) - Math.abs(a[1].mean)) // Wichtigste zuerst
                .map(([key, stat]) => (
                  <WeightBar key={key} label={LABELS[key] || key} mean={stat.mean} stdDev={stat.stdDev} />
                ))}
            </div>
            <p className="text-xs text-slate-400">
              Breite Balken = Starke Meinung. <span className="text-emerald-600">Grün</span> = Wird angestrebt,{" "}
              <span className="text-rose-600">Rot</span> = Wird vermieden.
              <br />
              Grauer Schatten = Unsicherheit (Uneinigkeit in der Gruppe).
            </p>
          </div>

          {/* Rechte Spalte: Analyse & Empfehlung */}
          <div className="space-y-6">
            
            {/* Recommendation Card */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <h4 className="mb-2 font-semibold text-indigo-900">Trainingsempfehlung</h4>
              <p className="text-sm text-indigo-800">
                Die Gruppe ist sich am unsichersten bei:{" "}
                <strong className="font-bold">{LABELS[groupStats.mostUncertain[0]]}</strong>.
              </p>
              <div className="mt-3 text-xs text-indigo-700">
                <strong>Warum?</strong> Hier weichen die Meinungen (Profile) am stärksten voneinander ab.
                <br />
                <strong>Strategie:</strong> Trainiere gezielt Szenarien, in denen{" "}
                {LABELS[groupStats.mostUncertain[0]]} stark variiert, um einen Konsens zu erzwingen.
              </div>
            </div>

            {/* Individual Files List */}
            <div>
              <h4 className="mb-3 font-medium text-slate-900">Analysierte Profile ({analyzedFiles.length})</h4>
              <div className="flex flex-col gap-2">
                {analyzedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <span className="truncate font-medium text-slate-700" title={file.filename}>
                      {file.userId} <span className="text-xs font-normal text-slate-400">({file.rowCount} Entscheidungen)</span>
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        file.consistency > 0.8 ? "text-emerald-600" : file.consistency > 0.6 ? "text-amber-600" : "text-rose-600"
                      }`}
                      title="Wie oft das Modell die Entscheidung korrekt vorhersagt (Trainings-Genauigkeit)"
                    >
                      {Math.round(file.consistency * 100)}% Konsistenz
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Visual Components ---

function WeightBar({ label, mean, stdDev }) {
  // Scaling factor for visualization
  const SCALE = 20; 
  const widthPercent = Math.min(100, Math.abs(mean) * SCALE);
  const isPositive = mean > 0;
  
  // Uncertainty width (StdDev)
  const uncertaintyWidth = Math.min(100, stdDev * SCALE);

  return (
    <div className="group relative">
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="text-slate-400">{mean.toFixed(2)}</span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-slate-100">
        {/* Center Line */}
        <div className="absolute left-1/2 top-0 h-full w-px bg-slate-300"></div>

        {/* The Main Bar (Mean) */}
        <div
          className={`absolute top-0 h-full rounded-full ${isPositive ? "bg-emerald-500" : "bg-rose-500"}`}
          style={{
            left: isPositive ? "50%" : `calc(50% - ${widthPercent / 2}%)`,
            width: `${widthPercent / 2}%`,
          }}
        ></div>

        {/* The Uncertainty Shadow (StdDev) */}
        <div
            className="absolute top-0 -mt-0.5 h-3 rounded-full bg-slate-400 opacity-20 transition-opacity group-hover:opacity-40"
            style={{
                left: `calc(50% + ${(mean - stdDev) * (SCALE/2)}%)`, // Simplification for visual range
                width: `${stdDev * SCALE}%`, // Shows range of disagreement
                // Fallback logic for center alignment if needed, but this is a rough visual
                left: "50%",
                marginLeft: `-${(uncertaintyWidth/2)}%`,
            }}
            title={`Unsicherheit (StdDev): ${stdDev.toFixed(2)}`}
        ></div>
      </div>
    </div>
  );
}

// --- Logic Helpers ---

function analyzeCsvContent(text, filename) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;

  const header = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  const rows = lines.slice(1).map((line) => {
    // Basic CSV split (works for simple numbers/strings without commas inside)
    return line.split(",").map((c) => c.trim().replace(/"/g, ""));
  });

  // Indizes finden
  const idxChoice = header.indexOf("choice");
  const idxUserId = header.indexOf("userId");
  
  if (idxChoice === -1) return null;

  const data = [];
  let userId = "Unbekannt";

  rows.forEach((row) => {
    if (row.length !== header.length) return;
    if (row[idxUserId]) userId = row[idxUserId];

    const choice = row[idxChoice];
    const featA = {};
    const featB = {};

    FEATURES.forEach((f) => {
      const iA = header.indexOf(`A_${f}`);
      const iB = header.indexOf(`B_${f}`);
      if (iA > -1) featA[f] = parseFloat(row[iA]);
      if (iB > -1) featB[f] = parseFloat(row[iB]);
    });

    data.push({ featA, featB, choice });
  });

  if (data.length === 0) return null;

  // Training simulieren (Batch)
  const weights = trainBatch(data);
  const consistency = calculateConsistency(weights, data);

  return {
    filename,
    userId,
    rowCount: data.length,
    weights,
    consistency,
  };
}

function trainBatch(data) {
  // Init
  let weights = initWeights();
  let opt = initOptState();
  
  // Hyperparams
  const EPOCHS = 50; 
  const LR = 0.1;

  // Simple Training Loop
  for (let i = 0; i < EPOCHS; i++) {
    for (const row of data) {
      const res = updateWeightsAdam({
        weights,
        opt,
        featA: row.featA,
        featB: row.featB,
        choice: row.choice,
        lr: LR,
      });
      weights = res.weights;
      opt = res.opt;
    }
  }
  return weights;
}

function calculateConsistency(weights, data) {
  let correct = 0;
  for (const row of data) {
    const scoreA = score(weights, row.featA);
    const scoreB = score(weights, row.featB);
    const predicted = scoreA > scoreB ? "A" : "B";
    if (predicted === row.choice) correct++;
  }
  return correct / data.length;
}

function score(w, f) {
  let s = 0;
  for (const k of Object.keys(f)) s += (w[k] ?? 0) * f[k];
  return s;
}
