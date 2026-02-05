export function dot(w, x) {
  let s = 0;
  for (const k of Object.keys(x)) s += (w[k] ?? 0) * x[k];
  return s;
}

export function sigmoid(z) {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

// Pairwise: x = A - B
export function pairwiseProbChooseA(weights, featA, featB) {
  const x = diff(featA, featB);
  const score = dot(weights, x);
  return { p: sigmoid(score), score, x };
}

export function diff(a, b) {
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) out[k] = (a[k] ?? 0) - (b[k] ?? 0);
  return out;
}

