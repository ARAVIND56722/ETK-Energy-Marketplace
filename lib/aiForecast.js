// lib/aiForecast.js
// Holt's linear trend (double exponential smoothing)
// Returns forecast for next N steps.

export function holtForecast(values, steps = 12, alpha = 0.6, beta = 0.2) {
  const clean = (values || []).filter(v => typeof v === "number" && isFinite(v));
  if (clean.length < 5) {
    // not enough data: fallback to last value
    const last = clean.length ? clean[clean.length - 1] : 0;
    return Array.from({ length: steps }, () => last);
  }

  let level = clean[0];
  let trend = clean[1] - clean[0];

  for (let i = 1; i < clean.length; i++) {
    const v = clean[i];
    const prevLevel = level;
    level = alpha * v + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  const out = [];
  for (let m = 1; m <= steps; m++) out.push(level + m * trend);
  return out;
}

export function sum(arr) {
  return (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}