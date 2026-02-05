import React, { useState } from "react";
import { runDeepAnalysis, parseCsvData } from "../engine/advancedAnalysis.js";

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
      setProgressMsg("Fehler bei der Analyse!");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Advanced Trainer Analysis <span className="text-xs align-top bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">PRO</span></h1>
          <p className="text-slate-500 mt-2">Iterative Feature-Fixing & Hyperparameter Grid Search</p>
        </div>

        {/* Upload Section */}
        <div className="rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            </div>
            <label className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 font-medium transition">
              CSV Dateien wählen
              <input type="file" multiple accept=".csv" className="hidden" onChange={handleFiles} />
            </label>
            <p className="text-sm text-slate-400">{files.length} Dateien geladen ({files.reduce((a, b) => a + b.rows.length, 0)} Entscheidungen)</p>
          </div>

          {files.length > 0 && !isAnalyzing && !result && (
             <div className="mt-8 flex justify-center">
               <button onClick={startAnalysis} className="rounded-xl bg-purple-600 px-8 py-3 text-lg font-bold text-white shadow-lg hover:bg-purple-700 hover:shadow-purple-200 transition transform hover:-translate-y-0.5">
                 Analyse starten (CPU intensiv)
               </button>
             </div>
          )}
        </div>

        {/* Progress UI */}
        {isAnalyzing && (
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200 animate-pulse">
            <div className="flex justify-between text-sm font-medium text-slate-700 mb-2">
              <span>{progressMsg}</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 transition-all duration-300 ease-out" style={{ width: `${progress * 100}%` }}></div>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center">Dein PC wird jetzt warm...</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            
            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl bg-white p-4 border border-slate-200 shadow-sm">
                <div className="text-sm text-slate-500">Trainings-Genauigkeit (CV)</div>
                <div className="text-2xl font-bold text-slate-900">{(result.accuracy * 100).toFixed(1)}%</div>
              </div>
              <div className="rounded-xl bg-white p-4 border border-slate-200 shadow-sm">
                <div className="text-sm text-slate-500">Optimale Hyperparameter</div>
                <div className="text-lg font-medium text-slate-900">LR: {result.bestParams.lr} | L2: {result.bestParams.l2}</div>
              </div>
              <div className="rounded-xl bg-white p-4 border border-slate-200 shadow-sm">
                <div className="text-sm text-slate-500">Datensätze</div>
                <div className="text-2xl font-bold text-slate-900">{result.rowCount}</div>
              </div>
            </div>

            {/* Weights Chart */}
            <div className="rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-6">Deep Analysis Weights</h3>
              <div className="space-y-4">
                {Object.entries(result.weights)
                  .sort((a, b) => Math.abs(b[1].value) - Math.abs(a[1].value))
                  .map(([key, stat]) => (
                    <div key={key} className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-4 md:col-span-3 text-sm font-medium text-slate-600 truncate" title={key}>
                        {key}
                        {stat.isDominant && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-purple-500" title="Dominantes Feature (Fixiert)"></span>}
                      </div>
                      
                      <div className="col-span-6 md:col-span-7 relative h-8 bg-slate-50 rounded-md flex items-center">
                        {/* Center Line */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300"></div>
                        
                        {/* Bar */}
                        <div 
                          className={`h-4 rounded-sm transition-all duration-500 ${stat.value > 0 ? 'bg-emerald-500' : 'bg-rose-500'} ${stat.isDominant ? 'ring-2 ring-purple-200' : ''}`}
                          style={{
                            marginLeft: stat.value > 0 ? '50%' : `calc(50% - ${Math.min(50, Math.abs(stat.value) * 10)}%)`,
                            width: `${Math.min(50, Math.abs(stat.value) * 10)}%`
                          }}
                        ></div>

                        {/* Confidence Interval (StdDev) */}
                        <div 
                          className="absolute h-1 bg-slate-900 opacity-20 top-1/2 -mt-0.5"
                          style={{
                             left: `calc(50% + ${(stat.value - stat.stdDev) * 10}%)`,
                             width: `${stat.stdDev * 2 * 10}%`
                          }}
                        ></div>
                      </div>

                      <div className="col-span-2 text-right text-xs font-mono text-slate-500">
                        {stat.value.toFixed(2)}
                        <br/>
                        <span className="text-[10px] text-slate-300">±{stat.stdDev.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
              </div>
              <p className="mt-6 text-xs text-slate-400 text-center">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-500 mr-1"></span> Dominante Features wurden fixiert, um schwächere Signale rauschfreier zu messen.
                <br/>
                Der schwarze Strich im Balken zeigt die Unsicherheit (Standardabweichung).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
