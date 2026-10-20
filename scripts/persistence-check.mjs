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
await page.goto("http://127.0.0.1:4173/leetleitner/");
await page.getByRole("button", { name: "Add problem", exact: true }).click();
await page.getByRole("button", { name: "Enter manually", exact: true }).click();
await page.getByLabel("Problem number", { exact: true }).fill("42");
await page.getByLabel("Title", { exact: true }).fill("Browser restart check");
await page
  .getByLabel("LeetCode URL", { exact: true })
  .fill("https://leetcode.com/problems/trapping-rain-water/");
await page
  .getByRole("dialog")
  .getByRole("button", { name: "Add problem", exact: true })
  .click();
await page.getByRole("button", { name: "Preferences", exact: true }).click();
const original = await page.evaluate(
  () => JSON.parse(localStorage.getItem("leetleitner.v1")).activeState,
);
await page.getByLabel("Choose a LeetLeitner export file").setInputFiles({
  name: "restart-import.txt",
  mimeType: "text/plain",
  buffer: Buffer.from(
    JSON.stringify({
      format: "leetleitner-state",
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      state: { ...original, problems: [] },
    }),
  ),
});
await page
  .getByRole("heading", { name: "Import preview", exact: true })
  .waitFor();
await page
  .getByRole("button", { name: "Replace current system", exact: true })
  .click();
await page.getByRole("dialog").waitFor({ state: "detached" });
await context.close();
context = await chromium.launchPersistentContext(profile, {
  channel: "msedge",
  headless: true,
});
page = await context.newPage();
try {
  await page.goto("http://127.0.0.1:4173/leetleitner/");
  const reopened = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("leetleitner.v1")),
  );
  assert.equal(reopened.activeState.problems.length, 0);
  assert.deepEqual(reopened.previousBackup.state, original);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByRole("button", { name: "Restore previous backup", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore this backup", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(
    await page
      .getByRole("button", { name: /#42 Easy Browser restart check/ })
      .count(),
    1,
  );
  await page.evaluate(() => localStorage.clear());
  await writeFile(
    ".test-results/restart.json",
    JSON.stringify({
      passed: true,
      browserRestartRetainsRecords: true,
      browserRestartRetainsImportedStateAndBackup: true,
    }),
  );
  console.log("Browser restart persistence passed.");
} finally {
  await context.close();
}
