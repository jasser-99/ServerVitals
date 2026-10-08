import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
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
const bdPreview = await build({
  entryPoints: ["scripts/preview-betterdiscord.tsx"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const pluginCode = await readFile(
  "dist/betterdiscord/ServerVitals.plugin.js",
  "utf8",
);
const html =
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>ServerVitals synthetic preview</title><body style="margin:0;background:#1c1e26"><div id="app"></div><script type="module" src="/preview.js"></script></body></html>';
const server = createServer((request, response) => {
  if (
    request.url === "/betterdiscord.js" ||
    request.url === "/preview-betterdiscord.js"
  ) {
    response.setHeader("Content-Type", "text/javascript");
    response.end(
      request.url === "/betterdiscord.js"
        ? pluginCode
        : bdPreview.outputFiles[0].text,
    );
    return;
  }
  response.setHeader(
    "Content-Type",
    request.url === "/preview.js" ? "text/javascript" : "text/html",
  );
  response.end(
    request.url === "/preview.js"
      ? js
      : request.url === "/betterdiscord"
        ? html.replace("/preview.js", "/preview-betterdiscord.js")
        : html,
  );
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
  assert.equal(await page.getByRole("searchbox").count(), 0);
  await page.getByLabel("Sort by", { exact: true }).click();
  await page
    .getByRole("button", { name: "Largest Server First", exact: true })
    .click();
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
  assert.equal(await page.getByLabel("Automatic refresh interval").count(), 0);
  assert.match(
    await page.locator(".sv-root").innerText(),
    /Activity cache:.*bytes/,
  );
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
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Reset activity cache", { exact: true }).click();
  await page
    .getByRole("button", { name: "Clear activity cache", exact: true })
    .click();
  await page.getByRole("button", { name: "Servers", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 0);
  await page.getByRole("button", { name: "Check Now", exact: true }).click();
  await page.locator("tbody tr").first().waitFor();
  assert.equal(await page.locator("tbody tr").count(), 6);
  await page.goto(`http://127.0.0.1:${port}/betterdiscord`);
  await page
    .getByRole("button", { name: "Open ServerVitals", exact: true })
    .click();
  assert.equal(await page.locator("tbody tr").count(), 0);
  const dialog = await page.locator(".bd-modal-root").boundingBox();
  assert.ok(dialog.width > 700 && dialog.height > 850);
  await page.getByRole("button", { name: "Check Now", exact: true }).click();
  await page.locator("tbody tr").first().waitFor();
  assert.equal(await page.getByRole("searchbox").count(), 0);
  await page.getByLabel("Sort by", { exact: true }).click();
  await page
    .getByRole("button", { name: "Newest Activity First", exact: true })
    .click();
  await page.getByLabel("Select Test server to leave", { exact: true }).check();
  await page
    .getByRole("button", { name: "Leave selected servers (1)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel leaving", exact: true })
    .click();
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page
    .getByRole("button", { name: "Leave selected servers (1)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm leave 1 servers", exact: true })
    .click();
  await page.getByText(/Left 1 server\(s\)/).waitFor();
  assert.equal(await page.locator("tbody tr").count(), 0);
  await page.reload();
  await page
    .getByRole("button", { name: "Open ServerVitals", exact: true })
    .click();
  await page.getByRole("button", { name: "Check Now", exact: true }).click();
  await page.locator("tbody tr").first().waitFor();
  await page
    .getByRole("button", { name: "Open Last Active Channel", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Opened channel 100", exact: true })
    .waitFor();
  assert.equal(await page.getByTestId("discord-settings").count(), 0);
  assert.equal(await page.getByTestId("plugin-settings").count(), 0);
  assert.equal(
    await page
      .getByRole("region", { name: "ServerVitals", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.info(
    "Browser UI checks passed: rendering, search removal, size sort, Keep, filters, statistics, change drill-down, CSV download, diagnostics, settings and narrow layout. Zero page errors or external requests in the synthetic preview.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
