import React, { useState } from "react";
import { runDeepAnalysis, parseCsvData, generateExportData } from "../engine/advancedAnalysis.js";

export default function AdvancedAnalysisPage() {
  const [files, setFiles] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [result, setResult] = useState(null);

  const handleFiles = async (e) => {
    const fileList = Array.from(e.target.files);
    const parsedData = [];
    for (const f of fileList) {
      const text = await f.text();
      const data = parseCsvData(text, f.name);
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
      const res = await runDeepAnalysis(files, (msg, pct) => {
        setProgressMsg(msg);
        setProgress(pct);
      });
      setResult(res);
    } catch (err) {
      console.error(err);
      setProgressMsg("Fehler: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadReport = () => {
      if(!result) return;
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(generateExportData(result));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "deep_analysis_report.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        
        {/* Header */}
        <div className="border-b border-slate-700 pb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">Deep Learning Laboratory <span className="text-xs bg-indigo-500 text-white px-2 py-0.5 rounded ml-2">BRUTE FORCE</span></h1>
          <p className="text-slate-400 mt-2">Hochpräzisions-Training durch Grid-Search, Permutation Feature Importance & massives Bootstrapping.</p>
        </div>

        {/* Upload Section */}
        <div className="rounded-2xl bg-slate-800 p-8 shadow-xl border border-slate-700">
          <div className="flex flex-col items-center justify-center space-y-6">
            <label className="flex flex-col items-center cursor-pointer group">
                <div className="h-20 w-20 rounded-full bg-slate-700 flex items-center justify-center group-hover:bg-indigo-600 transition-colors duration-300">
                  <svg className="h-10 w-10 text-slate-300 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                </div>
                <span className="mt-4 text-lg font-medium text-slate-300 group-hover:text-white">CSV Trainingsdaten laden</span>
                <input type="file" multiple accept=".csv" className="hidden" onChange={handleFiles} />
            </label>
            {files.length > 0 && (
                <p className="text-sm text-indigo-400 font-mono">{files.length} Dateien bereit. ({files.reduce((a, b) => a + b.rows.length, 0)} Samples)</p>
            )}
          </div>

          {files.length > 0 && !isAnalyzing && !result && (
             <div className="mt-8 flex justify-center">
               <button onClick={startAnalysis} className="rounded-xl bg-indigo-600 px-10 py-4 text-lg font-bold text-white shadow-lg hover:bg-indigo-500 transition transform hover:scale-105">
                 MAXIMUM POWER Starten (Min. 2 Min)
               </button>
             </div>
          )}
        </div>

        {/* Progress UI */}
        {isAnalyzing && (
          <div className="rounded-2xl bg-slate-800 p-8 shadow-lg border border-slate-700">
            <div className="flex justify-between text-sm font-mono text-indigo-300 mb-2">
              <span className="animate-pulse">> {progressMsg}</span>
              <span>{(progress * 100).toFixed(1)}%</span>
            </div>
            <div className="h-6 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-700">
              <div className="h-full bg-indigo-500 relative overflow-hidden" style={{ width: `${progress * 100}%` }}>
                  <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]"></div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center font-mono">CPU-Kerne werden ausgelastet... Bitte warten.</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold text-white">Analyse Ergebnisse</h2>
                <button onClick={downloadReport} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 transition">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Full Report Exportieren (.json)
                </button>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl bg-slate-800 p-5 border border-slate-700">
                <div className="text-xs text-slate-400 uppercase tracking-wider">Modell-Genauigkeit</div>
                <div className="text-3xl font-bold text-emerald-400">{(result.accuracy * 100).toFixed(2)}%</div>
              </div>
              <div className="rounded-xl bg-slate-800 p-5 border border-slate-700">
                <div className="text-xs text-slate-400 uppercase tracking-wider">Beste Lernrate</div>
                <div className="text-xl font-mono text-white">{result.bestParams.lr}</div>
              </div>
              <div className="rounded-xl bg-slate-800 p-5 border border-slate-700">
                <div className="text-xs text-slate-400 uppercase tracking-wider">Daten-Konsistenz</div>
                <div className="text-xl font-mono text-white">{100 - (result.inconsistencies.length / result.rowCount * 100).toFixed(1)}%</div>
              </div>
              <div className="rounded-xl bg-slate-800 p-5 border border-slate-700">
                <div className="text-xs text-slate-400 uppercase tracking-wider">Samples</div>
                <div className="text-xl font-mono text-white">{result.rowCount}</div>
              </div>
            </div>

            {/* Weights Chart */}
            <div className="rounded-2xl bg-slate-800 p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-6">Faktor-Gewichtung & Stabilität</h3>
              <div className="space-y-6">
                {Object.entries(result.weights)
                  .sort((a, b) => Math.abs(b[1].mean) - Math.abs(a[1].mean))
                  .map(([key, stat]) => (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-slate-300">{key}</span>
                          <span className="font-mono text-slate-400">{stat.mean.toFixed(3)} <span className="text-xs text-slate-600">±{stat.stdDev.toFixed(3)}</span></span>
                      </div>
                      
                      <div className="relative h-10 bg-slate-900 rounded-md flex items-center px-2 border border-slate-700/50">
                        {/* Center Line */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600 z-10"></div>
                        
                        {/* Bar */}
                        <div 
                          className={`h-6 rounded-sm transition-all shadow-[0_0_15px_rgba(0,0,0,0.3)] ${stat.mean > 0 ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-rose-500 shadow-rose-500/20'}`}
                          style={{
                            marginLeft: stat.mean > 0 ? '50%' : `calc(50% - ${Math.min(48, Math.abs(stat.mean) * 5)}%)`,
                            width: `${Math.min(48, Math.abs(stat.mean) * 5)}%`
                          }}
                        ></div>

                        {/* Confidence Interval (StdDev) */}
                        <div 
                          className="absolute h-2 bg-white/40 top-1/2 -mt-1 rounded-sm z-20"
                          style={{
                             left: `calc(50% + ${(stat.mean - stat.stdDev) * 5}%)`,
                             width: `${stat.stdDev * 2 * 5}%`
                          }}
                        ></div>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 flex justify-end">
                          Wichtigkeit (Impact): {(stat.importance * 100).toFixed(2)}%
                      </div>
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
