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
      setProgressMsg("Fehler: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadFullReport = () => {
      if(!result) return;
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
      const anchor = document.createElement('a');
      anchor.setAttribute("href", dataStr);
      anchor.setAttribute("download", "deep_analysis_report.json");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
  };

const downloadPythonWeights = () => {
      // 1. Prüfen, ob Ergebnisse da sind
      if (!result) {
          alert("Fehler: Keine Analyse-Ergebnisse vorhanden.");
          return;
      }

      // 2. Prüfen, ob die Python-Config generiert wurde
      if (!result.pythonConfig) {
          console.error("Ergebnis-Objekt:", result); // Zum Debuggen in F12 schauen
          alert("Fehler: Die 'pythonConfig' fehlt in den Ergebnissen.\n\nHast du die Datei 'src/engine/advancedAnalysis.js' aktualisiert und die Analyse danach NEU gestartet?");
          return;
      }

      try {
          // 3. Sicherer Download via Blob (besser als Data-URI)
          const jsonString = JSON.stringify(result.pythonConfig, null, 2);
          const blob = new Blob([jsonString], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = "weights.json";
          document.body.appendChild(anchor);
          anchor.click();
          
          // Aufräumen
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
      } catch (err) {
          alert("Download fehlgeschlagen: " + err.message);
      }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        
        {/* Header */}
        <div className="border-b border-slate-700 pb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Deep Learning Laboratory 
            <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded ml-2 uppercase">Heavy Load</span>
          </h1>
          <p className="text-slate-400 mt-2">
            Brute Force Training zur Generierung der <code>weights.json</code> für den Python Scanner.
          </p>
        </div>

        {/* Upload Section */}
        <div className="rounded-2xl bg-slate-800 p-8 shadow-xl border border-slate-700">
          <div className="flex flex-col items-center justify-center space-y-6">
            <label className="flex flex-col items-center cursor-pointer group">
                <div className="h-20 w-20 rounded-full bg-slate-700 flex items-center justify-center group-hover:bg-indigo-600 transition-colors duration-300">
                  <svg className="h-10 w-10 text-slate-300 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                </div>
                <span className="mt-4 text-lg font-medium text-slate-300 group-hover:text-white">CSV Trainingsdaten wählen</span>
                <input type="file" multiple accept=".csv" className="hidden" onChange={handleFiles} />
            </label>
            {files.length > 0 && (
                <p className="text-sm text-indigo-400 font-mono">{files.length} Dateien bereit.</p>
            )}
          </div>

          {files.length > 0 && !isAnalyzing && !result && (
             <div className="mt-8 flex justify-center">
               <button onClick={startAnalysis} className="rounded-xl bg-indigo-600 px-10 py-4 text-lg font-bold text-white shadow-lg hover:bg-indigo-500 transition transform hover:scale-105">
                 Deep Analysis Starten (~2-3 Min)
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
            <p className="text-xs text-slate-500 mt-3 text-center font-mono">
              Prozessorkerne werden stark beansprucht. Bitte Tab nicht schließen.
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                <div>
                    <h2 className="text-2xl font-semibold text-white">Analyse Abgeschlossen</h2>
                    <p className="text-slate-400 text-sm">Genauigkeit: <span className="text-emerald-400">{(result.accuracy * 100).toFixed(2)}%</span></p>
                </div>
                <div className="flex gap-3">
                    <button onClick={downloadPythonWeights} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-900/20">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        weights.json (Python)
                    </button>
                    <button onClick={downloadFullReport} className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-600 transition">
                        Full Report
                    </button>
                </div>
            </div>

            {/* Preview der Python Config */}
            <div className="rounded-2xl bg-slate-800 p-6 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4">Generierte Konfiguration</h3>
              <pre className="bg-slate-950 p-4 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto">
                {JSON.stringify(result.pythonConfig, null, 2)}
              </pre>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
