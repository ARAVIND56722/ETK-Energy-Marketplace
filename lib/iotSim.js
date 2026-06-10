// lib/iotSim.js
// Simple smart meter simulation (no hardware)
// - Generates realistic-ish solar + consumption
// - Calculates surplus/deficit
// - Persists per-wallet state in localStorage

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function seededRand(seedStr) {
  // deterministic pseudo-random based on wallet address
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    // xorshift-ish
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    // 0..1
    return ((h >>> 0) % 100000) / 100000;
  };
}

function hourOfDay(ts = Date.now()) {
  return new Date(ts).getHours(); // 0..23
}

function solarShape(hour) {
  // DEMO MODE: keep solar available even at night for hackathon demo
  const DEMO_ALWAYS_DAY = true;

  if (!DEMO_ALWAYS_DAY) {
    if (hour < 6 || hour > 18) return 0;
  }

  // if demo mode, clamp hour into daytime range
  const h = DEMO_ALWAYS_DAY ? 12 : hour;

  const x = (h - 12) / 6; // -1..+1
  const bell = Math.exp(-2.2 * x * x);
  return bell; // 0..1
}

function baseLoadShape(hour) {
  // higher in morning & evening (typical residential)
  const morning = Math.exp(-0.5 * Math.pow((hour - 8) / 2.2, 2));
  const evening = Math.exp(-0.5 * Math.pow((hour - 20) / 2.6, 2));
  return 0.35 + 0.9 * (morning + evening); // ~0.35..2.1
}

function storageKey(address) {
  return `etk_meter_${address?.toLowerCase?.() || "unknown"}`;
}

export function getOrCreateMeterState(address) {
  const key = storageKey(address);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}

  // default baseline profiles — we can tune later
  const r = seededRand(address || "seed");
  // DEMO MODE: decide role by wallet address (first connected becomes producer if you want)
const homeType =
  (address || "").toLowerCase() === (localStorage.getItem("ETK_PRODUCER") || "").toLowerCase()
    ? "producer"
    : "consumer";

  const state = {
    address: address || "",
    homeType, // "producer" or "consumer"
    // capacities in kW (used to compute kWh per interval)
    solarCapacityKw: homeType === "producer" ? 12 : 1,
baseLoadKw: homeType === "producer" ? 1.5 : 2.8,
    // accumulated totals (kWh)
    totalGenerated: 0,
    totalConsumed: 0,
    totalExported: 0,
    totalImported: 0,
    lastTickTs: Date.now(),
    // current snapshot (kWh this tick)
    generatedNow: 0,
    consumedNow: 0,
    surplusNow: 0,
    deficitNow: 0,
  };

  persistMeterState(address, state);
  return state;
}

export function persistMeterState(address, state) {
  const key = storageKey(address);
  localStorage.setItem(key, JSON.stringify(state));
}

export function simulateOneTick(address, minutesPerTick = 5) {
  // returns updated state
  const state = getOrCreateMeterState(address);
  const r = seededRand((address || "") + String(Math.floor(Date.now() / 60000))); // changes slowly

  const hour = hourOfDay();

  const tickHours = minutesPerTick / 60;

  // solar generation (kWh) this tick
  const solarFactor = solarShape(hour);
  const clouds = 0.75 + r() * 0.5; // 0.75..1.25
  const generated = state.solarCapacityKw * solarFactor * clouds * tickHours;

  // consumption (kWh) this tick
  const loadFactor = baseLoadShape(hour);
  const noise = 0.85 + r() * 0.4; // 0.85..1.25
  const consumed = state.baseLoadKw * loadFactor * noise * tickHours;

  // net
  const net = generated - consumed;
  const surplus = net > 0 ? net : 0;
  const deficit = net < 0 ? -net : 0;

  state.generatedNow = Number(generated.toFixed(3));
  state.consumedNow = Number(consumed.toFixed(3));
  state.surplusNow = Number(surplus.toFixed(3));
  state.deficitNow = Number(deficit.toFixed(3));

  state.totalGenerated = Number((state.totalGenerated + generated).toFixed(3));
  state.totalConsumed = Number((state.totalConsumed + consumed).toFixed(3));
  state.totalExported = Number((state.totalExported + surplus).toFixed(3));
  state.totalImported = Number((state.totalImported + deficit).toFixed(3));

  state.lastTickTs = Date.now();

  persistMeterState(address, state);
  return state;
}
export function setProducerWallet(address) {
  localStorage.setItem("ETK_PRODUCER", address);
}

export function getProducerWallet() {
  return localStorage.getItem("ETK_PRODUCER") || "";
}