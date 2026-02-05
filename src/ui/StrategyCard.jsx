import { normalize } from "./normalize.js";

export default function StrategyCard({ strategy }) {
  const walkRatio = normalize(strategy.walkMeters, 600); // UI-Meinung
  const waitRatio = normalize(strategy.waitMinutes, 120);
  const switchRatio = normalize(strategy.switchCount, 4);

  return (
    <div className="rounded-2xl bg-white p-4 shadow">
      <h2 className="text-lg font-semibold">{strategy.label}</h2>

      <Metric
        icon="🚶"
        label="Gehweg"
        value={`${strategy.walkMeters} m`}
        ratio={walkRatio}
      />

      <Metric
        icon="⏳"
        label="Zeit ohne Raum"
        value={`${strategy.waitMinutes} min`}
        ratio={waitRatio}
      />

      <Metric
        icon="🔁"
        label="Raumwechsel"
        value={`${strategy.switchCount}`}
        ratio={switchRatio}
      />
    </div>
  );
}
