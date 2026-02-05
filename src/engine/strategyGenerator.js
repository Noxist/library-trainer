export function generateStrategies({ horizonHours }) {
  const A = buildStrategy({ horizonHours, style: "safe" });
  const B = buildStrategy({ horizonHours, style: "aggressive" });

  return { A, B };
}
