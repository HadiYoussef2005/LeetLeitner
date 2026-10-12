import { defaults, validateInput, type Store, type Problem } from "./engine";
export const STORAGE_KEY = "leetleitner.v1";
const validDate = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const timestamp = (v: unknown) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v));
export function parseStore(raw: string): Store {
  const data = JSON.parse(raw);
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.problems) ||
    !data.settings
  )
    throw Error(
      "This data format is unsupported. Your stored data has been preserved.",
    );
  const ids = new Set(),
    numbers = new Set();
  for (const p of data.problems as Problem[]) {
    if (
      !p ||
      p.schemaVersion !== 1 ||
      typeof p.id !== "string" ||
      ids.has(p.id) ||
      numbers.has(p.problemNumber) ||
      Object.keys(validateInput(p, [])).length ||
      ![1, 2, 3].includes(p.currentBucket) ||
      !Array.isArray(p.tags) ||
      !p.tags.every((t) => typeof t === "string") ||
      !validDate(p.nextReviewDueDate) ||
      ![p.createdAt, p.updatedAt, p.initialAttemptAt].every(timestamp) ||
      (p.lastReviewedAt !== null && !timestamp(p.lastReviewedAt)) ||
      typeof p.lastSchedulingTimeZone !== "string" ||
      !Array.isArray(p.reviewHistory)
    )
      throw Error(
        "Some stored records are invalid. Your stored data has been preserved.",
      );
    for (const h of p.reviewHistory)
      if (
        !h ||
        typeof h.id !== "string" ||
        !["initial_attempt", "review", "reclassification"].includes(
          h.eventType,
        ) ||
        !timestamp(h.occurredAt) ||
        ![1, 2, 3].includes(h.newBucket) ||
        !(h.previousBucket === null || [1, 2, 3].includes(h.previousBucket)) ||
        !(
          h.outcome === null ||
          ["could_not_solve", "solved_with_help", "solved"].includes(h.outcome)
        ) ||
        !Number.isInteger(h.intervalDaysApplied) ||
        !validDate(h.nextReviewDueDate)
      )
        throw Error(
          "Stored history is invalid. Your stored data has been preserved.",
        );
    ids.add(p.id);
    numbers.add(p.problemNumber);
  }
  for (const [bucket, min, max] of [
    [1, 1, 2],
    [2, 3, 4],
    [3, 7, 14],
  ]) {
    const days = data.settings.intervals?.[bucket];
    if (
      !Number.isInteger(days) ||
      days < min ||
      days > max ||
      !["due", "number", "title", "difficulty"].includes(
        data.settings.sorts?.[bucket],
      )
    )
      throw Error(
        "Stored settings are invalid. Your stored data has been preserved.",
      );
  }
  return data;
}
export function loadStore(): Store {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? parseStore(raw) : defaults();
}
export function saveStore(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
