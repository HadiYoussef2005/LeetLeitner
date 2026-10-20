import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = "http://127.0.0.1:4173/leetleitner/";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Toronto",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const metadata = {
  1: {
    problemNumber: 1,
    title: "Two Sum",
    url: "https://leetcode.com/problems/two-sum/",
    difficulty: "Easy",
    tags: ["Array", "Hash Table"],
  },
  2: {
    problemNumber: 2,
    title: "Add Two Numbers",
    url: "https://leetcode.com/problems/add-two-numbers/",
    difficulty: "Medium",
    tags: ["Linked List", "Math"],
  },
  3: {
    problemNumber: 3,
    title: "Longest Substring Without Repeating Characters",
    url: "https://leetcode.com/problems/longest-substring-without-repeating-characters/",
    difficulty: "Medium",
    tags: ["String", "Sliding Window"],
  },
  42: {
    problemNumber: 42,
    title: "Trapping Rain Water",
    url: "https://leetcode.com/problems/trapping-rain-water/",
    difficulty: "Hard",
    tags: ["Array", "Two Pointers"],
  },
};
const add = () =>
  page.getByRole("button", { name: "Add problem", exact: true }).click();
const source = () =>
  page.getByLabel("LeetCode link or number", { exact: true });
const state = () =>
  page.evaluate(() => {
    const raw = localStorage.getItem("leetleitner.v1");
    return raw ? JSON.parse(raw).activeState : null;
  });
const close = () => page.getByRole("button", { name: "Close dialog" }).click();
try {
  await page.goto(base);
  // Real upstream GET requests through the same endpoint used by Vercel.
  const liveNumber = await context.request.get(
    base + "api/problem.json?input=1",
  );
  assert.equal(liveNumber.status(), 200);
  assert.deepEqual((await liveNumber.json()).problem, metadata[1]);
  const liveLink = await context.request.get(
    base +
      "api/problem.json?input=" +
      encodeURIComponent(
        "https://leetcode.com/problems/trapping-rain-water/description/",
      ),
  );
  assert.equal(liveLink.status(), 200);
  assert.equal((await liveLink.json()).problem.problemNumber, 42);
  const hits = [];
  await page.route("**/leetleitner/api/problem.json?*", async (route) => {
    const input = new URL(route.request().url()).searchParams.get("input");
    hits.push(input);
    const number =
      input === "1" || input?.includes("two-sum")
        ? 1
        : input === "2" || input?.includes("add-two-numbers")
          ? 2
          : input === "3"
            ? 3
            : input === "42"
              ? 42
              : 0;
    if (input === "3")
      await new Promise((resolve) => setTimeout(resolve, 1300));
    if (input === "8888") {
      await route.fulfill({
        status: 503,
        json: {
          error:
            "LeetCode metadata is unavailable right now. Try again or enter the problem manually.",
        },
      });
      return;
    }
    await route
      .fulfill({
        status: number ? 200 : 404,
        json: number
          ? { problem: metadata[number] }
          : {
              error:
                "Problem not found. Check the number or enter it manually.",
            },
      })
      .catch(() => {});
  });
  await add();
  assert.equal(await page.getByLabel("Title", { exact: true }).count(), 0);
  await source().fill(
    "https://leetcode.com/problems/two-sum/description/?envType=daily-question#example",
  );
  await page
    .locator(".lookup-preview h3")
    .filter({ hasText: "Two Sum" })
    .waitFor();
  assert.equal(await state(), null);
  assert.equal(hits.length, 1);
  await page.getByRole("radio", { name: /^Solved with Help Next/ }).check();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
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
  await mkdir(".test-results", { recursive: true });
  await page.screenshot({
    path: ".test-results/link-input-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add problem", exact: true })
    .click();
  let stored = await state();
  assert.deepEqual(
    { ...metadata[1], currentBucket: 2 },
    {
      problemNumber: stored.problems[0].problemNumber,
      title: stored.problems[0].title,
      url: stored.problems[0].url,
      difficulty: stored.problems[0].difficulty,
      tags: stored.problems[0].tags,
      currentBucket: stored.problems[0].currentBucket,
    },
  );
  assert.equal(
    stored.problems[0].reviewHistory[0].eventType,
    "initial_attempt",
  );
  await add();
  await source().fill("2");
  await page.getByRole("button", { name: "Find problem", exact: true }).click();
  await page
    .locator(".lookup-preview h3")
    .filter({ hasText: "Add Two Numbers" })
    .waitFor();
  await page.waitForTimeout(700);
  assert.equal(hits.filter((x) => x === "2").length, 1);
  await page.getByRole("radio", { name: /^Solved Next/ }).check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add problem", exact: true })
    .click();
  assert.equal((await state()).problems[1].currentBucket, 3);
  const hitCount = hits.length;
  await add();
  await source().fill("1");
  await page
    .getByRole("button", { name: "Open existing problem", exact: true })
    .waitFor();
  assert.equal(hits.length, hitCount);
  await page
    .getByRole("button", { name: "Open existing problem", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "#1 · Two Sum", exact: true })
    .waitFor();
  assert.equal((await state()).problems.length, 2);
  await close();
  // Stale responses must never replace metadata for the latest input.
  await add();
  await source().fill("3");
  await page
    .getByRole("status")
    .filter({ hasText: "Finding problem" })
    .waitFor();
  await source().fill("42");
  await page
    .locator(".lookup-preview h3")
    .filter({ hasText: "Trapping Rain Water" })
    .waitFor();
  await page.waitForTimeout(1500);
  assert.equal(
    await page.locator(".lookup-preview h3").innerText(),
    "Trapping Rain Water",
  );
  await close();
  assert.equal((await state()).problems.length, 2);
  await add();
  await source().fill("https://evil.test/problems/two-sum/");
  await page.getByRole("button", { name: "Find problem", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(hits.length, hitCount + 2);
  assert.equal(await page.locator(".lookup-preview").count(), 0);
  await source().fill("99999");
  await page
    .getByRole("alert")
    .filter({ hasText: "Problem not found" })
    .waitFor();
  assert.equal((await state()).problems.length, 2);
  await source().fill("8888");
  await page.getByRole("alert").filter({ hasText: "unavailable" }).waitFor();
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Problem number", { exact: true }).inputValue(),
    "8888",
  );
  await page.getByLabel("Problem number", { exact: true }).fill("4");
  await page.getByLabel("Title", { exact: true }).fill("Manual fallback");
  await page
    .getByLabel("LeetCode URL", { exact: true })
    .fill("https://leetcode.com/problems/median-of-two-sorted-arrays/");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add problem", exact: true })
    .click();
  assert.equal((await state()).problems.length, 3);
  await add();
  await source().fill("42");
  await page
    .locator(".lookup-preview h3")
    .filter({ hasText: "Trapping Rain Water" })
    .waitFor();
  await page.getByRole("button", { name: "Edit details manually" }).click();
  assert.equal(
    await page.getByLabel("Title", { exact: true }).inputValue(),
    "Trapping Rain Water",
  );
  assert.equal(
    await page.getByLabel("Difficulty", { exact: true }).inputValue(),
    "Hard",
  );
  await close();
  await page.setViewportSize({ width: 390, height: 844 });
  await add();
  await source().fill("42");
  await page
    .locator(".lookup-preview h3")
    .filter({ hasText: "Trapping Rain Water" })
    .waitFor();
  await page.screenshot({
    path: ".test-results/link-input-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await close();
  await page.reload();
  assert.equal((await state()).problems.length, 3);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.unrouteAll({ behavior: "wait" });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Problem notebook" }).waitFor();
  await add();
  await source().fill("42");
  await page.getByRole("alert").waitFor();
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Problem number", { exact: true }).inputValue(),
    "42",
  );
  await page.getByLabel("Title", { exact: true }).fill("Trapping Rain Water");
  await page
    .getByLabel("LeetCode URL", { exact: true })
    .fill("https://leetcode.com/problems/trapping-rain-water/");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add problem", exact: true })
    .click();
  assert.equal((await state()).problems.length, 4);
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  await writeFile(
    ".test-results/link-input-report.json",
    JSON.stringify(
      {
        passed: true,
        liveLeetCodeNumber: liveNumber.status(),
        liveLeetCodeLink: liveLink.status(),
        checks: [
          "link lookup",
          "number lookup",
          "automatic metadata",
          "outcome scheduling",
          "duplicate detection without network",
          "explicit submit does not double fetch",
          "stale request cancellation",
          "invalid link without upstream request",
          "missing problem",
          "service failure and manual fallback",
          "editable resolved metadata",
          "cancel without saving",
          "mobile layout",
          "reload persistence",
          "offline manual save",
        ],
        accessibilityViolations: axe.violations.length,
      },
      null,
      2,
    ),
  );
  console.log(
    "Link/number entry, live metadata GETs, failure handling, and offline fallback passed.",
  );
} finally {
  await browser.close();
}
