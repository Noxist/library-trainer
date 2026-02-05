import React, { useEffect, useState } from "react";

import { listDays, buildDayIndexForDay } from "./engine/dayIndex.js";
import { generateTwoStrategies } from "./engine/strategyBuilder.js";
import { computeFeatures } from "./engine/features.js";
import { initWeights, initOptState, updateWeightsAdam } from "./engine/trainer.js";
import { defaultProfile } from "./engine/profiles.js";
import { buildDatasetFromStartup } from "./engine/dataset.js";
import { selectTrainingHorizon } from "./engine/selectTrainingHorizon.js";

import { loadState, saveState, resetState, saveDataset, loadDataset, resetDataset } from "./utils/storage.js";
import { downloadTextFile, toCsvRow } from "./utils/csv.js";
import DecisionCard from "./ui/DecisionCard.jsx";
import SessionProgress from "./ui/SessionProgress.jsx";
import TrainingMixBar from "./ui/TrainingMixBar.jsx";
import OnboardingModal from "./ui/OnboardingModal.jsx";

// Import der Advanced Page für das Routing
import AdvancedAnalysisPage from "./ui/AdvancedAnalysisPage.jsx";
import PerfectioningPage from "./ui/PerfectioningPage.jsx";

const FIXED_MODE = "LOCKER";
const FIXED_ACCOUNTS = 3;

const CSV_HEADER = [
  "tsISO", "userId", "scenarioId", "day", "mode", "horizonMin", "accounts",
  "choice", "scoreA", "scoreB", "pChooseA",
  "A_distanceNorm", "A_waitPenalty", "A_switchPenalty", "A_stabilityPenalty", "A_productiveLossMin", "A_riskLateMin", "A_totalPlannedMin", "A_totalCoveredMin",
  "B_distanceNorm", "B_waitPenalty", "B_switchPenalty", "B_stabilityPenalty", "B_productiveLossMin", "B_riskLateMin", "B_totalPlannedMin", "B_totalCoveredMin",
  "prof_morningMean", "prof_morningStd", "prof_middayMean", "prof_middayStd", "prof_afternoonMean", "prof_afternoonStd", "prof_eveningMean", "prof_eveningStd",
  "prof_gapBrutalFrom", "prof_gapLongOkFrom", "prof_checkinStressFrom", "prof_switchLossMin"
];

function nowISO() { return new Date().toISOString(); }
function safe(s) { return (s || "user").replaceAll(/[^a-zA-Z0-9_-]/g, "_"); }
function scenarioIdOf(day, mode, horizonMin, n) { return `${day}|${mode}|${horizonMin}|${n}`; }

export default function App() {
  // 1. States definieren
  const [route, setRoute] = useState(window.location.hash);
  
  const persisted = loadState();
  const persistedDataset = loadDataset();

  const [userId, setUserId] = useState(persisted?.userId ?? "");
  const [profile, setProfile] = useState(persisted?.profile ?? defaultProfile(persisted?.userId ?? "unknown"));
  const [modelState, setModelState] = useState(() => persisted?.modelState ?? {
    LOCKER: { weights: initWeights(), opt: initOptState() },
    HUSTLE: { weights: initWeights(), opt: initOptState() }
  });
  const [logs, setLogs] = useState(persisted?.logs ?? []);
  const [round, setRound] = useState(persisted?.round ?? 0);
  const [datasetState, setDatasetState] = useState(() => persistedDataset ?? null);
  const [isLoadingDataset, setIsLoadingDataset] = useState(!persistedDataset);
  const [showOnboarding, setShowOnboarding] = useState(!persisted?.userId);

  // 2. Effects
  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    saveState({ userId, mode: FIXED_MODE, horizonMin: selectTrainingHorizon(round) * 60, accounts: FIXED_ACCOUNTS, profile, modelState, logs, round });
  }, [userId, profile, modelState, logs, round]);

  useEffect(() => {
    if (datasetState?.dataset && datasetState?.matrix) return;
    let active = true;
    setIsLoadingDataset(true);

    (async () => {
      try {
        const payload = await buildDatasetFromStartup();
        if (!active) return;
        setDatasetState(payload);
        saveDataset(payload.dataset, payload.matrix);
      } catch (error) {
        console.error("[dataset] Startup load failed", error);
      } finally {
        if (active) setIsLoadingDataset(false);
      }
    })();

    return () => { active = false; };
  }, [datasetState]);

  // Log-Handler für Perfectioning
  const handlePerfectioningLog = (data) => {
    const row = buildLogRow({
      userId,
      scenarioId: `PERF|${Date.now()}`,
      day: "SIMULATION",
      mode: "PERFECTIONING",
      horizonMin: data.featA.totalPlannedMin || 480,
      accounts: 0,
      choice: data.choice,
      scoreA: 0,
      scoreB: 0,
      pChooseA: 0.5,
      featA: data.featA,
      featB: data.featB,
      profile
    });
    setLogs((prev) => [...prev, row]);
  };

  // 3. Routing-Weichen
  if (route === "#/auswertung") {
    return <AdvancedAnalysisPage />;
  }

  if (route === "#/perfectioning") {
    return (
      <PerfectioningPage 
        modelState={modelState} 
        setModelState={setModelState}
        userId={userId}
        onBack={() => {
            window.location.hash = "";
            setRoute(""); 
        }}
        onLog={handlePerfectioningLog}
      />
    );
  }

  // 4. Haupt-App Logik (gekürzt)
  if (isLoadingDataset && (!datasetState?.dataset || !datasetState?.matrix)) {
    return <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 md:px-6"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">Trainingsdaten werden geladen …</div></main>;
  }

  if (!datasetState?.dataset || !datasetState?.matrix) {
    return <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 md:px-6"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">Trainingsdaten konnten nicht geladen werden.</div></main>;
  }

  const dataset = datasetState.dataset;
  const matrix = datasetState.matrix;
  const mode = FIXED_MODE;
  const accounts = FIXED_ACCOUNTS;
  const horizonHours = selectTrainingHorizon(round);
  const horizonMin = horizonHours * 60;

  let dayIndex = null;
  let day = null;
  try {
    const allDays = listDays(dataset);
    day = allDays.length ? allDays[round % allDays.length] : null;
    if (day) dayIndex = buildDayIndexForDay(dataset, day);
  } catch (error) {
    console.error("[dataset] Index error", error);
  }

  if (!dayIndex) {
    return <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 md:px-6"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">Die Daten sind derzeit nicht nutzbar.</div></main>;
  }

  const scenarioId = scenarioIdOf(day, mode, horizonMin, round);
  const { strategyA, strategyB } = generateTwoStrategies({ dayIndex, matrix, mode, horizonMin, accounts, scenarioId });
  const featA = computeFeatures({ dayIndex, matrix, strategy: strategyA, profile, scenarioId });
  const featB = computeFeatures({ dayIndex, matrix, strategy: strategyB, profile, scenarioId });

  const curModel = modelState[mode];
  const scoreA = scoreFromWeights(curModel.weights, featA);
  const scoreB = scoreFromWeights(curModel.weights, featB);
  const pChooseA = softmaxProb(scoreA, scoreB);

  function onChoose(choice) {
    if (!userId.trim()) return;

    const upd = updateWeightsAdam({
      weights: curModel.weights,
      opt: curModel.opt,
      featA,
      featB,
      choice,
      lr: 0.05,
      l2: 0.001
    });

    setModelState((prev) => ({ ...prev, [mode]: { weights: upd.weights, opt: upd.opt } }));

    const row = buildLogRow({
      userId, scenarioId, day, mode, horizonMin, accounts, choice,
      scoreA, scoreB, pChooseA, featA, featB, profile
    });

    setLogs((prev) => [...prev, row]);
    setRound((prev) => prev + 1);
  }

  function onExportChoicesCsv() {
    const lines = [CSV_HEADER.join(",")];
    for (const r of logs) lines.push(toCsvRow(r, CSV_HEADER));
    const fname = `choices_${safe(userId)}_${nowISO().slice(0, 19).replaceAll(":", "-")}.csv`;
    downloadTextFile(fname, lines.join("\n"));
  }

  function onResetAllLocal() {
    resetState();
    resetDataset();
    setDatasetState(null);
    setUserId("");
    setProfile(defaultProfile("unknown"));
    setModelState({
      LOCKER: { weights: initWeights(), opt: initOptState() },
      HUSTLE: { weights: initWeights(), opt: initOptState() }
    });
    setLogs([]);
    setRound(0);
    setShowOnboarding(true);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <OnboardingModal
        open={showOnboarding}
        profile={profile}
        userId={userId}
        onClose={() => setShowOnboarding(false)}
        onSave={(nextProfile, nextUserId) => {
          setProfile(nextProfile);
          setUserId(nextUserId);
        }}
      />

      <header className="mb-6 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Room Reservation Trainer</h1>
              <p className="mt-1 text-sm text-slate-600">Wähle die angenehmere Strategie.</p>
            </div>
            <button type="button" onClick={onExportChoicesCsv} disabled={logs.length === 0} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
              Export CSV
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowOnboarding(true)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">Profil</button>
            <button type="button" onClick={onResetAllLocal} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">Neu starten</button>
          </div>
        </div>

        <SessionProgress count={logs.length} />
        <TrainingMixBar currentHours={horizonHours} />
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <DecisionCard title="A" strategy={strategyA} features={featA} onChoose={() => onChoose("A")} disabled={!userId.trim()} />
        <DecisionCard title="B" strategy={strategyB} features={featB} onChoose={() => onChoose("B")} disabled={!userId.trim()} />
      </section>

      <details className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        <summary className="cursor-pointer font-medium text-slate-700">Debug</summary>
        <div className="mt-3 space-x-2">
          <button type="button" onClick={() => { resetDataset(); setDatasetState(null); }} className="rounded-xl border border-slate-300 px-3 py-2">Dataset neu laden</button>
          <span className="text-xs">Aktuelle Runde: {round + 1}</span>
        </div>
      </details>
    </main>
  );
}

function softmaxProb(a, b) {
  const ma = Math.max(a, b);
  const ea = Math.exp(a - ma);
  const eb = Math.exp(b - ma);
  return ea / (ea + eb);
}

function scoreFromWeights(w, f) {
  let s = 0;
  for (const k of Object.keys(f)) s += (w[k] ?? 0) * f[k];
  return s;
}

function buildLogRow({ userId, scenarioId, day, mode, horizonMin, accounts, choice, scoreA, scoreB, pChooseA, featA, featB, profile }) {
  const p = profile;
  return {
    tsISO: nowISO(), userId, scenarioId, day, mode, horizonMin, accounts, choice,
    scoreA: scoreA.toFixed(6), scoreB: scoreB.toFixed(6), pChooseA: pChooseA.toFixed(6),
    A_distanceNorm: featA.distanceNorm.toFixed(6),
    A_waitPenalty: featA.waitPenalty.toFixed(6),
    A_switchPenalty: featA.switchPenalty.toFixed(6),
    A_stabilityPenalty: featA.stabilityPenalty.toFixed(6),
    A_productiveLossMin: featA.productiveLossMin.toFixed(3),
    A_riskLateMin: featA.riskLateMin.toFixed(6),
    A_totalPlannedMin: featA.totalPlannedMin,
    A_totalCoveredMin: featA.totalCoveredMin,
    B_distanceNorm: featB.distanceNorm.toFixed(6),
    B_waitPenalty: featB.waitPenalty.toFixed(6),
    B_switchPenalty: featB.switchPenalty.toFixed(6),
    B_stabilityPenalty: featB.stabilityPenalty.toFixed(6),
    B_productiveLossMin: featB.productiveLossMin.toFixed(3),
    B_riskLateMin: featB.riskLateMin.toFixed(6),
    B_totalPlannedMin: featB.totalPlannedMin,
    B_totalCoveredMin: featB.totalCoveredMin,
    prof_morningMean: p.delayByBucket.MORNING.meanMin,
    prof_morningStd: p.delayByBucket.MORNING.stdMin,
    prof_middayMean: p.delayByBucket.MIDDAY.meanMin,
    prof_middayStd: p.delayByBucket.MIDDAY.stdMin,
    prof_afternoonMean: p.delayByBucket.AFTERNOON.meanMin,
    prof_afternoonStd: p.delayByBucket.AFTERNOON.stdMin,
    prof_eveningMean: p.delayByBucket.EVENING.meanMin,
    prof_eveningStd: p.delayByBucket.EVENING.stdMin,
    prof_gapBrutalFrom: p.gapAnnoyance.shortBrutalFromMin,
    prof_gapLongOkFrom: p.gapAnnoyance.longOkFromMin,
    prof_checkinStressFrom: p.riskTolerance.lateCheckinBrutalFromMin,
    prof_switchLossMin: p.switchAnnoyance.switchLossMin
  };
}
