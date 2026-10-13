import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://127.0.0.1:4173/leetleitner/");
  await page.evaluate(() => {
    const now = new Date().toISOString();
    const problems = Array.from({ length: 1000 }, (_, i) => ({
      schemaVersion: 1,
      id: "perf-" + i,
      problemNumber: i + 1,
      title: "Performance problem " + (i + 1),
      url: "https://leetcode.com/problems/two-sum/",
      currentBucket: (i % 3) + 1,
      difficulty: ["Easy", "Medium", "Hard"][i % 3],
      tags: ["Array", "Hash Table"],
      createdAt: now,
      updatedAt: now,
      initialAttemptAt: now,
      lastReviewedAt: null,
      nextReviewDueDate: "2026-12-31",
      lastSchedulingTimeZone: "America/Toronto",
      reviewHistory: [],
    }));
    localStorage.setItem(
      "leetleitner.v1",
      JSON.stringify({
        schemaVersion: 1,
        problems,
        settings: {
          intervals: { 1: 2, 2: 4, 3: 10 },
          sorts: { 1: "due", 2: "due", 3: "due" },
        },
      }),
    );
  });
  await page.reload();
  await page.locator(".problem-card").first().waitFor();
  const timings = await page.evaluate(async () => {
    const samples = [];
    const select = document.querySelector(
      '[aria-label="Sort Couldn\'t Solve"]',
    );
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      select.value = i % 2 ? "due" : "title";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      samples.push(performance.now() - start);
    }
    return samples;
  });
  const sorted = [...timings].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const report = {
    records: 1000,
    samples: 30,
    p95Ms: p95,
    maxMs: Math.max(...timings),
    timings,
    reference: {
      browser: await browser.version(),
      viewport: "1440x1000",
      node: process.version,
      platform: process.platform,
      processor: process.env.PROCESSOR_IDENTIFIER,
    },
  };
  await writeFile(
    ".test-results/performance.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  assert.ok(p95 < 100, "State update p95 must be below 100ms");
} finally {
  await browser.close();
}
