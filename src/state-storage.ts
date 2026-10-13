import {
  BUCKETS,
  bucketFor,
  defaults,
  validateInput,
  type Bucket,
  type History,
  type Outcome,
  type Problem,
  type Store,
} from "./engine";
export const STORAGE_KEY = "leetleitner.v1";
export interface Backup {
  createdAt: string;
  state: Store;
}
export interface StorageEnvelope {
  storageVersion: 2;
  activeState: Store;
  previousBackup: Backup | null;
}
export interface Snapshot {
  raw: string | null;
  envelope: StorageEnvelope;
}
export class StorageConflictError extends Error {
  constructor() {
    super(
      "Data changed since this preview was opened. Reload this tab and generate a fresh preview before continuing.",
    );
  }
}
function invalid(message: string): never {
  throw new Error(message);
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    invalid(`${label} must contain text.`);
  return value;
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function timestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !==
      (value.includes(".") ? value : value.replace("Z", ".000Z"))
  )
    invalid(`${label} must be a valid UTC ISO timestamp.`);
  return value;
}
function date(value: unknown, label: string): string {
  if (!validDate(value)) invalid(`${label} must be a valid YYYY-MM-DD date.`);
  return value;
}
function bucket(value: unknown, label: string): Bucket {
  if (value !== 1 && value !== 2 && value !== 3)
    invalid(`${label} must be bucket 1, 2, or 3.`);
  return value;
}
function interval(value: unknown, b: Bucket): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < BUCKETS[b].min ||
    value > BUCKETS[b].max
  )
    invalid(
      `Bucket ${b} interval must be ${BUCKETS[b].min}–${BUCKETS[b].max} days.`,
    );
  return value;
}
function parseHistory(value: unknown, usedIds: Set<string>): History {
  const h = object(value, "History event"),
    id = text(h.id, "History ID");
  if (usedIds.has(id)) invalid("History event IDs must be unique.");
  usedIds.add(id);
  if (
    typeof h.eventType !== "string" ||
    !["initial_attempt", "review", "reclassification"].includes(h.eventType)
  )
    invalid("Invalid history event type.");
  const eventType = h.eventType as History["eventType"];
  const newBucket = bucket(h.newBucket, "History bucket");
  const previousBucket =
    h.previousBucket === null
      ? null
      : bucket(h.previousBucket, "Previous bucket");
  const outcome = h.outcome;
  if (eventType === "reclassification") {
    if (outcome !== null || previousBucket === null)
      invalid(
        "Reclassification must have a previous bucket and a null outcome.",
      );
  } else {
    if (
      outcome !== "could_not_solve" &&
      outcome !== "solved_with_help" &&
      outcome !== "solved"
    )
      invalid("An attempt must have a valid outcome.");
    if (bucketFor(outcome) !== newBucket)
      invalid("History outcome does not match its bucket.");
    if ((eventType === "initial_attempt") !== (previousBucket === null))
      invalid("Only an initial attempt can have a null previous bucket.");
  }
  return {
    id,
    eventType,
    occurredAt: timestamp(h.occurredAt, "History timestamp"),
    outcome: outcome as Outcome | null,
    previousBucket,
    newBucket,
    intervalDaysApplied: interval(h.intervalDaysApplied, newBucket),
    nextReviewDueDate: date(h.nextReviewDueDate, "History due date"),
  };
}
/** Reconstruct only allowed fields. Never spread untrusted imported objects. */
export function validateState(value: unknown): Store {
  const data = object(value, "State");
  if (data.schemaVersion !== 1)
    invalid(
      "Unsupported state schema version. Use a schema version 1 LeetLeitner export.",
    );
  if (!Array.isArray(data.problems))
    invalid("State must contain a problems array.");
  const s = object(data.settings, "Settings"),
    ints = object(s.intervals, "Intervals"),
    sorts = object(s.sorts, "Sorting preferences");
  const settings = defaults().settings;
  for (const b of [1, 2, 3] as Bucket[]) {
    settings.intervals[b] = interval(ints[String(b)], b);
    const sort = sorts[String(b)];
    if (
      sort !== "due" &&
      sort !== "number" &&
      sort !== "title" &&
      sort !== "difficulty"
    )
      invalid(`Invalid sort preference for bucket ${b}.`);
    settings.sorts[b] = sort;
  }
  const ids = new Set<string>(),
    numbers = new Set<number>(),
    eventIds = new Set<string>(),
    zones = new Set<string>();
  const problems: Problem[] = data.problems.map((value, index) => {
    const p = object(value, `Problem ${index + 1}`),
      id = text(p.id, "Problem ID");
    if (p.schemaVersion !== 1) invalid("Unsupported problem schema version.");
    if (ids.has(id)) invalid("Problem IDs must be unique.");
    ids.add(id);
    const input = {
      problemNumber: p.problemNumber as number,
      title: text(p.title, "Problem title"),
      url: text(p.url, "Problem URL"),
      difficulty: p.difficulty as Problem["difficulty"],
    };
    const errors = validateInput(input, []);
    if (Object.keys(errors).length)
      invalid(`Problem ${index + 1}: ${Object.values(errors)[0]}`);
    if (numbers.has(input.problemNumber))
      invalid("Problem numbers must be unique.");
    numbers.add(input.problemNumber);
    if (
      !Array.isArray(p.tags) ||
      !p.tags.every((t) => typeof t === "string" && t.trim())
    )
      invalid("Tags must be an array of nonempty strings.");
    if (new Set(p.tags).size !== p.tags.length) invalid("Tags must be unique.");
    const zone = text(p.lastSchedulingTimeZone, "Scheduling time zone");
    if (!zones.has(zone)) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
      } catch {
        invalid("Invalid scheduling time zone.");
      }
      zones.add(zone);
    }
    if (!Array.isArray(p.reviewHistory))
      invalid("Review history must be an array.");
    const reviewHistory = p.reviewHistory.map((h) => parseHistory(h, eventIds));
    for (let i = 0; i < reviewHistory.length; i++) {
      const h = reviewHistory[i];
      if (i === 0 && h.eventType !== "initial_attempt")
        invalid("History must start with an initial attempt.");
      if (
        i > 0 &&
        (h.eventType === "initial_attempt" ||
          h.previousBucket !== reviewHistory[i - 1].newBucket)
      )
        invalid("History bucket transitions are inconsistent.");
    }
    const currentBucket = bucket(p.currentBucket, "Current bucket");
    if (
      reviewHistory.length &&
      reviewHistory.at(-1)!.newBucket !== currentBucket
    )
      invalid("Current bucket does not match the latest history event.");
    const lastReviewedAt =
      p.lastReviewedAt === null
        ? null
        : timestamp(p.lastReviewedAt, "Last reviewed timestamp");
    const lastReview = [...reviewHistory]
      .reverse()
      .find((h) => h.eventType === "review");
    if ((lastReview?.occurredAt ?? null) !== lastReviewedAt)
      invalid("Last reviewed timestamp does not match the review history.");
    return {
      schemaVersion: 1,
      id,
      ...input,
      currentBucket,
      tags: p.tags as string[],
      createdAt: timestamp(p.createdAt, "Created timestamp"),
      updatedAt: timestamp(p.updatedAt, "Updated timestamp"),
      initialAttemptAt: timestamp(
        p.initialAttemptAt,
        "Initial attempt timestamp",
      ),
      lastReviewedAt,
      nextReviewDueDate: date(p.nextReviewDueDate, "Next review due date"),
      lastSchedulingTimeZone: zone,
      reviewHistory,
    };
  });
  return { schemaVersion: 1, problems, settings };
}
export function parseStore(raw: string): Store {
  return validateState(JSON.parse(raw));
}
function parseEnvelope(raw: string): StorageEnvelope {
  const data = object(JSON.parse(raw), "Stored data");
  if (data.storageVersion !== 2)
    invalid(
      "Unsupported storage version. Your stored data has been preserved.",
    );
  let previousBackup: Backup | null = null;
  if (data.previousBackup !== null) {
    const backup = object(data.previousBackup, "Previous backup");
    previousBackup = {
      createdAt: timestamp(backup.createdAt, "Backup timestamp"),
      state: validateState(backup.state),
    };
  }
  return {
    storageVersion: 2,
    activeState: validateState(data.activeState),
    previousBackup,
  };
}
export function loadSnapshot(migrate = true): Snapshot {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null)
    return {
      raw: null,
      envelope: {
        storageVersion: 2,
        activeState: defaults(),
        previousBackup: null,
      },
    };
  const data = object(JSON.parse(raw), "Stored data");
  if ("storageVersion" in data) return { raw, envelope: parseEnvelope(raw) };
  const envelope: StorageEnvelope = {
    storageVersion: 2,
    activeState: validateState(data),
    previousBackup: null,
  };
  if (!migrate) return { raw, envelope };
  if (localStorage.getItem(STORAGE_KEY) !== raw)
    throw new StorageConflictError();
  const migrated = JSON.stringify(envelope);
  try {
    localStorage.setItem(STORAGE_KEY, migrated);
  } catch {
    invalid(
      "Could not migrate browser storage. Your original data is preserved. Free up storage and reload; you can also download stored data for recovery.",
    );
  }
  return { raw: migrated, envelope };
}
export function assertUnchanged(snapshot: Snapshot) {
  if (localStorage.getItem(STORAGE_KEY) !== snapshot.raw)
    throw new StorageConflictError();
}
function persist(envelope: StorageEnvelope, expected: Snapshot): Snapshot {
  const raw = JSON.stringify(envelope);
  assertUnchanged(expected);
  localStorage.setItem(STORAGE_KEY, raw);
  return { raw, envelope };
}
export function saveActive(state: Store, expected: Snapshot): Snapshot {
  return persist({ ...expected.envelope, activeState: state }, expected);
}
export function replaceActive(
  state: Store,
  expected: Snapshot,
  now = new Date(),
): Snapshot {
  return persist(
    {
      storageVersion: 2,
      activeState: state,
      previousBackup: {
        createdAt: now.toISOString(),
        state: expected.envelope.activeState,
      },
    },
    expected,
  );
}
export function restoreBackup(expected: Snapshot, now = new Date()): Snapshot {
  if (!expected.envelope.previousBackup)
    invalid("No previous backup is available.");
  return replaceActive(expected.envelope.previousBackup.state, expected, now);
}
