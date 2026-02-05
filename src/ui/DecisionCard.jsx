import { getRoomSizeLabel, getSeats } from "../data/roomMeta.js";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stabilityText(score) {
  if (score >= 0.75) return "hoch";
  if (score >= 0.45) return "mittel";
  return "niedrig";
}

export default function DecisionCard({ title, strategy, features, onChoose, disabled }) {
  // 1. Support für Simulation (steps) vs. Echt (blocks)
  const dataPoints = strategy?.blocks || strategy?.steps || [];
  const rooms = Array.from(new Set(dataPoints.map((b) => b.room)));
  
  const seats = rooms.map((room) => getSeats(room)).filter((v) => typeof v === "number");
  const typicalSeats = median(seats);
  
  // Wenn keine Sitze bekannt (Simulation), nehmen wir einen Standardwert "mittel" an
  const roomSizeLabel = typicalSeats 
    ? getRoomSizeLabel(typicalSeats) 
    : "mittel (Sim)";
    
  const roomSize = rooms.length > 1 
    ? `mix (typisch: ${roomSizeLabel})` 
    : roomSizeLabel;

  const stabilityRatio = clamp01(features?.stabilityScore ?? 0);
  
  const debug = {
    distanceNorm: features?.distanceNorm ?? 0,
    waitPenalty: features?.waitPenalty ?? 0,
    switchPenalty: features?.switchPenalty ?? 0,
    riskLateMin: features?.riskLateMin ?? 0,
    productiveLossMin: features?.productiveLossMin ?? 0
  };

  // 2. WICHTIG: Prüfen, ob wir im Simulations-Modus sind ("forcedStats")
  // Falls ja, nehmen wir die fake Werte. Falls nein, die echten Features.
  const isSim = !!strategy?.forcedStats;
  
  const displayValues = {
    walk: isSim ? strategy.forcedStats.distance : `${features.walkMeters ?? 0} m`,
    wait: isSim ? strategy.forcedStats.gap : `${features.waitMinutesTotal ?? 0} min`,
    switches: isSim ? strategy.forcedStats.switches : (features.switches ?? 0),
    // Wenn geplant (Sim), dann das anzeigen, sonst default
    planned: isSim ? strategy.forcedStats.planned : null
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6 transition hover:shadow-md">
      <h3 className="text-lg font-semibold text-slate-900">Strategie {title}</h3>

      <div className="mt-4 space-y-2 text-sm text-slate-700">
        <p className="font-medium">Verwendete Räume</p>
        <div className="flex flex-wrap gap-2">
          {rooms.map((room) => {
            const roomSeats = getSeats(room);
            return (
              <span key={room} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
                {room} {roomSeats ? `(${roomSeats} Plätze)` : ""}
              </span>
            );
          })}
          {rooms.length === 0 && <span className="text-slate-400 italic">Keine Räume</span>}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-2">
        <Metric label="Fussweg" value={displayValues.walk} />
        <Metric label="Zeit ohne Raum" value={displayValues.wait} />
        <Metric label="Raumwechsel" value={displayValues.switches} />
        <Metric label="Raumgrösse" value={roomSize} />
        {displayValues.planned && (
             <Metric label="Geplante Zeit" value={displayValues.planned} />
        )}
      </dl>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-sm text-slate-700">
          <span>Stabilität</span>
          <span className="text-xs text-slate-500">{stabilityText(stabilityRatio)}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${stabilityRatio * 100}%` }} />
        </div>
      </div>

      <details className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-100">
        <summary className="cursor-pointer font-medium text-slate-700">AI Features (Debug)</summary>
        <div className="mt-2 grid grid-cols-2 gap-y-1 gap-x-4 sm:grid-cols-2">
          <span title="Bestrafung für Laufweg">dist: {debug.distanceNorm.toFixed(2)}</span>
          <span title="Bestrafung für Warten">wait: {debug.waitPenalty.toFixed(2)}</span>
          <span title="Bestrafung für Wechsel">switch: {debug.switchPenalty.toFixed(2)}</span>
          <span title="Zeitverlust durch Wechsel">prodLoss: {debug.productiveLossMin.toFixed(0)}</span>
        </div>
      </details>

      <button
        type="button"
        onClick={onChoose}
        disabled={disabled}
        className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-indigo-700 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
      >
        Diese Strategie wählen
      </button>
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 border border-slate-100">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
