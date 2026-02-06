import React, { useState } from "react";
// WICHTIG: Importiere die neuen Funktionen aus der neuen Datei
import { runComprehensiveAnalysis, parseCsvDataWithMode } from "../engine/comprehensiveAnalysis.js";

export default function AdvancedAnalysisPage() {
  const [files, setFiles] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFiles = async (e) => {
    const fileList = Array.from(e.target.files);
    const parsedData = [];
    
    for (const f of fileList) {
      try {
        const text = await f.text();
        const data = parseCsvDataWithMode(text, f.name);
        if (data && data.rows.length > 0) {
            parsedData.push(data);
        }
      } catch (err) {
        console.error("Error parsing file:", f.name, err);
      }
    }
    setFiles(parsedData);
    setResult(null);
    setError(null);
  };

  const startAnalysis = async () => {
    if (files.length === 0) return;
    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      const res = await runComprehensiveAnalysis(files, (msg, pct) => {
        setProgressMsg(msg);
        setProgressPct(pct);
      });
      setResult(res);
    } catch (err) {
      console.error(err);
      setError("Analyse fehlgeschlagen: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadJson = (data, filename) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        
        {/* Header */}
        <div className="border-b border-slate-700 pb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Comprehensive Trainer Analysis
          </h1>
          <p className="text-slate-400 mt-2">
            Kombiniert Training, Perfektionierung (5x Gewichtung) und Python-Export-Logik.
          </p>
        </div>

        {/* Upload */}
        <div className="rounded-2xl bg-slate-800 p-8 shadow-xl border border-slate-700">
          <div className="flex flex-col items-center justify-center space-y-6">
            <label className="flex flex-col items-center cursor-pointer group">
                <div className="h-16 w-16 rounded-full bg-slate-700 flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                  <svg className="h-8 w-8 text-slate-300 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                </div>
                <span className="mt-4 text-lg font-medium text-slate-300 group-hover:text-white">Alle CSVs auswählen</span>
                <input type="file" multiple accept=".csv" className="hidden" onChange={handleFiles} />
            </label>
            {files.length > 0 && <p className="text-sm text-indigo-400">{files.length} Dateien bereit ({files.reduce((a,b)=>a+b.rows.length,0)} Zeilen)</p>}
            {error && <p className="text-sm text-rose-500 font-bold">{error}</p>}
          </div>

          {files.length > 0 && !isAnalyzing && !result && (
             <div className="mt-8 flex justify-center">
               <button onClick={startAnalysis} className="rounded-xl bg-indigo-600 px-10 py-4 text-lg font-bold text-white shadow-lg hover:bg-indigo-500 transition transform hover:scale-105">
                 Start Analysis
               </button>
             </div>
          )}
        </div>

        {/* Progress */}
        {isAnalyzing && (
          <div className="rounded-2xl bg-slate-800 p-8 shadow-lg border border-slate-700 animate-pulse">
            <div className="flex justify-between text-sm font-mono text-indigo-300 mb-2">
              <span>{progressMsg}</span>
              <span>{(progressPct * 100).toFixed(0)}%</span>
            </div>
            <div className="h-4 w-full bg-slate-900 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progressPct * 100}%` }}></div>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            
            <div className="flex justify-between items-center bg-slate-800 p-6 rounded-2xl border border-slate-700">
                <div>
                    <h2 className="text-xl font-bold text-white">Analyse Fertig</h2>
                    <p className="text-slate-400 text-sm">Genauigkeit: <span className="text-emerald-400">Sehr Hoch (Ensemble)</span></p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => downloadJson(result.pythonConfig, "weights.json")} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold text-sm shadow-lg shadow-emerald-900/20 flex items-center gap-2">
                        ⬇️ weights.json
                    </button>
                </div>
            </div>

            {/* Python Config Preview */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <h4 className="text-slate-500 uppercase font-bold mb-4 text-xs">Generierte Python Konfiguration</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-sm">
                    {Object.entries(result.pythonConfig).map(([k,v]) => (
                        <div key={k} className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-400">{k}</span>
                            <span className={v > 0 ? "text-emerald-400" : "text-rose-400"}>{v.toFixed(4)}</span>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-slate-600 mt-4">
                    Hinweis: 'stabilityBonus' wurde invertiert (Penalty -> Bonus), damit es im Python-Skript positiv wirkt (Belohnung für Stabilität).
                </p>
            </div>

            {/* Active Learning Suggestions */}
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4">Empfohlene nächste Trainings-Schritte</h3>
                <div className="space-y-2">
                    {result.suggestions.map((s, i) => (
                        <div key={i} className="bg-slate-700/50 px-4 py-3 rounded-lg text-sm text-slate-200 border border-slate-600">
                            {s}
                        </div>
                    ))}
                </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
