import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { createApp } from "../src/server.js";
import { openStore } from "../src/store.js";

const store = openStore(":memory:");
const config = { development: true, baseUrl: "http://127.0.0.1:3199" };
const server = createApp(config, store, {
  now: () => new Date("2026-09-19T12:00:00Z"),
}).listen(3199, "127.0.0.1");
let browser;
try {
  await once(server, "listening");
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(config.baseUrl);
  await page.getByRole("heading", { name: "Your today", level: 2 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page
      .getByRole("heading", { name: "Clean room", exact: true })
      .count(),
    1,
  );
  mkdirSync("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/today-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page
    .getByRole("button", { name: "Complete Clean room", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "That’s your today, taken care of." })
    .waitFor();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete Clean room", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByLabel("Move to", { exact: true }).fill("2026-09-20");
  await page.getByRole("button", { name: "Move chore", exact: true }).click();
  await page
    .getByRole("heading", { name: "A little breathing room." })
    .waitFor();
  await page.getByRole("button", { name: "Upcoming", exact: true }).click();
  assert.equal(await page.locator(".upcoming-day").count(), 14);
  assert.equal(
    await page
      .locator(".upcoming-day")
      .nth(1)
      .getByText("Clean room", { exact: true })
      .count(),
    1,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Add a chore", exact: true })
    .click();
  await page.getByLabel("Chore name", { exact: true }).fill("Wash towels");
  await page.getByLabel("Chore type", { exact: true }).selectOption("laundry");
  await page
    .getByRole("group", { name: "Week A" })
    .getByRole("checkbox", { name: "Sat", exact: true })
    .check();
  await page.getByRole("button", { name: "Add chore", exact: true }).click();
  await page.getByText("Wash towels", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  for (const step of ["Wash", "Dry", "Put away"]) {
    await page
      .getByRole("button", {
        name: `Finish ${step} for Wash towels`,
        exact: true,
      })
      .click();
    if (step === "Wash") await page.reload();
  }
  await page
    .getByRole("heading", { name: "That’s your today, taken care of." })
    .waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  await page.getByLabel("Date name", { exact: true }).fill("A picnic together");
  await page
    .getByLabel("Your message", { exact: true })
    .fill("Let’s find a sunny spot.");
  await page
    .getByRole("button", { name: "Save invitation", exact: true })
    .click();
  await page.getByText("A picnic together", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Little treats", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "A little invitation is on its way" })
    .waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Keep animations still", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("reduced-motion"),
  );
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "artifacts/today-desktop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  // Axe injects its own styles. Keep the app interaction checks under the real
  // CSP, and use a separate context for automated accessibility analysis.
  const auditContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    bypassCSP: true,
    reducedMotion: "reduce",
  });
  const auditPage = await auditContext.newPage();
  await auditPage.goto(config.baseUrl);
  await auditPage
    .getByRole("heading", { name: "Your today", level: 2 })
    .waitFor();
  const violations = [];
  for (const label of ["Today", "Upcoming", "Little treats", "Settings"]) {
    await auditPage.getByRole("button", { name: label, exact: true }).click();
    const result = await new AxeBuilder({ page: auditPage })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    violations.push(...result.violations.map((v) => ({ page: label, ...v })));
  }
  await auditPage
    .getByRole("button", { name: "+ Add a chore", exact: true })
    .click();
  const dialogAudit = await new AxeBuilder({ page: auditPage })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  violations.push(
    ...dialogAudit.violations.map((v) => ({ page: "Chore dialog", ...v })),
  );
  writeFileSync(
    "artifacts/accessibility.json",
    JSON.stringify(violations, null, 2),
  );
  assert.deepEqual(
    violations.map((v) => ({
      page: v.page,
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
    "Accessibility checks",
  );
  console.log(
    "Browser checks passed: mobile layout, complete/undo/move, upcoming, chore editing, persistent laundry steps, invitations, reduced motion, desktop layout.",
  );
} finally {
  await browser?.close();
  server.close();
  store.close();
}
