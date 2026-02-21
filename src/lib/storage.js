// src/lib/storage.js
export function getLogArr(key) {
  return JSON.parse(localStorage.getItem(key) || "[]");
}

export function setLogArr(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
}

export function upsertRowIntoHistory(storageKey, row) {
  const arr = getLogArr(storageKey);
  const rowId = String(row[0] || "");
  if (!rowId) return;

  const idx = arr.findIndex((r) => String(r[0]) === rowId);
  if (idx >= 0) arr[idx] = row;
  else arr.push(row);

  setLogArr(storageKey, arr);
}
