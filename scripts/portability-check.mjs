import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir(".test-results", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Toronto",
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const url = "http://127.0.0.1:4173/leetleitner/";
const raw = () => page.evaluate(() => localStorage.getItem("leetleitner.v1"));
const envelope = async () => JSON.parse(await raw());
const prefs = () =>
  page.getByRole("button", { name: "Preferences", exact: true }).click();
const close = () => page.getByRole("button", { name: "Close dialog" }).click();
async function download(button) {
  const pending = page.waitForEvent("download");
  await button.click();
  const file = await pending;
  assert.match(
    file.suggestedFilename(),
    /^leetleitner-(export|backup)-.+\.txt$/,
  );
  return JSON.parse(await readFile(await file.path(), "utf8"));
}
async function upload(value, name = "leetleitner-test.txt") {
  await page.getByLabel("Choose a LeetLeitner export file").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(
      typeof value === "string" ? value : JSON.stringify(value),
    ),
  });
}
async function waitPreview(name = "Import preview") {
  await page.getByRole("heading", { name, exact: true }).waitFor();
}
async function replace(value) {
  await prefs();
  await upload(value);
  await waitPreview();
  await page
    .getByRole("button", { name: "Replace current system", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
}
async function restore() {
  await prefs();
  await page
    .getByRole("button", { name: "Restore previous backup", exact: true })
    .click();
  await waitPreview("Restore preview");
  await page
    .getByRole("button", { name: "Restore this backup", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
}
async function add(n) {
  await page.getByRole("button", { name: "Add problem", exact: true }).click();
  await page.getByLabel("Problem number", { exact: true }).fill(String(n));
  await page
    .getByLabel("Title", { exact: true })
    .fill(`Problem ${n} — Unicode 🧠`);
  await page
    .getByLabel("LeetCode URL", { exact: true })
    .fill("https://leetcode.com/problems/two-sum/");
  await page.getByLabel(/^Tags/).fill("Array, 数组");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add problem", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
}
try {
  await page.goto(url);
  await add(1);
  await add(2);
  await add(3);
  // Full field preservation includes real review and reclassification history.
  await page.getByRole("button", { name: /#1 Easy Problem/ }).click();
  await page.getByRole("button", { name: "Review now" }).click();
  await page
    .getByRole("button", { name: "Solved with Help Review again" })
    .click();
  await page.getByRole("button", { name: "Back to your library" }).click();
  await prefs();
  const originalExport = await download(
    page.getByRole("button", { name: "Export current state", exact: true }),
  );
  const original = originalExport.state;
  assert.deepEqual(original, (await envelope()).activeState);
  assert.equal((await envelope()).previousBackup, null);
  assert.equal(
    await page
      .getByRole("button", { name: "Restore previous backup", exact: true })
      .isDisabled(),
    true,
  );
  await close();
  const imported = structuredClone(original);
  imported.problems = imported.problems.slice(0, 2).map((p, i) => ({
    ...p,
    id: "import-" + p.id,
    problemNumber: 101 + i,
    title: `Imported ${i} — 雪 🧠 <script>literal</script>`,
    nextReviewDueDate: "2020-01-01",
    reviewHistory: p.reviewHistory.map((h) => ({
      ...h,
      id: "import-" + h.id,
    })),
  }));
  imported.settings.intervals = { 1: 1, 2: 3, 3: 14 };
  imported.settings.sorts = { 1: "number", 2: "difficulty", 3: "title" };
  const importFile = {
    format: "leetleitner-state",
    exportVersion: 1,
    exportedAt: "2026-10-12T19:30:00.000Z",
    state: imported,
  };
  // Preview is read-only, cancel is read-only, and validation never mutates storage.
  await page.getByLabel("Search problems").fill("does not match");
  await page.getByLabel("Filter by difficulty").selectOption("Hard");
  await prefs();
  const before = await raw();
  await upload(importFile);
  await waitPreview();
  assert.equal(await raw(), before);
  await page.getByRole("button", { name: "Cancel replacement" }).click();
  assert.equal(await raw(), before);
  for (const invalid of [
    "{bad",
    JSON.stringify({ ...importFile, exportVersion: 99 }),
    JSON.stringify({
      ...importFile,
      state: {
        ...imported,
        problems: [imported.problems[0], imported.problems[0]],
      },
    }),
  ]) {
    await upload(invalid);
    await page.locator('.data-backups [role="alert"]').waitFor();
    assert.equal(await raw(), before);
    assert.equal(
      await page
        .getByRole("button", { name: "Replace current system" })
        .count(),
      0,
    );
  }
  await upload(" ".repeat(10 * 1024 * 1024 + 1));
  await page.locator('.data-backups [role="alert"]').waitFor();
  assert.match(
    await page.locator('.data-backups [role="alert"]').innerText(),
    /10 MiB/,
  );
  assert.equal(await raw(), before);
  await upload(importFile);
  await waitPreview();
  await page.screenshot({
    path: ".test-results/import-preview.png",
    fullPage: true,
  });
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
  // Closing a pending replacement must cancel it, even after confirmation starts.
  const pendingRaw = await raw();
  await page
    .getByRole("button", { name: "Replace current system", exact: true })
    .evaluate((button) => {
      button.click();
      document.querySelector('[aria-label="Close dialog"]').click();
    });
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.waitForTimeout(100);
  assert.equal(await raw(), pendingRaw);
  await prefs();
  await upload({ ...importFile, extraPadding: "x".repeat(4 * 1024 * 1024) });
  await waitPreview();
  assert.equal(await raw(), pendingRaw);
  // Rapid repeated confirmation should commit exactly once.
  await page.evaluate(() => {
    window.writeCount = 0;
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) {
      window.writeCount++;
      return window.originalSetItem.apply(this, args);
    };
  });
  await page
    .getByRole("button", { name: "Replace current system", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.writeCount), 1);
  await page.evaluate(
    () => (Storage.prototype.setItem = window.originalSetItem),
  );
  let state = await envelope();
  assert.deepEqual(state.activeState, imported);
  assert.deepEqual(state.previousBackup.state, original);
  assert.equal(await page.getByLabel("Search problems").inputValue(), "");
  assert.equal(
    await page.getByLabel("Filter by difficulty").inputValue(),
    "All difficulties",
  );
  assert.equal(await page.locator(".problem-card").count(), 2);
  assert.equal(
    await page.locator("script").filter({ hasText: "literal" }).count(),
    0,
  );
  await page.reload();
  assert.deepEqual((await envelope()).activeState, imported);
  await prefs();
  const backupExport = await download(
    page.getByRole("button", { name: "Download previous backup", exact: true }),
  );
  assert.deepEqual(backupExport.state, original);
  assert.equal(
    backupExport.backupCreatedAt,
    (await envelope()).previousBackup.createdAt,
  );
  assert.equal(backupExport.state.previousBackup, undefined);
  await close();
  await restore();
  assert.deepEqual((await envelope()).activeState, original);
  assert.deepEqual((await envelope()).previousBackup.state, imported);
  await restore();
  assert.deepEqual((await envelope()).activeState, imported);
  // Existing backup replacement is explicitly disclosed with a download action.
  await prefs();
  await upload(backupExport);
  await waitPreview();
  assert.match(
    await page.locator(".backup-warning").innerText(),
    /will be replaced/,
  );
  const preservedDownload = await download(
    page
      .locator(".backup-warning")
      .getByRole("button", { name: "Download previous backup" }),
  );
  assert.deepEqual(preservedDownload.state, original);
  // Quota failure cannot partially activate an import or restore.
  const beforeQuota = await raw();
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page
    .getByRole("button", { name: "Replace current system", exact: true })
    .click();
  await page.locator('.data-backups [role="alert"]').waitFor();
  assert.equal(await raw(), beforeQuota);
  await page.getByRole("button", { name: "Cancel replacement" }).click();
  await page
    .getByRole("button", { name: "Restore previous backup", exact: true })
    .click();
  await waitPreview("Restore preview");
  await page
    .getByRole("button", { name: "Restore this backup", exact: true })
    .click();
  await page.locator('.data-backups [role="alert"]').waitFor();
  assert.equal(await raw(), beforeQuota);
  await page.evaluate(
    () => (Storage.prototype.setItem = window.originalSetItem),
  );
  await close();
  // A real second tab invalidates a prepared replacement.
  await prefs();
  await upload(importFile);
  await waitPreview();
  const other = await context.newPage();
  await other.goto(url);
  await other.evaluate(() => {
    const value = JSON.parse(localStorage.getItem("leetleitner.v1"));
    value.activeState.settings.sorts[1] = "title";
    localStorage.setItem("leetleitner.v1", JSON.stringify(value));
  });
  await page
    .getByRole("button", { name: "Replace current system", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    await page
      .getByRole("button", { name: "Import state", exact: true })
      .isDisabled(),
    true,
  );
  const external = await raw();
  const latestExport = await download(
    page.getByRole("button", { name: "Export current state", exact: true }),
  );
  assert.deepEqual(latestExport.state, JSON.parse(external).activeState);
  assert.equal(await raw(), external);
  await close();
  assert.equal(await raw(), external);
  await other.close();
  await page.reload();
  // Clear-origin events also invalidate previews (storage event key is null).
  await prefs();
  await upload(importFile);
  await waitPreview();
  const other2 = await context.newPage();
  await other2.goto(url);
  await other2.evaluate(() => localStorage.clear());
  await page
    .getByRole("button", { name: "Replace current system", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(await raw(), null);
  await other2.close();
  await page.evaluate(
    (raw) => localStorage.setItem("leetleitner.v1", raw),
    external,
  );
  await page.reload();
  // Offline worker validation, import, active export, backup export, and restore.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await replace(originalExport);
  await prefs();
  const offlineExport = await download(
    page.getByRole("button", { name: "Export current state", exact: true }),
  );
  assert.deepEqual(offlineExport.state, original);
  const offlineBackup = await download(
    page.getByRole("button", { name: "Download previous backup", exact: true }),
  );
  assert.deepEqual(offlineBackup.state, JSON.parse(external).activeState);
  await close();
  await restore();
  assert.deepEqual(
    (await envelope()).activeState,
    JSON.parse(external).activeState,
  );
  await context.setOffline(false);
  // Empty collection replaces rather than merges and is reversible.
  const empty = { ...importFile, state: { ...original, problems: [] } };
  await replace(empty);
  assert.equal((await envelope()).activeState.problems.length, 0);
  assert.equal(await page.locator(".problem-card").count(), 0);
  await restore();
  assert.equal((await envelope()).activeState.problems.length, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await prefs();
  await upload(originalExport);
  await waitPreview();
  await page.screenshot({
    path: ".test-results/import-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(
    ".test-results/portability-report.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "complete file export",
          "Unicode and literal markup",
          "read-only preview",
          "cancel",
          "cancel after confirmation starts",
          "large file worker validation",
          "export latest persisted state",
          "invalid and oversized files",
          "real worker validation",
          "single-write repeated confirmation",
          "full replacement and UI reset",
          "exact history and schedule preservation",
          "backup download and reimport",
          "reversible restore",
          "backup overwrite disclosure",
          "quota failure during import and restore",
          "cross-tab modification",
          "cross-tab clear",
          "offline export/import/restore",
          "empty import",
          "keyboard dismissal",
          "mobile layout",
        ],
        accessibilityViolations: axe.violations.length,
      },
      null,
      2,
    ),
  );
  console.log("All data portability browser checks passed.");
} finally {
  await browser.close();
}
