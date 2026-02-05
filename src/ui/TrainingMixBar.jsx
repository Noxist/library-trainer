import { TRAINING_MIX } from "../config/trainingMix.js";

export default function TrainingMixBar({ currentHours }) {
  const total = Object.values(TRAINING_MIX).reduce((a, b) => a + b, 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
        <span className="font-medium">Trainings-Mix</span>
        <span>Aktuell: {currentHours}h</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
        {Object.entries(TRAINING_MIX).map(([hours, weight]) => (
          <div
            key={hours}
            className={Number(hours) === currentHours ? "bg-indigo-600" : "bg-slate-300"}
            style={{ width: `${(weight / total) * 100}%` }}
            title={`${hours}h`}
          />
        ))}
      </div>
      <div className="mt-2 text-xs text-slate-500">4h selten, 8h normal, 12h häufig.</div>
    </section>
  );
}
