// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";

import { listDays, buildDayIndexForDay } from "./engine/dayIndex.js";
import { generateTwoStrategies } from "./engine/strategyBuilder.js";
import { computeFeatures } from "./engine/features.js";
import { initWeights, initOptState, updateWeightsAdam } from "./engine/trainer.js";
import { defaultProfile } from "./engine/profiles.js";
import { buildDatasetFromRepository, buildDatasetFromUploads } from "./engine/dataset.js";

import { loadState, saveState, resetState, saveDataset, loadDataset, resetDataset } from "./utils/storage.js";
import { downloadTextFile, toCsvRow } from "./utils/csv.js";
import { selectTrainingHorizon } from "./engine/selectTrainingHorizon.js";
import { generateStrategies } from "./engine/strategyGenerator.js";

const horizonHours = selectTrainingHorizon(roundIndex);

const { A, B } = generateStrategies({ horizonHours });

// A.walkMeters → Engine-Wahrheit
// normalize(A.walkMeters, 600) → UI-Übersetzung

const SOFT_TARGET_QUESTIONS = 250;

const CSV_HEADER = [
  "tsISO","userId","scenarioId","day","mode","horizonMin","accounts",
  "choice","scoreA","scoreB","pChooseA",
  "A_distanceNorm","A_waitPenalty","A_switchPenalty","A_stabilityPenalty","A_productiveLossMin","A_riskLateMin","A_totalPlannedMin","A_totalCoveredMin",
  "B_distanceNorm","B_waitPenalty","B_switchPenalty","B_stabilityPenalty","B_productiveLossMin","B_riskLateMin","B_totalPlannedMin","B_totalCoveredMin",
  "prof_morningMean","prof_morningStd","prof_middayMean","prof_middayStd","prof_afternoonMean","prof_afternoonStd","prof_eveningMean","prof_eveningStd",
  "prof_gapBrutalFrom","prof_gapLongOkFrom","prof_checkinStressFrom","prof_switchLossMin"
];

function nowISO() { return new Date().toISOString(); }
function safe(s) { return (s || "user").replaceAll(/[^a-zA-Z0-9_-]/g, "_"); }

function scenarioIdOf(day, mode, horizonMin, n) {
  return `${day}|${mode}|${horizonMin}|${n}`;
}

export default function App() {
  const persisted = loadState();
  const persistedDataset = loadDataset();

  const [userId, setUserId] = useState(persisted?.userId ?? "");
  const [mode, setMode] = useState(persisted?.mode ?? "LOCKER");
  const [horizonMin, setHorizonMin] = useState(persisted?.horizonMin ?? 480);
  const [accounts, setAccounts] = useState(persisted?.accounts ?? 3);
  const [profile, setProfile] = useState(persisted?.profile ?? defaultProfile(persisted?.userId ?? "unknown"));

  const [modelState, setModelState] = useState(() => {
    return persisted?.modelState ?? {
      LOCKER: { weights: initWeights(), opt: initOptState() },
      HUSTLE: { weights: initWeights(), opt: initOptState() }
    };
  });

  const [logs, setLogs] = useState(persisted?.logs ?? []);
  const [round, setRound] = useState(persisted?.round ?? 0);

  const [datasetState, setDatasetState] = useState(() => {
    return persistedDataset ?? null; // { dataset, matrix }
  });

  // Persist main state
  useMemo(() => {
    saveState({ userId, mode, horizonMin, accounts, profile, modelState, logs, round });
  }, [userId, mode, horizonMin, accounts, profile, modelState, logs, round]);

  // Wenn kein Dataset geladen: Upload UI zeigen
  if (!datasetState?.dataset || !datasetState?.matrix) {
    return (
      <div style={{ fontFamily: "system-ui", padding: 16, maxWidth: 1100, margin: "0 auto" }}>
        <h2>Room Reservation Trainer</h2>
        <DatasetUploader
          onLoaded={(dataset, matrix) => {
            const payload = { dataset, matrix };
            setDatasetState(payload);
            saveDataset(dataset, matrix);
          }}
          onReset={() => {
            resetDataset();
            setDatasetState(null);
          }}
        />
      </div>
    );
  }

  const dataset = datasetState.dataset;
  const matrix = datasetState.matrix;

  // --- SICHERHEITS-BLOCK: Verhindert Abstürze bei fehlerhaften Daten ---
  let allDays = [];
  let dayIndex = null;
  let day = null;
  let errorMsg = null;

  try {
    allDays = listDays(dataset);
    day = allDays.length ? allDays[round % allDays.length] : null;
    if (day) {
      dayIndex = buildDayIndexForDay(dataset, day);
    }
  } catch (e) {
    console.error("Critical Dataset Error:", e);
    errorMsg = e.message;
  }

  if (errorMsg || !dayIndex) {
    return (
      <div style={{ padding: 20, fontFamily: "system-ui", color: "#d32f2f", border: "2px solid #d32f2f", borderRadius: 8, margin: 20 }}>
        <h3>Fehler beim Laden der Tages-Daten</h3>
        <p>Das Dataset scheint beschädigt oder inkompatibel zu sein.</p>
        <pre style={{ background: "#eee", padding: 10 }}>{errorMsg || "Unbekannter Fehler beim Indizieren des Tages."}</pre>
        <button 
          onClick={() => { resetDataset(); setDatasetState(null); window.location.reload(); }}
          style={{ marginTop: 10, padding: 10, cursor: "pointer" }}
        >
          Dataset zurücksetzen & neu laden
        </button>
      </div>
    );
  }
  // --- ENDE SICHERHEITS-BLOCK ---

  const scenarioId = scenarioIdOf(day, mode, horizonMin, round);

  const { strategyA, strategyB } = useMemo(() => {
    return generateTwoStrategies({
      dayIndex,
      matrix,
      mode,
      horizonMin,
      accounts,
      scenarioId
    });
  }, [dayIndex, matrix, mode, horizonMin, accounts, scenarioId]);

  const featA = useMemo(() => computeFeatures({ dayIndex, matrix, strategy: strategyA, profile, scenarioId }), [strategyA, profile, scenarioId, dayIndex, matrix]);
  const featB = useMemo(() => computeFeatures({ dayIndex, matrix, strategy: strategyB, profile, scenarioId }), [strategyB, profile, scenarioId, dayIndex, matrix]);

  const curModel = modelState[mode];
  const scoreA = scoreFromWeights(curModel.weights, featA);
  const scoreB = scoreFromWeights(curModel.weights, featB);
  const pChooseA = softmaxProb(scoreA, scoreB);

  const progress = logs.length;
  const softGoalText = progress >= SOFT_TARGET_QUESTIONS
    ? `Ziel erreicht: ${progress} Entscheide`
    : `Ziel: ${SOFT_TARGET_QUESTIONS} Entscheide (aktuell ${progress})`;

  function onChoose(choice) {
    if (!userId.trim()) return;

    const upd = updateWeightsAdam({
      weights: curModel.weights,
      opt: curModel.opt,
      featA,
      featB,
      choice,
      lr: mode === "HUSTLE" ? 0.04 : 0.05,
      l2: 0.001
    });

    const nextModelState = {
      ...modelState,
      [mode]: { weights: upd.weights, opt: upd.opt }
    };
    setModelState(nextModelState);

    const row = buildLogRow({
      userId,
      scenarioId,
      day,
      mode,
      horizonMin,
      accounts,
      choice,
      scoreA,
      scoreB,
      pChooseA,
      featA,
      featB,
      profile
    });

    setLogs([...logs, row]);
    setRound(round + 1);
  }

  function onExportChoicesCsv() {
    const lines = [];
    lines.push(CSV_HEADER.join(","));
    for (const r of logs) lines.push(toCsvRow(r, CSV_HEADER));
    const fname = `choices_${safe(userId)}_${nowISO().slice(0,19).replaceAll(":","-")}.csv`;
    downloadTextFile(fname, lines.join("\n"));
  }

  function onResetAllLocal() {
    resetState();
    resetDataset();
    setDatasetState(null);
    setUserId("");
    setMode("LOCKER");
    setHorizonMin(480);
    setAccounts(3);
    setProfile(defaultProfile("unknown"));
    setModelState({
      LOCKER: { weights: initWeights(), opt: initOptState() },
      HUSTLE: { weights: initWeights(), opt: initOptState() }
    });
    setLogs([]);
    setRound(0);
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h2>Room Reservation Trainer</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card title="User">
          <label>UserId (Name/Kürzel)</label>
          <input value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle} placeholder="z.B. leandro" />
          <div style={{ marginTop: 8, fontSize: 14 }}>{softGoalText}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={onExportChoicesCsv} disabled={logs.length === 0}>Export choices.csv</button>
            <button onClick={() => { resetDataset(); setDatasetState(null); }}>Dataset neu laden</button>
            <button onClick={onResetAllLocal}>Reset alles lokal</button>
          </div>
        </Card>

        <Card title="Session">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label>Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)} style={inputStyle}>
              <option value="LOCKER">LOCKER</option>
              <option value="HUSTLE">HUSTLE</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <label>Horizon</label>
            <select value={horizonMin} onChange={e => setHorizonMin(Number(e.target.value))} style={inputStyle}>
              <option value={240}>4h (240)</option>
              <option value={480}>8h (480)</option>
              <option value={600}>10h (600)</option>
              <option value={720}>12h (720)</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <label>Accounts</label>
            <select value={accounts} onChange={e => setAccounts(Number(e.target.value))} style={inputStyle}>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </div>

          <div style={{ marginTop: 8, fontSize: 13 }}>
            Startzeit fix 08:00. Tag (Rotation): {day} ({allDays.length} Tage geladen)
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 12 }}>
        <ProfileEditor profile={profile} setProfile={(p) => setProfile({ ...p, userId: userId || p.userId })} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <StrategyCard title="Strategie A" strategy={strategyA} features={featA} score={scoreA} onChoose={() => onChoose("A")} />
        <StrategyCard title="Strategie B" strategy={strategyB} features={featB} score={scoreB} onChoose={() => onChoose("B")} />
      </div>

      <div style={{ marginTop: 12, fontSize: 13 }}>
        p(A) nach aktuellem Modell: {pChooseA.toFixed(3)}
      </div>
    </div>
  );
}

// --- Sub-Komponenten (unverändert, aber nötig für vollständige Datei) ---

function DatasetUploader({ onLoaded, onReset }) {
  const [dayFiles, setDayFiles] = useState([]);
  const [matrixFile, setMatrixFile] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setStatus("Lade Dataset aus GitHub...");
        const { dataset, matrix } = await buildDatasetFromRepository();
        if (!active) return;
        setStatus(`OK: ${Object.keys(dataset.days).length} Tage, ${dataset.rooms.length} Räume`);
        onLoaded(dataset, matrix);
      } catch {
        if (!active) return;
        setStatus("");
      }
    })();
    return () => { active = false; };
  }, [onLoaded]);

  async function onLoad() {
    setStatus("Lade JSONs...");
    try {
      const { dataset, matrix } = await buildDatasetFromUploads(dayFiles, matrixFile);
      setStatus(`OK: ${Object.keys(dataset.days).length} Tage, ${dataset.rooms.length} Räume`);
      onLoaded(dataset, matrix);
    } catch (e) {
      setStatus(`Fehler: ${String(e.message || e)}`);
    }
  }

  return (
    <Card title="Dataset Upload">
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        Lade alle Tagesfiles (z.B. <code>2026-01-06_ml.json</code>) und die Matrix <code>roomDistanceMatrix.json</code>.
      </div>

      <label>38 Tages-JSONs (multi)</label>
      <input
        type="file"
        multiple
        accept=".json,application/json"
        onChange={(e) => setDayFiles(Array.from(e.target.files || []))}
        style={{ ...inputStyle, padding: 6 }}
      />

      <label style={{ marginTop: 8 }}>Matrix (roomDistanceMatrix.json)</label>
      <input
        type="file"
        accept=".json,application/json"
        onChange={(e) => setMatrixFile((e.target.files && e.target.files[0]) ? e.target.files[0] : null)}
        style={{ ...inputStyle, padding: 6 }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={onLoad} disabled={!dayFiles.length || !matrixFile}>Dataset laden</button>
        <button onClick={onReset}>Dataset Reset</button>
      </div>

      <div style={{ marginTop: 8, fontSize: 13 }}>
        Tagesfiles: {dayFiles.length} | Matrix: {matrixFile ? matrixFile.name : "keine"}
      </div>

      {status && <div style={{ marginTop: 8, fontSize: 13 }}>{status}</div>}
    </Card>
  );
}

function StrategyCard({ title, strategy, features, score, onChoose }) {
  return (
    <Card title={title}>
      <div style={{ fontSize: 13, marginBottom: 8 }}>Policy: {strategy.policy}</div>
      <div style={{ fontFamily: "monospace", fontSize: 12, background: "#f6f6f6", padding: 8, borderRadius: 8 }}>
        {strategy.blocks.map((b, i) => (
          <div key={i}>
            {b.room} {b.startTime}–{b.endTime}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 13 }}>
        <div>Score: {score.toFixed(3)}</div>
        <div>DistNorm: {features.distanceNorm.toFixed(3)}</div>
        <div>WaitPenalty: {features.waitPenalty.toFixed(3)}</div>
        <div>SwitchPenalty: {features.switchPenalty.toFixed(3)}</div>
        <div>StabilityPenalty: {features.stabilityPenalty.toFixed(3)}</div>
        <div>ProductiveLossMin: {features.productiveLossMin.toFixed(1)}</div>
        <div>RiskLateMin: {features.riskLateMin.toFixed(2)}</div>
      </div>

      {strategy.opportunities?.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary>Opportunitäten (bei grossen Gaps)</summary>
          <div style={{ fontSize: 12 }}>
            {strategy.opportunities.map((o, idx) => (
              <div key={idx} style={{ marginTop: 6 }}>
                <div><b>{o.atTime}</b> Gap {o.gapMin}min</div>
                <div>stableFreeRooms: {o.stableFreeRooms.slice(0, 6).join(", ")}{o.stableFreeRooms.length > 6 ? " ..." : ""}</div>
                <div>imminentLossRooms: {o.imminentLossRooms.slice(0, 6).join(", ")}{o.imminentLossRooms.length > 6 ? " ..." : ""}</div>
                <div>recentlyVacatedRooms: {o.recentlyVacatedRooms.slice(0, 6).join(", ")}{o.recentlyVacatedRooms.length > 6 ? " ..." : ""}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      <button onClick={onChoose} style={{ marginTop: 10, width: "100%" }}>
        Waehle {title.endsWith("A") ? "A" : "B"}
      </button>
    </Card>
  );
}

function ProfileEditor({ profile, setProfile }) {
  const p = profile;
  return (
    <Card title="Profil (pro Person)">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <h4 style={{ margin: "4px 0" }}>Puenktlichkeit (mean/std Minuten)</h4>
          <BucketRow label="MORNING" model={p.delayByBucket.MORNING} onChange={(m) => setProfile({ ...p, delayByBucket: { ...p.delayByBucket, MORNING: m } })} />
          <BucketRow label="MIDDAY" model={p.delayByBucket.MIDDAY} onChange={(m) => setProfile({ ...p, delayByBucket: { ...p.delayByBucket, MIDDAY: m } })} />
          <BucketRow label="AFTERNOON" model={p.delayByBucket.AFTERNOON} onChange={(m) => setProfile({ ...p, delayByBucket: { ...p.delayByBucket, AFTERNOON: m } })} />
          <BucketRow label="EVENING" model={p.delayByBucket.EVENING} onChange={(m) => setProfile({ ...p, delayByBucket: { ...p.delayByBucket, EVENING: m } })} />
        </div>

        <div>
          <h4 style={{ margin: "4px 0" }}>Toleranzen</h4>

          <label>Gap brutal bis (min)</label>
          <input type="number" value={p.gapAnnoyance.shortBrutalFromMin}
            onChange={e => setProfile({ ...p, gapAnnoyance: { ...p.gapAnnoyance, shortBrutalFromMin: Number(e.target.value) } })}
            style={inputStyle} />

          <label style={{ marginTop: 8 }}>Gap ok ab (min)</label>
          <input type="number" value={p.gapAnnoyance.longOkFromMin}
            onChange={e => setProfile({ ...p, gapAnnoyance: { ...p.gapAnnoyance, longOkFromMin: Number(e.target.value) } })}
            style={inputStyle} />

          <label style={{ marginTop: 8 }}>Check-in Stress ab (min vor Deadline)</label>
          <input type="number" value={p.riskTolerance.lateCheckinBrutalFromMin}
            onChange={e => setProfile({ ...p, riskTolerance: { ...p.riskTolerance, lateCheckinBrutalFromMin: Number(e.target.value) } })}
            style={inputStyle} />

          <label style={{ marginTop: 8 }}>Produktiver Verlust pro Switch (min)</label>
          <input type="number" value={p.switchAnnoyance.switchLossMin}
            onChange={e => setProfile({ ...p, switchAnnoyance: { ...p.switchAnnoyance, switchLossMin: Number(e.target.value) } })}
            style={inputStyle} />
        </div>
      </div>
    </Card>
  );
}

function BucketRow({ label, model, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 8, marginTop: 6, alignItems: "center" }}>
      <div style={{ fontSize: 12 }}>{label}</div>
      <input type="number" value={model.meanMin} onChange={e => onChange({ ...model, meanMin: Number(e.target.value) })} style={inputStyle} />
      <input type="number" value={model.stdMin} onChange={e => onChange({ ...model, stdMin: Number(e.target.value) })} style={inputStyle} />
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
      <h3 style={{ margin: "4px 0 10px 0" }}>{title}</h3>
      {children}
    </div>
  );
}

const inputStyle = { width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" };

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
    tsISO: nowISO(),
    userId,
    scenarioId,
    day,
    mode,
    horizonMin,
    accounts,
    choice,
    scoreA: scoreA.toFixed(6),
    scoreB: scoreB.toFixed(6),
    pChooseA: pChooseA.toFixed(6),

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
