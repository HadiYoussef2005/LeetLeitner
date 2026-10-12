import { describe, it, expect } from "vitest";
import {
  addDays,
  createProblem,
  defaults,
  schedule,
  bucketFor,
  dueQueue,
  validateInput,
  sortProblems,
  type Bucket,
  type Outcome,
} from "./engine";
import { parseStore } from "./storage";
const input = {
  problemNumber: 1,
  title: "Two Sum",
  url: "https://leetcode.com/problems/two-sum/",
  difficulty: "Easy" as const,
  tags: ["Array"],
};
const now = new Date(2026, 9, 12, 10);
const settings = defaults().settings;
describe("Leitner engine", () => {
  for (const from of [1, 2, 3] as Bucket[])
    for (const outcome of [
      "could_not_solve",
      "solved_with_help",
      "solved",
    ] as Outcome[])
      it(`${from} + ${outcome} follows outcome and restarts schedule`, () => {
        const p = {
          ...createProblem(input, "solved", settings, now),
          currentBucket: from,
        };
        const next = schedule(
          p,
          bucketFor(outcome),
          settings,
          "review",
          outcome,
          now,
        );
        expect(next.currentBucket).toBe(bucketFor(outcome));
        expect(next.nextReviewDueDate).toBe(
          addDays("2026-10-12", settings.intervals[bucketFor(outcome)]),
        );
        expect(next.lastReviewedAt).toBe(now.toISOString());
        expect(next.reviewHistory.at(-1)?.previousBucket).toBe(from);
      });
  it("initial attempts are not completed reviews", () => {
    const p = createProblem(input, "solved_with_help", settings, now);
    expect(p.lastReviewedAt).toBeNull();
    expect(p.reviewHistory[0].eventType).toBe("initial_attempt");
    expect(p.nextReviewDueDate).toBe("2026-10-16");
  });
  it("correction preserves last review timestamp", () => {
    const p = schedule(
      createProblem(input, "solved", settings, now),
      3,
      settings,
      "review",
      "solved",
      now,
    );
    const next = schedule(
      p,
      1,
      settings,
      "reclassification",
      null,
      new Date(2026, 9, 14),
    );
    expect(next.lastReviewedAt).toBe(p.lastReviewedAt);
    expect(next.nextReviewDueDate).toBe("2026-10-16");
    expect(next.reviewHistory.at(-1)?.outcome).toBeNull();
  });
  it.each([
    ["2026-12-31", 2, "2027-01-02"],
    ["2028-02-28", 2, "2028-03-01"],
    ["2026-03-07", 2, "2026-03-09"],
    ["2026-10-31", 2, "2026-11-02"],
  ])("calendar dates %s + %s", (date, days, result) =>
    expect(addDays(date, days as number)).toBe(result),
  );
  it("orders oldest due, weaker bucket, then problem number", () => {
    const base = createProblem(input, "solved", settings, now);
    const a = {
      ...base,
      problemNumber: 3,
      currentBucket: 3 as Bucket,
      nextReviewDueDate: "2026-10-12",
    };
    const b = {
      ...base,
      problemNumber: 2,
      currentBucket: 1 as Bucket,
      nextReviewDueDate: "2026-10-12",
    };
    const c = { ...base, problemNumber: 9, nextReviewDueDate: "2026-10-11" };
    const future = { ...base, nextReviewDueDate: "2026-10-13" };
    expect(
      dueQueue([a, b, c, future], "2026-10-12").map((p) => p.problemNumber),
    ).toEqual([9, 2, 3]);
  });
  it("rejects duplicates and invalid external URLs", () => {
    const p = createProblem(input, "solved", settings, now);
    expect(validateInput(input, [p]).problemNumber).toBeTruthy();
    expect(validateInput(input, [p], p.id)).toEqual({});
    expect(
      validateInput(
        { ...input, url: "https://leetcode.com.evil.test/problems/two-sum/" },
        [],
      ).url,
    ).toBeTruthy();
    expect(
      validateInput({ ...input, problemNumber: 1.5, title: " " }, []),
    ).toHaveProperty("title");
  });
  it("sorts without mutating original records", () => {
    const a = createProblem(input, "solved", settings, now),
      b = createProblem(
        { ...input, problemNumber: 2, title: "A problem", difficulty: "Hard" },
        "solved",
        settings,
        now,
      );
    const list = [a, b];
    expect(sortProblems(list, "title")[0]).toBe(b);
    expect(sortProblems(list, "difficulty")[0]).toBe(a);
    expect(list[0]).toBe(a);
  });
  it("validates persisted state and preserves unknown/malformed data by rejecting it", () => {
    const data = {
      ...defaults(),
      problems: [createProblem(input, "solved", settings, now)],
    };
    expect(parseStore(JSON.stringify(data))).toEqual(data);
    expect(() =>
      parseStore(JSON.stringify({ ...data, schemaVersion: 2 })),
    ).toThrow();
    expect(() =>
      parseStore(
        JSON.stringify({
          ...data,
          problems: [data.problems[0], data.problems[0]],
        }),
      ),
    ).toThrow();
    expect(() =>
      parseStore(
        JSON.stringify({
          ...data,
          settings: { intervals: { 1: 99 }, sorts: {} },
        }),
      ),
    ).toThrow();
    expect(() => parseStore("{bad")).toThrow();
  });
});
