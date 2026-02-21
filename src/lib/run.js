// src/lib/run.js
import { todayDateStr } from "./date.js";

export function runKey(date, field) {
  return `run_${date}_${field}`;
}

export function todayRunDate() {
  return localStorage.getItem("run_date") || todayDateStr();
}

export function clearRunDraftForToday() {
  const date = todayRunDate();
  localStorage.removeItem(runKey(date, "distance"));
  localStorage.removeItem(runKey(date, "time"));
  localStorage.removeItem(runKey(date, "effort"));
  localStorage.removeItem(runKey(date, "notes"));
}

export function runDoneKey(date) {
  return `run_${date}_done`;
}

export function markRunDoneToday() {
  const date = todayRunDate();
  localStorage.setItem(runDoneKey(date), "1");
}

export function isRunLoggedToday() {
  const date = todayRunDate();

  // if synced today, it's done even after clearing draft
  if (localStorage.getItem(runDoneKey(date)) === "1") return true;

  // draft counts as "done" only if distance + time exist
  const dist = (localStorage.getItem(runKey(date, "distance")) || "").trim();
  const time = (localStorage.getItem(runKey(date, "time")) || "").trim();
  return dist !== "" && time !== "";
}