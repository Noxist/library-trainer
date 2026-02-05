import { TRAINING_MIX } from "../config/trainingMix.js";

export default function TrainingMixBar({ current }) {
  const total = Object.values(TRAINING_MIX).reduce((a,b) => a+b, 0);

  return (
    <div className="flex gap-2 items-center text-xs text-gray-500">
      {Object.entries(TRAINING_MIX).map(([h, w]) => (
        <div
          key={h}
          className={`h-2 rounded-full ${
            Number(h) === current ? "bg-indigo-500" : "bg-gray-300"
          }`}
          style={{ width: `${(w / total) * 100}%` }}
          title={`${h}h`}
        />
      ))}
    </div>
  );
}
