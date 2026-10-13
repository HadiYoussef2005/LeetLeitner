import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProblem, defaults, schedule, type Store } from "./engine";
import {
  loadSnapshot,
  replaceActive,
  restoreBackup,
  saveActive,
  STORAGE_KEY,
  StorageConflictError,
  validateState,
} from "./storage";
import {
  MAX_IMPORT_BYTES,
  parseExport,
  serializeExport,
  validateFile,
} from "./portability";

const now = new Date("2026-10-12T19:30:00.000Z");
function fixture(number = 1): Store {
  const store = defaults();
  let p = createProblem(
    {
      problemNumber: number,
      title: "Équilibre 🧠 <script>text only</script>",
      url: "https://leetcode.com/problems/two-sum/",
      difficulty: "Medium",
      tags: ["数组", "Hash Table"],
    },
    "solved",
    store.settings,
    now,
  );
  p = schedule(
    p,
    1,
    store.settings,
    "review",
    "could_not_solve",
    new Date("2026-10-13T19:30:00.000Z"),
  );
  p = schedule(
    p,
    2,
    store.settings,
    "reclassification",
    null,
    new Date("2026-10-14T19:30:00.000Z"),
  );
  store.problems = [p];
  store.settings.sorts[2] = "title";
  return store;
}
let saved: string | null;
let setItem: ReturnType<typeof vi.fn>;
beforeEach(() => {
  saved = null;
  setItem = vi.fn((_key: string, value: string) => {
    saved = value;
  });
  vi.stubGlobal("localStorage", { getItem: vi.fn(() => saved), setItem });
});
describe("export format", () => {
  it("round trips every state field including Unicode, IDs, history, and schedules", () => {
    const original = fixture();
    const raw = serializeExport(original, now);
    expect(parseExport(raw).state).toEqual(original);
    expect(raw).toContain("\n");
    expect(JSON.parse(raw).format).toBe("leetleitner-state");
    expect(parseExport("\uFEFF" + raw).state).toEqual(original);
  });
  it("round trips empty collections and backup metadata without recursive backups", () => {
    const parsed = parseExport(
      serializeExport(defaults(), now, now.toISOString()),
    );
    expect(parsed.state).toEqual(defaults());
    expect(parsed.backupCreatedAt).toBe(now.toISOString());
    expect(parsed).not.toHaveProperty("previousBackup");
  });
  it.each(["{oops", "null", "[]", "{}"])("rejects invalid file %s", (raw) =>
    expect(() => parseExport(raw)).toThrow(),
  );
  it("rejects unsupported versions and missing fields", () => {
    const value = JSON.parse(serializeExport(fixture(), now));
    for (const change of [
      { exportVersion: 2 },
      { format: "other" },
      { exportedAt: "not-a-date" },
      { state: { ...value.state, schemaVersion: 2 } },
    ])
      expect(() =>
        parseExport(JSON.stringify({ ...value, ...change })),
      ).toThrow();
  });
  it("enforces the byte limit, including multibyte characters", async () => {
    expect(() => parseExport(" ".repeat(MAX_IMPORT_BYTES + 1))).toThrow(
      /10 MiB/,
    );
    expect(() => parseExport("🧠".repeat(MAX_IMPORT_BYTES / 4 + 1))).toThrow(
      /10 MiB/,
    );
    await expect(
      validateFile(
        { size: MAX_IMPORT_BYTES + 1 } as File,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/10 MiB/);
  });
  it("strips unrecognized and prototype-related properties at every level", () => {
    const state = fixture();
    const raw = JSON.stringify(state);
    const untrusted = JSON.parse(raw);
    untrusted.secret = "ignored";
    untrusted.problems[0].unexpected = "ignored";
    untrusted.problems[0].reviewHistory[0].unexpected = true;
    untrusted.settings.extra = "ignored";
    untrusted.settings.intervals.extra = 9;
    Object.defineProperty(untrusted, "__proto__", {
      value: { polluted: true },
      enumerable: true,
    });
    expect(validateState(untrusted)).toEqual(state);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
  it("rejects coerced event enums rather than accepting arrays as strings", () => {
    const state = fixture();
    Object.assign(state.problems[0].reviewHistory[1], {
      eventType: ["review"],
    });
    expect(() => parseExport(serializeExport(state, now))).toThrow(
      /event type/,
    );
  });
});
describe("complete state validation", () => {
  const mutations: [string, (state: Store) => void][] = [
    [
      "duplicate ID",
      (s) => s.problems.push({ ...s.problems[0], problemNumber: 2 }),
    ],
    [
      "duplicate number",
      (s) => s.problems.push({ ...s.problems[0], id: "different" }),
    ],
    ["invalid date", (s) => (s.problems[0].nextReviewDueDate = "2026-02-30")],
    [
      "invalid timestamp",
      (s) => (s.problems[0].createdAt = "2026-02-30T00:00:00Z"),
    ],
    ["invalid URL", (s) => (s.problems[0].url = "javascript:alert(1)")],
    ["invalid tag", (s) => (s.problems[0].tags = [""])],
    [
      "invalid timezone",
      (s) => (s.problems[0].lastSchedulingTimeZone = "Moon/Sea"),
    ],
    ["invalid interval", (s) => (s.settings.intervals[1] = 99)],
    ["invalid sort", (s) => ((s.settings.sorts[1] as string) = "random")],
    [
      "inconsistent outcome",
      (s) => (s.problems[0].reviewHistory[1].outcome = "solved"),
    ],
    [
      "broken transition",
      (s) => (s.problems[0].reviewHistory[1].previousBucket = 2),
    ],
    [
      "duplicate event",
      (s) =>
        (s.problems[0].reviewHistory[1].id = s.problems[0].reviewHistory[0].id),
    ],
    [
      "bad correction outcome",
      (s) => (s.problems[0].reviewHistory[2].outcome = "solved_with_help"),
    ],
    [
      "invalid event interval",
      (s) => (s.problems[0].reviewHistory[0].intervalDaysApplied = 2),
    ],
    ["wrong current bucket", (s) => (s.problems[0].currentBucket = 3)],
    ["wrong last reviewed", (s) => (s.problems[0].lastReviewedAt = null)],
  ];
  it.each(mutations)("rejects %s without writing data", (_label, mutate) => {
    const state = fixture();
    mutate(state);
    expect(() => parseExport(serializeExport(state, now))).toThrow();
    expect(setItem).not.toHaveBeenCalled();
  });
});
describe("atomic storage, migration, and reversible restore", () => {
  it("migrates legacy state with one write and no data loss", () => {
    const original = fixture();
    saved = JSON.stringify(original);
    const loaded = loadSnapshot();
    expect(loaded.envelope.activeState).toEqual(original);
    expect(loaded.envelope.previousBackup).toBeNull();
    expect(loaded.envelope.storageVersion).toBe(2);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(loadSnapshot()).toEqual(loaded);
    expect(setItem).toHaveBeenCalledTimes(1);
  });
  it("can read the latest persisted legacy state for export without modifying storage", () => {
    const original = fixture();
    saved = JSON.stringify(original);
    const before = saved;
    expect(loadSnapshot(false).envelope.activeState).toEqual(original);
    expect(saved).toBe(before);
    expect(setItem).not.toHaveBeenCalled();
  });
  it("preserves original legacy state when migration hits quota", () => {
    const raw = JSON.stringify(fixture());
    saved = raw;
    setItem.mockImplementation(() => {
      throw Error("quota");
    });
    expect(() => loadSnapshot()).toThrow(/original data is preserved/);
    expect(saved).toBe(raw);
  });
  it("preserves malformed and future storage versions", () => {
    for (const raw of [
      "{invalid",
      JSON.stringify({ storageVersion: 99 }),
      JSON.stringify({ ...defaults(), schemaVersion: 99 }),
    ]) {
      saved = raw;
      expect(() => loadSnapshot()).toThrow();
      expect(saved).toBe(raw);
    }
    expect(setItem).not.toHaveBeenCalled();
  });
  it("fully replaces state and saves exactly one previous state atomically", () => {
    const original = saveActive(fixture(1), loadSnapshot());
    setItem.mockClear();
    const imported = fixture(2);
    const next = replaceActive(imported, original, now);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0][0]).toBe(STORAGE_KEY);
    expect(next.envelope.activeState).toEqual(imported);
    expect(next.envelope.previousBackup).toEqual({
      createdAt: now.toISOString(),
      state: original.envelope.activeState,
    });
    expect(loadSnapshot()).toEqual(next);
  });
  it("replaces old backup and preserves it during normal edits", () => {
    const first = saveActive(fixture(1), loadSnapshot());
    const second = replaceActive(fixture(2), first, now);
    const edited = saveActive(
      { ...second.envelope.activeState, settings: defaults().settings },
      second,
    );
    expect(edited.envelope.previousBackup).toEqual(
      second.envelope.previousBackup,
    );
    const third = replaceActive(defaults(), edited, now);
    expect(third.envelope.previousBackup?.state).toEqual(
      edited.envelope.activeState,
    );
    expect(third.envelope.activeState.problems).toHaveLength(0);
  });
  it("swaps backups on restore and can reverse that restore", () => {
    const first = saveActive(fixture(1), loadSnapshot());
    const second = replaceActive(fixture(2), first, now);
    const restored = restoreBackup(second, now);
    expect(restored.envelope.activeState).toEqual(first.envelope.activeState);
    expect(restored.envelope.previousBackup?.state).toEqual(
      second.envelope.activeState,
    );
    expect(restoreBackup(restored, now).envelope.activeState).toEqual(
      second.envelope.activeState,
    );
  });
  it.each(["import", "restore"] as const)(
    "quota failure during %s changes neither active nor backup",
    (action) => {
      const original = replaceActive(
        fixture(2),
        saveActive(fixture(1), loadSnapshot()),
        now,
      );
      const before = saved;
      setItem.mockImplementation(() => {
        throw new DOMException("Quota", "QuotaExceededError");
      });
      expect(() =>
        action === "import"
          ? replaceActive(defaults(), original)
          : restoreBackup(original),
      ).toThrow();
      expect(saved).toBe(before);
      expect(JSON.parse(saved!)).toEqual(original.envelope);
    },
  );
  it("serialization failure cannot partially commit", () => {
    const baseline = loadSnapshot();
    const state = defaults();
    (state as unknown as { cycle: Store }).cycle = state;
    expect(() => replaceActive(state, baseline)).toThrow();
    expect(saved).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });
  it("stale previews, deleted storage, and repeated confirmations cannot overwrite newer data", () => {
    const original = saveActive(fixture(1), loadSnapshot());
    const next = replaceActive(fixture(2), original, now);
    expect(() => replaceActive(defaults(), original)).toThrow(
      StorageConflictError,
    );
    expect(saved).toBe(next.raw);
    saved = null;
    expect(() => restoreBackup(next)).toThrow(StorageConflictError);
    expect(saved).toBeNull();
  });
  it("does not restore when there is no backup", () => {
    expect(() => restoreBackup(loadSnapshot())).toThrow(/No previous backup/);
    expect(setItem).not.toHaveBeenCalled();
  });
});
