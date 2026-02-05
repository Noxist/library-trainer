import React, { useState } from "react";
import { getNextPerfectionCase, featuresToStrategyDisplay } from "../engine/perfectioningGenerator.js";
import { updateWeightsAdam } from "../engine/trainer.js";
import DecisionCard from "./DecisionCard.jsx";

const TARGET_MODE = "HUSTLE"; 
const TOTAL_ROUNDS = 20;

export default function PerfectioningPage({ modelState, setModelState, userId, onBack, onLog }) {
  const [round, setRound] = useState(0);
  const [currentCase, setCurrentCase] = useState(() => getNextPerfectionCase(0));

  const stratA = featuresToStrategyDisplay(currentCase.featA);
  const stratB = featuresToStrategyDisplay(currentCase.featB);

  const handleChoice = (choice) => {
    // 1. Trainieren
    const upd = updateWeightsAdam({
      weights: modelState[TARGET_MODE].weights,
      opt: modelState[TARGET_MODE].opt,
      featA: currentCase.featA,
      featB: currentCase.featB,
      choice,
      lr: 0.1, 
      l2: 0.001
    });

    setModelState(prev => ({
      ...prev,
      [TARGET_MODE]: { weights: upd.weights, opt: upd.opt }
    }));

    // In die CSV-Logs schreiben
    if (onLog) {
      onLog({
        choice,
        featA: currentCase.featA,
        featB: currentCase.featB
      });
    }

    // 2. Nächste Runde
    if (round + 1 < TOTAL_ROUNDS) {
      setRound(r => r + 1);
      setCurrentCase(getNextPerfectionCase(round + 1));
    } else {
      alert("Perfektionierung abgeschlossen! Dein Modell ist jetzt deutlich robuster.");
      onBack();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <span className="bg-indigo-600 text-white text-xs px-2 py-1 rounded uppercase tracking-wide">Lab</span>
              Model Perfectioning
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Runde {round + 1} von {TOTAL_ROUNDS}: {currentCase.description}
            </p>
          </div>
          <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-600">
            Abbrechen
          </button>
        </div>

        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-indigo-600 transition-all duration-300" 
            style={{ width: `${((round) / TOTAL_ROUNDS) * 100}%` }}
          ></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-2xl opacity-50 group-hover:opacity-100 transition duration-200"></div>
            <div className="relative">
               <DecisionCard 
                 title="Option A (Simulation)" 
                 strategy={stratA} 
                 features={currentCase.featA} 
                 onChoose={() => handleChoice("A")}
                 disabled={false}
               />
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-100 to-amber-100 rounded-2xl opacity-50 group-hover:opacity-100 transition duration-200"></div>
             <div className="relative">
              <DecisionCard 
                  title="Option B (Simulation)" 
                  strategy={stratB} 
                  features={currentCase.featB} 
                  onChoose={() => handleChoice("B")} 
                  disabled={false}
                />
             </div>
          </div>
        </div>

        <div className="text-center mt-12">
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
                Diese Szenarien sind synthetisch generiert, um mathematische Lücken ("Blind Spots") im Modell zu füllen. 
                Die Raumnamen sind Platzhalter. Konzentriere dich auf die angezeigten Metriken (Laufweg, Wartezeit, Wechsel).
            </p>
        </div>

      </div>
    </div>
  );
}
