// lib/meterHistory.js
const MAX_POINTS = 500; // enough for demo (history window)

function key(address) {
  return `etk_meter_history_${(address || "").toLowerCase()}`;
}

export function appendMeterPoint(address, point) {
  if (!address) return;
  const k = key(address);
  const raw = localStorage.getItem(k);
  const arr = raw ? JSON.parse(raw) : [];
  arr.push(point);
  // keep last MAX_POINTS
  while (arr.length > MAX_POINTS) arr.shift();
  localStorage.setItem(k, JSON.stringify(arr));
}

export function getMeterHistory(address) {
  if (!address) return [];
  const raw = localStorage.getItem(key(address));
  return raw ? JSON.parse(raw) : [];
}

export function clearMeterHistory(address) {
  if (!address) return;
  localStorage.removeItem(key(address));
}