const GOAL = 250;

export default function SessionProgress({ count }) {
  const shown = Math.min(count, GOAL);
  const ratio = shown / GOAL;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
        <span className="font-medium">Fortschritt</span>
        <span>{shown} / {GOAL} Entscheidungen</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${ratio * 100}%` }} />
      </div>
    </section>
  );
}
