export function initWeights() {
  return {
    distanceNorm: 0,
    waitPenalty: 0,
    switchPenalty: 0,
    stabilityPenalty: 0,
    productiveLossMin: 0,
    riskLateMin: 0,
    totalPlannedMin: 0,
    totalCoveredMin: 0,
  };
}

export function initOptState() {
  return { t: 0, m: {}, v: {} };
}

function sigmoid(z) {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

export function updateWeightsAdam({ weights, opt, featA, featB, choice, lr = 0.05, l2 = 0.001, beta1 = 0.9, beta2 = 0.999, eps = 1e-8 }) {
  const x = {};
  const keys = new Set([...Object.keys(featA || {}), ...Object.keys(featB || {}), ...Object.keys(weights || {})]);
  for (const k of keys) x[k] = (featA?.[k] ?? 0) - (featB?.[k] ?? 0);

  let score = 0;
  for (const k of Object.keys(x)) score += (weights?.[k] ?? 0) * x[k];
  const p = sigmoid(score);
  const y = choice === "A" ? 1 : 0;

  const t = (opt?.t ?? 0) + 1;
  const m = { ...(opt?.m || {}) };
  const v = { ...(opt?.v || {}) };
  const nextWeights = { ...(weights || {}) };

  for (const k of Object.keys(x)) {
    const g = (p - y) * x[k] + l2 * (nextWeights[k] ?? 0);
    m[k] = beta1 * (m[k] ?? 0) + (1 - beta1) * g;
    v[k] = beta2 * (v[k] ?? 0) + (1 - beta2) * g * g;

    const mHat = m[k] / (1 - Math.pow(beta1, t));
    const vHat = v[k] / (1 - Math.pow(beta2, t));
    nextWeights[k] = (nextWeights[k] ?? 0) - lr * mHat / (Math.sqrt(vHat) + eps);
  }

  return { weights: nextWeights, opt: { t, m, v } };
}
