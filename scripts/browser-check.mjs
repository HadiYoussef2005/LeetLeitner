import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
await mkdir(".test-results", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Toronto",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const url = "http://127.0.0.1:4173/";
const data = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("leetleitner.v1")));
const add = async (number, title, outcome = "Solved") => {
  await page.getByRole("button", { name: "Add problem", exact: true }).click();
  await page.getByLabel("Problem number", { exact: true }).fill(String(number));
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("LeetCode URL", { exact: true })
    .fill("https://leetcode.com/problems/two-sum/");
  await page.getByLabel(/^Tags/).fill("Array, Hash Table, Array");
  await page
    .getByRole("radio", { name: new RegExp("^" + outcome + " Next") })
    .check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add problem", exact: true })
    .click();
  await page.waitForFunction(
    (n) =>
      JSON.parse(localStorage.getItem("leetleitner.v1")).problems.some(
        (p) => p.problemNumber === n,
      ),
    number,
  );
};
try {
  await page.goto(url);
  await add(1, "Two Sum");
  await add(2, "Add Two Numbers", "Solved with Help");
  await add(3, "Longest Substring", "Couldn't Solve");
  let state = await data();
  assert.deepEqual(
    state.problems.map((p) => p.currentBucket),
    [3, 2, 1],
  );
  assert.equal(state.problems[0].lastReviewedAt, null);
  assert.deepEqual(state.problems[0].tags, ["Array", "Hash Table"]);
  await page.reload();
  assert.equal((await data()).problems.length, 3);
  await page.getByRole("button", { name: "Add problem", exact: true }).click();
  await page.getByLabel("Problem number", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Open existing problem" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Two Sum · Updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  let updated = (await data()).problems[0];
  assert.equal(updated.nextReviewDueDate, state.problems[0].nextReviewDueDate);
  assert.deepEqual(updated.reviewHistory, state.problems[0].reviewHistory);
  await page.getByRole("button", { name: "Preferences" }).click();
  await page.getByRole("dialog").locator("select").nth(0).selectOption("1");
  await page.getByRole("button", { name: "Save preferences" }).click();
  assert.equal((await data()).settings.intervals[1], 1);
  assert.equal(
    (await data()).problems[2].nextReviewDueDate,
    state.problems[2].nextReviewDueDate,
  );
  // Controlled fixture: exercise due and overdue sessions without waiting days.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("leetleitner.v1"));
    s.problems.forEach((p) => (p.nextReviewDueDate = "2020-01-01"));
    localStorage.setItem("leetleitner.v1", JSON.stringify(s));
  });
  await page.reload();
  await page.getByRole("button", { name: "Start review" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page
    .getByRole("button", { name: "Couldn't Solve Review again" })
    .click();
  await page
    .getByRole("button", { name: "Solved Review again", exact: false })
    .click();
  await page.getByRole("button", { name: "Back to your library" }).click();
  state = await data();
  assert.equal(state.problems[2].nextReviewDueDate, "2020-01-01");
  assert.equal(state.problems[1].currentBucket, 1);
  assert.equal(state.problems[0].currentBucket, 3);
  // Failure from bucket 3, and reclassification does not count as a review.
  await page.getByRole("button", { name: /#1 Easy Two Sum/ }).click();
  await page.getByRole("button", { name: "Review now" }).click();
  await page
    .getByRole("button", { name: "Couldn't Solve Review again" })
    .click();
  await page.getByRole("button", { name: "Back to your library" }).click();
  state = await data();
  assert.equal(state.problems[0].currentBucket, 1);
  const last = state.problems[0].lastReviewedAt;
  await page.getByRole("button", { name: /#1 Easy Two Sum/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Correct bucket").selectOption("2");
  assert.equal((await data()).problems[0].lastReviewedAt, last);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Sort Couldn't Solve").selectOption("title");
  await page.reload();
  assert.equal((await data()).settings.sorts[1], "title");
  await page.getByLabel("Search problems").fill("Hash Table");
  assert.equal(await page.locator(".problem-card").count(), 3);
  await page.getByLabel("Search problems").fill("no-such-title");
  assert.equal(await page.locator(".problem-card").count(), 0);
  await page.getByLabel("Search problems").fill("");
  await page.screenshot({ path: ".test-results/desktop.png", fullPage: true });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  await writeFile(
    ".test-results/accessibility.json",
    JSON.stringify(axe.violations, null, 2),
  );
  assert.equal(
    axe.violations.length,
    0,
    JSON.stringify(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".test-results/mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Practice that sticks." }).waitFor();
  assert.equal((await data()).problems.length, 3);
  await context.setOffline(false);
  // Storage failure must not mutate the visible or persisted record.
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Add problem", exact: true }).click();
  await page.getByLabel("Problem number", { exact: true }).fill("9");
  await page.getByLabel("Title", { exact: true }).fill("Storage failure");
  await page
    .getByLabel("LeetCode URL", { exact: true })
    .fill("https://leetcode.com/problems/two-sum/");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add problem", exact: true })
    .click();
  assert.equal((await data()).problems.length, 3);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.evaluate(
    () => (Storage.prototype.setItem = window.originalSetItem),
  );
  await page.reload();
  // Malformed data remains untouched and disables writes.
  const raw = await page.evaluate(() => localStorage.getItem("leetleitner.v1"));
  await page.evaluate(() => localStorage.setItem("leetleitner.v1", "{invalid"));
  await page.reload();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("leetleitner.v1")),
    "{invalid",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Add problem", exact: true })
      .isDisabled(),
    true,
  );
  await page.evaluate(
    (raw) => localStorage.setItem("leetleitner.v1", raw),
    raw,
  );
  await page.reload();
  await page.getByRole("button", { name: /#1 Easy Two Sum/ }).click();
  const modalAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  assert.equal(
    modalAxe.violations.length,
    0,
    JSON.stringify(modalAxe.violations.map((v) => v.id)),
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByRole("button", { name: /#1 Easy Two Sum/ }).click();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  assert.equal((await data()).problems.length, 3);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  assert.equal((await data()).problems.length, 2);
  assert.deepEqual(errors, []);
  await writeFile(
    ".test-results/browser-report.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "manual entry",
          "duplicate navigation",
          "reload persistence",
          "metadata editing",
          "preferences",
          "skip",
          "bucket transitions",
          "failure demotion",
          "reclassification",
          "sorting persistence",
          "search",
          "responsive layout",
          "offline reload",
          "storage failure",
          "malformed storage",
          "zero browser exceptions",
        ],
        accessibilityViolations: axe.violations.length,
      },
      null,
      2,
    ),
  );
  console.log(
    "Browser workflows, offline persistence, responsive layout, and accessibility passed.",
  );
} finally {
  await browser.close();
}
