import React, { useState } from "react";
import { runDiagnostics } from "../engine/diagnostics.js";
import { initWeights, initOptState, updateWeightsAdam } from "../engine/trainer.js";

// Wir nutzen den Parser aus deiner bestehenden Utils-Struktur oder inline
import { parseCsvData } from "../engine/advancedAnalysis.js"; // Falls dort exportiert, sonst siehe unten

export default function AdvancedAnalysisPage() {
  const [files, setFiles] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFiles = async (e) => {
    const fileList = Array.from(e.target.files);
    const parsedData = [];
    for (const f of fileList) {
      const text = await f.text();
      // Wir nutzen hier einfachheitshalber die Parse-Funktion, 
      // die wir im vorigen Schritt in advancedAnalysis oder csv.js hatten
      const data = parseCsvData(text, f.name); 
      if (data) parsedData.push(data);
    }
    setFiles(parsedData);
    setReport(null);
    setErrorMsg("");
  };

  const startDiagnostics = async () => {
    if (files.length === 0) return;
    setIsAnalyzing(true);
    setErrorMsg("");
    setReport(null);

    try {
      // 1. Ein "Referenz-Modell" trainieren, um den Ist-Zustand zu simulieren
      // (Wir nehmen an, das aktuelle Modell entspricht dem Durchschnitt der Trainingsdaten)
      const currentWeights = trainReferenceModel(files);

      // 2. Diagnose starten
      const result = await runDiagnostics(files, currentWeights);
      setReport(result);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagnostics_report.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        
        {/* Header */}
        <div className="border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Trainer Diagnostics & Active Learning
          </h1>
          <p className="text-slate-500 mt-2">
            Analysiert Unsicherheiten, Deckungslücken und schlägt die nächsten Trainings-Szenarien vor.
          </p>
        </div>

        {/* Upload Section */}
        <div className="rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col items-center justify-center space-y-6">
            <label className="flex flex-col items-center cursor-pointer group">
              <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <span className="mt-3 text-sm font-medium text-slate-600 group-hover:text-blue-700">CSV Trainingsdaten hochladen</span>
              <input type="file" multiple accept=".csv" className="hidden" onChange={handleFiles} />
            </label>
            {files.length > 0 && (
              <p className="text-sm text-slate-400">{files.length} Dateien ({files.reduce((a,b)=>a+b.rows.length,0)} Entscheidungen)</p>
            )}
          </div>

          {files.length > 0 && !isAnalyzing && !report && (
            <div className="mt-6 flex justify-center">
              <button onClick={startDiagnostics} className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 transition">
                Diagnose Starten
              </button>
            </div>
          )}
          
          {isAnalyzing && (
            <div className="mt-6 text-center text-sm text-slate-500 animate-pulse">
              Analysiere Unsicherheiten, berechne Bootstrap-Modelle und suche Blind Spots...
            </div>
          )}
          
          {errorMsg && (
             <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm text-center border border-red-100">
               {errorMsg}
             </div>
          )}
        </div>

        {/* Report Section */}
        {report && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Top KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <MetricCard label="Unsichere Entscheidungen" value={(report.uncertainty.uncertaintyRatio * 100).toFixed(0) + "%"} color="text-amber-600" />
              <MetricCard label="Disagreement Count" value={report.uncertainty.disagreementCount} color="text-slate-900" />
              <MetricCard label="Kritische Lernzonen" value={report.coverage.blindSpots.length} color="text-rose-600" />
              <MetricCard label="Redundante Features" value={report.features.redundantPairs.length} color="text-slate-500" />
            </div>

            {/* MAIN ACTION: Suggestions */}
            <div className="rounded-2xl bg-indigo-50 p-6 border border-indigo-100">
              <h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Empfohlene Trainings-Szenarien (Active Learning)
              </h3>
              <p className="text-sm text-indigo-700 mb-4">
                Diese Situationen erzeugen aktuell die höchste Unsicherheit im Modell. Generiere diese Vergleiche, um maximal zu lernen:
              </p>
              <div className="space-y-3">
                {report.suggestions.map((sug, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm text-sm font-medium text-slate-700 flex gap-3">
                    <span className="text-indigo-400 font-bold">{idx+1}.</span>
                    {sug}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Coverage & Blind Spots */}
              <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-900 mb-4">Coverage Blind Spots</h3>
                {report.coverage.blindSpots.length === 0 ? (
                  <p className="text-sm text-emerald-600">Keine offensichtlichen Lücken gefunden. Gute Abdeckung!</p>
                ) : (
                  <ul className="space-y-2">
                    {report.coverage.blindSpots.map((spot, i) => (
                      <li key={i} className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-md border border-rose-100">
                        ⚠️ Fehlende Daten: {spot}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Feature Health */}
              <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
                <h3 className="font-semibold text-slate-900 mb-4">Feature Analyse</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Redundante Features</h4>
                    {report.features.redundantPairs.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">Keine Redundanzen.</span>
                    ) : (
                      <ul className="space-y-1">
                        {report.features.redundantPairs.map((pair, i) => (
                          <li key={i} className="text-xs text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded inline-block mr-2 mb-1">
                            {pair}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Kipppunkte (Sensitivität)</h4>
                    <div className="grid grid-cols-2 gap-2">
                       {Object.entries(report.features.tippingPoints).slice(0,6).map(([k, v]) => (
                         <div key={k} className="flex justify-between text-xs border-b border-slate-50 pb-1">
                           <span className="text-slate-600 truncate mr-2" title={k}>{k}</span>
                           <span className="font-mono text-slate-900">{v}</span>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Critical Samples Table */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-semibold text-slate-900">Kritische Trainingsbeispiele</h3>
                <button onClick={downloadReport} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                  JSON Report Exportieren
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                    <tr>
                      <th className="px-6 py-3">Index</th>
                      <th className="px-6 py-3">Margin</th>
                      <th className="px-6 py-3">Disagreement</th>
                      <th className="px-6 py-3">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.uncertainty.criticalSamples.map((sample, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-6 py-3 font-mono text-slate-400">#{sample.index}</td>
                        <td className="px-6 py-3 font-mono">{sample.margin}</td>
                        <td className="px-6 py-3">
                          <div className="w-20 bg-slate-200 rounded-full h-1.5">
                            <div className="bg-amber-500 h-1.5 rounded-full" style={{width: `${sample.disagreement * 100}%`}}></div>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-amber-700 font-medium text-xs">{sample.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.uncertainty.criticalSamples.length === 0 && (
                   <div className="p-8 text-center text-slate-400 text-sm">Alles stabil. Keine kritischen Samples gefunden.</div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// --- VISUAL COMPONENTS ---

function MetricCard({ label, value, color }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="text-xs text-slate-500 uppercase font-semibold">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

// --- HELPER: Train Reference Model ---
// Trainiert schnell ein Standard-Modell auf den Daten, um "Current Weights" zu simulieren
function trainReferenceModel(files) {
  let rows = [];
  files.forEach(f => rows.push(...f.rows));
  
  let weights = initWeights();
  let opt = initOptState();
  
  // 100 Epochen reichen für eine solide Baseline
  for(let i=0; i<100; i++) {
    rows.forEach(row => {
      const res = updateWeightsAdam({
        weights, opt, 
        featA: row.featA, featB: row.featB, choice: row.choice, 
        lr: 0.05 
      });
      weights = res.weights;
      opt = res.opt;
    });
  }
  return weights;
}
