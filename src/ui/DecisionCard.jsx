import { normalize } from "./normalize.js";

function toWalkMeters(features) {
  return Math.round((features?.distanceNorm ?? 0) * 600);
}

function toWaitMinutes(features) {
  return Math.round((features?.waitPenalty ?? 0) * 120);
}

function toSwitchCount(features) {
  return Math.max(0, Math.round((features?.switchPenalty ?? 0) * 6));
}

function roomSizeLabel(strategy) {
  const rooms = new Set((strategy?.blocks || []).map((b) => b.room));
  const roomCount = rooms.size;
  if (roomCount <= 1) return "klein";
  if (roomCount <= 2) return "mittel";
  return "gross";
}

function stabilityRatio(strategy) {
  const blocks = strategy?.blocks || [];
  if (!blocks.length) return 0;
  const uniqueRooms = new Set(blocks.map((b) => b.room)).size;
  return normalize(1 / uniqueRooms, 1);
}

export default function DecisionCard({ title, strategy, features, onChoose, disabled }) {
  const rooms = Array.from(new Set((strategy?.blocks || []).map((b) => b.room)));
  const walkMeters = toWalkMeters(features);
  const waitMinutes = toWaitMinutes(features);
  const switchCount = toSwitchCount(features);
  const size = roomSizeLabel(strategy);
  const stable = stabilityRatio(strategy);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <h3 className="text-lg font-semibold text-slate-900">Strategie {title}</h3>

      <div className="mt-4 space-y-2 text-sm text-slate-700">
        <p className="font-medium">Verwendete Räume</p>
        <div className="flex flex-wrap gap-2">
          {rooms.map((room) => (
            <span key={room} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {room} · Sitzplätze: k.A.
            </span>
          ))}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-2">
        <Metric label="Gehzeit" value={`${walkMeters} m`} />
        <Metric label="Zeit ohne Raum" value={`${waitMinutes} min`} />
        <Metric label="Raumwechsel" value={`${switchCount}`} />
        <Metric label="Raumgrösse" value={size} />
      </dl>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-sm text-slate-700">
          <span>Stabilität</span>
          <span className="text-xs text-slate-500">visuelle Einordnung</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${stable * 100}%` }} />
        </div>
      </div>

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
