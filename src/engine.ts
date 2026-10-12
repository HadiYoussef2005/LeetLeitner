export type Bucket = 1 | 2 | 3;
export type Outcome = "could_not_solve" | "solved_with_help" | "solved";
export type Sort = "due" | "number" | "title" | "difficulty";
export const BUCKETS = {
  1: {
    name: "Couldn't Solve",
    outcome: "could_not_solve",
    min: 1,
    max: 2,
    description: "Build the foundation",
    color: "red",
  },
  2: {
    name: "Solved with Help",
    outcome: "solved_with_help",
    min: 3,
    max: 4,
    description: "Connect the dots",
    color: "amber",
  },
  3: {
    name: "Solved",
    outcome: "solved",
    min: 7,
    max: 14,
    description: "Keep it sharp",
    color: "green",
  },
} as const;
export interface History {
  id: string;
  eventType: "initial_attempt" | "review" | "reclassification";
  occurredAt: string;
  outcome: Outcome | null;
  previousBucket: Bucket | null;
  newBucket: Bucket;
  intervalDaysApplied: number;
  nextReviewDueDate: string;
}
export interface Problem {
  schemaVersion: 1;
  id: string;
  problemNumber: number;
  title: string;
  url: string;
  currentBucket: Bucket;
  difficulty: "Easy" | "Medium" | "Hard";
  tags: string[];
  createdAt: string;
  updatedAt: string;
  initialAttemptAt: string;
  lastReviewedAt: string | null;
  nextReviewDueDate: string;
  lastSchedulingTimeZone: string;
  reviewHistory: History[];
}
export interface Settings {
  intervals: Record<Bucket, number>;
  sorts: Record<Bucket, Sort>;
}
export interface Store {
  schemaVersion: 1;
  problems: Problem[];
  settings: Settings;
}
export const defaults = (): Store => ({
  schemaVersion: 1,
  problems: [],
  settings: {
    intervals: { 1: 2, 2: 4, 3: 10 },
    sorts: { 1: "due", 2: "due", 3: "due" },
  },
});
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const result = new Date(y, m - 1, d, 12);
  result.setDate(result.getDate() + days);
  return localDate(result);
}
export const bucketFor = (outcome: Outcome): Bucket =>
  outcome === "solved" ? 3 : outcome === "solved_with_help" ? 2 : 1;
export function schedule(
  problem: Problem,
  bucket: Bucket,
  settings: Settings,
  eventType: History["eventType"],
  outcome: Outcome | null,
  now = new Date(),
): Problem {
  const nextReviewDueDate = addDays(localDate(now), settings.intervals[bucket]);
  return {
    ...problem,
    currentBucket: bucket,
    updatedAt: now.toISOString(),
    lastReviewedAt:
      eventType === "review" ? now.toISOString() : problem.lastReviewedAt,
    nextReviewDueDate,
    lastSchedulingTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    reviewHistory: [
      ...problem.reviewHistory,
      {
        id: crypto.randomUUID(),
        eventType,
        occurredAt: now.toISOString(),
        outcome,
        previousBucket:
          eventType === "initial_attempt" ? null : problem.currentBucket,
        newBucket: bucket,
        intervalDaysApplied: settings.intervals[bucket],
        nextReviewDueDate,
      },
    ],
  };
}
export function createProblem(
  input: Pick<
    Problem,
    "problemNumber" | "title" | "url" | "difficulty" | "tags"
  >,
  outcome: Outcome,
  settings: Settings,
  now = new Date(),
): Problem {
  const initial: Problem = {
    ...input,
    schemaVersion: 1,
    id: crypto.randomUUID(),
    currentBucket: bucketFor(outcome),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    initialAttemptAt: now.toISOString(),
    lastReviewedAt: null,
    nextReviewDueDate: "",
    lastSchedulingTimeZone: "",
    reviewHistory: [],
  };
  return schedule(
    initial,
    initial.currentBucket,
    settings,
    "initial_attempt",
    outcome,
    now,
  );
}
export function dueQueue(problems: Problem[], today = localDate()) {
  return problems
    .filter((p) => p.nextReviewDueDate <= today)
    .sort(
      (a, b) =>
        a.nextReviewDueDate.localeCompare(b.nextReviewDueDate) ||
        a.currentBucket - b.currentBucket ||
        a.problemNumber - b.problemNumber,
    );
}
export function sortProblems(problems: Problem[], sort: Sort) {
  const rank = { Easy: 0, Medium: 1, Hard: 2 };
  return [...problems].sort(
    (a, b) =>
      (sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "number"
          ? a.problemNumber - b.problemNumber
          : sort === "difficulty"
            ? rank[a.difficulty] - rank[b.difficulty]
            : a.nextReviewDueDate.localeCompare(b.nextReviewDueDate)) ||
      a.problemNumber - b.problemNumber,
  );
}
export function validateInput(
  input: Pick<Problem, "problemNumber" | "title" | "url" | "difficulty">,
  problems: Problem[],
  excludeId?: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isSafeInteger(input.problemNumber) || input.problemNumber < 1)
    errors.problemNumber = "Enter a positive whole problem number.";
  if (
    problems.some(
      (p) => p.problemNumber === input.problemNumber && p.id !== excludeId,
    )
  )
    errors.problemNumber = "This problem is already in your collection.";
  if (!input.title.trim()) errors.title = "Enter a problem title.";
  try {
    const url = new URL(input.url);
    if (
      url.protocol !== "https:" ||
      !["leetcode.com", "www.leetcode.com"].includes(url.hostname) ||
      !/^\/problems\/[^/]+\/?$/.test(url.pathname) ||
      url.username ||
      url.password
    )
      throw Error();
  } catch {
    errors.url = "Use an HTTPS LeetCode problem URL.";
  }
  if (!["Easy", "Medium", "Hard"].includes(input.difficulty))
    errors.difficulty = "Choose a difficulty.";
  return errors;
}
