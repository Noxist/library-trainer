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
  const rooms = Array.from(new Set((strategy?.blocks || []).map((b) => b.room)));
  const seats = rooms.map((room) => getSeats(room)).filter((v) => typeof v === "number");
  const typicalSeats = median(seats);
  const roomSize = rooms.length > 1 ? `mix (typisch: ${getRoomSizeLabel(typicalSeats)})` : getRoomSizeLabel(typicalSeats);

  const stabilityRatio = clamp01(features?.stabilityScore ?? 0);
  const debug = {
    distanceNorm: features?.distanceNorm ?? 0,
    waitPenalty: features?.waitPenalty ?? 0,
    switchPenalty: features?.switchPenalty ?? 0,
    riskLateMin: features?.riskLateMin ?? 0,
    productiveLossMin: features?.productiveLossMin ?? 0
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <h3 className="text-lg font-semibold text-slate-900">Strategie {title}</h3>

      <div className="mt-4 space-y-2 text-sm text-slate-700">
        <p className="font-medium">Verwendete Räume</p>
        <div className="flex flex-wrap gap-2">
          {rooms.map((room) => {
            const roomSeats = getSeats(room);
            return (
              <span key={room} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {room} ({roomSeats ?? "?"} Sitzplätze)
              </span>
            );
          })}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-2">
        <Metric label="Fussweg" value={`${features.walkMeters} m`} />
        <Metric label="Zeit ohne Raum" value={`${features.waitMinutesTotal} min`} />
        <Metric label="Raumwechsel" value={`${features.switches}`} />
        <Metric label="Raumgrösse" value={roomSize} />
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

      <details className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">Details</summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <span>distanceNorm: {debug.distanceNorm.toFixed(3)}</span>
          <span>waitPenalty: {debug.waitPenalty.toFixed(3)}</span>
          <span>switchPenalty: {debug.switchPenalty.toFixed(3)}</span>
          <span>riskLateMin: {debug.riskLateMin.toFixed(2)}</span>
          <span>productiveLossMin: {debug.productiveLossMin.toFixed(2)}</span>
        </div>
      </details>

      <button
        type="button"
        onClick={onChoose}
        disabled={disabled}
        className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Diese Strategie wählen
      </button>
    </article>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
