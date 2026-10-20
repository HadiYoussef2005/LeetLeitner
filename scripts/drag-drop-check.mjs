import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    timezoneId: "America/Toronto",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = JSON.parse(
    await readFile("leetleitner-mock-import.txt", "utf8"),
  ).state;
  await page.goto("http://127.0.0.1:4173/leetleitner/");
  await page.evaluate(
    (state) =>
      localStorage.setItem(
        "leetleitner.v1",
        JSON.stringify({
          storageVersion: 2,
          activeState: state,
          previousBackup: null,
        }),
      ),
    state,
  );
  await page.reload();
  const data = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem("leetleitner.v1")).activeState,
    );
  const source = page.locator(".bucket.red .problem-card").first();
  const number = Number(
    (await source.locator(".card-reference").innerText())
      .replace("#", "")
      .trim(),
  );
  const before = (await data()).problems.find(
    (p) => p.problemNumber === number,
  );
  await source.dragTo(page.locator(".bucket.green .bucket-header"));
  await expect(page.getByRole("status")).toContainText("Moved");
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await expect(page.locator(".landing")).toHaveCount(0);
  const after = (await data()).problems.find((p) => p.id === before.id);
  assert.equal(after.currentBucket, 3);
  assert.equal(after.lastReviewedAt, before.lastReviewedAt);
  assert.equal(after.reviewHistory.length, before.reviewHistory.length + 1);
  assert.equal(after.reviewHistory.at(-1).eventType, "reclassification");
  assert.equal(after.reviewHistory.at(-1).previousBucket, 1);
  const expected = await page.evaluate((days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, state.settings.intervals[3]);
  assert.equal(after.nextReviewDueDate, expected);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  assert.equal(
    (await data()).problems.find((p) => p.id === before.id).currentBucket,
    3,
  );
  const card = page.locator(".problem-card").filter({
    has: page.getByRole("heading", { name: before.title, exact: true }),
  });
  await card.dragTo(page.locator(".bucket.green .bucket-header"));
  assert.deepEqual(
    (await data()).problems.find((p) => p.id === before.id),
    after,
    "same-bucket drops are no-ops",
  );
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent("dragstart", { dataTransfer: transfer });
  await expect(page.locator(".drag-preview")).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".drag-preview")
      .evaluate((el) => getComputedStyle(el).transform),
    "none",
  );
  await card.dispatchEvent("dragend");
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.deepEqual(
    (await data()).problems.find((p) => p.id === before.id),
    after,
    "canceling leaves data unchanged",
  );
  await expect(page.locator(".drop-target, .dragging")).toHaveCount(0);
  await page.locator(".bucket.red").dispatchEvent("drop");
  assert.deepEqual(
    (await data()).problems.find((p) => p.id === before.id),
    after,
    "external drops are ignored",
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await card.dragTo(page.locator(".bucket.amber .bucket-header"));
  await expect(page.getByRole("alert")).toContainText("Could not save");
  await expect(page.locator(".landing, .drag-preview")).toHaveCount(0);
  assert.deepEqual(
    (await data()).problems.find((p) => p.id === before.id),
    after,
    "failed saves leave data unchanged",
  );
  await expect(
    page
      .locator(".bucket.green .problem-card")
      .filter({ hasText: before.title }),
  ).toHaveCount(1);
  await page.reload();
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "leetleitner.v1" }),
    ),
  );
  await expect(page.locator('.problem-card[draggable="true"]')).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "Drag-and-drop scheduling, persistence, no-op/canceled/foreign drops, failed saves, and locked storage passed.",
  );
} finally {
  await browser.close();
}
