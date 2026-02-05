import { TARGET_QUESTIONS } from "../config/trainingLimits.js";

export default function ProgressBar({ current }) {
  const ratio = Math.min(1, current / TARGET_QUESTIONS);

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Training</span>
        <span>{current} / {TARGET_QUESTIONS}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
