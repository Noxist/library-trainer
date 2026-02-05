import React, { useState } from "react";
import { runComprehensiveAnalysis, parseCsvDataWithMode } from "../engine/comprehensiveAnalysis.js";

export default function AdvancedAnalysisPage() {
  const [files, setFiles] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [result, setResult] = useState(null);

  const handleFiles = async (e) => {
    const fileList = Array.from(e.target.files);
    const parsedData = [];
    for (const f of fileList) {
      const text = await f.text();
      const data = parseCsvDataWithMode(text, f.name); // Neuer Parser!
      if (data) parsedData.push(data);
    }
    setFiles(parsedData);
    setResult(null);
  };

  const startAnalysis = async () => {
    if (files.length === 0) return;
    setIsAnalyzing(true);
    setResult(null);

    try {
      const res = await runComprehensiveAnalysis(files, (msg, pct) => {
        setProgressMsg(msg);
        setProgressPct(pct);
      });
      setResult(res);
    } catch (err) {
      console.error(err);
      setProgressMsg("Fehler: " + err.message);
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
        <div className="border-b border-slate-700 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Grand Unified Analysis <span className="text-xs bg-purple-600 px-2 py-1 rounded ml-2">V2</span>
            </h1>
            <p className="text-slate-400 mt-2">
              Kombiniert Deep Learning Grid-Search mit Uncertainty-Diagnostics.
              Verarbeitet "Perfectioning"-Daten mit 3x Gewichtung.
            </p>
          </div>
        </div>

        {/* Upload */}
        <div className="rounded-2xl bg-slate-800 p-8 shadow-xl border border-slate-700">
          <div className="flex flex-col items-center justify-center space-y-6">
            <label className="flex flex-col items-center cursor-pointer group">
                <div className="h-16 w-16 rounded-full bg-slate-700 flex items-center justify-center group-hover:bg-purple-600 transition-colors">
                  <svg className="h-8 w-8 text-slate-300 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </div>
                <span className="mt-4 text-lg font-medium text-slate-300 group-hover:text-white">CSVs laden (inkl. Perfectioning)</span>
                <input type="file" multiple accept=".csv" className="hidden" onChange={handleFiles} />
            </label>
            {files.length > 0 && <p className="text-sm text-purple-400">{files.length} Files geladen</p>}
          </div>

          {files.length > 0 && !isAnalyzing && !result && (
             <div className="mt-8 flex justify-center">
               <button onClick={startAnalysis} className="rounded-xl bg-purple-600 px-10 py-4 text-lg font-bold text-white shadow-lg hover:bg-purple-500 transition transform hover:scale-105">
                 Start Grand Analysis (Heavy Load)
               </button>
             </div>
          )}
        </div>

        {/* Progress */}
        {isAnalyzing && (
          <div className="rounded-2xl bg-slate-800 p-8 shadow-lg border border-slate-700 animate-pulse">
            <div className="flex justify-between text-sm font-mono text-purple-300 mb-2">
              <span>{progressMsg}</span>
              <span>{(progressPct * 100).toFixed(0)}%</span>
            </div>
            <div className="h-4 w-full bg-slate-900 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${progressPct * 100}%` }}></div>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            
            {/* Top Bar */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-800 p-6 rounded-2xl border border-slate-700">
                <div className="text-center md:text-left">
                    <div className="text-xs text-slate-400 uppercase">Dataset Health</div>
                    <div className="text-2xl font-bold text-emerald-400">{Number(result.diagnostics.datasetHealth) * 100}%</div>
                    <div className="text-xs text-slate-500 mt-1">
                        {result.meta.rowCount} Decisions ({result.meta.perfectioningCount} Perfectioning)
                    </div>
                </div>
                
                <div className="flex gap-3">
                    <button onClick={() => downloadJson(result.pythonConfig, "weights.json")} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold text-sm shadow-lg shadow-emerald-900/20 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        weights.json
                    </button>
                    <button onClick={() => downloadJson(result, "full_analysis.json")} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-3 rounded-lg font-medium text-sm">
                        Full Report
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Weights Stability */}
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                    <h3 className="text-lg font-semibold text-white mb-4">Model Weights & Stability</h3>
                    <div className="space-y-3">
                        {Object.entries(result.weightsAnalysis).sort((a,b) => Math.abs(b[1].mean) - Math.abs(a[1].mean)).map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between text-sm">
                                <span className="text-slate-400 w-1/3 truncate" title={k}>{k}</span>
                                <div className="flex-1 mx-3 h-2 bg-slate-900 rounded-full relative">
                                    <div 
                                        className={`absolute top-0 bottom-0 rounded-full ${v.mean > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                        style={{ 
                                            left: v.mean > 0 ? '50%' : `calc(50% - ${Math.min(50, Math.abs(v.mean)*5)}%)`,
                                            width: `${Math.min(50, Math.abs(v.mean)*5)}%` 
                                        }}
                                    ></div>
                                    {/* StdDev Marker */}
                                    <div 
                                        className="absolute top-0 bottom-0 bg-white/20"
                                        style={{
                                            left: `calc(50% + ${(v.mean - v.stdDev)*5}%)`,
                                            width: `${v.stdDev * 10}%`
                                        }}
                                    ></div>
                                </div>
                                <span className="text-slate-300 w-16 text-right font-mono">{v.mean.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-slate-500 mt-4 text-center">Weißer Schatten = Unsicherheit (StdDev)</p>
                </div>

                {/* Active Learning Suggestions */}
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                    <h3 className="text-lg font-semibold text-white mb-4">Next Training Steps</h3>
                    <p className="text-sm text-slate-400 mb-4">
                        Basierend auf {result.diagnostics.disagreementCount} widersprüchlichen Vorhersagen im Ensemble:
                    </p>
                    <div className="space-y-3">
                        {result.suggestions.map((s, i) => (
                            <div key={i} className="bg-slate-700/50 p-3 rounded-lg border border-slate-600 text-sm text-slate-200">
                                <span className="text-purple-400 font-bold mr-2">#{i+1}</span>
                                {s}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Python Config Preview */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 font-mono text-xs overflow-x-auto">
                <h4 className="text-slate-500 uppercase font-bold mb-2">Python Config Preview</h4>
                <pre className="text-emerald-400">{JSON.stringify(result.pythonConfig, null, 2)}</pre>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
