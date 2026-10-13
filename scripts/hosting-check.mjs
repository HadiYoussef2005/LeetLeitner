import { chromium } from "@playwright/test";
import { readFile, readdir, access, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = process.env.PORTFOLIO_TEST_ORIGIN || "http://127.0.0.1:4174";
const { base } = JSON.parse(await readFile("hosting.config.json", "utf8"));
const directory = `dist${base.slice(0, -1)}`;
const vercel = JSON.parse(await readFile("vercel.json", "utf8"));
assert.equal(vercel.outputDirectory, "dist");
assert.equal(vercel.trailingSlash, true);
assert.equal(vercel.redirects.length, 1);
assert.equal(vercel.redirects[0].source, "/");
const html = await readFile(`${directory}/index.html`, "utf8");
assert.match(html, /\/leetleitner\/assets\//);
assert.match(html, /href="\/leetleitner\/icon\.svg"/);
await assert.rejects(access("dist/index.html"));
assert.deepEqual(await readdir("dist"), ["leetleitner"]);
const redirected = await fetch(origin + "/leetleitner", { redirect: "manual" });
assert.equal(redirected.status, 308);
assert.equal(
  new URL(redirected.headers.get("location"), origin).pathname,
  base,
);
const root = await fetch(origin + "/");
assert.equal(root.status, 200);
const rootHtml = await root.text();
assert.ok(!rootHtml.includes("LeetLeitner · Practice that sticks"));
const contact = await fetch(origin + "/api/contact");
assert.equal(contact.status, 405);
const otherSlash = await fetch(origin + "/unrelated-page/", {
  redirect: "manual",
});
assert.equal(otherSlash.status, 308);
assert.equal(
  new URL(otherSlash.headers.get("location"), origin).pathname,
  "/unrelated-page",
);
for (const file of [
  "index.html",
  "icon.svg",
  "sw.js",
  ...(await readdir(`${directory}/assets`)).map((f) => "assets/" + f),
]) {
  const response = await fetch(origin + base + file);
  assert.equal(response.status, 200, file);
  if (file.endsWith(".js"))
    assert.match(response.headers.get("content-type"), /javascript/, file);
  if (file.endsWith(".css"))
    assert.match(response.headers.get("content-type"), /css/, file);
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Toronto",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(origin + "/");
  await page.evaluate(async () => {
    const cache = await caches.open("portfolio-cache-probe");
    await cache.put("/portfolio-cache-probe", new Response("preserve me"));
  });
  await page.goto(origin + "/leetleitner");
  assert.equal(new URL(page.url()).pathname, base);
  await page.getByRole("heading", { name: "Practice that sticks." }).waitFor();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const registration = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return {
      scope: r.scope,
      scriptURL: r.active.scriptURL,
      cacheKeys: await caches.keys(),
    };
  });
  assert.equal(registration.scope, origin + base);
  assert.equal(registration.scriptURL, origin + base + "sw.js");
  assert.ok(registration.cacheKeys.includes("portfolio-cache-probe"));
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByLabel("Choose a LeetLeitner export file")
    .setInputFiles("leetleitner-mock-import.txt");
  await page
    .getByRole("heading", { name: "Import preview", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Replace current system", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.locator(".problem-card").count(), 36);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Practice that sticks." }).waitFor();
  assert.equal(await page.locator(".problem-card").count(), 36);
  // Import worker validation through the portfolio URL also works offline.
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page
    .getByLabel("Choose a LeetLeitner export file")
    .setInputFiles("leetleitner-mock-import.txt");
  await page
    .getByRole("heading", { name: "Import preview", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Cancel replacement" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await context.setOffline(false);
  await page.goto(origin + "/");
  assert.equal(
    await page.evaluate(() => navigator.serviceWorker.controller),
    null,
  );
  assert.equal(
    await page.evaluate(async () => await caches.has("portfolio-cache-probe")),
    true,
  );
  assert.equal(
    await page.getByRole("heading", { name: "Practice that sticks." }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  await mkdir(".test-results", { recursive: true });
  await writeFile(
    ".test-results/hosting-report.json",
    JSON.stringify(
      {
        passed: true,
        base,
        portfolioHomeStatus: root.status,
        contactStatus: contact.status,
        workerScope: registration.scope,
        checks: [
          "physical subpath build",
          "favicon and all asset types",
          "canonical redirect without loop",
          "existing slash canonicalization preserved",
          "actual Next.js external rewrite",
          "portfolio homepage preserved",
          "contact endpoint preserved",
          "service worker scoped to app",
          "unrelated portfolio cache retained",
          "mock import through portfolio",
          "offline reload through portfolio",
          "offline worker through portfolio",
          "portfolio is not controlled by app worker",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Subpath hosting and actual portfolio integration passed.");
} finally {
  await browser.close();
}
