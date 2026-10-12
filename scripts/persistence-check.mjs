import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const profile = ".test-results/restart-profile";
await mkdir(profile, { recursive: true });
let context = await chromium.launchPersistentContext(profile, {
  channel: "msedge",
  headless: true,
});
let page = await context.newPage();
await page.goto("http://127.0.0.1:4173/");
await page.getByRole("button", { name: "Add problem", exact: true }).click();
await page.getByLabel("Problem number", { exact: true }).fill("42");
await page.getByLabel("Title", { exact: true }).fill("Browser restart check");
await page
  .getByLabel("LeetCode URL", { exact: true })
  .fill("https://leetcode.com/problems/trapping-rain-water/");
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Add problem", exact: true })
  .click();
await context.close();
context = await chromium.launchPersistentContext(profile, {
  channel: "msedge",
  headless: true,
});
page = await context.newPage();
try {
  await page.goto("http://127.0.0.1:4173/");
  assert.equal(
    await page
      .getByRole("button", { name: /#42 Easy Browser restart check/ })
      .count(),
    1,
  );
  await page.evaluate(() => localStorage.clear());
  await writeFile(
    ".test-results/restart.json",
    JSON.stringify({ passed: true, browserRestartRetainsRecords: true }),
  );
  console.log("Browser restart persistence passed.");
} finally {
  await context.close();
}
