import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const output = await build({
  entryPoints: ["scripts/preview.tsx"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const js = output.outputFiles[0].text;
const html =
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>ServerVitals synthetic preview</title><body style="margin:0;background:#1c1e26"><div id="app"></div><script type="module" src="/preview.js"></script></body></html>';
const server = createServer((request, response) => {
  response.setHeader(
    "Content-Type",
    request.url === "/preview.js" ? "text/javascript" : "text/html",
  );
  response.end(request.url === "/preview.js" ? js : html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.SERVERVITALS_BROWSER ||
      (process.platform === "win32"
        ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
        : undefined),
  });
  const page = await browser.newPage({
    viewport: { width: 1640, height: 1040 },
  });
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      !request.url().startsWith(`http://127.0.0.1:${port}`) &&
      !request.url().startsWith("blob:")
    )
      external.push(request.url());
  });
  await page.goto(`http://127.0.0.1:${port}`);
  await page
    .getByRole("heading", { name: "ServerVitals", exact: true })
    .waitFor();
  assert.equal(await page.locator("tbody tr").count(), 8);
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/dashboard-demo.png",
    fullPage: true,
  });
  await page.getByRole("searchbox").fill("counter");
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("searchbox").fill("");
  await page.getByLabel("Sort by").selectOption("largest");
  assert.match(
    await page.locator("tbody tr").first().innerText(),
    /Counter Strike Community/,
  );
  await page
    .getByRole("button", { name: "Keep Counter Strike Community", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", {
        name: "Keep Counter Strike Community",
        exact: true,
      })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("summary").filter({ hasText: "Filters" }).click();
  await page.getByLabel("Unknown", { exact: true }).check();
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await page.getByRole("heading", { name: "Statistics Dashboard" }).waitFor();
  assert.match(await page.locator(".sv-stats").innerText(), /Unknown Activity/);
  await page.getByRole("button", { name: "What Changed", exact: true }).click();
  await page.getByRole("button", { name: /New server detected/ }).click();
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.getByRole("button", { name: "Show all servers" }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV (all)" }).click();
  const download = await pending;
  assert.ok(download.suggestedFilename().endsWith(".csv"));
  await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
  assert.match(await page.locator("dl").innerText(), /GuildStore\s+Found/);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel(/Hide Keep servers/).check();
  await page.getByRole("button", { name: "Servers", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 6);
  await page.setViewportSize({ width: 760, height: 1000 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    "docs/screenshots/README.md",
    "# Dashboard preview\n\n`dashboard-demo.png` is an actual browser capture of the shared React dashboard using synthetic fixture data. It is not a live BetterDiscord/Vencord screenshot or a compatibility claim. The preview banner is part of the testing harness, not the plugin.\n",
  );
  console.info(
    "Browser UI checks passed: rendering, search, size sort, Keep, filters, statistics, change drill-down, CSV download, diagnostics, settings and narrow layout. Zero page errors or external requests in the synthetic preview.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
